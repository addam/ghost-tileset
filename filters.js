const path = require("path")
const fsp = require("fs").promises
const got = require("got")
const gltfPipeline = optionalRequire("gltf-pipeline")
const { jsonClone, isTileset, boundingRegion } = require("./util")
const { gdbToB3dm, swisstopoBoundingRegion, LocalCoordinates } = require("../convert-tileset/app")
const Cache = require("./microdb")

const masterUrl = "tileset.json"

let verbose = false
function optionalLog(...args) {
  if (verbose) {
    console.log(new Date(), ...args)
  }
}

function optionalRequire(module) {
  try {
    return require(module)
  } catch {
    return {}
  }
}

// collect all ancestors that have no children
function leaves(root, test=(node => !node.children)) {
  const result = []
  const remaining = [root]
  while (remaining.length) {
    const node = remaining.pop()
    if (test(node)) {
      result.push(node)
    } else {
      remaining.push(...node.children)
    }
  }
  return result
}

// iterate over all nodes
function* nodes(root) {
  const remaining = [root]
  while (remaining.length) {
    const node = remaining.pop()
    yield node
    remaining.push(...(node.children || []))
  }
}

function contentUri(node, baseUrl) {
  const content = node.content || {}
  const uri = content.uri || content.url
  return (uri === undefined || !baseUrl || uri.match(/\w+:\/.*/)) ? uri : path.posix.join(baseUrl, uri)
}

function systemPath(posixPath) {
  if (path.sep == path.posix.sep) {
    return posixPath
  }
  return posixPath.split(path.posix.sep).join(path.sep)
}

function optionalJson(req, data) {
  return isTileset(req) ? JSON.parse(data) : data
}

// Read tileset from the web
function httpFactory(protocol) {
  function result(_prev, tilesetPath) {
    const tilesetFile = path.basename(tilesetPath)
    const baseUrl = path.dirname(tilesetPath)
    async function src(req) {
      if (req == masterUrl) {
        req = tilesetFile
      }
      const responseType = req.endsWith(".json") ? 'json' : 'buffer'
      try {
        return await got(`${protocol}:${baseUrl}/${req}`, {responseType, resolveBodyOnly: true})
      } catch (e) {
        console.error("failed to get", baseUrl, req)
        console.error(e)
        return {}
      }
    }
    return Cache(src, 5000)
  }
  result.json = result.b3dm = true
  return result
}
const http = httpFactory("http")
const https = httpFactory("https")

// Read tileset from a local zip file
// currently, only .7z files are supported
async function zip(_prev, baseUrl) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'filterTool'))

  function _7z(req) {
    return new Promise((resolve, reject) => {
      const stream = sevenZip.extractFull(baseUrl, tempDir, { include: [ req ] })
      stream.on('data', function ({ status, file }) {
        if (status == "extracted") {
          fsp.readFile(file).then((data) => {  // maybe { encoding: "utf-8" } ?
            fsp.unlink(file)
            resolve(optionalJson(req, data))
          })
        }
      })
    })
  }

  if (path.extname(baseUrl) == ".7z") {
    return _7z
  } else {
    return _zip // TODO not implemented
  }
}
zip.json = zip.b3dm = true

// Read tileset from a local file
async function file(_prev, tilesetPath) {
  const tilesetFile = path.basename(tilesetPath)
  const baseUrl = path.dirname(tilesetPath)
  return async(req) => {
    if (req == masterUrl) {
      req = tilesetFile
    }
    const data = await fsp.readFile(path.join(baseUrl, systemPath(req))) // maybe { encoding: "utf-8" } ?
    return optionalJson(req, data)
  }
}
file.json = file.b3dm = true

// read tileset from a local directory in the swisstopo .gdb.zip format
async function swisstopo(_prev, baseUrl) {
  const files = (await fsp.readdir(baseUrl)).filter(name => name.endsWith(".gdb.zip"))
  const tileset = {
    asset: { version: "1.0" },
    geometricError: 500,
    root: {
      geometricError: 50,
      children: files.map(name => {
        const region = swisstopoBoundingRegion(name)
        const frame = LocalCoordinates.fromRegion(region)
        return {
          boundingVolume: { region },
          transform: frame.matrix,
          geometricError: 0,
          content: { uri: name.replace(/\.gdb\.zip$/, ".b3dm") }
        }
      })
    }
  }
  tileset.root.boundingVolume = { region: boundingRegion(tileset.root.children) }
  return async(req) => {
    if (req == masterUrl) {
      return tileset
    }
    const tileName = req.replace(/\.b3dm$/, ".gdb.zip")
    console.log("processing", tileName)
    const frame = LocalCoordinates.fromRegion(swisstopoBoundingRegion(tileName))
    const data = await gdbToB3dm(path.join(baseUrl, tileName), { frame })
    console.log("done", tileName)
    return data
  }
}
swisstopo.json = swisstopo.b3dm = true

/// Collect all ancestors into a single tileset.
/// This may be necessary as a first operation for aggregate tilesets.
function fetch(prev, limit=-1) {
  let currentLimit
  async function fetchChildren(root, baseUrl='') {
    optionalLog("fetchChildren", root.children.length, baseUrl)
    const remaining = [root]
    while (remaining.length) {
      const node = remaining.pop()
      remaining.push(...(node.children || []))
      const uri = contentUri(node, baseUrl)
      if (isTileset(uri) && currentLimit != 0) {
        currentLimit -= 1
        const subDir = path.posix.dirname(uri)
        optionalLog(" fetch sub", uri)
        const sub = jsonClone(await prev(uri))
        fetchChildren(sub.root, subDir)
        node.children = node.children || []
        node.children.push(sub.root)
        delete node.content
      } else if (uri) {
        const key = node.content.url ? "url" : "uri"
        node.content[key] = uri
      }
    }
  }

  return async(req) => {
    currentLimit = limit
    if (isTileset(req)) {
      const tileset = jsonClone(await prev(req))
      await fetchChildren(tileset.root)
      return tileset
    }
    return prev(req)
  }
}
fetch.json = fetch.b3dm = true

/// Assign `geometricError` to each tile based on the subtree depth.
/// Geometric error will be `leaf` at leaf nodes and `base * factor**elevation(node)` on all inner nodes.
/// The elevation of a node is determined by the longest path to a leaf.
function exponential(prev, base=1, factor=2, jsonLeaf=160) {
  function _exponential(node) {
    const here = isTileset(contentUri(node)) ? jsonLeaf : base
    const top = node.children ? Math.max(...node.children.map(child => _exponential(child))) : 0
    return (node.geometricError = Math.max(here, top) * factor)
  }

  return async(req) => {
    const tileset = await prev(req)
    _exponential(tileset.root)
    tileset.geometricError = tileset.root.geometricError
    return tileset
  }
}
exponential.json = true

/// Create a new root node.
/// This new node has the original root as its only child and its geometric error is set as specified by the parameter.
function growRoot(prev, geometricError) {
  return async(req) => {
    const tileset = await prev(req)
    tileset.root = {
      boundingVolume: jsonClone(tileset.root.boundingVolume),
      geometricError,
      children: [tileset.root],
      refine: "ADD",
    }
    return tileset
  }
}
growRoot.json = true

/// Dump all inner nodes and recreate the tileset from leaf nodes.
/// Each inner node will have `2**compressLevels` children, all of roughly the same size.
async function quickTree(prev, compressLevels=3) {
  // On each level, the nodes are sorted by `x` or `y` coordinate of their bounding boxes (always choosing the longer dimension of the whole set) and split into two halves at the median.
  // Afterwards, every `compressLevels` consecutive levels are compressed into a node.
  function _quickTree(nodes, depth) {
    if (nodes.length <= 1<<depth) {
      return nodes
    }
    const region = boundingRegion(nodes)
    const co = (region[2] - region[0] > region[3] - region[1]) ? 0: 1
    nodes.sort((a, b) => a.boundingVolume.region[co] - b.boundingVolume.region[co])
    const children = [nodes.splice(0, nodes.length / 2), nodes]
      .flatMap(slice => _quickTree(slice, (depth || compressLevels) - 1))
    if (depth == 0) {
      return [{
        geometricError: 1,
        boundingVolume: { region },
        refine: "ADD",
        children,
      }]
    }
    return children
  }

  return async (req) => {
    const tileset = await prev(req)
    const nodes = leaves(tileset.root, (node => node.content))
    const root = _quickTree(nodes, 0)[0]
    return {asset: tileset.asset, root}
  }
}
quickTree.json = true

/// Process all `b3dm` content using Draco compression.
/// Requires gltf-pipeline to be installed.
async function draco(prev, quantization=10) {
  function configDraco(c) {
    return { compressionLevel: 7, quantizePositionBits: c+6, quantizeNormalBits: c+2, quantizeTexcoordBits: c+4, quantizeColorBits: c, quantizeGenericBits: c+4 }
  }

  // returns offset to .glb data within a .b3dm file, in bytes
  function glbStart(b3dm) {
    const fj = b3dm.readUInt32LE(12)
    const fb = b3dm.readUInt32LE(16)
    const bj = b3dm.readUInt32LE(20)
    const bb = b3dm.readUInt32LE(24)
    return 28 + fj + fb + bj + bb
  }
  
  // copy the .glb portion of a .b3dm file
  function extractGlb(b3dm) {
    return b3dm.subarray(glbStart(b3dm))
  }
  
  // create a .b3dm file from a .b3dm header and .glb data
  function combineGlb(b3dm, glb) {
    const start = glbStart(b3dm)
    const out = Buffer.allocUnsafe(start + glb.length)
    b3dm.copy(out, 0, 0, start)
    glb.copy(out, start)
    out.writeUInt32LE(out.length, 8)
    return out
  }

  return async (req) => {
    const b3dm = await prev(req)
    const glb = extractGlb(b3dm)
    const dracoOptions = configDraco(quantization)
    const dr = await gltfPipeline.processGlb(glb, { dracoOptions })
    return combineGlb(b3dm, dr.glb)
  }
}
draco.b3dm = true

/// Makes all uris relative
async function relative(prev) {
  const original = new Map()
  const master = await prev(masterUrl)
  const remote = Cache(async (uri) => {
    const responseType = uri.endsWith(".json") ? 'json' : 'buffer'
    return await got(uri, {responseType, resolveBodyOnly: true})
  })

  for (const node of nodes(master.root)) {
    const content = node.content || {}
    const key = content.url ? "url" : "uri"
    const uri = content[key]
    if (uri) {
      const extension = path.extname(uri)
      const name = `${original.size}${extension}`
      original.set(name, uri)
      content[key] = name
    }
  }
  
  return async(req) => {
    if (req == masterUrl) {
      return master
    }
    const uri = original.get(req)
    if (uri.match(/^https?:\/\//)) {
      return remote(uri)
    }
    return prev(req)
  }
}
relative.json = relative.b3dm = true

/// Splits the tileset into a master tileset.json and a number of child tilesets
/// the cuts are automatic so that the root and all child files contain roughly the same number of nodes
async function split(prev, splitCount=1) {
  optionalLog(new Date(), "Initialize split")
  let num = 1
  const minions = []

  function subTileset(node) {
    let root = {
      boundingVolume: {region: boundingRegion(node.children)},
      geometricError: node.geometricError,
      children: node.children
    }
    if (node.content) {
      root = {
        boundingVolume: jsonClone(root.boundingVolume),
        geometricError: root.geometricError,
        children: [root]
      }
    }
    const tileset = {asset: { version: "1.0" }, root}
    minions.push(tileset)
    return `${minions.length}.json`
  }

  // returns count of child files in this subtree
  // if this subtree has been cut away, the count is 1
  function prune(node, maxSize) {
    if (!node.children || !node.children.length) {
      return 1
    }
    const sizes = node.children.map(child => {
      const size = prune(child, maxSize)
      if (size >= maxSize) {
        child.content = {url: subTileset(jsonClone(child))}
        delete child.children
        return 1
      }
      return size
    })
    return sizes.reduce((a, b) => a + b, 0)
  }

  const master = await prev(masterUrl)
  const origCount = leaves(master.root).length
  const maxSize = Math.pow(origCount, 1 / (splitCount + 1))
  prune(master.root, maxSize)
  optionalLog(new Date(), `maxSize: ${maxSize} nodes, master leaves: ${leaves(master.root).length} from original ${origCount}`)

  return async(req) => {
    const match = req.match(/(\d+).json/)
    if (!match) {
      // TODO what's up with the tileset naming?
      if (req == masterUrl) {
        optionalLog("split return master from", req)
        return master
      }
      optionalLog("split missed", req)
      return await prev(req)
    }
    const num = Number(match[1])
    optionalLog(`split return minions[${num - 1}]`, req)
    return minions[num - 1]
  }
}
split.json = true

async function zshift(prev, offset) {
  return async(req) => {
    if (isTileset(req)) {
      const tileset = jsonClone(await prev(req))
      for (const node of nodes(tileset.root)) {
        const matrix = node.transform
        if (!matrix) {
          continue
        }
        const center = matrix.slice(12, 15)
        const norm = Math.sqrt(center.reduce((a, b) => a + b * b, 0))
        for (let i=12; i<15; i++) {
          matrix[i] *= 1 + offset / norm
        }
      }
      return tileset
    }
  }
}
zshift.json = true

/// Cache the results at this checkpoint
async function cache(prev, maxCount=1000) {
  return Cache(prev, maxCount)
}
cache.json = cache.b3dm = true

/// Enable verbose log. The tileset is passed without a change.
function v(prev, verbosity=true) {
  verbose = verbosity
  optionalLog("logging enabled")
  return prev // the return value will never be used
}

/// Remove the "version" attribute from the asset
function stripVersion(prev) {
  return async(req) => {
    const result = await prev(req)
    delete result.asset.version
    return result
  }
}
stripVersion.json = true

const filters = { draco, exponential, fetch, growRoot, quickTree, relative, split, http, https, zip, file, swisstopo, stripVersion, zshift, cache, v }

function enabled(filter, req) {
  return (isTileset(req)) ? filter.json : filter.b3dm
}

const buildPipeline = Cache(async (operations) => {
  if (!operations.length) {
    return
  }
  optionalLog("build", operations)
  const [name, ...args] = operations.pop()
  const filter = filters[name]
  const prev = await buildPipeline(operations)
  if (!filter) {
    console.error("Could not find filter", name)
    return prev
  }
  const modify = await filter(prev, ...args)
  return (target) => enabled(filter, target) ? modify(target) : prev(target)
})

module.exports = verbose ? async(...args) => {
  optionalLog("build", ...args)
  const result = await buildPipeline(...args)
  optionalLog("done", ...args)
  return (...request) => {
    optionalLog("request", ...request)
    return result(...request)
  }
} : buildPipeline

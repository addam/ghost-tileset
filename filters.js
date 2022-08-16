const path = require("path")
const fsp = require("fs").promises
const got = require("got")
const gltfPipeline = optionalRequire("gltf-pipeline")
const { jsonClone, urlDirname, isTileset, boundingRegion } = require("./util")
const Cache = require("./microdb")

function optionalRequire(module) {
  try {
    return require(module)
  } catch {
    return {}
  }
}

// collect all ancestors that have no children
function leaves(root) {
  const result = []
  const remaining = [root]
  while (remaining.length) {
    const node = remaining.pop()
    if (node.children) {
      remaining.push(...node.children)
    } else {
      result.push(node)
    }
  }
  return result
}

// collect content from all nodes
function b3dmContent(tileset) {
  const result = []
  const remaining = [tileset.root]
  while (remaining.length) {
    const node = remaining.pop()
    const uri = contentUri(node)
    if (uri.endsWith(".b3dm")) {
      result.push(uri)
    }
    remaining.push(...(node.children || []))
  }
  return result
}

function contentUri(node, baseUrl) {
  const content = node.content || {}
  const uri = content.uri || content.url
  return (uri === undefined || uri.match(/\w+:\/.*/)) ? uri : path.posix.join(baseUrl, uri)
}

function systemPath(posixPath) {
  if (path.sep == path.posix.sep) {
    return posixPath
  }
  return posixPath.split(path.posix.sep).join(path.sep)
}

/// Add a data source. Shadows files defined by previous filters.
// name always uses forward slash as directory separator
async function src(prev, baseUrl, ...args) {
  let tempDir
  let tilesetFile

  async function _httpSrc(req) {
    const responseType = req.endsWith(".json") ? 'json' : 'buffer'
    return got(`${baseUrl}/${req}`, {responseType, resolveBodyOnly: true})
  }

  async function _7zSrc(req) {
    if (!tempDir) {
      tempDir = await mkdtemp(path.join(os.tmpdir(), 'filterTool'))
    }
    return new Promise((resolve, reject) => {
      const stream = sevenZip.extractFull(baseUrl, tempDir, { include: [ req ] })
      stream.on('data', function ({ status, file }) {
        if (status == "extracted") {
          fsp.readFile(file).then((data) => {  // maybe { encoding: "utf-8" } ?
            fsp.unlink(file)
            resolve(data)
          })
        }
      })
    })
  }

  async function _dirSrc(req) {
    if (req == "tileset.json") {
      req = tilesetFile
    }
    const data = await fsp.readFile(path.join(baseUrl, systemPath(req))) // maybe { encoding: "utf-8" } ?
    return data
  }

  let fn
  if (baseUrl.match(/^https?:\/\//)) {
    return Cache(_httpSrc)
  } else if (baseUrl.match(/.7z$/)) {
    tilesetFile = args[0]
    fn = _7zSrc
  } else {
    tilesetFile = path.basename(baseUrl)
    baseUrl = path.dirname(baseUrl)
    fn = _dirSrc
  }

  return async(req) => {
    const result = await fn(req)
    if (result) {
      return isTileset(req) ? JSON.parse(result) : result
    }
    return prev(req)
  }
}
src.json = src.b3dm = true

/// Collect all ancestors into a single tileset.
/// This may be necessary as a first operation for aggregate tilesets.
function fetch(prev) {
  async function _fetchChildren(node, baseUrl='') {
    const remaining = [node]
    while (remaining.length) {
      node = remaining.pop()
      remaining.push(...(node.children || []))
      const uri = contentUri(node, baseUrl)
      if (isTileset(uri)) {
        const subDir = path.posix.dirname(uri)
        const sub = await prev(uri)
        _fetchChildren(sub.root, subDir)
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
    if (isTileset(req)) {
      const tileset = await prev(req)
      await _fetchChildren(tileset.root)
      return tileset
    }
    return prev(req)
  }
}
fetch.json = fetch.b3dm = true

/// Assign `geometricError` to each tile based on the subtree depth.
/// Geometric error will be `leaf` at leaf nodes and `base * factor**elevation(node)` on all inner nodes.
/// The elevation of a node is determined by the longest path to a leaf.
function exponential(prev, factor=2, base=1, leaf=base) {
  function _exponential(node) {
    if (node.children) {
      const top = Math.max(base, ...node.children.map(child => _exponential(child)))
      return (node.geometricError = top * factor)
    } else {
      node.geometricError = base
      return 0
    }
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
    const nodes = leaves(tileset.root)
    const root = _quickTree(nodes, 0)[0]
    return {asset: tileset.asset, root}
  }
}
quickTree.json = true

/// Process all `b3dm` content using Draco compression.
/// Requires gltf-pipeline to be installed.
async function draco(prev, quantization=8) {
  function configDraco(c) {
    return { compressionLevel: 7, quantizePositionBits: c+3, quantizeNormalBits: c, quantizeTexcoordBits: c+2, quantizeColorBits: c, quantizeGenericBits: c }
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
    const dracoOptions = configDraco(Number(quantization))
    const dr = await gltfPipeline.processGlb(glb, { dracoOptions })
    return combineGlb(b3dm, dr.glb)
  }
}
draco.b3dm = true

/// Splits the tileset into a master tileset.json and a number of child tilesets
/// the cuts are automatic so that the root and all child files contain roughly the same number of nodes
async function split(prev, splitCount=1, name="tileset.json") {
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
        boundingVolume: root.boundingVolume,
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
    const sizes = node.children.map(child => prune(child, maxSize))
    for (let i=0; i<sizes.length; i++) {
      if (sizes[i] > maxSize) {
        const child = node.children[i]
        child.content = {url: subTileset(child)}
        delete child.children
        sizes[i] = 1
      }
    }
    return sizes.reduce((a, b) => a + b, 0)
  }

  const master = await prev(name)
  const origCount = leaves(master.root).length
  const maxSize = Math.pow(origCount, 1 / (splitCount + 1))
  prune(master.root, maxSize)
  //console.log(`maxSize: ${maxSize} nodes, master leaves: ${leaves(master.root).length} from original ${origCount}`)

  return async(req) => {
    const match = req.match(/(\d+).json/)
    if (!match) {
      // TODO what's up with the tileset naming?
      if (req == "tileset.json") {
        return master
      }
      return await prev(req)
    }
    const num = Number(match[1])
    return minions[num - 1]
  }
}
split.json = true

/// No-operation. The tileset is passed without a change.
function v(prev, req) {
}

const filters = { draco, exponential, fetch, growRoot, quickTree, split, src }

function enabled(filter, req) {
  return (isTileset(req)) ? filter.json : filter.b3dm
}

async function buildPipeline(operations, source) {
  for (const [name, ...args] of operations) {
    const filter = filters[name]
    const prev = source
    const modify = await filter(prev, ...args)
    source = (target) => enabled(filter, target) ? modify(target) : prev(target)
  }
  return source
}

module.exports = buildPipeline

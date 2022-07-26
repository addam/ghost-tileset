const path = require("path")
const fsp = require("fs").promises
const {jsonClone, urlDirname, isTileset, boundingRegion} = require("./util")
const gltfPipeline = optionalRequire("gltf-pipeline")

function optionalRequire(module) {
  try {
    return require(module)
  } catch {
    return {}
  }
}

// collect all ancestors that have no children
function leaves(tileset) {
  const result = []
  const remaining = [tileset.root]
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

function contentUri(node) {
  const content = node.content || {}
  return content.uri || content.url || ""  
}

function systemPath(posixPath) {
  if (path.sep == path.posix.sep) {
    return posixPath
  }
  return posixPath.split(path.posix.sep).join(path.sep)
}

function configDraco(c) {
  return { compressionLevel: 7, quantizePositionBits: c+3, quantizeNormalBits: c, quantizeTexcoordBits: c+2, quantizeColorBits: c, quantizeGenericBits: c }
}

class Filters {
  constructor(options) {
    this.options = options
  }

  // dir: directory where the tileset is located
  async _fetchChildren(node, dir) {
    for (const child of node.children || []) {
      await this._fetchChildren(child, dir)
    }
    const uri = contentUri(node)
    if (uri) {
      const absUri = path.posix.join(dir, uri)
      if (isTileset(uri)) {
        const subDir = path.posix.dirname(absUri)
        const data = await fsp.readFile(systemPath(absUri), { encoding: "utf-8" })
        const sub = JSON.parse(data)
        this._fetchChildren(sub.root, subDir)
        node.children = node.children || []
        node.children.push(sub.root)
        delete node.content
      } else {
        const key = node.content.url ? "url" : "uri"
        node.content[key] = path.posix.relative(this.options.sourceDir, absUri)
      }
    }
  }

  /// Collect all ancestors into a single tileset.
  /// This may be necessary as a first operation for aggregate tilesets.
  async fetch(tileset) {
    await this._fetchChildren(tileset.root, this.options.sourceDir)
    return tileset
  }

  _exponential(node, base, factor, leaf) {
    if (node.children) {
      const top = Math.max(base, ...node.children.map(child => this._exponential(child, base, factor, leaf)))
      return (node.geometricError = top * factor)
    } else {
      return node.geometricError = leaf
    }
  }

  /// Assign `geometricError` to each tile based on the subtree depth.
  /// Geometric error will be `leaf` at leaf nodes and `base * factor**elevation(node)` on all inner nodes.
  /// The elevation of a node is determined by the longest path to a leaf.
  async exponential(tileset, base=2, factor=2, leaf=0) {
    this._exponential(tileset.root, base, factor, leaf)
    tileset.geometricError = tileset.root.geometricError
    return tileset
  }

  /// Create a new root node.
  /// This new node has the original root as its only child and its geometric error is set as specified by the parameter.
  async growRoot(tileset, geometricError) {
    tileset.root = {
      boundingVolume: jsonClone(tileset.root.boundingVolume),
      geometricError,
      children: [tileset.root],
      refine: "ADD",
    }
    return tileset
  }

  // On each level, the nodes are sorted by `x` or `y` coordinate of their bounding boxes (always choosing the longer dimension of the whole set) and split into two halves at the median.
  // Afterwards, every `compressLevels` consecutive levels are compressed into a node.
  _quickTree(nodes, compressLevels, depth) {
    if (nodes.length <= 1<<depth) {
      return nodes
    }
    const region = boundingRegion(nodes)
    const co = (region[2] - region[0] > region[3] - region[1]) ? 0: 1
    nodes.sort((a, b) => a.boundingVolume.region[co] - b.boundingVolume.region[co])
    const children = [nodes.splice(0, nodes.length / 2), nodes]
      .flatMap(slice => this._quickTree(slice, compressLevels, (depth || compressLevels) - 1))
    if (depth == 0) {
      return [{
        geometricError: 0,
        boundingVolume: { region },
        refine: "ADD",
        children,
      }]
    }
    return children
  }

  /// Dump all inner nodes and recreate the tileset from leaf nodes.
  /// Each inner node will have `2**compressLevels` children, all of roughly the same size.
  async quickTree(tileset, compressLevels=3) {
    const nodes = leaves(tileset)
    const root = this._quickTree(nodes, compressLevels, 0)[0]
    return {asset: tileset.asset, root}
  }

  /// Process all `b3dm` content using Draco compression.
  /// Requires gltf-pipeline to be installed. The resulting files will be stored in their paths relatively to the destination directory so they will be overwritten if source and destination directory is the same.
  async draco(tileset, quantization=8) {
    for (const uri of b3dmContent(tileset)) {
      const b3dmPath = systemPath(uri)
      const b3dm = await fsp.readFile(path.join(this.options.sourceDir, b3dmPath))
      const glb = extractGlb(b3dm)
      const dracoOptions = configDraco(Number(quantization))
      const dr = await gltfPipeline.processGlb(glb, { dracoOptions })
      const out = combineGlb(b3dm, dr.glb)
      const outPath = path.join(this.options.dstDir, b3dmPath)
      //console.log("write", out.length, "bytes to", outPath, "from original", b3dm.length, "bytes in", b3dmPath)
      await fsp.writeFile(outPath, out)
    }
    return tileset
  }

  /// No-operation. The tileset is passed without a change.
  async v(tileset) {
    return tileset
  }
}

module.exports = Filters

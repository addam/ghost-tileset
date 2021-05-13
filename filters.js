const path = require("path")
const {isTileset, boundingRegion} = require("./util")

function jsonClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function contentful(tileset) {
  const result = []
  const remaining = [tileset.root]
  while (remaining.length) {
    const node = remaining.pop()
    if (node.content) {
      result.push(node)
    } else {
      remaining.push(...(node.children || []))
    }
  }
  return result
}

class Filters {
  constructor(db) {
    this.db = db
  }

  _fetchChildren(node, rootPath, cwd) {
    for (const child of node.children || []) {
      this._fetchChildren(child, rootPath, cwd)
    }
    if (node.content && node.content.url) {
      const subUrl = path.join(cwd, node.content.url)
      if (isTileset(node.content.url)) {
        const sub = this.db.getDefault(subUrl)
        const subCwd = path.dirname(subUrl)
        this._fetchChildren(sub.root, rootPath, subCwd)
        node.children = node.children || []
        node.children.push(jsonClone(sub.root))
        delete node.content
      } else {
        // {tileset.path}/{node.content.url} = subUrl
        node.content.url = path.relative(rootPath, subUrl)
      }
    }
  }

  fetch(tileset) {
    // cwd: path relative to baseUrl
    // {baseUrl}/{cwd}/tileset.json is the file being processed
    tileset = jsonClone(tileset)
    this._fetchChildren(tileset.root, tileset.path, tileset.path)
    return tileset
  }

  _exponential(node, base, factor) {
    if (node.children) {
      const top = Math.max(base, ...node.children.map(child => this._exponential(child, base, factor)))
      return (node.geometricError = top * factor)
    } else {
      return node.geometricError = 0
    }
  }

  exponential(tileset, base, factor) {
    tileset = jsonClone(tileset)
    this._exponential(tileset.root, base, factor)
    return tileset
  }

  growRoot(tileset, geometricError) {
    tileset = jsonClone(tileset)
    tileset.root = {
      boundingVolume: jsonClone(tileset.root.boundingVolume),
      geometricError,
      children: [tileset.root],
      refine: "ADD",
    }
    return tileset
  }

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

  quickTree(tileset, compressLevels) {
    const nodes = contentful(tileset)
    const root = this._quickTree(nodes, compressLevels, 0)[0]
    return {asset: tileset.asset, root}
  }

  v(tileset) {
    return tileset
  }
}

module.exports = Filters

const path = require("path")
const {jsonClone, urlDirname, isTileset, boundingRegion} = require("./util")

// collect all ancestors that have content
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

  // cwd: path relative to baseUrl
  // {baseUrl}/{cwd}/tileset.json is the file being processed
  async _fetchChildren(node, cwd) {
    for (const child of node.children || []) {
      await this._fetchChildren(child, cwd)
    }
    if (node.content && node.content.url) {
      const subUrl = (cwd) ? `${cwd}/${node.content.url}`: node.content.url
      if (isTileset(node.content.url)) {
        const subCwd = urlDirname(subUrl)
        const sub = jsonClone(await this.db.getDefault(subUrl))
        this._fetchChildren(sub.root, subCwd)
        node.children = node.children || []
        node.children.push(sub.root)
        delete node.content
      } else if (cwd) {
        // {cwd}/{node.content.url} = subUrl
        node.content.url = path.posix.relative(cwd, subUrl)
      }
    }
  }

  async fetch(tileset) {
    await this._fetchChildren(tileset.root, tileset.path)
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

  async exponential(tileset, base, factor) {
    this._exponential(tileset.root, base, factor)
    tileset.geometricError = tileset.root.geometricError
    return tileset
  }

  async growRoot(tileset, geometricError) {
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

  async quickTree(tileset, compressLevels) {
    const nodes = contentful(tileset)
    const root = this._quickTree(nodes, compressLevels, 0)[0]
    return {asset: tileset.asset, root}
  }

  async v(tileset) {
    return tileset
  }
}

module.exports = Filters

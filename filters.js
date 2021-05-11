const path = require("path")

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
      if (path.basename(node.content.url) === "tileset.json") {
        const sub = this.db.getDefault(subUrl)
        const subCwd = path.dirname(subUrl)
        this._fetchChildren(sub.root, rootPath, subCwd)
        node.children = node.children || []
        node.children.push(JSON.parse(JSON.stringify(sub.root)))
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
    this._fetchChildren(tileset.root, tileset.path, tileset.path)
    return tileset
  }

  nop(tileset) {
    return tileset
  }
}

module.exports = Filters

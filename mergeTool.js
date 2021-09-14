const fs = require("fs")
const path = require("path")
const {boundingRegion} = require("./util")

// USAGE: node mergeTool.js (directory) [(geometricError)]
// tileset.json is created in directory by merging all tileset.json files in child directories (only depth 1)
// files with names other than "tileset.json" are ignored

// EXAMPLE
// assuming that we have a lot of tilesets /home/me/3dtiles/houses/Instanced0/tileset.json .. /InstancedZZX/tileset.json
// then this command:
// node mergeTool.js /home/me/3dtiles/houses/
// ...will write to /home/me/houses/tileset.json

const dir = process.argv[2]
const geometricError = Number(process.argv[3]) || 15

function makeRelativeUrl(node, dir) {
  if (node.content && node.content.url) {
    node.content.url = `${dir}/${node.content.url}`
  }
  for (const child of node.children || []) {
    makeRelativeUrl(child, dir)
  }
}

const children = []
for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
  if (entry.isDirectory()) {
    const filepath = path.join(dir, entry.name)
    try {
      const data = fs.readFileSync(path.join(filepath, "tileset.json"))
      const tileset = JSON.parse(data)
      makeRelativeUrl(tileset.root, entry.name)
      children.push(tileset.root)
    } catch (e) {
      console.error(e)
    }
  }
}

const result = {
  asset: {
    version: "1.0",
  },
  geometricError,
  root: {
    geometricError,
    boundingVolume: { region: boundingRegion(children) },
    refine: "ADD",
    children,
  }
}

fs.writeFileSync(path.join(dir, "tileset.json"), JSON.stringify(result))

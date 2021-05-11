const fs = require("fs")
const path = require("path")

// USAGE: node mergeTool.js directory [geometricError]
// tileset.json is created in directory by merging all tileset.json files in child directories (only depth 1)

// assuming that we have a lot of tilesets /home/mycity/beta/3dtiles/trees/Instanced0/tileset.json .. /InstancedZZX/tileset.json
// then this command:
// node mergeTool.js /home/mycity/beta/3dtiles/trees/
// ...will write to /home/mycity/beta/3dtiles/trees/tileset.json

const dir = process.argv[2]
const geometricError = Number(process.argv[3]) || 15

function makeRelativeUrl(node, dir) {
  if (node.content && node.content.url) {
    node.content.url = path.join(dir, node.content.url)
  }
  for (const child of node.children || []) {
    makeRelativeUrl(child)
  }
}

function boundingRegion(nodes) {
  let low = [Infinity, Infinity, Infinity]
  let high = [-Infinity, -Infinity, -Infinity]
  for (const node of nodes) {
    const region = node.boundingVolume.region
    low = [region[0], region[1], region[4]].map((x, i) => Math.min(x, low[i]))
    high = [region[2], region[3], region[5]].map((x, i) => Math.max(x, high[i]))
  }
  return [low[0], low[1], high[0], high[1], low[2], high[2]]
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

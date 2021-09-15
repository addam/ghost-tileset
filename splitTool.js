const fs = require("fs")
const path = require("path")
const {boundingRegion} = require("./util")

// USAGE: node splitTool.js (tileset) (directory) [split count]
// splits (tileset) into a master tileset.json and a number of child tilesets, all stored in (directory)
// the cuts are automatic so that the root and all child files contain roughly the same number of nodes

// EXAMPLE:
// node splitTool.js /home/me/3dtiles/houses/tree.json /home/me/3dtiles/houses/split/ 1

const source = process.argv[2]
const destination = process.argv[3]
const splitCount = Number(process.argv[4] || 1)
var num = 1

function countLeaves(root) {
  let result = 0
  const remaining = [root]
  while (remaining.length) {
    const node = remaining.pop()
    if (node.children) {
      remaining.push(...node.children)
    } else {
      result += 1
    }
  }
  return result
}

function subTileset(node, destination) {
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
  const tileset = {asset: {version: "1.0"}, root}
  const name = `${num++}.json`
  fs.writeFileSync(path.join(destination, name), JSON.stringify(tileset))
  return name
}

// returns count of child files in this subtree
// if this subtree has been cut away, the count is 1
function prune(node, destination, maxSize) {
  if (!node.children || !node.children.length) {
    return 1
  }
  const sizes = node.children.map(child => prune(child, destination, maxSize))
  for (let i=0; i<sizes.length; i++) {
    if (sizes[i] > maxSize) {
      const child = node.children[i]
      child.content = {url: subTileset(child, destination)}
      delete child.children
      sizes[i] = 1
    }
  }
  return sizes.reduce((a, b) => a + b, 0)
}

const data = fs.readFileSync(source, {encoding: "utf-8"})
const master = JSON.parse(data)
const origCount = countLeaves(master.root)
const maxSize = Math.pow(origCount, 1 / (splitCount + 1))
fs.mkdirSync(destination, {recursive: true})
prune(master.root, destination, maxSize)
console.log(`maxSize: ${maxSize} nodes, master leaves: ${countLeaves(master.root)} from original ${origCount}`)
fs.writeFileSync(path.join(destination, "tileset.json"), JSON.stringify(master))

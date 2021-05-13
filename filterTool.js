const fs = require("fs")
const path = require("path")
const Filters = require("./filters")

// USAGE: node filterTool.js (source) (destination) (filter:option[:option...]) [...]
// loads the (source) tileset, processes it through all the listed filters and stores the result in (destination)
// EXAMPLE:
// node filterTool.js /home/mycity/beta/3dtiles/sb20/1.json /home/mycity/beta/3dtiles/sb20/tree.json fetch quickTree:3 exponential:2:2

const source = process.argv[2]
const dst = process.argv[3]
const operations = process.argv.slice(4).map(code => code.split(/=|:|%3A/))

const baseUrl = path.dirname(source)

function loadTileset(url) {
  const data = fs.readFileSync(`${baseUrl}/${url}`, {encoding: "utf-8"})
  const result = JSON.parse(data)
  result.path = path.dirname(url)
  return result
}

const loader = {
  getDefault: loadTileset
}
const filters = new Filters(loader)

let tileset = loadTileset(path.basename(source))
for (const [name, ...args] of operations) {
  tileset = filters[name](tileset, ...args)
}
fs.writeFileSync(dst, JSON.stringify(tileset))

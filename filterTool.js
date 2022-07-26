const fs = require("fs")
const fsp = fs.promises
const path = require("path")
const Filters = require("./filters")

// USAGE: node filterTool.js (source) (destination) (filter:option[:option...]) [...]
// loads the (source) tileset, processes it through all the listed filters and stores the result in (destination)
// EXAMPLE:
// node filterTool.js /home/me/3dtiles/houses/tileset.json /home/me/3dtiles/houses/tree.json fetch quickTree:3 exponential:2:2

const source = process.argv[2]
const dst = process.argv[3]
const operations = process.argv.slice(4).map(code => code.split(/=|:|%3A/))

const sourceDir = path.dirname(source)
const dstDir = path.dirname(dst)

async function main(source) {
  await fsp.mkdir(dstDir, {recursive: true})
  const filters = new Filters({sourceDir, dstDir})

  const data = await fsp.readFile(source, { encoding: "utf-8" })
  let tileset = JSON.parse(data)
  for (const [name, ...args] of operations) {
    tileset = await filters[name](tileset, ...args)
  }
  await fsp.writeFile(dst, JSON.stringify(tileset))
}

main(source).then(process.exit)

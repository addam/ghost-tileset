const fs = require("fs")
const fsp = fs.promises
const path = require("path")
const buildPipeline = require("./filters")

// USAGE: node filterTool.js src:(source) (filter:option[:option...]) [...] (destination)
// loads the (source) tileset, processes it through all the listed filters and stores the result in (destination)
// EXAMPLE:
// node filterTool.js src:/home/me/source/tileset.json quickTree:3 fetch exponential:2:2 split draco:12 /home/me/destination/tileset.json
// node filterTool.js src:/home/me/tileset.7z:tileset.json quickTree fetch relative exponential split draco /home/me/3dtiles/houses/tree.json

function contentUri(node) {
  const content = node.content || {}
  return content.uri || content.url
}

function isRelative(uri) {
  return uri && !uri.match(/^\w+:\//)
}

// collect content from all nodes
async function listFiles(tileset, pipeline) {
  const result = []
  const remaining = [tileset.root]
  while (remaining.length) {
    const node = remaining.pop()
    const uri = contentUri(node)
    if (isRelative(uri)) {
      result.push(uri)
    }
    remaining.push(...(node.children || []))
  }
  return result
}

async function main(operations, destination) {
  const destinationDir = path.dirname(destination)
  const tilesetFile = path.basename(destination)

  async function write(name, data) {
    const file = path.join(destinationDir, name)
    await fsp.mkdir(path.dirname(file), { recursive: true })
    return fsp.writeFile(file, (data.write) ? data : JSON.stringify(data))
  }

  await fsp.mkdir(destinationDir, { recursive: true })
  const pipeline = await buildPipeline(operations)
  const tileset = await pipeline(tilesetFile)
  await write(tilesetFile, tileset)
  for (const target of await listFiles(tileset, pipeline)) {
    const data = await pipeline(target)
    await write(target, data)
  }
}

const destination = process.argv.pop()
const operations = process.argv.slice(2).map(code => code.split(/=|:|%3A/))

main(operations, destination).then(process.exit)

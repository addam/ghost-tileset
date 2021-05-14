const fs = require("fs")
const path = require("path")
const got = require("got")

// USAGE: node downloadTool.js (url) (dir)
// downloads the tileset (url), all child tilesets and re-links all content to absolute urls to (dir)
// EXAMPLE:
// node downloadTool.js https://vectortiles100.geo.admin.ch/3d-tiles/ch.swisstopo.swisstlm3d.3d/20201020/tileset.json /home/me/3dtiles/houses

// NOTE: all i/o is synchronous -- although there are some await's in the code
const source = process.argv[2]
const dir = process.argv[3]
var num = 1

function isTileset(url) {
  return path.basename(url).split("?")[0].endsWith(".json")
}

async function grab(url) {
  const name = `${num++}.json`
  response = await got(url)
  const tileset = JSON.parse(response.body)
  const currentUrl = path.dirname(url)
  const remaining = [tileset.root]
  while (remaining.length) {
    const node = remaining.pop()
    if (node.content && node.content.url) {
      const contentUrl = `${currentUrl}/${node.content.url}`
      if (isTileset(contentUrl)) {
        node.content.url = await grab(contentUrl)
      } else {
        node.content.url = contentUrl
      }
    }
    remaining.push(...(node.children || []))
  }
  console.log("write", name, "from", url)
  await fs.promises.writeFile(path.join(dir, name), JSON.stringify(tileset))
  return name
}

fs.mkdirSync(dir, {recursive: true})
grab(source).then(process.exit)

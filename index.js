const path = require("path")
const url = require("url")
const express = require("express")
const cors = require("cors")
const got = require("got")
const request = require("request")
const Microdb = require("./microdb")
const Filters = require("./filters")
const {isTileset, jsonClone, urlDirname} = require("./util")

// USAGE: node index.js (baseUrl) [(port)]
// creates a proxy for the (baseUrl) tileset folder
// the tilesets can be accessed on localhost:(port)/(tilesetName)?(filter:option:option[...])
// while being loaded, the tileset is processed by the filters on the fly

const source = process.argv[2]
const baseUrl = source.includes("://") ? source : (path.sep == "/") ? `file://${source}` : `file://${source.replace(path.sep, "/")}`
const port = process.argv[3] || process.env.PORT || 3000

async function getTileset(url) {
  console.log(`load ${baseUrl}/${url}`)
  const response = await got(`${baseUrl}/${url}`, {json: true})
  return response.body
}

const cache = new Microdb(getTileset)
const filters = new Filters(cache)

const app = express()
app.use(cors())

app.use(function (req, res, next) {
  req.query = url.parse(req.url).query
  next()
});

function invalidRequest(res, err) {
  console.error(err)
  res.status(500).end()
}

app.get("/", (req, res) => {
  res.send("<!doctype html><a href='20201020/tileset.json'>Swiss houses</a>")
})

app.get("/*", async (req, res) => {
  try {
    const path = req.params[0]
    if (isTileset(path)) {
      let tileset = await cache.getDefault(path)
      tileset = jsonClone(tileset)
      tileset.path = urlDirname(path)
      for (const code of (req.query ? req.query.split("&") : [])) {
        const [name, ...args] = code.split(/=|:|%3A/)
        tileset = await filters[name](tileset, ...args)
      }
      res.json(tileset)
    } else {
      console.log(`proxy ${baseUrl}/${path}`)
      request(`${baseUrl}/${path}`).pipe(res)
    }
  } catch (err) {
    invalidRequest(res, err)
  }
})

app.listen(port)
console.log(`ghost-tileset running on http://localhost:${port}`)


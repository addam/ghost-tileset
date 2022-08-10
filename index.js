const path = require("path")
const url = require("url")
const express = require("express")
const cors = require("cors")
const got = require("got")
const request = require("request")
const Cache = require("./microdb")
const buildPipeline = require("./filters")
const { isTileset, jsonClone, urlDirname } = require("./util")

// USAGE: node index.js (baseUrl) [(port)]
// creates a proxy for the (baseUrl) tileset folder
// the tilesets can be accessed on localhost:(port)/(tilesetName)?(filter:option:option[...])
// while being loaded, the tileset is processed by the filters on the fly

const source = process.argv[2]
const baseUrl = source.includes("://") ? source : (path.sep == "/") ? `file://${source}` : `file://${source.replace(path.sep, "/")}`
const port = process.argv[3] || process.env.PORT || 3000

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

function getPipeline(query) {
  // TODO forbid explicitly using the `src` filter
  const operations = (query ? query.split("&") : [])
    .map(code => code.split(/=|:|%3A/));
  operations.unshift(["src", source])
  return buildPipeline(operations)
}
getPipeline = Cache(getPipeline)

app.get("/", (req, res) => {
  // TODO link to Sandcastle instead
  res.send("<!doctype html><a href='20201020/tileset.json'>Swiss houses</a>")
})

app.get("/*", async (req, res) => {
  try {
    const path = req.params[0]
    const pipeline = await getPipeline(req.query)
    const result = await pipeline(path)
    if (isTileset(path)) {
      res.json(result)
    } else {
      res.send(result)
    }
  } catch (err) {
    invalidRequest(res, err)
  }
})

app.listen(port)
console.log(`ghost-tileset running on http://localhost:${port}`)


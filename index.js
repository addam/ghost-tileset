const path = require("path")
const url = require("url")
const fs = require("fs")
const express = require("express")
const cors = require("cors")
const Microdb = require("./microdb")
const Filters = require("./filters")

const baseUrl = "/home/mycity/beta/3dtiles"

function loadTileset(url) {
  const data = fs.readFileSync(`${baseUrl}/${url}`, {encoding: "utf-8"})
  const result = JSON.parse(data)
  result.path = path.dirname(url)
  return result
}

const cache = new Microdb(loadTileset)
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

app.get("/3dtiles/*", (req, res) => {
  try {
    const path = req.params[0]
    if (path.endsWith("/tileset.json")) {
      let tileset = cache.getDefault(path)
      for (const code of req.query.split("&")) {
        const [name, ...args] = code.split(/=|:|%3A/)
        tileset = filters[name](tileset, ...args)
      }
      res.json(tileset)
    } else {
      res.sendFile(path, {root: baseUrl})
    }
  } catch (err) {
    invalidRequest(res, err)
  }
})

app.get("/", (req, res) => {
  res.send("<!doctype html><a href='/3dtiles/2884/tileset.json'>Swiss buildings</a>, <a href='/3dtiles/trees/tileset.json'>Trees</a>")
})

var port = process.env.PORT || 3000
app.listen(port)
console.log(`ghost-tileset running on http://localhost:${port}`)


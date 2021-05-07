const fs = require("fs")
const express = require("express")
const microdb = require("./microdb")

const app = express()
const cache = new microdb()

const baseUrl = "/home/mycity/beta/3dtiles"

function invalidRequest(res, err) {
  console.error(err)
  res.status(500).end()
}

function loadTileset(id) {
  const path = `${baseUrl}/${id}`
  const data = fs.readFileSync(`${path}/tileset.json`, {encoding: "utf-8"})
  const result = JSON.parse(data)
  result.path = path
  return result
}

app.get("/3dtiles/:tileset/*", (req, res) => {
  try {
    const tileset = cache.getdefault(req.params.tileset, loadTileset)
    if (req.params[0] === "tileset.json") {
      res.json(tileset)
    } else {
      res.sendFile(req.params[0], {root: tileset.path})
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


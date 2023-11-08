const url = require("url")
const express = require("express")
const cors = require("cors")
const Cache = require("./microdb")
const buildPipeline = require("./filters")
const { isTileset, jsonClone, urlDirname, tryParseNumber } = require("./util")

// USAGE: node index.js (baseUrl) [(port)]
// creates a proxy for the (baseUrl) tileset folder
// the tilesets can be accessed on localhost:(port)/(tilesetName)?(filter:option:option[...])
// while being loaded, the tileset is processed by the filters on the fly

const source = process.argv[2]
if (!source) {
  console.error("Usage: node index.js (baseUrl) [(port)]")
  process.exit(1)
}
const port = process.argv[3] || process.env.PORT || 3000

const app = express()
app.use(cors())

function getParams(req) {
  const query = url.parse(req.url).query
  if (!query) {
    return []
  }
  // Cesium does not handle query parameters without a `=` well
  const match = query.match(/v=[\d.]+&(.+)=undefined/)
  if (match && match[1]) {
    return match[1].split("%26")
  }
  return query.split("&").map(x => x.endsWith("=") ? x.slice(0, -1) : x)
}

function getPipeline(req) {
  // TODO forbid explicitly using the `src` filter, for security
  const operations = [source, ...getParams(req, source)]
    .map(code => code.split(/:|%3A/).map(tryParseNumber));
  return buildPipeline(operations)
}

app.get("/", (req, res) => {
  res.send("<!doctype html><a href='https://sandcastle.cesium.com/#c=bZJRb9MwEMe/ipWnVApOIJNAoRugFok+FE1bACHlxbOv64Fjh/Ol7Yb47nOSDbUwPzjJ3f3u/z/H2rvAYoewBxLnwsFeLCBg38qvYyxtEj1+L7xjhQ6oSTLxu3FCMBDFyCX5HRqgSqi9Qn7CNYFi+ObJmnoq/BDunE5n2cAS/Ooh8BW4SK69gUow9RBzf2ZvGzf5kUGDA6lVC6RkAB4spaO2iTA6xehd9aS4UMTxTblSbsi3S7glgJC+kWUmzl7LIhMvoZzkPSHEcSb8aOZPoAy620tkvb3y1p40ig1evIpbMfWI1mtSLmw8tX89rBUTHs7kavnxc72qvz87UEfYIuMOglTGpCfHNj3KZY0W4sSjgS9k00GxSbbMXZXn1mtltz5wVRZFkfNj7Y/g3Tut9BaapHGzI104cLSbPmpMwROllQsdaPa0xgO6gUyyRMQ1D3xn4WKQH9Z7bDtPLPpoScqcoe1s/M0hv+n1z2hBhzDAI5kfo3ODO4Hm/JnrJLRVIcTMprf2Gu+j+4t5Huv/Q9l7e6Pon/wD'>View in Sandcastle</a>")
})

app.get("/*", async (req, res) => {
  const pth = req.params[0]
  if (pth.endsWith("favicon.ico")) {
    res.status(404).end()
    return
  }
  try {
    const pipeline = await getPipeline(req)
    const result = await pipeline(pth)
    if (isTileset(pth)) {
      res.json(result)
    } else if (result) {
      res.set('Content-Type', 'application/octet-stream')
      res.send(result)
    }
  } catch (e) {
    console.error(e)
    res.status(500).end()
  }
})

app.listen(port)
console.log(`ghost-tileset running on http://localhost:${port}`)


const url = require("url")
const express = require("express")
const cors = require("cors")
const Cache = require("./microdb")
const buildPipeline = require("./filters")
const { isTileset, jsonClone, urlDirname } = require("./util")

// USAGE: node index.js (baseUrl) [(port)]
// creates a proxy for the (baseUrl) tileset folder
// the tilesets can be accessed on localhost:(port)/(tilesetName)?(filter:option:option[...])
// while being loaded, the tileset is processed by the filters on the fly

const source = process.argv[2]
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

function tryParseNumber(value) {
  return (isNaN(value) || value == "") ? value : Number(value)
}

function getPipeline(query) {
  // TODO forbid explicitly using the `src` filter
  const operations = (query ? query.split("&") : [])
    .map(code => code.split(/=|:|%3A/).map(tryParseNumber));
  operations.unshift(["src", source])
  return buildPipeline(operations)
}
getPipeline = Cache(getPipeline)

app.get("/", (req, res) => {
  // TODO link to Sandcastle instead
  res.send("<!doctype html><a href='https://sandcastle.cesium.com/#c=bZLRb9MwEMb/FStPmRScQCaBQjchtUj0oWgaEQgpL559XQ8cO5wvXQHtf8eux9TB/OAk5/vu931ytHeBxR7hDkhcCAd3YgkB51F+PtbKodDH76V3rNABDUUlfg9OCAaiWLkiv0cD1P0VagLF8MWTNX1uKc+qJCD4MUPga3CxfeMNdIJphsHdn70d3OCyCxk0OJBajUBKBuBkpDwSTVSjU4zePdKWiji+KdfKLflxBbcEEMo3sq3E+WvZVOIltJnvCSGGyPKTpB9AGXS3V8h6d+2tfTIoDnjxKm5NnhG996Rc2HoaHz1sFBMezuV69f5jv+6/Vs9HmghHZNxDkMqY8sRBfrSrHi3ExDntTLYTQ7Fjnrq6tl4ru/OBu7Zpmppzp/wWvBuKxEvABxwcOPosH4bn4hPE2oUJNHva4AFdUhZVIeJaBP5p4TLh03qH4+SJk5VSypphnGy821DfzPp7pOsQkviorE+lC4N7gebimb9HaKtCiCfb2dpP+AuG4nJRx/7/pOy9vVH0z/kf'>View in Sandcastle</a>")
})

app.get("/*", async (req, res) => {
  try {
    const pth = req.params[0]
    const pipeline = await getPipeline(req.query)
    const result = await pipeline(pth)
    if (isTileset(pth)) {
      res.json(result)
    } else {
      res.set('Content-Type', 'application/octet-stream')
      res.send(result)
    }
  } catch (err) {
    invalidRequest(res, err)
  }
})

app.listen(port)
console.log(`ghost-tileset running on http://localhost:${port}`)


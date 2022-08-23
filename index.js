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

function tryParseNumber(value) {
  return (isNaN(value) || value == "") ? value : Number(value)
}

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
  const operations = getParams(req)
    .map(code => code.split(/:|%3A/).map(tryParseNumber));
  operations.unshift(["src", source])
  return buildPipeline(operations)
}

app.get("/", (req, res) => {
  res.send("<!doctype html><a href='https://sandcastle.cesium.com/#c=bZLRb9MwEMb/FStPmRScQCaBQjchtUj0oWgaEQgpL559XQ8cO5wvXQHtf8eux9TB/OAk5/vu931ytHeBxR7hDkhcCAd3YgkB51F+PtbKodDH76V3rNABDUUlfg9OCAaiWLkiv0cD1P0VagLF8MWTNX1uKc+qJCD4MUPga3CxfeMNdIJphsHdn70d3OCyCxk0OJBajUBKBuBkpDwSTVSjU4zePdKWiji+KdfKLflxBbcEEMo3sq3E+WvZVOIltJnvCSGGyPKTpB9AGXS3V8h6d+2tfTIoDnjxKm5NnhG996Rc2HoaHz1sFBMezuV69f5jv+6/Vs9HmghHZNxDkMqY8sRBfrSrHi3ExDntTLYTQ7Fjnrq6tl4ru/OBu7Zpmppzp/wWvBuKxEvABxwcOPosH4bn4hPE2oUJNHva4AFdUhZVIeJaBP5p4TLh03qH4+SJk5VSypphnGy821DfzPp7pOsQkviorE+lC4N7gebimb9HaKtCiCfb2dpP+AuG4nJRx/7/pOy9vVH0z/kf'>View in Sandcastle</a>")
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


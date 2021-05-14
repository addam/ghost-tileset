const path = require("path")

module.exports = {
  boundingRegion(nodes) {
    let low = [Infinity, Infinity, Infinity]
    let high = [-Infinity, -Infinity, -Infinity]
    for (const node of nodes) {
      const region = node.boundingVolume.region
      low = [region[0], region[1], region[4]].map((x, i) => Math.min(x, low[i]))
      high = [region[2], region[3], region[5]].map((x, i) => Math.max(x, high[i]))
    }
    return [low[0], low[1], high[0], high[1], low[2], high[2]]
  },

  // given an url that ends in a filename, strips the filename off
  urlDirname(url) {
    return url.replace(/(.*)\/.*/, "$1")
  },

  isTileset(url) {
    return path.basename(url).split("?")[0].endsWith(".json")
  },

  jsonClone(obj) {
    return JSON.parse(JSON.stringify(obj))
  }
}

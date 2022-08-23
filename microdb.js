const Lock = require('./lock')

module.exports = function (callback, maxSize=1000) {
  const data = new Map() // args.map(JSON::stringify).join(",") -> [value, time]
  const lock = Lock()
  let now = 0

  function cleanup() {
    const victims = [...data.entries()]
      .sort((a, b) => a[1][1] - b[1][1])
      .slice(data.size - maxSize);
    for (const [id, ..._] of victims) {
      data.delete(id)
    }
  }

  return async function(...args) {
    const id = args.map(x => JSON.stringify(x)).join(",")
    const release = await lock(id)
    let result = data.get(id)
    if (result === undefined) {
      result = [await callback(...args), now++]
      if (data.size > 2 * maxSize) {
        cleanup()
      }
      data.set(id, result)
    } else {
      result[1] = now++
    }
    await release()
    return result[0]
  }
}

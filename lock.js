function createLock() {
  clients = new Map()

  function nop() {
  }

  return async(id) => {
    const waiting = clients.get(id)
    if (!waiting) {
      const queue = []
      clients.set(id, queue)
      return async() => {
        clients.delete(id)
        if (queue.length) {
          for (const resolve of queue) {
            await resolve(nop)
          }
        }
      }
    }
    return new Promise((resolve, reject) => {
      waiting.push(resolve)
    })
  }
}

module.exports = createLock

async function test() {
  const startTime = new Date()
  function log(...args) {
    console.log(new Date() - startTime, "ms:", ...args)
  }

  const lock = createLock();
  (async() => {
    const release = await lock("first")
    setTimeout(async() => {
      log("first long operation done")
      await release()
    }, 1000)
  })();

  (async() => {
    const release = await lock("first")
    log("first quick operation done")
    await release()
  })();

  (async() => {
    const release = await lock("second")
    log("second quick operation done")
    await release()
  })();
}

if (require.main === module) {
    test()
}

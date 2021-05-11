module.exports = class MicroDb {
  constructor(defaultFunc) {
    this.cacheTimeoutMilliseconds = 3600 * 1000
    this.lastCacheCleanup = new Date()
    this.content = new Map()
    this.time = new Map()
    this.defaultFunc = defaultFunc
  }

  cleanupCache() {
    const now = new Date()
    for (const [id, time] of this.time.entries()) {
      if (now - time > this.cacheTimeoutMilliseconds) {
        this.content.delete(id)
        this.time.delete(id)
      }
    }
    this.lastCacheCleanup = now
  }

  create(id, item) {
    const now = new Date()
    if (now - this.lastCacheCleanup > this.cacheTimeoutMilliseconds) {
      this.cleanupCache()
    }
    this.content.set(id, item)
    this.time.set(id, now)
  }

  read(id) {
    return this.content.get(id)
  }

  getDefault(id, func) {
    let result = this.read(id)
    if (result === undefined) {
      result = (func || this.defaultFunc)(id)
      this.create(id, result)
    }
    return result
  }
}

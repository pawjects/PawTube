/**
 * PawTube - Client-side In-Memory TTL Cache
 */

class SimpleCache {
  constructor() {
    this.map = new Map();
  }

  get(key) {
    const item = this.map.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.map.delete(key);
      return null;
    }
    return item.data;
  }

  set(key, data, ttlMs = 60000) {
    this.map.set(key, {
      data,
      expiry: Date.now() + ttlMs
    });
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

export const cache = new SimpleCache();
export default cache;

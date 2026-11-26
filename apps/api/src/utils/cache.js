// A small in-memory cache for data that is read often and changes rarely. Each API instance has
// its own copy. Never put child or family data in it.
export function createCache({ ttlMs, maxEntries, now = Date.now }) {
  const entries = new Map();
  // Goes up on every clear(), so a read that started before a change is not saved after it
  let generation = 0;

  function get(key) {
    const entry = entries.get(key);
    if (entry === undefined) return undefined;
    if (now() >= entry.expiresAt) {
      entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key, value) {
    entries.delete(key);
    if (entries.size >= maxEntries) {
      // A Map keeps insertion order, so the first key is the oldest
      entries.delete(entries.keys().next().value);
    }
    entries.set(key, { value, expiresAt: now() + ttlMs });
  }

  function clear() {
    generation += 1;
    entries.clear();
  }

  async function getOrLoad(key, load) {
    const cached = get(key);
    if (cached !== undefined) return cached;

    const startedAt = generation;
    const value = await load();
    if (startedAt === generation) set(key, value);
    return value;
  }

  return { get, set, clear, getOrLoad };
}

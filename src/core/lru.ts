// Tiny LRU over Map insertion order — touch moves to newest; at capacity the
// oldest key is dropped. Used by sprite caches so we never nuke the whole table.

/** Re-insert so this key becomes the newest (Map preserves insertion order). */
export function lruTouch<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
}

/** Drop oldest entries until size < cap (room for one insert). */
export function lruEvictOldest<K, V>(map: Map<K, V>, cap: number): void {
  while (map.size >= cap) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** Keep only keys present in `live`. */
export function pruneMapKeys<K, V>(map: Map<K, V>, live: ReadonlySet<K>): void {
  for (const key of map.keys()) {
    if (!live.has(key)) map.delete(key);
  }
}

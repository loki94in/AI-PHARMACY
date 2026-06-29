/**
 * apiCache — stale-while-revalidate in-memory cache for local API calls.
 *
 * Strategy:
 *  - Fresh  (< TTL):          return cached data instantly, no network call
 *  - Stale  (TTL – TTL×4):   return cached data instantly + revalidate in background
 *  - Expired (> TTL×4):      block and fetch fresh (first load or very stale)
 *
 * Invalidation: call invalidate('key-prefix') after any mutation that changes that data.
 */

interface Entry<T> {
  data: T;
  ts: number;              // when data was fetched
  inflight?: Promise<T>;   // deduplicate concurrent requests
}

const store = new Map<string, Entry<any>>();

export const TTL = {
  SHORT:  15_000,  // 15s — frequently changing (orders, refills)
  MEDIUM: 30_000,  // 30s — moderately changing (purchases, sales history)
  LONG:   60_000,  // 60s — slow changing (inventory, distributors, doctors)
  XLONG: 120_000,  // 2m  — almost static (medicines DB, license)
} as const;

/**
 * Wrap any async fetcher with caching.
 * key     — unique string for this endpoint + params combo
 * fetcher — the actual API call () => Promise<T>
 * ttl     — freshness window in ms (use TTL.* constants)
 */
export function cached<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
  const entry = store.get(key) as Entry<T> | undefined;
  const now = Date.now();

  if (entry) {
    const age = now - entry.ts;

    // Fresh — return immediately
    if (age < ttl) {
      return Promise.resolve(entry.data);
    }

    // Stale — return old data, kick off background refresh (deduped)
    if (age < ttl * 4) {
      if (!entry.inflight) {
        entry.inflight = fetcher().then(data => {
          store.set(key, { data, ts: Date.now() });
          return data;
        }).finally(() => {
          const e = store.get(key);
          if (e) e.inflight = undefined;
        });
      }
      return Promise.resolve(entry.data);
    }
  }

  // No cache or expired — deduplicate concurrent first loads
  const existing = store.get(key);
  if (existing?.inflight) return existing.inflight as Promise<T>;

  const inflight = fetcher().then(data => {
    store.set(key, { data, ts: Date.now() });
    return data;
  }).finally(() => {
    const e = store.get(key);
    if (e) e.inflight = undefined;
  });

  store.set(key, { data: undefined as any, ts: 0, inflight });
  return inflight;
}

/**
 * Immediately remove all cache entries whose key starts with prefix.
 * Call this after any mutation (POST / PUT / DELETE) that changes the data.
 * Examples:
 *   invalidate('inventory')  → clears inventory, inventory/*, inventory?*
 *   invalidate('purchases')  → clears all purchase-related cache entries
 */
export function invalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(prefix + ':') || key.startsWith(prefix + '?')) {
      store.delete(key);
    }
  }
}

/** Wipe everything — useful when the user logs out or does a full sync. */
export function invalidateAll(): void {
  store.clear();
}

/** For debugging: see what's cached and how old each entry is. */
export function debugCache(): Record<string, { age: number; stale: boolean }> {
  const now = Date.now();
  const out: Record<string, { age: number; stale: boolean }> = {};
  store.forEach((entry, key) => {
    const age = now - entry.ts;
    out[key] = { age, stale: age > TTL.SHORT };
  });
  return out;
}

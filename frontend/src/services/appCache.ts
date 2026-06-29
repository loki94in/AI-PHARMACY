/**
 * appCache.ts — Central client-side cache for the pharmacy app.
 *
 * Design goals:
 *  - Pages mount and show data INSTANTLY from cache (no loading spinner on navigation)
 *  - When a mutation happens anywhere (sale, purchase, inventory edit), related
 *    caches are invalidated and live pages re-fetch silently in the background
 *  - Pages that are NOT mounted just get a stale flag; they re-fetch on next mount
 */

// ─── Cache keys ─────────────────────────────────────────────────────────────

export type CacheKey =
  | 'inventory'
  | 'sells'
  | 'purchases'
  | 'purchase_history'
  | 'dashboard'
  | 'expiry'
  | 'staged_sales'
  | 'staged_purchases'
  | 'orders'
  | 'dispatch'
  | 'doctors'
  | 'automation'
  | 'crm'
  | 'mail'
  | 'database';

// ─── Cache entry ─────────────────────────────────────────────────────────────

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;   // ms since epoch
  isStale: boolean;
}

// ─── TTLs (ms) — how long before background refresh triggers ─────────────────

const TTL: Record<CacheKey, number> = {
  inventory:        5 * 60_000,  // 5 min
  sells:            3 * 60_000,  // 3 min
  purchases:        3 * 60_000,
  purchase_history: 5 * 60_000,
  dashboard:        2 * 60_000,  // 2 min (stats change often)
  expiry:          10 * 60_000,  // 10 min (rarely changes)
  staged_sales:    30_000,        // 30 s (needs to be fresh for billing)
  staged_purchases:30_000,
  orders:           5 * 60_000,
  dispatch:         2 * 60_000,
  doctors:         10 * 60_000,
  automation:       2 * 60_000,
  crm:              5 * 60_000,
  mail:             2 * 60_000,
  database:        10 * 60_000,
};

// ─── Subscriber registry ─────────────────────────────────────────────────────
// When a page is mounted, it registers a callback so it can re-render when
// its cache key is updated by another page's mutation.

type Subscriber = (data: any) => void;
const subscribers = new Map<CacheKey, Set<Subscriber>>();

// ─── Internal store ──────────────────────────────────────────────────────────

const store = new Map<CacheKey, CacheEntry>();

// ─── Public API ──────────────────────────────────────────────────────────────

export const appCache = {
  /**
   * Check whether a key has fresh data in cache.
   */
  has(key: CacheKey): boolean {
    const entry = store.get(key);
    if (!entry) return false;
    if (entry.isStale) return false;
    return (Date.now() - entry.timestamp) < TTL[key];
  },

  /**
   * Get cached data. Returns undefined if not cached.
   * Does NOT distinguish stale from fresh — callers decide whether to re-fetch.
   */
  get<T>(key: CacheKey): T | undefined {
    return store.get(key)?.data as T | undefined;
  },

  /**
   * Store data in cache and notify all mounted subscribers immediately.
   */
  set<T>(key: CacheKey, data: T): void {
    store.set(key, { data, timestamp: Date.now(), isStale: false });
    // Notify any mounted pages that subscribe to this key
    subscribers.get(key)?.forEach(cb => cb(data));
  },

  /**
   * Mark one or more keys as stale.
   * - Mounted pages (subscribers) will receive a null signal to trigger re-fetch
   * - Unmounted pages will re-fetch on next mount when they check isStale
   */
  invalidate(keys: CacheKey | CacheKey[]): void {
    const keyList = Array.isArray(keys) ? keys : [keys];
    keyList.forEach(key => {
      const entry = store.get(key);
      if (entry) {
        store.set(key, { ...entry, isStale: true });
      } else {
        // Mark as stale even if never populated
        store.set(key, { data: undefined, timestamp: 0, isStale: true });
      }
      // Signal mounted pages to re-fetch
      subscribers.get(key)?.forEach(cb => cb(null));
    });
  },

  /**
   * Subscribe to cache updates for a key.
   * Returns an unsubscribe function.
   * callback(data) — called with fresh data when cache is set
   * callback(null)  — called when cache is invalidated (trigger re-fetch)
   */
  subscribe(key: CacheKey, callback: Subscriber): () => void {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key)!.add(callback);
    return () => subscribers.get(key)?.delete(callback);
  },

  /**
   * isStale — true if cache entry exists but is stale, or TTL has expired.
   */
  isStale(key: CacheKey): boolean {
    const entry = store.get(key);
    if (!entry) return true;
    if (entry.isStale) return true;
    return (Date.now() - entry.timestamp) >= TTL[key];
  },

  /** Clear everything (e.g. on logout) */
  clear(): void {
    store.clear();
  },
};

// ─── Mutation → invalidation map ─────────────────────────────────────────────
// Call these from mutation sites (POS, Purchases, Inventory edit, etc.)

export const cacheInvalidators = {
  /** Call after a sale invoice is created (POS checkout) */
  onSaleCreated(): void {
    appCache.invalidate(['sells', 'inventory', 'dashboard']);
  },

  /** Call after an existing sale bill is edited (qty/items changed) */
  onSaleUpdated(): void {
    appCache.invalidate(['sells', 'inventory', 'dashboard']);
  },

  /** Call after a sale bill is deleted from history */
  onSaleDeleted(): void {
    appCache.invalidate(['sells', 'inventory', 'dashboard']);
  },

  /** Call after a purchase bill is saved */
  onPurchaseCreated(): void {
    appCache.invalidate(['purchases', 'purchase_history', 'inventory', 'dashboard']);
  },

  /** Call after an existing purchase bill is edited */
  onPurchaseUpdated(): void {
    appCache.invalidate(['purchases', 'purchase_history', 'inventory', 'dashboard']);
  },

  /** Call after a purchase bill is deleted */
  onPurchaseDeleted(): void {
    appCache.invalidate(['purchases', 'purchase_history', 'inventory', 'dashboard']);
  },

  /** Call after any inventory item is edited (qty, price, rack, etc.) */
  onInventoryUpdated(): void {
    appCache.invalidate(['inventory', 'expiry']);
  },

  /** Call after a staged/phone sale is approved */
  onStagedSaleApproved(): void {
    appCache.invalidate(['staged_sales', 'sells', 'inventory', 'dashboard']);
  },

  /** Call after a staged purchase is approved */
  onStagedPurchaseApproved(): void {
    appCache.invalidate(['staged_purchases', 'purchases', 'purchase_history', 'inventory', 'dashboard']);
  },

  /** Call when a mobile bill syncs via SSE */
  onMobileSaleSync(): void {
    appCache.invalidate(['staged_sales', 'sells', 'inventory', 'dashboard']);
  },

  /** Call when a mobile purchase syncs via SSE */
  onMobilePurchaseSync(): void {
    appCache.invalidate(['staged_purchases', 'purchases', 'inventory', 'dashboard']);
  },

  /** Call after doctor/distributor data changes */
  onReferenceDataUpdated(): void {
    appCache.invalidate(['doctors', 'automation']);
  },

  /** Call when orders change (special orders) */
  onOrdersUpdated(): void {
    appCache.invalidate(['orders', 'dispatch', 'automation']);
  },
};

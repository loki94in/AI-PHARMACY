/**
 * useInfiniteScroll.ts
 *
 * Reusable infinite scroll hook for all list pages (Sells, Purchases, Inventory).
 *
 * Behaviour:
 *  - Reads first batch instantly from appCache (populated by prefetchAll on app start)
 *  - Attaches an IntersectionObserver to a sentinel ref at the bottom of the list
 *  - When sentinel enters viewport → silently fetches next batch and appends
 *  - Filter change → resets rows to [] and re-fetches from offset 0
 *  - Mutation (onSaleCreated etc.) invalidates cache → hook re-fetches from offset 0
 *    and replaces the list so the new record appears immediately
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { appCache, type CacheKey } from '../services/appCache';

export interface InfiniteScrollOptions<F> {
  /** appCache key for this page's data */
  cacheKey: CacheKey;
  /** Batch size per fetch (default 100) */
  batchSize?: number;
  /**
   * Fetcher: receives current offset + filters, returns { data: T[], meta: { total: number } }
   * OR just T[] (for APIs that don't return meta yet).
   */
  fetcher: (offset: number, filters: F) => Promise<{ data: any[]; meta?: { total: number } } | any[]>;
  /** Initial filter state */
  initialFilters: F;
}

export interface InfiniteScrollResult<T, F> {
  rows: T[];
  total: number;
  loading: boolean;          // true only on first load (no cached data yet)
  loadingMore: boolean;      // true when fetching next batch on scroll
  hasMore: boolean;
  filters: F;
  setFilters: (f: F) => void;
  sentinelRef: React.RefObject<HTMLDivElement>;
  reset: () => void;         // call after a mutation to force re-fetch from top
}

export function useInfiniteScroll<T, F extends Record<string, any>>(
  opts: InfiniteScrollOptions<F>
): InfiniteScrollResult<T, F> {
  const { cacheKey, batchSize = 100, fetcher, initialFilters } = opts;

  // Seed from appCache (populated by prefetchAll) so first render is instant
  const seed = appCache.get<any>(cacheKey);
  const seedRows: T[] = seed
    ? (Array.isArray(seed) ? seed : (seed as any).data ?? [])
    : [];
  const seedTotal: number = seed && !Array.isArray(seed) ? ((seed as any).meta?.total ?? seedRows.length) : seedRows.length;

  const [rows, setRows]           = useState<T[]>(seedRows);
  const [total, setTotal]         = useState<number>(seedTotal);
  const [loading, setLoading]     = useState<boolean>(seedRows.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]     = useState<boolean>(seedRows.length >= batchSize);
  const [filters, setFiltersState] = useState<F>(initialFilters);

  const offsetRef   = useRef<number>(seedRows.length > 0 ? seedRows.length : 0);
  const fetchingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const filtersRef  = useRef<F>(initialFilters);

  // ── Core fetch function ─────────────────────────────────────────────────────
  const fetchBatch = useCallback(async (offset: number, currentFilters: F, replace: boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (replace) setLoading(true);
    else setLoadingMore(true);

    try {
      const result = await fetcher(offset, currentFilters);
      const batch: T[] = Array.isArray(result) ? result : (result as any).data ?? [];
      const newTotal: number = Array.isArray(result)
        ? (replace ? batch.length : 99999)
        : ((result as any).meta?.total ?? (replace ? batch.length : 99999));

      setRows(prev => replace ? batch : [...prev, ...batch]);
      setTotal(newTotal);
      setHasMore(batch.length >= batchSize);
      offsetRef.current = offset + batch.length;

      // Update appCache with fresh first-page data so subscriber pages stay warm
      if (replace) {
        appCache.set(cacheKey, Array.isArray(result) ? batch : result);
      }
    } catch (err) {
      console.error(`[useInfiniteScroll] fetch error (${cacheKey}):`, err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [fetcher, batchSize, cacheKey]);

  // ── Filter change → reset list ─────────────────────────────────────────────
  const setFilters = useCallback((newFilters: F) => {
    filtersRef.current = newFilters;
    setFiltersState(newFilters);
    offsetRef.current = 0;
    fetchBatch(0, newFilters, true);
  }, [fetchBatch]);

  // ── Manual reset (call after mutation) ────────────────────────────────────
  const reset = useCallback(() => {
    offsetRef.current = 0;
    fetchBatch(0, filtersRef.current, true);
  }, [fetchBatch]);

  // ── Initial load (if cache was empty) ─────────────────────────────────────
  useEffect(() => {
    if (seedRows.length === 0) {
      fetchBatch(0, initialFilters, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Subscribe to cache invalidation (mutation on another page) ────────────
  useEffect(() => {
    return appCache.subscribe(cacheKey, (signal) => {
      if (signal === null) {
        // Cache was invalidated — re-fetch from top to get fresh data
        offsetRef.current = 0;
        fetchBatch(0, filtersRef.current, true);
      }
    });
  }, [cacheKey, fetchBatch]);

  // ── IntersectionObserver — fires when sentinel scrolls into view ───────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetchingRef.current) {
          fetchBatch(offsetRef.current, filtersRef.current, false);
        }
      },
      { rootMargin: '200px' } // start loading 200px before hitting bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchBatch]);

  return { rows, total, loading, loadingMore, hasMore, filters, setFilters, sentinelRef, reset };
}

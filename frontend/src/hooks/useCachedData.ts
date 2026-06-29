/**
 * useCachedData — React hook for instant page loads with background refresh.
 *
 * Usage:
 *   const { data, loading, refresh } = useCachedData('sells', () => api.listSales({ limit: 500 }));
 *
 * Behaviour:
 *  1. On mount: returns cached data IMMEDIATELY (no spinner) if cache is fresh
 *  2. If cache is stale or empty: shows loading, fetches, caches result
 *  3. If another component calls appCache.invalidate('sells'), this hook re-fetches silently
 *  4. Manual `refresh()` forces a re-fetch and updates the cache
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { appCache, type CacheKey } from '../services/appCache';

interface UseCachedDataResult<T> {
  data: T | undefined;
  loading: boolean;       // true only on FIRST load (no cached data exists)
  refreshing: boolean;    // true on background/manual refresh (cached data visible)
  error: string | null;
  refresh: () => void;    // manually trigger a re-fetch
  lastUpdated: Date | null;
}

export function useCachedData<T>(
  key: CacheKey,
  fetcher: () => Promise<T>,
  options?: {
    onData?: (data: T) => void;  // called every time fresh data arrives
  }
): UseCachedDataResult<T> {
  const cached = appCache.get<T>(key);
  const [data, setData] = useState<T | undefined>(cached);
  const [loading, setLoading] = useState(!cached);           // only show spinner if no cache
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    cached ? new Date() : null
  );
  const fetchingRef = useRef(false);

  const doFetch = useCallback(async (silent: boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (!silent) setLoading(true);
    else setRefreshing(true);

    setError(null);
    try {
      const result = await fetcher();
      appCache.set(key, result);          // store + notify siblings
      setData(result);
      setLastUpdated(new Date());
      options?.onData?.(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
      console.error(`[cache] fetch error for key "${key}":`, err);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [key, fetcher]);  // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: fetch if stale or missing
  useEffect(() => {
    if (appCache.isStale(key)) {
      const hasCached = appCache.get(key) !== undefined;
      doFetch(!hasCached ? false : true);  // silent if we have stale data to show
    }
    // Subscribe to invalidation signals from other pages
    const unsub = appCache.subscribe(key, (incoming) => {
      if (incoming === null) {
        // Invalidated — re-fetch silently (keep showing current data)
        doFetch(true);
      } else {
        // Another component already fetched and stored — just update state
        setData(incoming as T);
        setLastUpdated(new Date());
      }
    });
    return unsub;
  }, [key, doFetch]);

  const refresh = useCallback(() => {
    doFetch(data !== undefined);  // silent if we have data, spinner if empty
  }, [doFetch, data]);

  return { data, loading, refreshing, error, refresh, lastUpdated };
}

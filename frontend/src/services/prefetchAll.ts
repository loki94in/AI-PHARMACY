/**
 * prefetchAll.ts
 *
 * Fires trimmed API calls in parallel 100ms after app mount.
 * Stores results in appCache so every page is instant from first navigation.
 * Total RAM cost: ~170 KB — negligible.
 */
import { api } from './api';
import { appCache } from './appCache';

export async function prefetchAll(): Promise<void> {
  await Promise.allSettled([

    // Dashboard — always small, no trimming needed
    api.getDashboard()
      .then(data => appCache.set('dashboard', data))
      .catch(() => {}),

    // Sells — last 100 bills (user rarely needs bill #500 immediately)
    api.listSales({ limit: 100 })
      .then(data => appCache.set('sells', data))
      .catch(() => {}),

    // Inventory — page 1 × 100 rows (search/pagination loads more as needed)
    api.getInventory({ page: 1, limit: 100 })
      .then(data => appCache.set('inventory', data))
      .catch(() => {}),

    // Purchases — last 100 bills, shared across history views
    api.getPurchases({ limit: 100 })
      .then(data => {
        const trimmed = Array.isArray(data) ? data.slice(0, 100) : data;
        appCache.set('purchases', trimmed);
        appCache.set('purchase_history', trimmed);
      })
      .catch(() => {}),

    // Staged sales — always small (only pending mobile bills)
    api.getStagedSales()
      .then(data => appCache.set('staged_sales', data))
      .catch(() => {}),

    // Expiry — next 90 days only
    api.getExpiryList({ days: 90, limit: 100, offset: 0 })
      .then(data => appCache.set('expiry', data))
      .catch(() => {}),
  ]);
}

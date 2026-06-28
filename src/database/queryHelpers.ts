import { Database } from 'sqlite';

const SQLITE_BUSY_RETRIES = 5;
const SQLITE_BUSY_BASE_DELAY_MS = 100;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Runs db.all with automatic retry on SQLITE_BUSY using exponential backoff.
 * The busy_timeout PRAGMA is already set at connection open time; this adds
 * an application-level retry layer for extra resilience under write contention.
 */
export async function queryAllWithRetry(
  db: Database,
  sql: string,
  params: any[] = []
): Promise<any[]> {
  let attempt = 0;
  while (true) {
    try {
      return await db.all(sql, params);
    } catch (err: any) {
      const msg: string = err?.code ?? err?.message ?? '';
      const isBusy = msg.includes('BUSY');
      if (isBusy && attempt < SQLITE_BUSY_RETRIES) {
        await sleep(SQLITE_BUSY_BASE_DELAY_MS * Math.pow(2, attempt));
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

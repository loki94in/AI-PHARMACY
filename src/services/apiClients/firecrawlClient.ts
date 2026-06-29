import { Firecrawl } from 'firecrawl';
import { BaseApiClient, EnrichedProductData } from './baseApiClient.js';
import type { OnlineMedicineSuggestion } from './oneMgClient.js';
import { dbManager } from '../../database/connection.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

async function getFirecrawlKeys(): Promise<string[]> {
  try {
    const db = await dbManager.getConnection();
    const multiRow = await db.get("SELECT value FROM app_settings WHERE key = 'firecrawl_api_keys'");
    if (multiRow?.value) {
      try {
        const keys = JSON.parse(multiRow.value) as string[];
        if (Array.isArray(keys) && keys.length > 0) return keys;
      } catch {}
    }
    const singleRow = await db.get("SELECT value FROM app_settings WHERE key = 'firecrawl_api_key'");
    if (singleRow?.value) return [singleRow.value as string];
  } catch {}
  const envKey = process.env.FIRECRAWL_API_KEY;
  return envKey ? [envKey] : [];
}

async function getExhaustedKeys(): Promise<Set<string>> {
  try {
    const db = await dbManager.getConnection();
    const row = await db.get("SELECT value FROM app_settings WHERE key = 'firecrawl_exhausted_keys'");
    if (row?.value) {
      const arr = JSON.parse(row.value) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    }
  } catch {}
  return new Set();
}

async function markKeyExhausted(key: string): Promise<void> {
  try {
    const db = await dbManager.getConnection();
    const row = await db.get("SELECT value FROM app_settings WHERE key = 'firecrawl_exhausted_keys'");
    const current: string[] = row?.value ? JSON.parse(row.value) : [];
    if (!current.includes(key)) {
      current.push(key);
      await db.run(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('firecrawl_exhausted_keys', ?)",
        JSON.stringify(current)
      );
      console.warn(`[Firecrawl] Key ...${key.slice(-6)} exhausted — add a new key in Settings > Internet Data Sources`);
    }
  } catch (err) {
    console.error('[Firecrawl] Failed to persist exhausted key:', err);
  }
}

async function getDailyLimit(): Promise<number> {
  try {
    const db = await dbManager.getConnection();
    const row = await db.get("SELECT value FROM app_settings WHERE key = 'firecrawl_daily_limit'");
    if (row?.value) {
      const n = parseInt(row.value, 10);
      if (!isNaN(n) && n >= 0) return n;
    }
  } catch {}
  return 30;
}

type DailyUsageMap = Record<string, { date: string; count: number }>;

async function getDailyUsage(key: string): Promise<number> {
  try {
    const db = await dbManager.getConnection();
    const row = await db.get("SELECT value FROM app_settings WHERE key = 'firecrawl_daily_usage'");
    if (row?.value) {
      const usage = JSON.parse(row.value) as DailyUsageMap;
      const entry = usage[key];
      if (entry && entry.date === TODAY()) return entry.count;
    }
  } catch {}
  return 0;
}

async function incrementDailyUsage(key: string): Promise<void> {
  try {
    const db = await dbManager.getConnection();
    const row = await db.get("SELECT value FROM app_settings WHERE key = 'firecrawl_daily_usage'");
    const usage: DailyUsageMap = row?.value ? JSON.parse(row.value) : {};
    const today = TODAY();
    if (!usage[key] || usage[key].date !== today) {
      usage[key] = { date: today, count: 0 };
    }
    usage[key].count++;
    await db.run(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('firecrawl_daily_usage', ?)",
      JSON.stringify(usage)
    );
  } catch (err) {
    console.error('[Firecrawl] Failed to update daily usage:', err);
  }
}

function isQuotaError(err: any): boolean {
  const msg = (err?.message || String(err)).toLowerCase();
  return (
    msg.includes('402') ||
    msg.includes('quota') ||
    msg.includes('credit') ||
    msg.includes('limit exceeded') ||
    msg.includes('insufficient')
  );
}

const MEDICINE_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:         { type: 'string' },
          composition:  { type: 'string' },
          manufacturer: { type: 'string' },
          mrp:          { type: 'number' },
          packaging:    { type: 'string' },
          category:     { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  required: ['suggestions'],
};

const SCRAPE_TARGETS = [
  (q: string) => `https://www.1mg.com/search/all?name=${q}`,
  (q: string) => `https://www.apollopharmacy.in/search-medicines/${q}`,
  (q: string) => `https://www.netmeds.com/catalogsearch/result/${q}/all`,
];

const EXTRACT_PROMPT =
  'Extract medicine/drug search results from this pharmacy page. ' +
  'For each result extract: name (brand name), composition (salt/active ingredients), ' +
  'manufacturer, mrp (price in INR as number), packaging (e.g. "Strip of 10 Tablets"), ' +
  'category (therapeutic class).';

export class FirecrawlClient extends BaseApiClient {
  name = 'Firecrawl';

  async searchSuggestions(medicineName: string): Promise<OnlineMedicineSuggestion[]> {
    if (!medicineName || medicineName.length < 2) return [];

    const allKeys = await getFirecrawlKeys();
    if (!allKeys.length) return [];

    const [exhausted, dailyLimit] = await Promise.all([getExhaustedKeys(), getDailyLimit()]);

    const activeKeys = allKeys.filter(k => !exhausted.has(k));
    if (!activeKeys.length) {
      console.warn('[Firecrawl] All API keys are exhausted — add a new key in Settings > Internet Data Sources');
      return [];
    }

    const encoded = encodeURIComponent(medicineName);

    for (const apiKey of activeKeys) {
      // Soft daily budget: rotate before hitting the monthly hard cap
      if (dailyLimit > 0) {
        const usedToday = await getDailyUsage(apiKey);
        if (usedToday >= dailyLimit) {
          console.log(`[Firecrawl] Key ...${apiKey.slice(-6)} at daily limit (${usedToday}/${dailyLimit}) — rotating to next key`);
          continue;
        }
      }

      const app = new Firecrawl({ apiKey });
      let quotaHit = false;

      for (const urlFn of SCRAPE_TARGETS) {
        if (quotaHit) break;
        const url = urlFn(encoded);
        try {
          const doc = await app.scrape(url, {
            formats: [{ type: 'json', prompt: EXTRACT_PROMPT, schema: MEDICINE_SCHEMA }],
            onlyMainContent: true,
            timeout: 15000,
          });
          await incrementDailyUsage(apiKey);
          const raw = doc.json as { suggestions?: any[] } | undefined;
          const items: any[] = raw?.suggestions || [];
          if (items.length > 0) {
            return items
              .filter(i => i.name)
              .slice(0, 8)
              .map(i => ({
                name: i.name,
                api_reference: i.composition || '',
                manufacturer: i.manufacturer || '',
                mrp: typeof i.mrp === 'number' ? i.mrp : 0,
                packaging: i.packaging || '',
                category: i.category || '',
                source: 'Firecrawl' as const,
              }));
          }
        } catch (err: any) {
          if (isQuotaError(err)) {
            await markKeyExhausted(apiKey);
            quotaHit = true;
          } else {
            await incrementDailyUsage(apiKey); // failed scrape may still count as a credit
            console.warn(`[Firecrawl] Scrape failed for ${url.split('?')[0]}:`, err.message);
          }
        }
      }

      if (!quotaHit) {
        // Key is active and within budget but no results from any target site
        return [];
      }
      // quotaHit — try the next key
    }

    return [];
  }

  async queryMedicine(medicineName: string): Promise<EnrichedProductData | null> {
    const results = await this.searchSuggestions(medicineName);
    if (!results.length) return null;
    const top = results[0];
    return {
      medicineName: top.name,
      activeIngredients: top.api_reference ? [top.api_reference] : [],
      manufacturer: top.manufacturer || undefined,
      source: 'Firecrawl',
    };
  }
}

import { Firecrawl } from 'firecrawl';
import { BaseApiClient, EnrichedProductData } from './baseApiClient.js';
import type { OnlineMedicineSuggestion } from './oneMgClient.js';

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
  private app: Firecrawl | null = null;

  constructor() {
    super();
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (apiKey) this.app = new Firecrawl({ apiKey });
  }

  async searchSuggestions(medicineName: string): Promise<OnlineMedicineSuggestion[]> {
    if (!this.app || !medicineName || medicineName.length < 2) return [];
    const encoded = encodeURIComponent(medicineName);

    for (const urlFn of SCRAPE_TARGETS) {
      const url = urlFn(encoded);
      try {
        const doc = await this.app.scrape(url, {
          formats: [{ type: 'json', prompt: EXTRACT_PROMPT, schema: MEDICINE_SCHEMA }],
          onlyMainContent: true,
          timeout: 15000,
        });
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
        console.warn(`[Firecrawl] Scrape failed for ${url.split('?')[0]}:`, err.message);
      }
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

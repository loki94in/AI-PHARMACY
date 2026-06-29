import { dbManager } from '../../database/connection.js';
import { BaseApiClient, EnrichedProductData } from './baseApiClient.js';
import type { OnlineMedicineSuggestion } from './oneMgClient.js';

async function getPrToken(): Promise<string> {
  try {
    const db = await dbManager.getConnection();
    const row = await db.get("SELECT value FROM app_settings WHERE key = 'pharmarack_session_token'");
    return row?.value || '';
  } catch {
    return '';
  }
}

export class PharmarackClient extends BaseApiClient {
  name = 'Pharmarack';

  async searchSuggestions(medicineName: string): Promise<OnlineMedicineSuggestion[]> {
    if (!medicineName || medicineName.length < 2) return [];

    const token = await getPrToken();
    if (!token) return [];

    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    const payload = {
      SearchKeyword: medicineName,
      StoreId: [],
      NonMappedStoreId: [],
      Count: 10,
      SkipCount: 0,
      isMappedSearch: null,
      IsStock: 2,
      IsScheme: 2,
      CartSource: 'MOVP',
    };

    try {
      const response = await fetch(
        'https://pharmretail-elasticsearch.pharmarack.com/open-search/api/v2/search',
        {
          method: 'POST',
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(6000),
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
            devicetype: 'web',
            Accept: 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://retailers.pharmarack.com/',
            Origin: 'https://retailers.pharmarack.com',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          console.warn('[Pharmarack] Session token expired — refresh via Settings');
        }
        return [];
      }

      const data: any = await response.json();
      if (!Array.isArray(data?.data)) return [];

      return data.data
        .filter((p: any) => p.ProductName || p.ProductFullName)
        .slice(0, 8)
        .map((p: any) => ({
          name: p.ProductName || p.ProductFullName || '',
          api_reference: p.Composition || p.SaltComposition || '',
          manufacturer: p.Company || p.Manufacturer || '',
          mrp: p.MRP || 0,
          packaging: p.Packing || '',
          category: p.Category || p.TherapeuticClass || '',
          source: 'Pharmarack' as const,
        }));
    } catch (err: any) {
      console.error('[Pharmarack] Search failed:', err.message);
      return [];
    }
  }

  async queryMedicine(medicineName: string): Promise<EnrichedProductData | null> {
    const results = await this.searchSuggestions(medicineName);
    if (!results.length) return null;
    const top = results[0];
    return {
      medicineName: top.name,
      activeIngredients: top.api_reference ? [top.api_reference] : [],
      manufacturer: top.manufacturer || undefined,
      source: 'Pharmarack',
    };
  }
}

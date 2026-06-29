import { BaseApiClient, EnrichedProductData } from './baseApiClient.js';

export interface OnlineMedicineSuggestion {
  name: string;
  api_reference: string;
  manufacturer: string;
  mrp: number;
  packaging: string;
  category: string;
  source: 'Pharmarack' | '1mg' | 'Pharmeasy' | 'OpenFDA' | 'Firecrawl';
}

export class OneMgClient extends BaseApiClient {
  name = '1mg';
  private static lastCallAt = 0;
  private static readonly MIN_DELAY_MS = 2500;

  private async throttle(): Promise<boolean> {
    const now = Date.now();
    if (now - OneMgClient.lastCallAt < OneMgClient.MIN_DELAY_MS) {
      return false;
    }
    OneMgClient.lastCallAt = now;
    return true;
  }

  private normalize1mgSuggestion(item: any): OnlineMedicineSuggestion {
    return {
      name: item.name || item.product_name || '',
      api_reference: item.salt_composition || item.composition || item.generic_name || '',
      manufacturer: item.manufacturer_name || item.marketer_name || '',
      mrp: parseFloat(item.price || item.mrp || '0') || 0,
      packaging: item.pack_size_label || item.pack_info || '',
      category: item.category || item.therapeutic_class || item.sub_category || '',
      source: '1mg'
    };
  }

  private normalizePharmeasyItem(item: any): OnlineMedicineSuggestion {
    return {
      name: item.name || item.productName || '',
      api_reference: item.saltComposition || item.composition || item.genericName || '',
      manufacturer: item.manufacturer || item.manufacturerName || '',
      mrp: parseFloat(item.mrp || item.price || '0') || 0,
      packaging: item.packForm || item.packSize || '',
      category: item.category || item.therapeuticClass || '',
      source: 'Pharmeasy'
    };
  }

  async searchSuggestions(medicineName: string): Promise<OnlineMedicineSuggestion[]> {
    if (!medicineName || medicineName.length < 2) return [];

    const allowed = await this.throttle();
    if (!allowed) {
      console.warn('[1mg] Rate limit — too soon since last call, skipping');
      return [];
    }

    const results = await this.fetch1mg(medicineName);
    if (results.length > 0) return results;

    return this.fetchPharmeasy(medicineName);
  }

  private async fetch1mg(medicineName: string): Promise<OnlineMedicineSuggestion[]> {
    try {
      const url = `https://www.1mg.com/search/suggest?name=${encodeURIComponent(medicineName)}&lang=en`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.1mg.com/',
          'Origin': 'https://www.1mg.com'
        }
      });

      if (!response.ok) {
        console.warn(`[1mg] HTTP ${response.status} for "${medicineName}"`);
        return [];
      }

      const data = await response.json();
      const suggestions: any[] = data?.data?.suggestions || data?.suggestions || [];
      return suggestions
        .filter((s: any) => s.name || s.product_name)
        .slice(0, 8)
        .map((s: any) => this.normalize1mgSuggestion(s));
    } catch (err: any) {
      console.error(`[1mg] Fetch failed for "${medicineName}":`, err.message);
      return [];
    }
  }

  private async fetchPharmeasy(medicineName: string): Promise<OnlineMedicineSuggestion[]> {
    try {
      const url = `https://pharmeasy.in/api/search/query?searchQuery=${encodeURIComponent(medicineName)}&page=0`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://pharmeasy.in/'
        }
      });

      if (!response.ok) {
        console.warn(`[Pharmeasy] HTTP ${response.status} for "${medicineName}"`);
        return [];
      }

      const data = await response.json();
      const products: any[] = data?.data?.productList || data?.productList || [];
      return products
        .filter((p: any) => p.name || p.productName)
        .slice(0, 8)
        .map((p: any) => this.normalizePharmeasyItem(p));
    } catch (err: any) {
      console.error(`[Pharmeasy] Fetch failed for "${medicineName}":`, err.message);
      return [];
    }
  }

  async queryMedicine(medicineName: string): Promise<EnrichedProductData | null> {
    const results = await this.searchSuggestions(medicineName);
    if (results.length === 0) return null;

    const top = results[0];
    return {
      medicineName: top.name,
      activeIngredients: top.api_reference ? [top.api_reference] : [],
      manufacturer: top.manufacturer || undefined,
      source: top.source
    };
  }
}

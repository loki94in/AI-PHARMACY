import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Helper function to calculate similarity using Levenshtein distance
function similarity(s1: string, s2: string, threshold: number = 0.8): number {
  const maxLen = Math.max(s1.length, s2.length);
  const minLen = Math.min(s1.length, s2.length);
  
  if (maxLen === 0) return 1.0;

  // Shortcut: if the length difference is greater than the allowed error, it cannot match
  if ((maxLen - minLen) / maxLen > (1 - threshold)) {
    return 0.0;
  }

  // Simple Levenshtein distance implementation
  const editDistance = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
    let currRow = new Array(b.length + 1);

    for (let j = 1; j <= a.length; j++) {
      currRow[0] = j;
      for (let i = 1; i <= b.length; i++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          currRow[i] = prevRow[i - 1];
        } else {
          currRow[i] = Math.min(
            prevRow[i - 1] + 1, // substitution
            currRow[i - 1] + 1, // insertion
            prevRow[i] + 1      // deletion
          );
        }
      }
      prevRow = [...currRow];
    }

    return prevRow[b.length];
  };

  const distance = editDistance(s1.toLowerCase(), s2.toLowerCase());
  return 1.0 - distance / maxLen;
}

export interface FilterOptions {
  enableInternetFallback?: boolean;
  internetApiEndpoint?: string;
  internetApiKey?: string;
  minConfidenceThreshold?: number;
  fallbackTimeoutMs?: number;
}

export interface FilterResult {
  matches: string[];
  sources: {
    local: boolean;
    internet: boolean;
  };
  confidence: number; // Average confidence of matches (0-100)
  fallbackUsed: boolean;
  processingTimeMs: number;
}

export class ProductNameFilterService {
  private medicineNames: string[] = [];
  private initialized: boolean = false;
  private dbPath: string;
  private readonly DEFAULT_THRESHOLD = 0.8; // 80% similarity threshold
  private readonly DEFAULT_TIMEOUT = 5000; // 5 seconds

  constructor(dbPath: string = './data/app.db') {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    try {
      const db = await open({ filename: this.dbPath, driver: sqlite3.Database });
      const rows = await db.all('SELECT DISTINCT name FROM medicines WHERE name IS NOT NULL AND name <> ""');
      this.medicineNames = rows.map(row => row.name).filter(Boolean);
      await db.close();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize ProductNameFilterService:', error);
      throw new Error(`Failed to load medicine names from database: ${error.message}`);
    }
  }

  async filterProductNames(ocrText: string, options: FilterOptions = {}): Promise<FilterResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      throw new Error('ProductNameFilterService not initialized. Call initialize() first.');
    }

    // Merge options with defaults
    const {
      enableInternetFallback = false,
      internetApiEndpoint,
      internetApiKey,
      minConfidenceThreshold = this.DEFAULT_THRESHOLD,
      fallbackTimeoutMs = this.DEFAULT_TIMEOUT
    } = options;

    if (!ocrText || ocrText.trim() === '') {
      return {
        matches: [],
        sources: { local: false, internet: false },
        confidence: 0,
        fallbackUsed: false,
        processingTimeMs: Date.now() - startTime
      };
    }

    const normalizedOcr = ocrText.toLowerCase().trim();
    const scoredMatches: Array<{ name: string; score: number }> = [];

    // Local fuzzy matching with score caching
    for (const medicineName of this.medicineNames) {
      const similarityScore = similarity(normalizedOcr, medicineName.toLowerCase(), minConfidenceThreshold);
      if (similarityScore >= minConfidenceThreshold) {
        scoredMatches.push({ name: medicineName, score: similarityScore });
      }
    }

    // Sort using the cached score to avoid redundant Levenshtein matrix calculations
    scoredMatches.sort((a, b) => b.score - a.score);
    const localMatches = scoredMatches.map(item => item.name);

    // Determine if we need to use internet fallback
    const hasLocalMatches = localMatches.length > 0;
    const localConfidence = hasLocalMatches ?
      scoredMatches.reduce((sum, item) => sum + item.score, 0) / scoredMatches.length : 0;
    const shouldUseFallback = enableInternetFallback &&
      (!hasLocalMatches || localConfidence < minConfidenceThreshold);

    let internetMatches: string[] = [];
    let fallbackUsed = false;

    // Internet fallback (if enabled and needed)
    if (shouldUseFallback) {
      try {
        fallbackUsed = true;
        internetMatches = await this.queryInternetApi(
          normalizedOcr,
          internetApiEndpoint || 'https://api.fda.gov/drug/ndc.json',
          internetApiKey || process.env.OPENFDA_API_KEY,
          fallbackTimeoutMs,
          minConfidenceThreshold
        );
      } catch (error) {
        console.warn('Internet API query failed, falling back to local results only:', error);
      }
    }

    // Combine results (prioritizing local matches, then adding unique internet matches)
    const allMatches = [...localMatches];
    for (const match of internetMatches) {
      if (!allMatches.includes(match)) {
        allMatches.push(match);
      }
    }

    // Calculate average confidence
    const totalMatches = allMatches.length;
    let averageConfidence = 0;
    if (totalMatches > 0) {
      averageConfidence = minConfidenceThreshold * 100;
    }

    return {
      matches: allMatches,
      sources: {
        local: localMatches.length > 0,
        internet: internetMatches.length > 0
      },
      confidence: averageConfidence,
      fallbackUsed,
      processingTimeMs: Date.now() - startTime
    };
  }

  private async queryInternetApi(
    query: string,
    endpoint: string,
    apiKey?: string,
    timeoutMs: number,
    minConfidenceThreshold: number
  ): Promise<string[]> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    const matches: string[] = [];

    try {
      // 1. Query openFDA API if matching openFDA URL
      if (endpoint.includes('fda.gov')) {
        let fdaUrl = `https://api.fda.gov/drug/ndc.json?search=(brand_name:"${encodeURIComponent(query)}"+generic_name:"${encodeURIComponent(query)}")&limit=5`;
        if (apiKey) {
          fdaUrl += `&api_key=${apiKey}`;
        }

        const response = await fetch(fdaUrl, {
          signal: abortController.signal,
          method: 'GET'
        });

        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.results)) {
            data.results.forEach((item: any) => {
              if (item.brand_name && typeof item.brand_name === 'string') {
                matches.push(item.brand_name);
              }
              if (item.generic_name && typeof item.generic_name === 'string') {
                matches.push(item.generic_name);
              }
            });
          }
        }
      }

      // 2. Query RxNav RxNorm API (NLM)
      const rxNavUrl = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(query)}`;
      const responseRx = await fetch(rxNavUrl, {
        signal: abortController.signal,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (responseRx.ok) {
        const data = await responseRx.json();
        if (data && data.drugGroup && Array.isArray(data.drugGroup.conceptGroup)) {
          data.drugGroup.conceptGroup.forEach((group: any) => {
            if (group.conceptProperties && Array.isArray(group.conceptProperties)) {
              group.conceptProperties.forEach((prop: any) => {
                if (prop.name && typeof prop.name === 'string') {
                  matches.push(prop.name);
                }
              });
            }
          });
        }
      }

      clearTimeout(timeoutId);

      // Filter and return unique matches with high similarity
      const uniqueMatches = Array.from(new Set(matches));
      return uniqueMatches.filter(matchName => 
        similarity(query, matchName.toLowerCase(), minConfidenceThreshold) >= minConfidenceThreshold
      );

    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Internet API request timed out after ${timeoutMs}ms`);
      }
      throw error;
    }
  }
}

// Export singleton instance
export const productNameFilterService = new ProductNameFilterService();
export default productNameFilterService;
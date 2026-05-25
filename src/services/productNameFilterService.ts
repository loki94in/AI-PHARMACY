import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Helper function to calculate similarity using Levenshtein distance
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;

  // Simple Levenshtein distance implementation
  const editDistance = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    // Initialize first row and column
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    // Fill the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
      matrix[i] = [];
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  };

  const distance = editDistance(s1.toLowerCase(), s2.toLowerCase());
  const maxLen = Math.max(s1.length, s2.length);
  return maxLen === 0 ? 1.0 : 1.0 - distance / maxLen;
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
    const localMatches: string[] = [];

    // Local fuzzy matching
    for (const medicineName of this.medicineNames) {
      const similarityScore = similarity(normalizedOcr, medicineName.toLowerCase());
      if (similarityScore >= minConfidenceThreshold) {
        localMatches.push(medicineName);
      }
    }

    // Sort local matches by similarity score (descending)
    localMatches.sort((a, b) => {
      const scoreA = similarity(normalizedOcr, a.toLowerCase());
      const scoreB = similarity(normalizedOcr, b.toLowerCase());
      return scoreB - scoreA;
    });

    // Determine if we need to use internet fallback
    const hasLocalMatches = localMatches.length > 0;
    const localConfidence = hasLocalMatches ?
      localMatches.reduce((sum, name) => sum + similarity(normalizedOcr, name.toLowerCase()), 0) / localMatches.length : 0;
    const shouldUseFallback = enableInternetFallback &&
      (!hasLocalMatches || localConfidence < minConfidenceThreshold) &&
      !!internetApiEndpoint;

    let internetMatches: string[] = [];
    let fallbackUsed = false;

    // Internet fallback (if enabled and needed)
    if (shouldUseFallback && internetApiEndpoint) {
      try {
        fallbackUsed = true;
        internetMatches = await this.queryInternetApi(
          normalizedOcr,
          internetApiEndpoint,
          internetApiKey,
          fallbackTimeoutMs,
          minConfidenceThreshold
        );
      } catch (error) {
        console.warn('Internet API query failed, falling back to local results only:', error);
        // Continue with local results only
      }
    }

    // Combine results (prioritizing local matches, then adding unique internet matches)
    const allMatches = [...localMatches];
    for const match of internetMatches) {
      if (!allMatches.includes(match)) {
        allMatches.push(match);
      }
    }

    // Calculate average confidence
    const totalMatches = allMatches.length;
    let averageConfidence = 0;
    if (totalMatches > 0) {
      // For simplicity, we'll use the threshold as base confidence
      // In a more sophisticated implementation, we'd calculate actual similarity scores
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
    // Abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      // Build request URL with query parameter
      const url = new URL(endpoint);
      url.searchParams.set('q', query);

      const headers: HeadersInit = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url.toString(), {
        signal: abortController.signal,
        headers,
        method: 'GET'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Extract product names from API response (adjust based on actual API structure)
      // This assumes API returns an array of objects with a 'name' field
      if (Array.isArray(data)) {
        return data
          .filter((item: any) =>
            item.name &&
            typeof item.name === 'string' &&
            similarity(query, item.name.toLowerCase()) >= minConfidenceThreshold
          )
          .map((item: any) => item.name);
      } else if (data && Array.isArray(data.results)) {
        return data.results
          .filter((item: any) =>
            item.name &&
            typeof item.name === 'string' &&
            similarity(query, item.name.toLowerCase()) >= minConfidenceThreshold
          )
          .map((item: any) => item.name);
      }

      return [];
    } catch (error) {
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
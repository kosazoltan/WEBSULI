/**
 * HTML Files Response Cache
 * 
 * Caches the /api/html-files endpoint response to reduce database load.
 * Cache is invalidated when files are created, updated, or deleted.
 */

interface CacheEntry {
  data: any[];
  timestamp: number;
}

export class HtmlFilesCache {
  private cache: CacheEntry | null = null;
  private ttl: number; // milliseconds
  private readonly CACHE_KEY = 'html-files-list';

  constructor(ttlMinutes: number = 5) {
    this.ttl = ttlMinutes * 60 * 1000; // Convert minutes to milliseconds
  }

  /**
   * Get cached HTML files list
   */
  get(): any[] | null {
    if (!this.cache) {
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - this.cache.timestamp > this.ttl) {
      this.cache = null;
      return null;
    }

    return this.cache.data;
  }

  /**
   * Set cache entry
   */
  set(data: any[]): void {
    this.cache = {
      data: [...data], // Create a copy to avoid mutations
      timestamp: Date.now(),
    };
  }

  /**
   * Invalidate cache (call when files are created/updated/deleted)
   */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * Check if cache is valid
   */
  isValid(): boolean {
    if (!this.cache) {
      return false;
    }

    const now = Date.now();
    return (now - this.cache.timestamp) <= this.ttl;
  }
}

/**
 * Singleton cache instance
 */
let cacheInstance: HtmlFilesCache | null = null;

export function getHtmlFilesCache(): HtmlFilesCache {
  if (!cacheInstance) {
    // Cache for 5 minutes by default
    cacheInstance = new HtmlFilesCache(5);
  }
  return cacheInstance;
}


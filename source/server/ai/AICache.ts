import crypto from 'crypto';

/**
 * AI Response Cache System
 * 
 * Caches AI responses to reduce costs and improve response times.
 * Uses in-memory storage with TTL (Time To Live).
 */

interface CacheEntry {
  content: string;
  timestamp: number;
  provider: string;
  model: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export class AICache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl: number; // milliseconds
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(ttlHours: number = 24, maxSize: number = 1000) {
    this.ttl = ttlHours * 60 * 60 * 1000; // Convert hours to milliseconds
    this.maxSize = maxSize;
    
    // Cleanup expired entries every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Generate cache key from messages
   */
  generateKey(messages: any[], model: string): string {
    // Create deterministic string from messages and model
    const content = JSON.stringify({ messages, model });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get cached response
   */
  get(key: string): string | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    console.log(`[AICache] Cache HIT for key: ${key.substring(0, 16)}...`);
    return entry.content;
  }

  /**
   * Set cache entry
   */
  set(key: string, content: string, provider: string, model: string): void {
    // Enforce max cache size (LRU-like behavior)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Delete oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      content,
      timestamp: Date.now(),
      provider,
      model,
    });

    console.log(`[AICache] Cache SET for key: ${key.substring(0, 16)}... (${this.cache.size}/${this.maxSize})`);
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`[AICache] Cache INVALIDATED for key: ${key.substring(0, 16)}...`);
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    console.log('[AICache] Cache CLEARED');
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      removed++;
    });

    if (removed > 0) {
      console.log(`[AICache] Cleanup: removed ${removed} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Get all cache entries (for debugging)
   */
  getEntries(): Array<{ key: string; entry: CacheEntry }> {
    const entries: Array<{ key: string; entry: CacheEntry }> = [];
    this.cache.forEach((entry, key) => {
      entries.push({ key, entry });
    });
    return entries;
  }
}

/**
 * Singleton cache instance
 */
let cacheInstance: AICache | null = null;

export function getAICache(): AICache {
  if (!cacheInstance) {
    cacheInstance = new AICache(24, 1000); // 24 hours TTL, max 1000 entries
  }
  return cacheInstance;
}

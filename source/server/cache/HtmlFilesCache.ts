/**
 * HTML Files Response Cache
 * 
 * Caches the /api/html-files endpoint response to reduce database load.
 * Cache is invalidated when files are created, updated, or deleted.
 */

import type { HtmlFile } from '@shared/schema';

interface CacheEntry {
  data: HtmlFile[];
  timestamp: number;
}

export class HtmlFilesCache {
  private cache: CacheEntry | null = null;
  private ttl: number; // milliseconds
  private readonly CACHE_KEY = 'html-files-list';
  /** A listából származtatott memóriák (pl. tanmenet-tartalomjelzők) — minden invalidáláskor ürülnek. */
  private readonly invalidateListeners = new Set<() => void>();

  constructor(ttlMinutes: number = 5) {
    this.ttl = ttlMinutes * 60 * 1000; // Convert minutes to milliseconds
  }

  /**
   * Get cached HTML files list
   */
  get(): HtmlFile[] | null {
    if (!this.cache) {
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - this.cache.timestamp > this.ttl) {
      this.cache = null;
      return null;
    }

    // Copy on read as well as on write: the returned array is handed straight to
    // res.json(), and a caller mutating it would corrupt the entry for every later hit.
    return [...this.cache.data];
  }

  /**
   * Set cache entry
   */
  set(data: HtmlFile[]): void {
    this.cache = {
      data: [...data], // Create a copy to avoid mutations
      timestamp: Date.now(),
    };
  }

  /**
   * Spec 2026-11-03-fooldal-sebesseg: friss bejegyzés → azonnal; ELAVULT bejegyzés → azonnal a régi lista, és EGYETLEN háttér-újraépítés
   * (mérve: a lejáratkor minden egyidejű kérés külön, párhuzamosan építette újra a teljes listát); nincs bejegyzés (indulás, érvénytelenítés
   * után) → az egyidejű kérések egyetlen építésen osztoznak. Az érvénytelenítés előtt indult építés eredménye nem kerül be (generáció).
   */
  getOrBuild(build: () => Promise<HtmlFile[]>, onBackgroundError: (error: unknown) => void = () => {}): Promise<HtmlFile[]> {
    const entry = this.cache;
    if (entry && Date.now() - entry.timestamp <= this.ttl) return Promise.resolve([...entry.data]);
    const running = this.building ?? this.startBuild(build);
    if (entry) {
      running.catch(onBackgroundError);
      return Promise.resolve([...entry.data]);
    }
    return running.then((data) => [...data]);
  }

  private building: Promise<HtmlFile[]> | null = null;
  private generation = 0;
  private startBuild(build: () => Promise<HtmlFile[]>): Promise<HtmlFile[]> {
    const generation = this.generation;
    const job = build().then((data) => {
      if (generation === this.generation) this.set(data);
      return data;
    }).finally(() => { if (this.building === job) this.building = null; });
    this.building = job;
    return job;
  }

  /**
   * Invalidate cache (call when files are created/updated/deleted)
   */
  invalidate(): void {
    this.cache = null;
    this.generation++;
    this.building = null;
    for (const listener of this.invalidateListeners) listener();
  }

  /** Feliratkozás az invalidálásra; a visszaadott függvény leiratkoztat. */
  onInvalidate(listener: () => void): () => void {
    this.invalidateListeners.add(listener);
    return () => this.invalidateListeners.delete(listener);
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


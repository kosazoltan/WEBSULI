/**
 * Prompt store with an inline fallback (LS-0d).
 *
 * Studio prompts live in the `system_prompts` table so the owner can revise them without
 * a deploy. This wrapper is deliberately FAIL-OPEN: a missing row, a blank row, or an
 * unreachable database must never turn into a failed AI request — the caller's original
 * hard-coded prompt is used instead. That keeps production behaviour identical before the
 * rows are seeded.
 *
 * The loader is injected so the cache/fallback logic is testable without a database.
 */

export interface PromptStoreDeps {
  /** Returns the stored prompt text, or null when there is no row. */
  load: (name: string) => Promise<string | null>;
  /** Injectable clock (ms) so TTL behaviour is testable. */
  now?: () => number;
  /** Cache lifetime for a successful lookup. Default 60 s. */
  ttlMs?: number;
}

export interface PromptStore {
  /** Stored prompt for `name`, or `fallback` when unavailable. */
  get(name: string, fallback: string): Promise<string>;
  /** Drops cached entries (used after an admin edits a prompt). */
  invalidate(name?: string): void;
}

export function createPromptStore(deps: PromptStoreDeps): PromptStore {
  const now = deps.now ?? (() => Date.now());
  const ttlMs = deps.ttlMs ?? 60_000;
  const cache = new Map<string, { value: string; expiresAt: number }>();

  return {
    async get(name: string, fallback: string): Promise<string> {
      const cached = cache.get(name);
      if (cached && cached.expiresAt > now()) {
        return cached.value;
      }

      let loaded: string | null;
      try {
        loaded = await deps.load(name);
      } catch {
        // Fail open. A transient failure is NOT cached, so the next call retries the
        // database instead of pinning the process to the inline text for the whole TTL.
        return fallback;
      }

      if (typeof loaded !== "string" || loaded.trim().length === 0) {
        // A missing or blank row means "not configured", not "use an empty prompt".
        return fallback;
      }

      cache.set(name, { value: loaded, expiresAt: now() + ttlMs });
      return loaded;
    },

    invalidate(name?: string): void {
      if (name === undefined) cache.clear();
      else cache.delete(name);
    },
  };
}

/**
 * Validation helpers for values that arrive from public, unauthenticated endpoints.
 *
 * Extracted from routes.ts so the rules can be unit-tested directly rather than only
 * through a live Express app.
 */

/** Max length accepted for a client-supplied browser fingerprint. */
export const MAX_FINGERPRINT_LENGTH = 128;

/** Max length accepted for a material id supplied by a client. */
export const MAX_MATERIAL_ID_LENGTH = 64;

/** Max number of material ids accepted in one batch lookup. */
export const MAX_MATERIAL_ID_BATCH = 100;

/**
 * SECURITY: Normalise an anonymous like-fingerprint coming from the client.
 * The value is written to the database by public endpoints, so it must be a bounded,
 * plain string — returns null for anything else.
 */
export function normalizeFingerprint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_FINGERPRINT_LENGTH) return null;
  // Fingerprints are hashes/ids — reject control characters and anything exotic.
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Keeps only plausible material ids from a client-supplied array and caps the batch size.
 * Non-strings, empty strings and over-long values are dropped rather than rejected, so a
 * single bad entry does not fail an otherwise valid page load.
 */
export function normalizeMaterialIdBatch(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (id): id is string =>
        typeof id === "string" && id.length > 0 && id.length <= MAX_MATERIAL_ID_LENGTH,
    )
    .slice(0, MAX_MATERIAL_ID_BATCH);
}

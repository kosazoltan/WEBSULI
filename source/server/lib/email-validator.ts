/**
 * Universal Error Logger — email-validator.ts
 * HMAC validáció, 24h freshness, timing-safe compare
 */
import crypto from "crypto";

const HMAC_SECRET =
  process.env.ERRORLOG_HMAC_SECRET ?? "errorlog-hmac-s3cr3t-websuli-2026-kz";

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ValidateEmailPayloadResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate an incoming error report request payload
 * Checks HMAC signature and timestamp freshness
 */
export function validateEmailPayload(
  payload: string,
  signature: string,
  timestamp?: string
): ValidateEmailPayloadResult {
  // 1. Freshness check (24h)
  if (timestamp) {
    const ts = new Date(timestamp).getTime();
    if (isNaN(ts)) {
      return { valid: false, reason: "Invalid timestamp format" };
    }
    if (Date.now() - ts > MAX_AGE_MS) {
      return { valid: false, reason: "Payload too old (>24h)" };
    }
  }

  // 2. HMAC verification (timing-safe)
  const expected = crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(payload)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");

  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: "Signature length mismatch" };
  }

  const match = crypto.timingSafeEqual(expectedBuf, actualBuf);
  if (!match) {
    return { valid: false, reason: "Signature mismatch" };
  }

  return { valid: true };
}

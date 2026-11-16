/**
 * JM7a — e-mailes belépés tiszta segédfüggvényei (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md „JM7a” 4.).
 * Adatbázis és hálózat nélkül: normalizálás, kód / link-token generálás, HMAC-hash, időkorlátok.
 * A kód és a link-token SOHA nem tárolódik nyersen, és nem kerül naplóba; a hash kulcsa a SESSION_SECRET-ből levezetett.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 10 * 60_000;
export const LINK_TTL_MS = 15 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;
/** Kódkérés e-mail-címenként (hash szerint) ennyi időablakban legfeljebb ennyiszer. */
export const START_PER_EMAIL_MAX = 3;
export const START_WINDOW_MS = 15 * 60_000;
export const START_PER_IP_MAX = 10;
/** Beváltási kísérlet IP-nként (a rekordonkénti 5 próbálkozás mellé). */
export const VERIFY_PER_IP_MAX = 30;
/** A kódrekordok (bennük a megerősítendő cím) ennyi idő után törlődnek. */
export const CODE_RETENTION_MS = 24 * 60 * 60_000;

const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A megerősítendő cím: trim + NFC + kisbetű. Formailag hibás vagy túl hosszú cím → null. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().normalize("NFC").toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) return null;
  return email;
}

/** A hash-kulcs: HMAC(SESSION_SECRET, "player-auth-v1"). A titok rotációja a függő kódokat érvényteleníti (rövid életűek). */
export function playerAuthKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set");
  return createHmac("sha256", secret).update("player-auth-v1").digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function emailHash(key: Buffer, normalizedEmail: string): string {
  return hmacHex(key, `email:${normalizedEmail}`);
}

/** A kód hash-e a címhez kötve (ugyanaz a kód más címre nem érvényes). */
export function codeHash(key: Buffer, emailHashHex: string, code: string): string {
  return hmacHex(key, `code:${emailHashHex}:${code}`);
}

export function linkHash(key: Buffer, linkToken: string): string {
  return hmacHex(key, `link:${linkToken}`);
}

/** 6 jegyű, egyenletes eloszlású kód (`crypto.randomInt`). */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** 32 bájtos átlátszatlan link-token (base64url, 43 jel) — e-mail-címet nem tartalmaz. */
export function generateLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export const CODE_PATTERN = /^\d{6}$/;
export const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Időállandó összehasonlítás két azonos hosszú hexa-hashre. */
export function sameHash(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

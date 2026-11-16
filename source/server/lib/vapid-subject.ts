/**
 * A web-push VAPID „subject” (RFC 8292 2.1: `mailto:` cím vagy `https:` URL) — a push-szolgáltató ezen érheti el az üzemeltetőt.
 * A `web-push` csak a VAPID-JWT `sub` mezőjébe teszi; a feliratkozás a kulcspárhoz (PUBLIC_VAPID_KEY) kötött, ezért a subject
 * cseréje a meglévő feliratkozásokat nem érinti.
 *
 * Forrás: a `VAPID_SUBJECT` környezeti változó; ha nincs vagy hibás, a nem személyes `https://websuli.vip`. Személyes cím nem
 * kerülhet a kódba (a repó nyilvános; docs/specs/2026-11-16-valodi-cimek-ki.md). A hibás értéket a napló nem írja ki.
 */
import { logger } from "./logger";
import { normalizeAdminEmail } from "./admin-access";

export const DEFAULT_VAPID_SUBJECT = "https://websuli.vip";

function validSubject(value: string): boolean {
  if (/^mailto:/i.test(value)) return normalizeAdminEmail(value.slice("mailto:".length)) !== null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "" && url.hostname !== "localhost";
  } catch {
    return false;
  }
}

export function vapidSubject(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.VAPID_SUBJECT ?? "").trim();
  if (!raw) return DEFAULT_VAPID_SUBJECT;
  if (validSubject(raw)) return raw;
  logger.warn(`[PUSH] a VAPID_SUBJECT értéke érvénytelen (mailto-cím vagy https-URL kell) — helyette az alapérték: ${DEFAULT_VAPID_SUBJECT}`);
  return DEFAULT_VAPID_SUBJECT;
}

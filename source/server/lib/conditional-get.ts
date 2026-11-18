/**
 * Kanban #101 — feltételes GET segédek a quiz-bank végponthoz (spec: docs/specs/2026-11-17-kerdesbank-karcsusitas.md 10.1).
 */

/** Az évfolyam-paraméter egyetlen elfogadott alakja: egész 0–12 (vezető nulla, előjel, tört, szóköz nélkül). */
export const QUIZ_BANK_CLASSROOM_RE = /^(?:[0-9]|1[0-2])$/;

/**
 * Az `If-None-Match` egyezése (RFC 9110 13.1.2: gyenge összevetés — a `W/` előtag nem számít; vesszős lista; `*` bármire).
 * A fejléc hiánya vagy üres értéke: nincs egyezés.
 */
export function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header.join(",") : header;
  const opaque = (t: string) => t.trim().replace(/^W\//, "");
  const want = opaque(etag);
  return raw.split(",").some((t) => {
    const v = t.trim();
    return v === "*" || (v.length > 0 && opaque(v) === want);
  });
}

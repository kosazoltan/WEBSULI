/**
 * Spec 2026-11-17-eredmeny-email-kviz, R10 — telepítési sorrend: a kliens (Vercel) és a szerver (Render) egymástól függetlenül települ,
 * a kliens jellemzően hamarabb. A régi szerver sémája szigorú (`.strict()`), az új mezőket 400-zal utasítja el. A VÉGLEGES beküldés régi
 * alakja: az új mezők (`startedAt`, `lastAnsweredAt`) nélkül — a szerver így is pontoz, csak a levél dátumsora marad ki. A PILLANATKÉPNEK
 * nincs régi alakja: a régi szerver a `partial` nélküli törzset végleges beküldésnek venné (a kihagyott kérdések hibásként, és a levél a kör
 * kulcsát foglalná). Import nélküli, tiszta függvény (kliens és egységteszt is hívja).
 */
/** R31: a kilét-címke (`subject`) is új mező — a régi szerver nem ismeri. */
const NEW_FIELDS = ["startedAt", "lastAnsweredAt", "clientNow", "subject"] as const;
/**
 * Terv R12 (második vak ellenőrzés K3): a szerver a `GET /api/csrf-token` válaszában ezzel jelzi, hogy ismeri az új eredmény-API-t
 * (pillanatkép, új mezők). A régi szerver nem küldi; a kliens jelzés nélkül a régi alakkal, pillanatkép nélkül dolgozik.
 */
export const RESULT_API_VERSION = 2;

/** A végleges beküldés régi alakja, vagy `null`, ha nincs (pillanatkép, illetve új mező nélküli törzs — ott a 400 valódi hiba). */
export function legacyResultBody<T extends Record<string, unknown>>(body: T): Omit<T, (typeof NEW_FIELDS)[number]> | null {
  if (body.partial === true || !NEW_FIELDS.some(field => field in body)) return null;
  const legacy: Record<string, unknown> = { ...body };
  for (const field of NEW_FIELDS) delete legacy[field];
  return legacy as Omit<T, (typeof NEW_FIELDS)[number]>;
}

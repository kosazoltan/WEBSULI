/**
 * Spec 2026-11-17-eredmeny-email-kviz, R10 — telepítési sorrend: a kliens (Vercel) és a szerver (Render) egymástól függetlenül települ,
 * a kliens jellemzően hamarabb. A régi szerver sémája szigorú (`.strict()`), az új mezőket 400-zal utasítja el. A VÉGLEGES beküldés régi
 * alakja: az új mezők (`startedAt`, `lastAnsweredAt`) nélkül — a szerver így is pontoz, csak a levél dátumsora marad ki. A PILLANATKÉPNEK
 * nincs régi alakja: a régi szerver a `partial` nélküli törzset végleges beküldésnek venné (a kihagyott kérdések hibásként, és a levél a kör
 * kulcsát foglalná). Import nélküli, tiszta függvény (kliens és egységteszt is hívja).
 */
const NEW_FIELDS = ["startedAt", "lastAnsweredAt"] as const;

/** A végleges beküldés régi alakja, vagy `null`, ha nincs (pillanatkép, illetve új mező nélküli törzs — ott a 400 valódi hiba). */
export function legacyResultBody<T extends Record<string, unknown>>(body: T): Omit<T, (typeof NEW_FIELDS)[number]> | null {
  if (body.partial === true || !NEW_FIELDS.some(field => field in body)) return null;
  const legacy: Record<string, unknown> = { ...body };
  for (const field of NEW_FIELDS) delete legacy[field];
  return legacy as Omit<T, (typeof NEW_FIELDS)[number]>;
}

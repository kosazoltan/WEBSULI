/**
 * Adventi naptár — Escape-tartalék a párbeszédablakokhoz (docs/specs/2026-11-18-adventi-naptar.md 4.2: „Escape / »Bezárás«
 * visszaadja a fókuszt”; robusztussági teszt S4, S5).
 *
 * A Radix DismissableLayer a réteg sorszámát RENDERELÉSKOR számolja, és a frissen megnyílt ablak csak egy későbbi (nem szinkron)
 * újrarenderelés után lesz a „legfelső réteg” — addig az Escape-et csendben eldobja. Mérés 2026-11-20 (focusin / keydown napló
 * a böngészőben): az összesítés megnyitása után ~30 ms-mal nyomott Escape-re az ablak nyitva maradt, a fókusz a benne lévő
 * „Javítom” gombon állt (20 futásból több bukás). Amikor a könyvtár kezeli az Escape-et, `preventDefault`-ot hív (a dokumentum
 * capture-fázisában, tehát a tartalom onKeyDown-ja ELŐTT) — ilyenkor itt nincs teendő; különben a bezárást a hívó végzi, így az
 * Escape a megnyílás pillanatától determinisztikusan zár, és pontosan egyszer.
 */
export type EscapeKeyEvent = { key: string; defaultPrevented: boolean; preventDefault(): void };

/** Igaz, ha ez az Escape a párbeszédablakon belül érkezett, és a könyvtár nem kezelte — ilyenkor le is foglalja (preventDefault). */
export function escapeMissedByLayer(event: EscapeKeyEvent): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  event.preventDefault();
  return true;
}

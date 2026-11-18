/**
 * Szólétra — a kérdés célrészének (kiemelt szó / mondat) keresése (olvashatósági javítás D; review K1).
 *
 * A célrész a kérdés ADATÁBÓL jön: szóbanknál a `VocabQuiz.focus` (a lap a megjelenítéskor / újraépítéskor tárolja), kézi
 * banknál a `LadderItem.focus`. A menetek közötti ismétlésből visszatérő kézi tétel a közös ismétlési sor tárolt
 * pillanatképéből épül (`restoreReviewQuestion` → `quiz` payload), abban nincs `focus` — ezért a kézi bank célrésze
 * azonosító szerint is kereshető (a közös director változatlan). Tiszta modul.
 */

/** Azonosító → célrész a kézi bank tételeiből (a `focus` nélküli tételek kimaradnak). */
export function manualFocusIndex(items: readonly { id?: string | number; focus?: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const it of items) {
    if (it.id !== undefined && typeof it.focus === "string" && it.focus.trim().length > 0) out.set(String(it.id), it.focus);
  }
  return out;
}

/**
 * A kérdés célrésze: előbb a menet közben tárolt (szóbank), utána a kézi bank azonosító szerinti célrésze. `null`, ha
 * egyik sincs, vagy a célrész nem rész-szövege a promptnak (biztonsági háló — a kérdés-sáv akkor a régi módon mutat).
 */
export function ladderFocusFor(
  quiz: { id?: string | number; prompt: string },
  session: ReadonlyMap<string, string>,
  manual: ReadonlyMap<string, string>,
): string | null {
  if (quiz.id === undefined || quiz.id === null) return null;
  const id = String(quiz.id);
  const focus = session.get(id) ?? manual.get(id) ?? null;
  return focus && quiz.prompt.includes(focus) ? focus : null;
}

/**
 * Kattintás, majd nyugvás (joystick-mérő, `docs/specs/2026-11-18-joystick-tsunami-stabil.md`).
 *
 * A mérő a kérdés megválaszolása / a magyarázókártya bezárása után ugyanannyit vár, mint a javítás előtti rögzített várakozás
 * (`click()` → `waitForTimeout(minMs)`): az állapotra várás UTÁN a hátralévő időt `minMs`-ig kiegészíti. Az időbélyeg a SIKERES
 * kattintás befejezésekor rögzül (review #514, P2): ha a kattintás előtt rögzülne, lassú futtatón a kattintásra várás is
 * beleszámítana, és éppen a lassú CI-n rövidülne a nyugvás.
 *
 * Sikertelen kattintás (a cél közben eltűnt / letiltódott — pl. a kérdés lejárt, a kártya magától bezárult) nem hiba: `false`, a hívó
 * újraolvassa az állapotot. Tiszta: az óra és az alvás befecskendezett (a `joystick-click-settle.test.ts` szimulált órával méri).
 */
export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };

export async function clickThenSettle(
  click: () => Promise<unknown>,
  untilState: () => Promise<unknown>,
  minMs: number,
  clock: Clock,
): Promise<boolean> {
  const clicked = await click().then(
    () => true,
    () => false,
  );
  if (!clicked) return false;
  const since = clock.now();
  await untilState();
  const rest = minMs - (clock.now() - since);
  if (rest > 0) await clock.sleep(rest);
  return true;
}

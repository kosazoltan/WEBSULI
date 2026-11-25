/**
 * Adventi naptár — a főoldali kártya megjelenésének forrása (docs/specs/2026-11-18-adventi-naptar.md 20.): a kliens-buildbe
 * égetett kapcsoló és a böngésző órája. Élesben az `index.html`-t a Vercel statikus buildje adja, ezért a „látszik-e a kártya”
 * döntésnek hálózati kör nélkül, az első rajzolás előtt kell megszületnie.
 *
 * Teszt-kampós buildben (`VITE_ENABLE_GAME_TEST_HOOKS=1` — a `build:e2e`) az idő CSAK a teszt által beadott
 * `window.__websuliAdventTestNow` értékből jön: nélküle a naptár a kliensben is „kikapcsolt”, így a többi főoldali teszt a
 * szezonban is változatlan lapot lát. Az éles buildben a kampót olvasó ág nem létezik (a feltétel build-időben hamis).
 */
import { homeCardClock } from "@shared/advent/home-card";

/** A kliens-buildbe égetett kapcsoló (Vercel: `VITE_ADVENT_CALENDAR=on`). */
export const ADVENT_BUILD_FLAG = import.meta.env.VITE_ADVENT_CALENDAR === "on";
const TEST_HOOKS = import.meta.env.VITE_ENABLE_GAME_TEST_HOOKS === "1";

/** A kártya „mostja”: `null`, ha a kártya biztosan nem látszik (kikapcsolt kapcsoló; teszt-buildben nincs beadott tesztidő). */
export function adventCardNow(): Date | null {
  let hookValue: unknown;
  if (TEST_HOOKS) hookValue = (window as unknown as { __websuliAdventTestNow?: unknown }).__websuliAdventTestNow;
  return homeCardClock({ flag: ADVENT_BUILD_FLAG, testHooks: TEST_HOOKS, hookValue, realNow: new Date() });
}

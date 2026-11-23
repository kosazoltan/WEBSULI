# Terv — a Vihargarázs érintéses végigjárása ne függjön a gép sebességétől (lendület utáni elnyelt koppintás)

Tulajdonosi utasítás (2026-11-23): a WEBSULI hiánylistáinak maradéktalan lezárása; az adventi PR-C kapuja ezen a teszten bukott.

## Tény (mérés, 2026-11-23)

- `tests/game-meta-quality.spec.ts` „Vihargarázs … érintéses végigjárás”: helyben 7-ből 5 bukik — a fő ágon (`c9dd780c`) is, a
  PR-C-től függetlenül; a CI-ben zöld.
- Eseménynapló a „Vissza” koppintásakor: `pointerdown, touchstart, pointerup, touchend` — **`click` nincs**; ugyanazon gombon
  programból hívott `click()` működik (az alkalmazás logikája helyes). A görgetés (CDP-swipe) nélkül a koppintás működik.
- Ok: a `swipeUp` segéd 10 gyors lépés után azonnal elengedi az ujjat → lendület (fling). Lendület közben a Chromium a következő
  koppintást a fling megállítására használja, `click` nélkül. A lap alján a fling a határon fut, a pozíció nem változik.

## Döntés

- A `swipeUp` végén az ujj megáll (3 × 40 ms azonos pontú `touchMove`), így nincs lendület; utána a görgetés nyugvásáig vár
  (pozíció-mintavétel) a fix 150 ms helyett. Termékkód nem változik.

## Elfogadás

- [ ] E1 WHEN a Vihargarázs-teszt fut helyben (SwiftShader, 1 worker) THEN mind a 7 nézet SHALL zöld lenni.
- [ ] E2 THE teljes `game-meta-quality.spec.ts` SHALL zöld maradni.

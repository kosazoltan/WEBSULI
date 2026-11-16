# Végrehajtási utasítás — Kockavadász: lejáratkor a játék megáll (kanban #58)

**Állapot:** folyamatban – 2026-11-16, ág `fix/e2e-coupon-expired-block-craft`
**Terv:** `docs/specs/2026-11-16-e2e-coupon-expired-block-craft.md`

## Fájlok (csak ezek)

- `source/client/src/pages/BlockCraftQuiz.tsx` — a javítás.
- `source/tests/coupon-expired-all-games.spec.ts` — ÚJ eset a Kockavadászra (a meglévő esetek változatlanok).
- `docs/specs/2026-11-16-e2e-coupon-expired-block-craft*.md` — terv, utasítás, mérési eredmények.

Közös fájlt (`game-engine/CouponHud.tsx`, `useCouponSession.ts`, `game-test-hooks.ts`, `index.css`, közös tesztsegéd) NEM
módosítunk.

## Lépések

1. `BlockCraftQuiz.tsx`
   - `frameCountRef = useRef(0)`; a render-`step` a `runningRef` ellenőrzése után növeli.
   - `installGameTestApi` → `probe()` új mezője: `frames: frameCountRef.current` (a típus `Record<string, number|string|null>`
     marad).
   - Render-ciklus-vezérlő effekt: `shouldRun = (phase === "play" || phase === "quiz") && !paused && !coupon.expired`;
     függőség: `coupon.expired`.
   - Játékóra-effekt és vezérlés-tipp-effekt: `|| coupon.expired` → nem indul / leáll; függőség: `coupon.expired`.
   - Új effekt: `coupon.expired` igazra váltásakor `releaseMovement()` és `releasePointerLock()` (játék-kezdeményezett
     elengedés → az `onLockChange` nem nyit szünetet).
2. `coupon-expired-all-games.spec.ts` — új eset: `block-craft-quiz: lejáratkor a játék megáll — a render-ciklus és a
   játékóra áll, szünet menü nélkül`:
   - lejárat előtt a `probe().frames` nő (a mérés érvényes: a ciklus futott);
   - lejárat után `expect.poll` → két, ≥ 1,5 s-mal későbbi leolvasás között a `frames` nem változik, és a HUD
     `progressbar` felirata sem; a `game-pause-menu` száma 0.
   - Az idő itt maga a mért mennyiség (egy 1 s-os óra legalább egyet lépne 1,5 s alatt), nem várakozás egy feltételre.
3. Mérés előtte / utána (helyben): ld. lent. A CI-bizonyíték a PR teljes E2E zöldje.

## Parancsok

```bash
cd source
# a CI útja: buildelt szerver, saját eldobható Postgres-konténer, szabad port
node --import tsx scripts/run-e2e-tests.ts tests/coupon-expired-all-games.spec.ts
node --import tsx scripts/run-e2e-tests.ts tests/coupon-expired-all-games.spec.ts -g block-craft --repeat-each 15
node --import tsx scripts/run-e2e-tests.ts tests/support/game-mobile-quality.ts -g block-craft
npm run lint && npm run check && npm run check:test
```

SwiftShader- és CPU-lassításos méréshez ideiglenes, NEM commitolt konfiguráció (`--disable-gpu --use-gl=swiftshader`) és
CDP `Emulation.setCPUThrottlingRate` próba kell (a mérés eredménye lent).

## Mérés

(a futások után kitöltve)

## Elfogadás

A terv `<!-- acceptance-checklist -->` pontjai.

## Nyitott (UNKNOWN / külön jegy)

- A többi négy kuponos játék (Tsunami, BrainRot, Űr-aszteroida, Tornádó) órája / ciklusa a lejárt párbeszéd alatt —
  UNVERIFIED, hogy tovább jár-e; ha igen, ugyanez a termékhiba olcsóbb formában (orkesztrátor-kérés).

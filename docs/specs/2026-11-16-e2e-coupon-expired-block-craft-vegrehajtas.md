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

Helyi gép: Windows x64, 12 mag / 24 szál; a CI útja (`scripts/run-e2e-tests.ts`: buildelt szerver, saját eldobható
Postgres 17, szabad port), 1 worker, újrapróba nélkül. A szoftveres WebGL-t a WebGL-renderer szövege igazolja: `ANGLE
(Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`.

| mód | előtte (origin/main ba9c666c) | utána (javítás) |
| --- | --- | --- |
| SwiftShader, 15× az eredeti eset | 15/15 zöld, 9,2–13,8 s | 15/15 zöld, 2,7–4,8 s; az új eset 15/15 zöld, 4,5–7,3 s |
| SwiftShader, 2 logikai CPU (`start /affinity 5`), 10× | 10/10 zöld, 9,7–12,6 s | 10/10 zöld, 3,1–7,5 s |
| GPU, 15× | a Kockavadász-eset 15/15 zöld, 1,4–2,5 s (rAF a lejárat után 169–172 / 3 s, 8 billentyű 8–55 ms) | a teljes spec 90/90 zöld; a Kockavadász-eset 1,2–2,6 s, az új eset 2,7–4,0 s, a többi négy játék 1,3–4,1 s |
| CI | 3 futásban bukott (ld. terv) | a PR teljes E2E-je: MERES_CI |

Képkocka-próba (ideiglenes, nem commitolt spec, SwiftShader, 2 logikai CPU, 10×; rAF-hívások 3 s alatt, 8 billentyű ideje):

| | előtte | utána |
| --- | --- | --- |
| rAF a lejárat ELŐTT / 3 s | 15–18 (~5 fps) | 13–16 |
| rAF a lejárat UTÁN / 3 s | 15–18 (a ciklus fut tovább) | **0** |
| 8 `keyboard.press` a lejárt párbeszédnél | 2823–3604 ms | 10–202 ms |

A CPU-lassítás (CDP `Emulation.setCPUThrottlingRate` 4× és 6×) a képkockaidőt nem változtatta (15–17 rAF / 3 s): a
SwiftShader a GPU-folyamatban rajzol, a renderer-szál lassítása nem éri. Helyben a 30 s-os bukás nem jött elő (helyben
a képkocka ~0,2 s, a CI-riport lépésidőinek kvantuma szerint ott ~0,7 s; a futtató CPU-száma UNVERIFIED) — a reprodukció a mechanizmusé
(lejárat után minden bemenet képkockára vár), nem a 30 s-os küszöbé.

Kapcsolódó e2e a javítással (GPU, egyszer): `block-craft-real-touch`, `blockcraft-two-finger`, `joystick-response`,
`games-pointer-controls`, `game-win-paths`, `games-touch-controls`, `game-viewport-experience` — 68/68 zöld; a közös mobil
mérő `game-mobile-quality.spec.ts -g block-craft` — 32/32 zöld.

Mutációs próba (a javítás két sora visszavonva, a `frames` számláló megtartva, GPU, 3×): az új eset 3/3 bukik —
`a lejárt párbeszéd alatt a render-ciklus leáll`, Expected 0, Received 17 (17 képkocka 300 ms alatt).

## Elfogadás

A terv `<!-- acceptance-checklist -->` pontjai.

## Nyitott (UNKNOWN / külön jegy)

- A többi négy kuponos játék (Tsunami, BrainRot, Űr-aszteroida, Tornádó) órája / ciklusa a lejárt párbeszéd alatt —
  UNVERIFIED, hogy tovább jár-e; ha igen, ugyanez a termékhiba olcsóbb formában (orkesztrátor-kérés).

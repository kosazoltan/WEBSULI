# E2E-ingadozók, 2. kör: joystick-mérő, szóbank-napló, a lejárt kupon a közös rétegben (kanban #58)

**Állapot:** folyamatban – 2026-11-16, ág `fix/e2e-ingadozok-2`
**Végrehajtási utasítás:** `docs/specs/2026-11-16-e2e-ingadozok-2-vegrehajtas.md`
**Előzmény:** `docs/specs/2026-11-16-e2e-coupon-expired-block-craft.md` (#470)

## 1. `joystick-response › block-craft-quiz` (a #470 CI-jében flaky, 180 s-os időtúllépés)

Tény: a #470 CI-jében (run 43934797679) a Kockavadász joystick-mérése kétszer a 180 s-os tesztkeretbe futott (a
`touch` CDP-hívásnál, ill. az `ensurePlaying` tárcsa-ellenőrzésénél), a 3. kísérlet zöld. A CI-ben a Kockavadász minden
Playwright-hívása egy ~0,7 s-os képkockára vár; a #470 `ensurePlaying` lépésenként több `isVisible`-t tett (kártya, kvíz,
tárcsa). Helyben SwiftShaderrel a régi és az új spec ideje azonos volt (1,1–1,2 perc) — a CI-ben a hívásszám dominál.

Cél: lépésenként EGY lap-hívás állapot-ellenőrzésre (`page.evaluate`: kártya, kvíz, tárcsa), a lassú út csak eltérésnél.
A küszöbök képkockában maradnak, a mérés tartalma nem változik.

## 2. `vocab-cross-game-log.spec.ts:49` (a #454 után is flaky, a 73. sornál)

Tény (run 43907199578, 1. kísérlet): a Szökőár-szakasz 4. kérdésénél a helyes válasz után a kérdés szövege 10 s-ig
„ugyanaz” maradt; a 3. kérdésnél ugyanez 7,9 s volt. Az eredményképen „Cél 4/6”: a 4. válasz beszámított. A gyökérok a
mérés után kerül ide (hipotézisek: a Szökőár saját, időzítős kvíze a kényszerített kvízek közé esik; a válasz-zár
(`answerLockedRef`) egy úton nem oldódik fel; a teszt a kérdés-szöveget a React újrarajzolása előtt olvassa).

## 3. A lejárt kupon a többi játékban

A kupon csak öt játékban él (`useCouponSession`: Kockavadász, Szökőár, Brain Rot, Aszteroida, Viharvadász); a Szólétra
és a Matek sprint nem indul kuponnal (nincs `CouponExpiredOverlay`-ük) — ott nincs mit megállítani. A négy nem
Kockavadász-játéknál mérni kell, fut-e a hurok / az óra / a szimuláció a lejárati párbeszéd alatt.

Javítás a KÖZÖS rétegben (ha fut): a `CouponExpiredOverlay` lejáratkor a `GameShell` automatikus szünetének útját
indítja (`GAME_HALT_EVENT` → minden játék saját `pauseGame`-je: hurok, óra, bemenet áll), és a közös `PauseMenu` a
lejárt kupon alatt nem rajzol (a lejárati párbeszéd az egyetlen réteg). Lapszintű módosítás nincs.

## Nem cél

- A tesztek elvárásainak vagy időkorlátjainak lazítása.
- A Matek (#466) és a Párbaj (#464) lapjainak módosítása.
- A `docs/agent-csapdak.md` (külön docs-PR).

## Elfogadás (EARS)

- AMIKOR a kupon lejár bármelyik kuponos játékban, a játék megáll (szimuláció / óra nem lép 3 s alatt), és a szünet menü
  NEM jelenik meg; a „Vissza a leckéhez” fókuszban marad.
- A joystick-mérő Kockavadász-esete SwiftShaderrel ≥ 10 ismétlésben zöld, a küszöbök változatlanok.
- A szóbank-napló teszt gyökéroka bizonyított, a javítás a gyökérnél van, új determinisztikus teszttel.
- A közös mobil mérő mind a hét játékra zöld; a CI teljes E2E-je zöld.

<!-- acceptance-checklist -->
- [ ] 1: `ensurePlaying` egy lap-hívásos gyors út; joystick block-craft SwiftShader ≥ 10× zöld.
- [ ] 2: szóbank-napló gyökérok + javítás + determinisztikus teszt.
- [ ] 3: mérés 5 kuponos játékon előtte / utána; közös javítás; az e2e kiterjesztése mind az 5 kuponos játékra.
- [ ] Mobil mérő 7 játékra, CI zöld.

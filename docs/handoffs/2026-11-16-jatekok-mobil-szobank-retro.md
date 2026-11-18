# Retro — Játékok mobilra + központi nyelvi szóbank (S0–S13, 2026-11-15 → 2026-11-16)

Terv: `docs/specs/2026-11-15-jatekok-mobil-szobank.md` · végrehajtás: `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`
· kanban #17–#30 (+ #31 felderítés). A globális CLAUDE.md „KÖTELEZŐ futás utáni retro” szabálya szerint, mért tényekből.

## 1. Mért tények

| Szelet | PR | CI-futás (bukott / zöld) | Megjegyzés |
|---|---|---|---|
| S0 terv | #419 | 2 / 1 | + #420 CI-javítás (Playwright E2E ubuntu-24.04) |
| S1 szóbank-infra | #421 | 1 / 3 | utójavítás #423 (riport-teszt a stage-hez), #432 (átfedő jelentésű elterelők) |
| S2 mobilkeret | #422 | 1 / 3 | utójavítás #429 (két környezeti WebGL-figyelmeztetés, közös mérő) |
| S3 angol 2664 | #431 | 0 / 3 | vak megoldó + idióma-/szinonima-audit |
| S4 német 2080 | #427 | 0 / 2 | |
| S5 francia 2064 | #428 | 0 / 2 | |
| S6 Szólétra | #430 | 2 / 3 | |
| S7 Matek sprint | #425 | 1 / 1 | |
| S8 Brain Rot | #424 | 2 / 1 | itt mértük a „kiváltott évfolyam-tétel nem fogy” csapdát |
| S9 Szökőár | #426 | 2 / 1 | |
| S10 Aszteroida | #434 | 0 / 2 | |
| S11 Kockavadász | #435 | 0 / 2 | |
| S12 Tornado | #433 | 0 / 2 | |
| kupon-réteg | #436 | 0 / 3 | lejárati párbeszéd a szünet / eredmény fölött |
| S13a lista + adat | #437 | 0 / 2 | a main CI-ja utána piros (lent) |
| S13b zárás | (ez a PR) | — | review-leletek, mérő-szigorítás, záró őrök |

- Összesen a szeletek ágain **14 bukott és 38 zöld CI-futás** (`gh run list --workflow ci.yml`, ágonként).
- **Main CI piros a #437 után** (run 43794783447, `b5041240`): Playwright E2E 3 failed (`block-craft-quiz` „full: M1 M2 M3 négy
  állapotban” mind a 3 nézetben, 3 újrapróbán), 1 flaky (`tests/block-art.spec.ts:18`). Gyökérok és javítás: C-33, e PR első
  javító commitja.
- **Vak megoldó:** kanári 10/10 szintenként mindhárom nyelven; a vak kör után a review-botok és a célzott audit még idióma-
  tükörfordítást, szinonimapárt, kognátot és duplikátumot találtak (S13a: de 14, fr 5, en 4 bejegyzés + 2 duplikátum) — a vak
  megoldó erre vak (C-31).
- **Átfogó review (S13b):** 0 kritikus, 1 magas (H1), 3 közepes (K1–K3), 6 alacsony (L1–L6) lelet; mind ellenőrizve a kódból.
- Időráfordítás: nem mértük szeletenként (UNKNOWN); a főbb várakozások: CI Playwright E2E ~27–31 perc / futás, a teljes 7 játékos
  mobil mátrix helyben ~12 perc (238 teszt).

## 2. Mi ment rosszul és mennyibe került

1. **A szóbank-bekötés „sorrend-őre” a jelentést nem mérte (H1).** A Tornadón tananyag mellett a szóbank sosem kérdezett, a ≤ 3
   tananyag-kérdés ismétlődött. Költség: az A8 a Tornadón a gyakori esetben nem teljesült a #433 merge-e óta; csak a független
   átfogó review fogta meg.
2. **Közös fedőrétegek modalitása (K1, K3).** A szünet menü háttere nem volt inert, a magyarázókártya (z 90) a menü (z 80) fölé
   került 6 játékban. Költség: akadálymentességi és csalási rés minden játékban; a mérő nem nézte.
3. **A mérő hiányai (K2).** Fekvő oldalsó sáv, szünetben álló óra, kvíz-állapot, jó válasz rezgése nem volt mérve. Költség: a fenti
   hibák zölden mentek át.
4. **„Beállt állapotra várás” élő HUD-on (C-33).** A #437 PR-ja zöld volt, a main CI piros. Költség: egy piros main és egy
   sürgős javítás.
5. **Vak megoldó vakfoltjai (C-31).** Idiómák, szinonimák, kognátok — több review-kör a tartalmi PR-okon.
6. **Párhuzamos alügynökök közös scratchpadje** (C-30): egymás segédfájljait írták felül.
7. **Eszköz-csapdák:** a Write / Edit a `\u00A0` escape-et nyers karakterré (S13a-ban sima szóközzé) írta; a `npm run test:e2e
   -- … --repeat-each N` láncon a kapcsoló és a fájlszűrő is elveszett (a teljes csomag futott le, 586 teszt) — C-34.

## 3. Ebben a futásban elvégzett javítások (fájllal)

- Tornado tananyag-elsőbbség: `source/client/src/lib/tornado/questions.ts` (+ `tests/tornado-material-unseen.test.ts`).
- Közös modális réteg: `source/client/src/game-engine/mobile/modalLayer.ts`, `PauseMenu.tsx`, `ResultScreen.tsx`,
  `QuizFeedbackCard.tsx`; válasz-őr szünetben: `TsunamiEscapeEnglish.tsx`, `BrainRotSteal.tsx`, `SpaceAsteroidQuiz.tsx`.
- Brain Rot kvíz-szünetgomb (C10), Tornado horgony-őr (C9): `BrainRotSteal.tsx`, `TornadoHunter200.tsx`.
- Jelvények az eredménykártyán (B6): `game-engine/mobile/ResultBadges.tsx`, `components/AchievementToast.tsx`, 7 játéklap.
- Közös `pickGradeSlotWithVocab` (E23): `game-engine/gradeQuiz.ts`.
- Renderer PCF (E21): `game-engine/three-look/renderer.ts`.
- Szinonima-kerülés (L2): `game-engine/vocab/vocabSource.ts`; L1 / L3 / L5 / L6: `TsunamiEscapeEnglish.tsx`, `CouponHud.tsx` +
  `index.css`, `game-engine/mobile/bestScore.ts`, `WordLadderHuEn.tsx`.
- Mérő: `source/tests/support/game-mobile-quality.ts` (M4 fekvő, M6 óra, M2/M3 kvíz, M10 jó válasz, K1/K3, élő HUD-on nincs
  beállás-várás), 7 esetfájl (`quizScope`, `quizForce`).
- Új őrök / e2e: `game-mobile-complete.test.ts`, `s13-review-guards.test.ts`, `grade-slot-shared.test.ts`,
  `three-look-shadow-type.test.ts`, `vocab-same-meaning-run.test.ts`, `coupon-expired-all-games.spec.ts`,
  `vocab-cross-game-log.spec.ts`.
- **Tudás a repóban:** `docs/agent-csapdak.md` C-31, C-32, C-33, C-34; `docs/measurements/2026-11-16-jatekok-c-ellenorzolista.md`.

## 4. Kanban

- #31 `BUG(e2e): lesson-result-email flaky` — felderítve (a `sent` jelzőt a kliens csak a POST válasza után írja), javítás nem e
  funkcióban.
- Tulajdonosi döntést igényel (a záró jelentésben opciókkal): E24 Tornado HUD angol feliratai (a meglévő tesztek az angol szöveget
  várják), B8 ClassroomGateModal kiváltása, L4 szintkimerülés utáni szintcsúszás, C15 Android vissza-gomb.
- **D19 – `better-sqlite3`:** friss munkafában az `npm ci` a telepítő szkriptet jóváhagyás nélkül kihagyja, ezért a
  `native-arch.test.ts` helyben bukik (a CI natív jobjai zöldek). Tulajdonosi döntés: `npm install-scripts approve better-sqlite3`
  a repó szintjén, vagy a teszt környezet-függővé tétele.

## 5. Legalább egy tartós javítás a repó tudásába

C-33 (stabilitás-várakozás csak végállapotú elemen; CI-úton is futtatni) és C-34 (szimulációs bekötés-teszt a forrásbeli sorrend-őr
helyett; közös modális réteg minden fedőrétegre) — mindkettőhöz kód- és tesztváltozás is tartozik ebben a PR-ban.

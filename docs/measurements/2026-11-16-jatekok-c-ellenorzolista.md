# Játékok mobilra + szóbank — C9–C16 ellenőrzőlista mind a 7 játékra (S13, 2026-11-16)

Forrás: az orkesztrátor S13-teendőlistájának C csoportja; kódaudit a `feat/jatekok-s13b-zaras` ágon (`b5041240` + az S13b
commitjai), egy független, csak olvasó alügynök és a saját visszaolvasásom alapján. A sorszámok a javítás ELŐTTI
`b5041240` állapotra vonatkoznak (a javított pontoknál a teszt neve a bizonyíték). Útvonalak a `source/client/src/` alól.

Jelölés: **OK** = vizsgálva, rendben; **JAVÍTVA** = hibát találtunk, ebben a PR-ban javítva (teszttel); **N/A** = nem alkalmazható.

| Pont | Szökőár | Szólétra | Kockavadász | Matek sprint | Brain Rot | Aszteroida | Tornado |
|---|---|---|---|---|---|---|---|
| C9 elavult időzítő | OK – `TsunamiEscapeEnglish.tsx:1298-1309` (runId + `phaseNowRef`); `tsunami-mobile.test.ts` | OK – `whenNotPaused` `WordLadderHuEn.tsx:702-711`, `clearRunTimers` :538-549 | OK – nincs késleltetett fázisváltás (:2536/:2538 azonnali) | OK – a :1725-ös 260 ms-os időzítő fázist nem vált | OK – fázisváltás csak effekthez kötött intervallumban (:808-822) | OK – `pushRunTimeout` :915-921, `finishRunAfter` :1950-1959; `space-asteroid-mobile.test.ts` | JAVÍTVA – horgonyzott állapotban új horgony-kvíz nyílhatott, és az ütemezett győzelem a nyitott kvíz alatt futott le; `s13-review-guards` „C9” |
| C10 szünet elérhető, óra áll | OK – `ts-quiz-pause` :1854; óra :1103-1105 | OK – nincs teljes képernyős kvíz; óra :591-596 | OK – `bc-quiz-pause` :3143; óra :1425-1438 | OK – óra :1606-1612; `speed-quiz-mobile.test.ts` | JAVÍTVA – a z-60-as kvízréteg eltakarta az egyetlen szünetgombot → `br-quiz-pause`; `s13-review-guards` „C10” | OK – `sa-quiz-pause` :3101; óra :1149-1178 | OK – kvíz a HUD alatti sávban; `tornado-mobile-shell.test.ts` |
| C10/K3 magyarázókártya a szünet fölött | JAVÍTVA (közös) | JAVÍTVA (közös) | JAVÍTVA (közös) | JAVÍTVA (közös) | JAVÍTVA (közös) | JAVÍTVA (közös) | OK (lapszintű `feedback && !paused`) — a közös javítás is fedi |
| C11 kiváltott évfolyam-tétel látott | OK – a szóbank a `pickGradeQuiz` előtt (:860-864); `tsunami-mobile.test.ts` | N/A (nincs évfolyam-bank) | OK – közös `pickGradeSlotWithVocab`; `blockcraft-mobile.test.ts` | N/A | OK – közös választó; `brainrot-tuning.test.ts` | OK – közös választó; `space-asteroid-quiz-slot.test.ts` | OK – közös választó (E23); `tornado-vocab-pick.test.ts` |
| C12 két irány / közös napló | OK (+ L1 javítva: tananyag-válasz nem kerül a naplóba) | OK – :610-615, :453-462; `word-ladder-vocab.test.ts` | OK – :1485-1487 | N/A | OK – :490-492 | OK – :1040-1042 | OK – :1353-1356 |
| C12 két játék között (A5, böngésző) | `vocab-cross-game-log.spec.ts` (Szólétra → Szökőár) | ← | (közös napló: `seenHistory.ts:209`, egy kulcs) | – | ← | ← | ← |
| C13 húzás közbeni tájolás-/méretváltás | OK – :953-958, :1082-1087; `VirtualJoystick.tsx:87-97` | N/A (koppintás) | OK – `releaseMovement` :1559-1568 | N/A | N/A (koppintás) | OK – :1094-1105 | OK – :1396-1401, :1653-1666 |
| C14 cloze magyar fordítás | OK | OK | OK | N/A | OK | OK | OK |
| C15 portálos fedőrétegek (fókusz, inert, Esc) | JAVÍTVA (közös `useModalLayer`) | JAVÍTVA | JAVÍTVA | JAVÍTVA | JAVÍTVA | JAVÍTVA | JAVÍTVA |
| C16 lista → játék ≤ 2 koppintás | `games-lobby-mobile.spec.ts` M8 (/games és /) + `game-mobile-quality.spec.ts` M8 | ← | ← | ← | ← | ← | ← |

## Megjegyzések

- **C14 mérés a valódi bankon:** a cloze helyes opciója célnyelvi szó (`questionGenerator.ts:105-109`), a magyar fordítás
  csak a kérdésben áll (:237), a fordításban szereplő rossz válasz eleve kizárt (:217) — magyar opciós triviális kérdés nem
  keletkezik. A fordításban szó szerint benne álló helyes célnyelvi szó (jövevényszó): en 3 / 2573, de 5 / 2043, fr 3 / 1998
  cloze-kérdés (pl. bus–busz, Akku). Rossz válasz a fordításban 0.
- **C15 – NOT DONE része:** az Android vissza-gomb (`popstate`) futás közben szünet nélkül elnavigál. Javításához a
  `GameShell`-nek `history.pushState`-tel kellene a böngésző-előzményt bővítenie játék közben, ami a wouter-navigációval
  (Kilépés, kupon „Vissza a leckéhez”) kölcsönhatna — tulajdonosi döntés / külön szelet. Az eredményképernyőn Esc nincs
  (nincs egyértelmű művelete: Újra vagy Vissza).
- **C13 – UNVERIFIED:** a `lostpointercapture` eseményt sem a `VirtualJoystick`, sem a `HoldButton` nem kezeli; a beragadást a
  `pointercancel` + szünet / blur / fázisváltás nullázása fedi. Olyan böngészőt, ahol a capture `pointerup` / `pointercancel`
  nélkül vész el, nem mértünk.
- **3D felszabadítás (a review nem vizsgálta):** a `TsunamiScene3D`, `BrainRotArena3D`, `LadderScene3D` a közös
  `useThreeScene`-en át épül; lecsatoláskor és függőség-váltáskor a `useThreeScene.ts:124-138` leállítja a rAF-ot, bontja a
  `ResizeObserver`-t, hívja a jelenet `dispose`-át (`TsunamiScene3D.tsx:1240-1242`, `BrainRotArena3D.tsx:760-764`,
  `LadderScene3D.tsx:889-892`), `disposeObjectTree(scene)`, `postFx.dispose()`, `renderer.dispose()`, és leválasztott
  vásznon `forceContextLoss()`. Újrakezdéskor a jelenet nem épül újra (a függőségek: `[props.light]` / `[]`). Rendben.

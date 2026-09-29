# Végrehajtás — évfolyam-bank bekötése az öt játékba (2026-09-29)

Terv: `docs/specs/2026-09-29-jatekok-3-12-evfolyam.md`, a **2., 3. és 4. döntés** (ez a szelet).
Az 1. döntés (a bank tartalma, `grade-03.ts … grade-12.ts`) párhuzamos szelet: ezen az ágon a
`GRADE_QUIZ_ITEMS` ÜRES — minden bekötésnek üres bankkal is a mai viselkedést kell adnia.

Ág: `feat/evfolyam-bank-bekotes` (alap: `origin/feat/evfolyam-bank-alap`). Parancsok a `source/` mappából.

## Nem ebben a szeletben
- Bank-tartalom, E2/E4 (tartalmi szelet). WordLadderHuEn / SpeedQuizMath. `shared/single-choice-check.ts`,
  `shared/game-quiz-contract.ts`. Az Aszteroida hajó/háttér grafikája (`buildPlayerShip`, `spaceBackdrop.ts`).

## Ellenőrzött kiindulópontok (újraellenőrizve ezen az ágon)
- `client/src/pages/SpaceAsteroidQuiz.tsx`: saját 1–12 választó `GRADES` (`:165`), `loadGrade/saveGrade` (`:245-263`),
  `pickQuiz` (`:896`), `adaptiveRef = createAdaptiveSession(4)` (`:995`), `onPickGrade` (`:2308`).
- `client/src/pages/BlockCraftQuiz.tsx`: `userGrade` (`:1241`), `subjectOrder` (`:1283`), `pickQuiz` (`:1349`),
  `subjectStats` (`:1180`, `:1430`), kvíz-chip címke (`:2758`); `client/src/lib/blockCraftSubjects.ts` (11 sor).
- `client/src/pages/BrainRotSteal.tsx`: `Quiz.category` (`:43`), `CATEGORY_LABELS/BORDERS` (`:199-209`),
  `difficultyRef = startingDifficulty(4)` (`:303`, `:531`), `pickQuiz` (`:360`).
- `client/src/pages/TsunamiEscapeEnglish.tsx`: `parseDifficultyFromSearch` (`:544`), `useState<GameDifficulty>` (`:552`),
  `pickQuiz` (`:692`), `adaptiveRef.reset(userGrade ?? 4)` (`:732`).
- `client/src/lib/tornado/questions.ts`: `SchoolLevel` 1–6 (`:18`), `AUTO_GRADE_TABLE` (`:52-59`), `pickQuestion` (`:384`);
  `client/src/lib/tornado/progress.ts:367` (1..6 vágás); `client/src/pages/TornadoHunter200.tsx:723` (`schoolOptions`),
  `:741` (AUTO súgószöveg), `:1075` (`pickQuestion` hívás).

## 1. feladat — tesztek előbb (`tests/grade-quiz-select.test.ts`, ÚJ)
A választót kis, injektált fixture-listával teszteljük (`items` paraméter), a bank tartalmától függetlenül.
1. `tierForBand`: 0.39 → 1, 0.4 → 2, 0.69 → 2, 0.7 → 3.
2. Évfolyam-elsőbbség: 7. évfolyamra csak `grade === 7` tétel jön, amíg van nem látott.
3. Szint a sáv szerint; ha a kívánt szint kimerült/üres → szomszédos szint (1→2→3, 3→2→1, 2→közelebbi).
4. Ismétlés-tilalom azonosító ÉS normalizált prompt szerint (két különböző id, csak kis/nagybetűben és
   szóközben eltérő prompt → csak az egyik jön).
5. Kimerült évfolyam → előbb `grade-1`, csak utána `grade+1`; mindhárom kimerült → `null`.
6. `subjects` szűrő: csak a megadott tárgyak; üres/hiányzó szűrő = minden tárgy.
7. Üres bank → `null`; `gradeForGame`: null/0/1/2/13/NaN → `null` (saját bank), 3..12 → az évfolyam.
8. `difficultyForGrade` (Szökőár): 3–5 easy, 6–8 normal, 9–12 hard, egyéb → null. `bandShiftForDifficulty`.
9. Szimuláció: 2000 futás különböző seedekkel; egy futásban `null`-ig húzunk; nincs ismétlődő id és normalizált
   prompt; a húzások száma = a (grade, grade−1, grade+1) ∩ 3..12 egyedi promptú tételeinek száma.
10. Bekötés-őr (forrásszöveg), játékonként: importálja a `@/game-engine/gradeQuiz`-t, hívja a `pickGradeQuiz`-t,
    és a játékos évfolyamát adja át (`gradeForGame(grade)` / `gradeForGame(userGrade)` / Szökőárnál `gradeForGame(userGradeRef.current)` a
    renderenként frissített `userGradeRef.current = userGrade` refen át / Tornádónál a
    `questions.ts` a `resolveGrades` eredményét). Brain Rot: `startingDifficulty(userGrade ?? 4)`, a `(4)` rögzítés eltűnt.
    Tornádó: `schoolOptions` 1..12 + auto; `progress.ts` 12-ig fogad el.
Parancs: `node --import tsx --test tests/grade-quiz-select.test.ts` → az implementáció előtt BUKIK (modul hiányzik).

## 2. feladat — `client/src/game-engine/gradeQuiz.ts` (ÚJ, tiszta modul)
Exportok:
- `normalizePrompt(p)`: NFC, kisbetű, szóköz-összevonás, trim.
- `createGradeQuizSeen()` → `{ ids: Set<string>; prompts: Set<string> }`; `markGradeQuizSeen(seen, {id?, prompt})`;
  `isGradeQuizSeen(seen, {id?, prompt})`.
- `tierForBand(band)`; `pickGradeQuiz({ grade, band, subjects?, seen, rng?, items? })` — `items` alapértéke
  `GRADE_QUIZ_ITEMS`; a visszaadott tételt NEM jelöli (a hívó jelöli, amikor ténylegesen kérdezi).
- `gradeForGame(grade)` → 3..12 egész esetén az évfolyam, egyébként `null` (= a játék saját bankja).
- `pickUnseenMaterial(material, seen)` — a tananyag-kvíz elsőbbségéhez (első nem látott tétel).
- `difficultyForGrade(grade)`, `bandShiftForDifficulty(d)` (Szökőár).
Parancs: `node --import tsx --test tests/grade-quiz-select.test.ts` → PASS.

## 3. feladat — bekötés játékonként (a mai út marad, ha a választó `null`-t ad)
Közös minta minden játékban: `const g = gradeForGame(<játékos évfolyama>)`; ha `g != null`:
(a) kupon + tananyag esetén a régi út; (b) nem látott tananyag-kvíz → az; (c) `pickGradeQuiz(...)` → átalakítás a játék
kvíz-alakjára, `markGradeQuizSeen`; (d) `null` → a régi választó. Új futásnál a `seen` törlődik.
- **Aszteroida** `SpaceAsteroidQuiz.tsx`: `onPickGrade` → `saveClassroomGrade(g)` is; `pickQuiz` a fenti mintával,
  `band: adaptiveRef.current.band`, minden tárgy; `topic` = tárgy (science → `nature`); `startNewRun` törli a `seen`-t.
- **Kockavadász** `blockCraftSubjects.ts`: `BlockCraftSubject` + `"science" | "history"`;
  `blockCraftSubjectFromGradeSubject(s)` (science → science, history → history); a `blockCraftSubjectFromTopic`
  változatlan (a meglévő `blockcraft-subject-mapping.test.ts` érvényes marad). `BlockCraftQuiz.tsx`: `subjectStats`
  kulcsai bővülnek, a kvíz-chip címkéi („Természettudomány”, „Történelem”), `pickQuiz` 3–12-nél a közös tárgyak
  körforgásával (`GRADE_SUBJECTS`), üres tárgy kimarad; `band: adaptiveRef.current.band`.
- **Brain Rot** `BrainRotSteal.tsx`: `category` + `"science" | "history"` (címke, szín, keret); `startingDifficulty(userGrade ?? 4)`
  (kezdő és újraindító), `pickQuiz` a mintával, `band: difficultyRef.current`, minden tárgy.
- **Szökőár** `TsunamiEscapeEnglish.tsx`: tárgy-mód → közös tárgy (`english`→english, `math`→math,
  `grammar`→hungarian, `nature`→science, `mixed`→ez a négy); a nehézség alapértéke URL-paraméter nélkül
  `difficultyForGrade(grade)`; a gomb kézi választása felülírja; `band = adaptív sáv + bandShiftForDifficulty(d)`.
- **Tornádó** `questions.ts`: `SchoolLevel` 1..12 | "auto"; `AUTO_GRADE_TABLE` 12 sáv (1–16 → 1., 17–33 → 2., 34–50 → 3.,
  51–66 → 4., 67–83 → 5., 84–100 → 6., 101–116 → 7., 117–133 → 8., 134–150 → 9., 151–166 → 10., 167–183 → 11.,
  184–200 → 12.); `pickQuestion` a tananyag-szintek után, ha a feloldott évfolyam ≥ 7: `pickGradeQuiz` (tárgy = mód
  tárgya), új `gradeBank?`/`gradeSeen?` paraméter; üres közös bank esetén a saját bank legközelebbi (≤ 6) évfolyama.
  `progress.ts`: 1..12 elfogadva. `TornadoHunter200.tsx`: `schoolOptions` 1..12 + auto, AUTO súgószöveg, futásonkénti
  `gradeSeen` ref. Elrendezés: 390 px-en nincs vízszintes túlcsordulás, gomb ≥ 44 px.

## 4. feladat — dokumentált tesztmódosítás (4. döntés)
Csak a terv által megnevezett, és a bekötés által TÉNYLEGESEN érvénytelenített rögzítések változnak. Napló:

A sorszámok a módosított fájlra vonatkoznak (a régi sorszám zárójelben).

| fájl:sor | régi → új | miért |
|---|---|---|
| `tests/tornado-questions.test.ts:44-57` (régi `:29-36`) | 6 sávos tábla (1–30 → [1,2] … 181–200 → [6]) → 12 sávos tábla (1–16 → [1] … 184–200 → [12]) | 4. döntés: az AUTO tábla 1–12-re osztja a 200 szintet; a hossz- és folytonos-lefedés ellenőrzés változatlan |
| `tests/tornado-questions.test.ts:73-83` (régi `:52-63`) | 12 rögzített határpont (1/30/31/…/181/200) → mind a 12 sáv mindkét határa (1/16, 17/33, …, 184/200) | ugyanaz; a „minden határon a helyes osztály” szándék marad, a lefedés bővült |
| `tests/tornado-questions.test.ts:88` (régi `:70`) | `resolveGrades("auto", 1)` → `[1, 2]` helyett `[1]` | az új tábla egy osztályt ad szintenként; az 1. szint az 1. osztály |
| `tests/tornado-questions.test.ts:90` (régi `:71`) | `resolveGrades("auto", 181)` → `[6]` helyett `resolveGrades("auto", 200)` → `[12]` | a 181. szint már a 11. osztály sávja; a teszt a legfelső sávot rögzítette, ez most a 12. osztály |
| `tests/tornado-questions.test.ts:124-129` (régi `:104-108`) | 190. szint angol → `grade === 6` helyett injektált 12. évfolyamos fixture-bankkal (`gradeBank: GRADE12_ENGLISH`) `grade === 12` | a 190. szint a 12. osztály; 7–12-nél a közös bankból kérdez (3. döntés). A fixture miatt a teszt nem függ a párhuzamosan töltött bank tartalmától |

Új tesztek ugyanebben a fájlban (nem módosítás): 7–12. osztály ismétlés nélkül + kimerült/üres közös bank → a saját bank
6. osztálya; 7–12-n is a tananyag-kérdés az első.

Változatlanul hagyva (a bekötés nem érinti, indoklás): `remaining-quiz-explanations.test.ts` `213`/`38`/`120` — a
bekötés nem ad új literál-kérdést a lapokhoz és a Tornádó `QUESTION_BANK`-jához (a közös bank külön modul);
`tornado-questions.test.ts:75` (1..6 ciklus) és `:90` (`q.grade <= 6`) — a `QUESTION_BANK` továbbra is a Tornádó saját,
1–6. osztályos bankja; a 7–12 lefedettséget a tartalmi szelet E2-tesztje méri.

## 5. feladat — kapuk (`source/`)
`npx tsc --noEmit`; `npx tsc --noEmit -p tsconfig.test.json`; `npx eslint client/src server --max-warnings 0`;
`node --import tsx --test tests/*.test.ts`; `npx vite build`. Vizuális: `npx vite --port 5192` a worktree-ből,
Playwright 390×844, Tornádó beállítások képernyő: `scrollWidth <= clientWidth`, iskolai-szint gombok magassága ≥ 44 px,
képernyőkép a scratchpadba; utána a szerver leállítása.

## 6. feladat — commit
Egy atomi commit a `feat/evfolyam-bank-bekotes` ágon, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` zárással; push csak erre az ágra.

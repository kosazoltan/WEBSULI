# Végrehajtás — Szólétra és Villám matek: nagyobb bankok, nincs ismétlés, 3–12. évfolyam (2026-09-29)

Terv: `docs/specs/2026-09-29-jatek-bankok-ismetles.md` (a „Bővítés 2026-09-29 délután” szakasszal együtt).
Ág: a munkafa saját ága (`worktree-agent-…`), push nincs. Minden parancs a `source/` mappában fut.

## T1 — Közös, tiszta választó: `client/src/game-engine/no-repeat.ts` (új)
1. `normalizePrompt(p)`: kisbetű, szóközök összevonása, trim.
2. `type SeenItem = { id: string; prompt: string }`.
3. `tierSearchOrder(count, preferred)`: a kért index, majd távolság szerint (1, 2, …), azonos távolságon előbb a
   kisebb (könnyebb) index. Példa: `(5, 2)` → `[2, 1, 3, 0, 4]`; `(3, 0)` → `[0, 1, 2]`.
4. `pickUnseen<T extends SeenItem>(tiers: T[][], preferred: number, seen: readonly SeenItem[], rng = Math.random)`:
   a keresési sorrend első olyan szintjéből, amelyben van nem látott tétel (sem az `id`, sem a normalizált
   `prompt` nincs a `seen`-ben), véletlen nem látott tétel. Ha minden elfogyott: a keresési sorrend első nem üres
   szintjéből a legrégebben látott (a `seen` utolsó előfordulása szerint legkisebb index; sosem látott = −1). Üres
   bemenet → `null`.
5. `dedupeTiersByContent(tiers)`: kulcs = normalizált prompt + normalizált helyes opció; az első előfordulás marad
   (szintek sorrendjében, szinten belül a statikus tételek elöl).
6. `ladderTierIndex(grade, band, tierCount = 5)`: alap = 3–4→0, 5–6→1, 7–8→2, 9–10→3, 11–12→4 (3 alatt 0, 12 fölött
   4); eltolás `Math.round((band − startingDifficulty(grade)) / 0.15)`; `[0, tierCount−1]`-re vágva.
7. `pickFreshTask<T extends { prompt: string }>({ teacher, seenPrompts, preferTeacher, generate, maxAttempts = 30, rng })`:
   a nem látott tanári tételek (`seenPrompts` normalizált prompt-halmaz); `preferTeacher` és van nem látott →
   véletlen nem látott tanári; különben legfeljebb 30 generálás, az első nem látott promptú visszaadva; ha nincs:
   nem látott tanári, ha van; különben az utolsó generált.

Teszt: `tests/no-repeat.test.ts` (új) — a fenti példák; `pickUnseen` szomszéd-szint (előbb könnyebb), kimerülés
után a legrégebbi; prompt-egyezés is „látott”; dedupe; `ladderTierIndex(3|5|7|9|12, startingDifficulty(g))` →
0/1/2/3/4, +0.1 sáv → +1 szint, −0.15 → −1 szint; `pickFreshTask` 30 próba után tanári nem látott; **szimuláció**:
2000 véletlen futás, 5 szint véletlen méretekkel (1–12), `createAdaptiveSession` véletlen jó/rossz válaszokkal és
véletlen évfolyammal; az első `N` (a különböző promptok száma) húzás között nincs ismétlődő id vagy prompt.
Parancs: `node --import tsx --test tests/no-repeat.test.ts` → a kód előtt bukik (hiányzó modul), utána pass.

## T2 — Szólétra bekötés: `client/src/pages/WordLadderHuEn.tsx`
1. Import: `pickUnseen`, `dedupeTiersByContent`, `ladderTierIndex`, `type SeenItem` a `@/game-engine/no-repeat`-ből;
   a `pickAdaptiveTier` import törlése (a függvény az `adaptiveSession.ts`-ben marad a meglévő tesztje miatt).
   Új import: `wordLadderB1`, `wordLadderB2` az `englishGameQuizExtras`-ból.
2. `mergedPools` → `{ easy, med, hard, b1, b2 }`, majd `tiers = dedupeTiersByContent([easy, med, hard, b1, b2])`
   (a szerver `easy/medium/hard` az első háromba).
3. `recentAdaptiveRef` → `seenRef: SeenItem[]`, a futás ÖSSZES tétele (`startGame` üríti, `onAnswer` hozzáfűzi a
   `current`-et). A két `pickAdaptiveTier` hívás helyett `pickUnseen(tiersRef.current, ladderTierIndex(ladderGrade,
   band), seenRef.current)`.
4. Menü: évfolyam-választó 3–12 (helyi állapot, alapértéke az osztály 3–12-re vágva) + a szint neve
   (`ladderLevelLabel`); `startGame` `adaptiveRef.current.reset(ladderGrade)`.
Ellenőrzés: `npx tsc --noEmit` → 0 hiba.

## T3 — Villám matek bekötés és 3–12: `client/src/pages/SpeedQuizMath.tsx`
1. `type GradeLevel = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12`; `GRADE_LEVELS` tömb; a `ROUND_SECONDS`,
   `QUESTION_SECONDS`, `TARGET_CORRECT`, `LEVEL_LABEL`, `SCORE_DIFFICULTY` 3–12 kitöltve (3–5 változatlan).
2. `MathTask.calc?: string` — csak ellenőrzés (teszt + vak megoldó); minden tanári tétel és generált sablon kitölti.
3. `uniqueOptions(correct, level)`: 6+ évfolyamon negatív tévesztők is (előjelhiba), tizedes eredménynél a tizedes
   lépték szerinti eltolás, kerekítés 6 jegyre; pontosan négy különböző érték, egyetlen egyezés.
4. `generatedTaskForGrade`: évfolyamonként ≥ 8 sablon (`const t = randInt(0, n−1)`), mindegyik ágban
   `prompt =`, `result =`, `explanation =`, `calc =` sor; minden évfolyamon van `×` és `÷` sablon.
5. `pickTask(level, seenPrompts)` → `pickFreshTask({ teacher, seenPrompts, preferTeacher: Math.random() < 0.68,
   generate: () => generatedTaskForGrade(level) })`; a `recentPromptsRef` a futás teljes listája (nem 6).
6. Megjelenítés: `formatMathNumber(n)` (tizedesvessző) a gomboknál és a magyarázó kártya opcióinál.
7. Pontozás: `base` és `speedBonus` 3–5-re változatlan, 6+ évfolyamra `44 + (grade − 5) × 2`, bónusz ×4.
8. Menü: 10 gomb, `grid-cols-3 sm:grid-cols-5`.
Ellenőrzés: `npx tsc --noEmit` → 0 hiba.

## T4 — Tartalom
1. `client/src/data/englishGameQuizExtras.ts`: `wordLadderEasyMore` + `a201…` (≥ 82 új), `wordLadderMedMore` +
   `b201…` (≥ 86 új), `wordLadderHardMore` + `c201…` (≥ 66 új), új `wordLadderB1` (`d201…`, ≥ 60) és
   `wordLadderB2` (`f201…`, ≥ 60). Egy tétel = egy sor; `explanation` 15–300 karakter, tartalmazza a helyes opció
   egy ≥ 3 betűs szavát; nincs sorszám-hivatkozás; nincs ASCII `"` a szövegekben.
2. Meglévő duplikátumok javítása: `m10` (a `we17` „Esernyő” promptja) → új szó; `wh4` promptja („Melyik mondat
   helyes?”, azonos a `h9`-ével) → egyedi prompt.
3. `SpeedQuizMath.tsx` `TEACHER_BANK`: minden 3..12 évfolyamon ≥ 40 tétel, egy sor, `calc` mezővel, a meglévő 34
   tétel is `calc`-ot kap; minden évfolyamon ≥ 1 szorzás és ≥ 1 osztás.
Ellenőrzés: `node --import tsx --test tests/quiz-bank-integrity.test.ts tests/game-quiz-explanations.test.ts
tests/speed-quiz-explanations.test.ts` → pass (változatlan tesztek).

## T5 — Új bank-tesztek
1. `tests/support/math-calc.ts` (új): biztonságos kifejezés-kiértékelő (számok, `+ - * / ^`, zárójel, előjel,
   `sqrt cbrt abs fact C P log(b,x) lg ln sin cos tan` fokban) — nincs `eval`.
2. `tests/game-bank-no-repeat-content.test.ts` (új):
   - Szólétra szintméretek (a lap `QUIZ_BANK`/`QUIZ_MED`/`QUIZ_HARD` soraiból + az importált tömbökből): 120/120/90/60/60.
   - Szólétra: nincs ismétlődő normalizált prompt a teljes statikus készletben; nincs ismétlődő id; egy tételen belül
     nincs két azonos opció; az új id-k `^[a-z]\d+$`.
   - Villám matek: a lap `randInt`…`isMathTask` szakasza TypeScript-átfordítással (`typescript.transpileModule`)
     `node:vm`-ben fut; `TEACHER_BANK` 3..12 mind ≥ 40, mindnek van `calc`-ja, a `calc` értéke pontosan EGY opcióval
     egyenlő és az a `correctIndex`; nincs ismétlődő prompt és ismétlődő opció; van `×` és `÷` évfolyamonként.
   - Generátor: évfolyamonként ≥ 8 sablon (a `t === k` ágak száma az évfolyam blokkjában) és 3000 futás: négy
     különböző véges opció, a `calc` pontosan egy opcióval egyenlő (= `correctIndex`), a `? =` alakú promptoknál a
     prompt kifejezése is kiszámolva egyezik; előfordul `*` és `/` a `calc`-ban.
Parancs: `node --import tsx --test tests/game-bank-no-repeat-content.test.ts` → pass.

## T6 — Vak megoldó: `source/game-bank-blind-check.local.mts` (gitignore-olt `*.local.mts`)
1. Kulcsok a fő checkout `source/.env`-jéből (`dotenv` `config({ path })`, értéket nem ír ki).
2. `createStudioProvider("gpt-5.6-terra", 240000, 16000, { jsonMode: true })`; 20 tétel/hívás, 6 párhuzamos.
3. A tételek: a munkafa és a `main` közötti ÚJ Szólétra-tételek (id-különbség), minden új / megváltozott tanári
   tétel, és sablononként 2 generált példány. A modell a kulcs nélkül MINDEN opciót `true/false`-ra minősít.
4. Jelzés, ha nem pontosan egy `true`, vagy az nem a `correctIndex`. Kimenet: ellenőrzött / jelzett darabszám és a
   jelzettek listája (`scratchpad` JSON). Javítás → újrafuttatás a jelzettekre, amíg 0.
Parancs: `node --import tsx game-bank-blind-check.local.mts` → `flagged: 0`.

## T7 — Kapuk
`npx tsc --noEmit`; `npx tsc --noEmit -p tsconfig.test.json`; `npx eslint client/src server --max-warnings 0`;
`node --import tsx --test tests/*.test.ts`; `npx vite build`. Mind 0 hiba / pass. Valós böngészős ellenőrzés a két
menüről (Vite dev szerver, 375 px és asztali szélesség): 10 évfolyamgomb, nincs túlcsordulás.

## T8 — Commitok (push nincs)
1. `docs: …` (terv-bővítés + végrehajtás). 2. `feat(games): pickUnseen …` (T1). 3. `feat(word-ladder): …` (T2+T4
Szólétra). 4. `feat(speed-math): …` (T3+T4 matek). 5. `test: …` (T5). Minden üzenet vége:
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

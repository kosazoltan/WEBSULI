# Szólétra — 3D kérdések, nyelvválasztó, pályák, angol bank (B szelet) — végrehajtási utasítás

Terv: `docs/specs/2026-09-29-palyak-szoletra-nyelvek.md` (4–7. döntés, E4–E6). Ág: `feat/szoletra-3d-nyelvek`
(alap: `feat/palyak-nyelvek-alap`). A közös alapot (`gradeLevels.ts`, `GradeLevelPicker.tsx`, `wordLadder/types.ts`,
`wordLadder/validate.ts`) NEM módosítjuk, és nem hozunk létre `de.ts` / `fr.ts` fájlt (C és D szelet).

Minden parancs a `source/` mappából fut. Kapuk: `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`,
`npm run lint`, `node --import tsx --test tests/*.test.ts`, `npm run build`.

## Rögzített megvalósítási döntések (a terv pontosítása, kódból ellenőrizve)

- **D1 — pálya → szint.** A pálya a közös sávon át hat (terv 1. és 3. döntés, „a meglévő sáv→szint leképezés”): a futás
  sávja `levelBand(level)`-ből indul, a közös `nextDifficulty` szabály mozgatja, és a `clampToLevel` a pálya sávja
  ±0,15-ön belül tartja; a kérdés szintje `ladderTierIndex(grade, band)`. Így az 1. pálya könnyebb vagy egyenlő az
  évfolyam alapszintjével, a 10. pálya minden évfolyamon a legfelső (B2) szintről kérdez. A futás sávja helyben él
  (`createLadderLevelSession`), a közös `adaptiveSession.ts` érintetlen (az E szelet is használja).
- **D2 — létra hossza:** `ladderRungsForLevel(level) = round(8 + (level − 1) · 12 / 9)` → 1. pálya 8 fok, 10. pálya
  20 fok (ma fix 16). A tájak (rét, erdő, felhők, csillagok) a haladás arányával skálázódnak (`zoneForProgress`).
- **D3 — nyelvek bekötése:** `data/wordLadder/registry.ts` a `de.ts` / `fr.ts` modult Vite-globbal (`import.meta.glob`,
  eager) veszi fel, ha létezik. A menüben a nyelv csak akkor választható, ha a bankja legalább egy tételt exportál
  (`availableLadderLanguages`). Az egyesítéskor így kódmódosítás nélkül megjelenik a német és a francia.
- **D4 — tárolás:** nyelv `websuli.wordladder.lang`; haladás `loadUnlockedLevel` / `unlockNextLevel` a
  `wordladder-<lang>` gameId-vel, évfolyamonként. A győzelem a következő pályát oldja fel.
- **D5 — 3D kérdés:** új `game-engine/scenes/QuizBoard3D.tsx` (three.js) + tiszta `quizBoardLayout.ts`.
  - A DOM a layout forrása: a kérdés (`wl-prompt`) és a 4 gomb (`wl-option-*`, `data-correct`) a helyén marad, a 3D
    lapok pontosan a gombok téglalapjára kerülnek (mérés `getBoundingClientRect`-tel, `ResizeObserver`).
  - Kamera: perspektív, FOV 10° (≤ 12°), a lapok a kamera felé néznek, a lap síkja z = 0 → 1 világegység = 1 CSS px,
    torzításmentes. Felirat vászon-textúrán, a textúra a renderer pixelarányával rajzolva; betű ≥ 20 CSS px
    (kérdés 22 px), színek `MeshBasicMaterial` + `toneMapped: false` → a kontraszt a tervezett (≥ 4,5:1, teszt).
  - Érintés: a lapok fölött a DOM-gomb átlátszó (háttér, keret, szöveg átlátszó, a fókuszkeret látszik). A réteg
    `pointermove` / `pointerdown` eseményét raycast dönti el (lebegés / lenyomás animáció); ha a pont egy lapot ér, de
    nem gombot (animáció közbeni kilógás), a raycast válaszol. Billentyűzet: 1–4 (quiz fázisban).
  - Animáció: a lapok lépcsőzetes „felpattanása”, lassú lebegés, jó válaszra zöld felvillanás + csillámok + előrejövés,
    rossz válaszra piros rázkódás. `prefers-reduced-motion` → azonnali állapotok, lebegés és rázás nélkül.
  - WebGL nélkül vagy `detectLookTier() === "low"` esetén nincs 3D réteg: a mai DOM-kártya látszik (CI = szoftveres GL
    → low → a meglévő E2E-k a DOM-ot mérik).
- **D6 — angol bank:** `data/wordLadder/en.ts` (`WORD_LADDER_EN: LadderItem[]`), egy tétel egy sor. A 468 régi tétel
  sorrendben kap azonosítót szintenként (`en<tier>-001` …), utána az új tételek. A régi `englishGameQuizExtras`
  Szólétra-exportok (`wordLadderEasyMore` … `wordLadderB2`) megmaradnak a szintek aliasaként (`/*#__PURE__*/`, a
  Szökőár csomagjába nem kerül be), a lapba égetett `QUIZ_*` tömbök megszűnnek.

## Jogos, dokumentált tesztváltozások (spec-változás: a bank helye és azonosító-formátuma, terv 5. döntés)

| Teszt | Régi mérés | Új mérés | Indok |
|---|---|---|---|
| `game-bank-no-repeat-content.test.ts` (Szólétra-rész) | a lap `QUIZ_*` blokkjai + extras; új id `[abcdf]\d{3}` ≥ 300 | `WORD_LADDER_EN` szintenként; minden id `en[0-4]-\d{3}`, ≥ 468; a lap a nyelvi bankból épít szinteket | a bank átköltözött, az id-formátum a terv szerint változott; a minimumok (120/120/90/60/60) változatlanok |
| `game-quiz-explanations.test.ts` („lapba égetett tételek”) | a lap `{ id: "[a-z]?\d+"` sorai ≥ 40 | az `en.ts` sorai (`en<tier>-<nnn>`) ≥ 40, mind magyarázattal | a tételek a lapról az `en.ts`-be kerültek |
| `quiz-bank-integrity.test.ts` | FILES a lappal | FILES + `client/src/data/wordLadder/en.ts` | a lap helyett az `en.ts` hordozza a tételeket; a ≥ 400 küszöb marad |

## Feladatok (sorrendben)

### T1 — új tesztek (a régi kódon BUKNAK)
1. `tests/word-ladder-en-bank.test.ts`: `ladderBankProblems(WORD_LADDER_EN, "en")` üres; mindkét irány ≥ 60 tétel
   („angolul” / „jelent”); az `en.ts` forrásában minden tétel egy sor; az extras-aliasok a szintekkel egyeznek.
2. `tests/word-ladder-levels.test.ts` (`client/src/lib/wordLadderLevels.ts`, `client/src/data/wordLadder/banks.ts`):
   létrahossz 8 → 20 szigorúan nem csökkenő; szint pályánként nem csökkenő minden évfolyamon, 10. pálya = 4. szint,
   1. pálya ≤ alapszint; a futás sávja a pálya ±0,15-én belül; gameId `wordladder-<lang>`; `zoneForProgress` végpontok;
   `availableLadderLanguages` (üres/hiányzó bank nem választható, `en` mindig); nyelv-tárolás (sérült érték → `en`);
   ismétlésmentesség: minden évfolyam × pálya futása (a létra kétszerese) `pickUnseen`-nel ismétlés nélkül.
3. `tests/word-ladder-quiz3d.test.ts` (`client/src/game-engine/scenes/quizBoardLayout.ts`): `contrastRatio`
   (fekete/fehér = 21); minden lapállapot szövege ≥ 4,5; FOV ≤ 12; betű ≥ 20 / kérdés ≥ 22; `rectToWorld`
   (1 egység = 1 px, középpont-origó, y felfelé); `wrapLines` (szóhatáron tör, nem vág); `quiz3dEnabled`.
4. `tests/word-ladder-3d-wiring.test.ts` (forrás-őr): a lap a `QuizBoard3D`-t, a `GradeLevelPicker`-t, a
   `wordLadderGameId`-t és az `unlockNextLevel`-t használja; nyelvválasztó `wl-lang-<lang>` testid-dal; `wl-option-*`
   és `correctDataAttrs` megmarad; 1–4 billentyű; `detectLookTier` low → DOM; a `QuizBoard3D` raycastot használ.
- Parancs: `node --import tsx --test tests/word-ladder-en-bank.test.ts tests/word-ladder-levels.test.ts tests/word-ladder-quiz3d.test.ts tests/word-ladder-3d-wiring.test.ts`
- Elvárt: mind BUKIK (hiányzó modul / hiányzó bekötés).

### T2 — angol bank
1. Kinyerés (ideiglenes, gitignore-olt `source/wl-extract.local.mts`): a lap blokkjai + extras → JSON, szinttel.
2. Kézi kategorizálás (468 tétel) + új tételek (`source/wl-new-items.local.mts`), generálás (`wl-gen-en.local.mts`) →
   `client/src/data/wordLadder/en.ts`.
3. Vak ellenőrzés: `source/wl-blind.local.mts` — `createStudioProvider("gpt-5.6-terra", …, { jsonMode: true })`, a kulcs
   a fő checkout `source/.env`-jéből (`dotenv` `path`, kiírás nélkül). Tételenként a kérdés + 4 opció kulcs nélkül;
   a modell opciónként ítél (helyes / helytelen / kétes) és indokol. Jelzés = nem pontosan a mi kulcsunk az egyetlen
   helyes. Minden jelzést kézzel nézünk: valódi hiba → javítás és újra-ellenőrzés; a megoldó tévedése → napló lent.
4. Tesztek átállítása (fenti táblázat), `englishGameQuizExtras.ts` aliasok.
- Parancs: `node --import tsx --test tests/word-ladder-en-bank.test.ts tests/game-bank-no-repeat-content.test.ts tests/game-quiz-explanations.test.ts tests/quiz-bank-integrity.test.ts` → PASS.

### T3 — pályák és nyelvek
1. `client/src/lib/wordLadderLevels.ts`, `client/src/data/wordLadder/banks.ts`, `client/src/data/wordLadder/registry.ts`.
2. `WordLadderHuEn.tsx`: menü = nyelvválasztó (3 gomb, ≥ 44 px, `wl-lang-*`), évfolyam, `GradeLevelPicker`
   (`wordladder-<lang>`), indítás; a futás a pálya létrahosszával és sávjával; győzelemkor `unlockNextLevel`.
   A menü 360×640 és 844×390 méreten is görgetés nélkül mutatja az indítógombot (meglévő E2E).
3. `LadderScene3D.tsx`: a fok-színezés a változó létrahosszal arányos.
- Parancs: `node --import tsx --test tests/word-ladder-levels.test.ts` → PASS.

### T4 — 3D kérdések
1. `client/src/game-engine/scenes/quizBoardLayout.ts`, `client/src/game-engine/scenes/QuizBoard3D.tsx`.
2. `WordLadderHuEn.tsx`: a kvízpanelen a 3D réteg; `data-quiz3d="true"` alatt a DOM átlátszó; 1–4 billentyű.
- Parancs: `node --import tsx --test tests/word-ladder-quiz3d.test.ts tests/word-ladder-3d-wiring.test.ts` → PASS.

### T5 — kapuk és valós böngésző
1. Az öt kapu (fent) → mind PASS.
2. Vite: `npx cross-env VITE_ENABLE_GAME_TEST_HOOKS=1 vite --port 5196 --strictPort`; mérőszkript
   `source/wl-3d-shot.local.mts` (Playwright, `channel: "chrome"`, valós GPU, `?look=high`), 390×844 és 1280×800
   (+ 360×640, 844×390 menü): nyelv- és pályaválasztó működik; a 3D réteg él (`data-quiz3d="true"`); betűméret
   (a rajzolt CSS px + képpontmérés) és kontraszt (a képernyőkép pixeleiből) a lapokon; nincs vízszintes görgetés,
   átfedés, levágott szöveg; a raycast-érintés és az 1–4 billentyű választ; képek:
   `C:\Temp\claude\D--repo-WEBSULI\a3627f3f-c161-4b37-98e5-e163bb7fb826\scratchpad\szoletra3d-*.png`.
3. Leállítás: csak az 5196-os port folyamatfája (`Get-CimInstance Win32_Process` + `Stop-Process`).

### T6 — commit, push
Atomi commitok (bank; pályák + nyelvek; 3D). Sentinel külön hívásban, majd `git push -u origin feat/szoletra-3d-nyelvek`.
PR nincs. A végén `cmd //c "rmdir source\\node_modules"` és a fő `node_modules` épségének ellenőrzése (≈ 633 bejegyzés).

## Vak ellenőrzés naplója

- Megoldó: `gpt-5.6-terra` (OpenAI-család; a tételeket Claude írta), JSON-mód, 12 tétel / hívás, kulcs nélkül; opciónként
  `correct` / `incorrect` / `doubtful`. Jelzés = a „correct” halmaz nem pontosan a mi kulcsunk, vagy van `doubtful`.
- 1. futás: 159 új tétel, **4 jelzés**, mind a mi kulcsunkat ítélte helyesnek, de egy disztraktort kétesnek:
  - `en1-130` (leaf): a `leafs` ritka, különleges értelemben előfordul → **valódi hiba**, a disztraktor `leavies` lett;
  - `en1-131` (bad), `en1-154` (hot), `en1-157` (easy): a `more bad` / `more hot` / `more easy` nem egyértelműen
    hibás → **valódi hiba**, helyettük `bader` / `hotest` / `easyier`.
  - Megelőzésből ugyanígy cseréltük az azonos mintájú, nem jelzett disztraktorokat: `more small` → `smaler`
    (`en0-129`), `the most good` → `the bestest` (`en1-132`), `the most far` → `the farest` (`en2-096`).
- 2. futás a 7 módosított tételre: **0 jelzés**. Nyitott jelzés: nincs. A megoldó tévedését nem kellett dokumentálni.

## Eredmény (mérve)

- Angol bank: 627 tétel (468 régi + 159 új). Szintenként 147 / 197 / 139 / 76 / 68; kategóriánként word 123,
  topic 132, phrase 140, irregular 72, regular 87, everyday 73. `ladderBankProblems(WORD_LADDER_EN, "en")` = [].
- Valós böngésző (Chrome, ANGLE D3D11, RTX 5090): 390×844 (DPR 3) és 1280×800 — 3D réteg él, rajzolt betű 20 px
  (kérdés 22 px), tintamagasság „frog” 18,3 px, kontraszt a képpontokból 13,6 (tábla) és 14,4–17,7 (lapok),
  0 szűkített sorú lap, nincs átfedés / vízszintes görgetés; raycast-kattintás, 1–4 billentyű, low szint → DOM.
  Menü 360×640 és 844×390: az indítógomb görgetés nélkül látszik.

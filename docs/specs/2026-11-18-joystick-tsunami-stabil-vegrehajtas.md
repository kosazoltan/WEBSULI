# Végrehajtás: az ingadozó „joystick-reakció: tsunami-english” mérő stabilizálása (AI-olvasható utasítás)

> Terv: `docs/specs/2026-11-18-joystick-tsunami-stabil.md` · Ág: `test/joystick-tsunami-stabil` · Munkafa:
> `.claude/worktrees/joystick-tsunami-stabil`
> **Állapot:** megvalósítva helyben; push / PR / CI-futás az orkesztrátoré.

Szabályok erre a szeletre: CSAK `source/tests/joystick-response.spec.ts` módosul (termékkód nem); küszöböt, eseményszámot,
időkeretet, `retries`-t módosítani, tesztet kihagyni tilos; a `fix/szokoar-tema-es-sebesseg` ághoz nem nyúlunk; push, PR,
`--no-verify`, rebase tilos.

## 1. lépés — Doksik (első commit)

- Fájlok: `docs/specs/2026-11-18-joystick-tsunami-stabil.md`, `docs/specs/2026-11-18-joystick-tsunami-stabil-vegrehajtas.md`.
- Commit: `docs(e2e): a Szökőár joystick-mérő stabilizálásának terve és végrehajtási utasítása`.

## 2. lépés — Reprodukció a javítás előtt (helyben, CI-azonos úton)

- Előtte mindig: `docker ps --filter name=websuli-e2e- --format "{{.Names}} {{.RunningFor}}"` (≥ 2 friss konténernél várj).
- A `source/` mappában a PR-kapu csomagoló konfigja (szoftveres WebGL, egy worker; nem commitolandó, `*.local.mts`):
  `node -e "import('../scripts/qa/gates/pre-pr-gate.mjs').then(m=>require('fs').writeFileSync('playwright.gate.local.mts',m.wrapperConfigSource()))"`.
- Alapvonal: `node --import tsx scripts/run-e2e-tests.ts --config playwright.gate.local.mts --workers=1 --repeat-each=6 -g
  "tsunami-english" tests/joystick-response.spec.ts` (a harness `npm run`-on át elveszíti a `--repeat-each`-et — C-53 / C-72).
- CI-szerű késéssel: ugyanez `JOY_CI_LAG_MS=200 JOY_CPU=2` környezettel (a mérő meglévő kapcsolói: minden érintés után késés,
  CPU-lassítás) → a javítás előtt bukik; a kimenet a PR-leírásba.

## 3. lépés — A javítás (`source/tests/joystick-response.spec.ts`)

1. `GameSpec.renderChunks: number` — Szökőár: 3, a többi: 1 (megjegyzéssel: miért).
2. `clearQuiz(page, g)`:
   - `correct = page.locator(\`${quizScope} [data-correct="true"]\`).first()`;
     `answerable = page.locator(\`${quizScope} [data-correct="true"]:not([aria-disabled="true"]):not(:disabled)\`).first()`.
   - kör (≤ 4): kártya látszik → bezárás, majd várakozás a kártya eltűnésére (állapot, korláttal); `correct` nem látszik →
     kilépés; `answerable` nem látszik (megoldás-kijelzés) → várakozás az állapotváltásra (`answerable` látható VAGY `correct`
     rejtett; korláttal), új kör; különben `answerable.click({ timeout: 2_000 })` — ha nem megy végbe (a kérdés közben eldőlt),
     új kör; ha végbement: `acted = true`, várakozás a megválaszolt kérdés eltűnésére (`correct` rejtett vagy új `answerable`
     nélkül; korláttal).
3. Render-ablak:
   - `rendersOpen` / `rendersClose`: a képkockánkénti figyelő a kérdés-jel mellett a tárcsa eltűnését is jelzi (`gone`); a záró
     olvasás `{ counts, quiz, gone }`.
   - `hold(jiggle, events, extraMs)` — egy darab: `events` mozgás-esemény (vagy `events` × 16 ms állva + `extraMs`).
   - `cleanChunk(jiggle, events, extraMs)` — legfeljebb `MAX_TRIES` (5) próba; `quiz` vagy `gone` → nem eredmény; kérdésnél az
     ismétlés előtt `alignToQuizGap` (következő megválaszolható kérdés megvárása ≤ 16 mp, `clearQuiz`, a kérdés-jel eltűnésének
     megvárása); a hibaüzenet marad („… próbából sincs kérdés nélküli … ablak — a render-szám nem mérhető”).
   - `cleanHold(jiggle, extraMsPerEvent)` — `renderChunks` darab, a számlálók és a hossz összegezve; az eredmény alakja a régi
     (`{ counts, ms }`), a `renderDelta` / `renderDrag` / `renderStill` / `stillMs` / `dragMs` számítása változatlan.
4. Lépcső: `readRec` a kérdés-jel mellett a tárcsa meglétét is visszaadja (`stickGone`); `stepOnce` a hiányzó tárcsánál
   `StepQuizError`-ral megismételteti a lépcsőt (a `stepRun` meglévő, ≤ 3 ismétléses útja; az `ensurePlaying` új kört indít).
5. Tilos: `expect(...)` sor, küszöb, `test.setTimeout`, a 30-as eseményszám (összeg), a kitérések módosítása.

- Parancs: `npx.cmd tsc --noEmit -p tsconfig.test.json` (a `source/`-ban) → 0 hiba; `npx.cmd eslint tests/joystick-response.spec.ts`
  ha a tesztmappa lintelt.

## 4. lépés — Igazolás

1. `--repeat-each=10 --workers=1`, csak a Szökőár, CI-azonos úton, késés nélkül → 10 / 10.
2. Ugyanez `JOY_CI_LAG_MS=200 JOY_CPU=2`-vel (a 2. lépésben bukó parancs) → zöld.
3. Mind a négy játék: `… --repeat-each=3 tests/joystick-response.spec.ts` → 12 / 12.
4. A `JOY_RESULT` sorokból: `renderWindows`, `renderDelta`, `stillMs`, `dragMs` a javítás előtt / után (PR-leírás).

## 5. lépés — Kapuk és jelentés

- `npm run gate:stage`, majd `npm run gate:push` a munkafa gyökeréből (a `native-arch.test.ts` helyi bukása ismert kivétel).
- Csapda-javaslat a zárójelentésben (C-48): ütemezett kérdésű játéknál a kérdés nélküli szakasz rövidebb lehet a mérési
  ablaknál — a mérő igazodjon a játék állapotához, és ellenőrizze, hogy a játék az ablak alatt élt.

## 6. Az első CI-futásnál ellenőrizendő (NOT RUN a push előtt)

- A „joystick-reakció: tsunami-english” `JOY_RESULT` sora: `renderWindows` (darabok + ismétlések), `stillMs` ≈ `dragMs`,
  `renderDelta` ≤ 6; a teszt ideje a 240 mp-es kereten belül (várható: 1–2,5 perc).
- A másik három játék `JOY_RESULT` sora a korábbi futásokéhoz hasonló (`renderWindows: 2`, ha nincs közbejövő kérdés).

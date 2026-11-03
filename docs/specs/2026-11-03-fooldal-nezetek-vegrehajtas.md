# Végrehajtás: főoldali nézetek (terv: `docs/specs/2026-11-03-fooldal-nezetek.md`)

Munkakönyvtár: `source/`. Ág: `feat/fooldal-nezetek` (az `origin/main`-ből).

## T1: tantárgy a szerveren

- `server/curriculum/match.ts`:
  - `CurriculumMatch` kap egy opcionális `subject?: string` mezőt; a `bestLesson` a nyertes terv `plan.subject`-jét beírja.
  - Új `export function subjectOfMaterial(input, index): string | null`: ha `matchMaterial` tanmenet-találatot ad → annak
    `subject`-je; különben ugyanaz a lánc, mint a `matchMaterial`-ban (`subjectsOfTitle(title)` → `subjectByVocabulary(words)`
    → `subjectsOfTitle(hints)` → `subjectByVocabulary(hintWords)`) első eleme; különben `null`. Évfolyam nélküli anyagnál csak
    a cím-alapú ág fut.
- `server/curriculum/index.ts`: `withCurriculum` minden elemhez `subject` mezőt ad (`subjectOfMaterial` a már betöltött
  tartalomjelzőkkel); hibánál `null`. Visszatérési típus: `T & { curriculum: …; subject: string | null }`.
- **Ellenőrzés:** `tests/curriculum.test.ts` új esetek: tanmenet-találatnál a terv kulcsa; cím alapján („Angol – Present
  Simple”) `angol`; ismeretlen cím `null`; a `withCurriculum` kimenetén van `subject`.

## T2: megjelenített nevek — `shared/subjects.ts`

- `SUBJECT_LABELS: Record<string, string>` a 17 kulcsra (`magyar-nyelvtan` és `magyar-nyelv-es-irodalom` → „Magyar nyelv”,
  `informatika` → „Digitális kultúra”, `hit-es-erkolcstan` → „Etika”, `termeszetismeret` → „Természettudomány”).
- `OTHER_SUBJECT = "Egyéb"`; `subjectLabel(key: string | null | undefined): string`.

## T3: logika — `client/src/lib/home-views.ts`

- `export type HomeView = { newest: boolean; bySubject: boolean }`; `DEFAULT_HOME_VIEW = { newest: false, bySubject: false }`.
- `parseHomeView(raw: string | null): HomeView` — csak `{newest:boolean,bySubject:boolean}` JSON; minden más → alap.
- `newestFirst<T extends {createdAt,id}>(files)`: `createdAt` csökkenő, azonosnál `id` növekvő; nem módosítja a bemenetet.
- `groupBySubject<T>(files, order: (list) => list)`: `[{ label, files }]`, címke szerint `localeCompare("hu")`, „Egyéb” utolsó;
  a csoporton belüli sorrendet az `order` függvény adja.
- `NEWEST_STRIP = 8`.
- **Ellenőrzés:** `tests/home-views.test.ts` — rendezés, stabilitás, csoportosítás, „Egyéb” utolsó, magyar ékezetes sorrend
  (Á, É, Ö), `parseHomeView` hibás bemenetre alap; `npx.cmd tsx --test tests/home-views.test.ts`.

## T4: UI — `client/src/components/UserFileList.tsx`

- `HtmlFileApi.subject?: string | null`.
- Állapot: `view` (`useState(() => parseHomeView(localStorage))`, try/catch), mentés `useEffect`-ben (try/catch).
- A kártya-JSX kiemelése belső `renderCard(file)` függvénybe (változatlan tartalom és `data-testid`-ek).
- A keresősor alatt: `data-testid="home-view-switch"` csoport (`role="group"`, `aria-label="Nézet"`), két gomb:
  `home-view-newest` („Legfrissebb”), `home-view-by-subject` („Tantárgyanként”), `aria-pressed`, `min-h-11` mobilon;
  magyarázó szöveg: „Egyszerre mindkettő is bekapcsolható.”
- Megjelenítés `filteredFiles` alapján:
  - alap → a mai rács (`data-testid="list-files"`), változatlan;
  - csak legfrissebb → ugyanaz a rács `newestFirst` sorrendben, címsor „Legfrissebb tananyagok”;
  - tantárgyanként → ugrógombsor (`home-subject-jump-<n>`, ha ≥ 2 szakasz), szakaszonként `section`
    (`data-testid="home-subject-section"`, `data-subject=<címke>`), `h3` + darabszám, rács; belül
    `curriculumSort` (csak tantárgy) vagy `newestFirst` (mindkettő);
  - mindkettő → előbb `home-newest-strip` szakasz a `newestFirst(...).slice(0, NEWEST_STRIP)` kártyákkal, utána a szakaszok.
- A meglévő `text-files-count`, `HomePracticeGames` és üres-állapot változatlan.

## T5: Playwright — `tests/home-views.spec.ts` + `playwright.home-views.config.ts`

- Konfig: mint a `playwright.web-research.config.ts` (vite, saját port 5191), `testMatch: "home-views.spec.ts"`.
- Mockolt `/api/html-files` (vegyes tantárgy, évfolyam, `createdAt`; egy `subject` nélküli), `/api/auth/user` → `null`.
- Esetek 390×844 és 1366×768 nézetben: alap sorrend = `curriculumSort`; csak legfrissebb → `createdAt` csökkenő; csak
  tantárgyanként → szakaszok címke szerint, „Egyéb” utolsó, darabszám; mindkettő → sáv ≤ 8 + szakaszok legújabb elöl;
  évfolyamváltás + keresés minden nézetben szűr; újratöltés után a választás megmarad; nincs vízszintes görgetés;
  a nézetgombok közepén `elementFromPoint` maga a gomb.
- `npx.cmd playwright test --config playwright.home-views.config.ts`.

## T6: verifikáció és élesítés

- `npm.cmd run doctor:arch`, `check`, `check:test`, `lint`, `npm.cmd test`, `build`; a meglévő
  `tests/curriculum-order.spec.ts` a home-views konfiggal is fut (alapnézet változatlan).
- Képernyőkép 390 / 1366 px, mind a 4 állapot. PR → review → zöld CI → merge → élő `GET /api/html-files` `subject` mező.

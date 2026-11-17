# Végrehajtási utasítás — osztály a tananyag címénél és a keresőben (S1, kanban #116)

Terv: `docs/specs/2026-11-17-tananyag-cim-osztaly.md`. Ág: `fix/tananyag-cim-osztaly`, munkafa:
`.claude/worktrees/tananyag-cim-osztaly`. Minden útvonal a munkafa gyökeréhez képest értendő. Játékfájlhoz, migrációhoz,
`server/` fájlhoz ez a szelet nem nyúl. Push / PR csak az orkesztrátor jelzésére.

## 0. Előkészítés

- `npm.cmd ci --prefix source --ignore-scripts` (C-38; a `native-arch` helyi bukása ismert kivétel).

## 1. Közös modul — `source/shared/material-title.ts` (új)

Függőség: `./classrooms` (`normalizeClassroom`, `classroomDisplayLabel`), `./subjects` (`subjectLabel`). Tiszta függvények, DOM nélkül.

- `TITLE_GRADE_SEPARATOR = " · "`.
- `foldText(text: string): string` — NFD, a kombináló ékezetek (U+0300–U+036F) törlése, kisbetű.
- `titleNamesClassroom(title: string): boolean` — igaz, ha a (hajtogatott) cím osztályt nevez meg:
  szám 1–12 + „osztály…” / „évfolyam…” (ponttal, szóközzel vagy anélkül); „osztály N” / „évfolyam N” (kettősponttal is);
  „N.o” / „N. o.”; sorszámnév + „osztály…” / „évfolyam…”; sorszámnév „-s / -es / -os” képzővel („ötödikes…”, „harmadikos…”).
  A szám előtt és az egész minta után nem állhat betű vagy számjegy.
- `materialTitleGradePrefix(title: string, classroom: unknown): string | null` — `null`, ha az osztály érvénytelen, ha a cím üres /
  csak szóköz, ha `titleNamesClassroom(title)`, vagy ha az osztály 0 és a címben szerepel a „programoz” tő; különben
  `classroomDisplayLabel(classroom)`.
- `materialDisplayTitle(title: string, classroom: unknown): string` — előtag + `TITLE_GRADE_SEPARATOR` + cím, vagy a cím változatlanul.
- `parseGradeQuery(query: string): { grades: number[]; rest: string[] }` — a hajtogatott kifejezésből:
  - szám 0–12, utána opcionálisan pont, képző („-es”, „-os”, „-as”, „-edik”, „-odik”, „-adik”, „-dik”, „-ik”), osztály-szó
    („osztály…”, „évfolyam…”, „oszt.”, „évf.”, „o.”); nem osztály, ha előtte betű, számjegy vagy `. , / : + * = -` áll, vagy utána
    betű, számjegy, illetve `. , / : + * = -` és nem szóköz következik (tört, tizedes, tartomány, hosszabb szám);
  - sorszámnév (első … tizenkettedik), opcionális „-s / -es / -os…” képzővel és osztály-szóval;
  - „prog”, „prog.”, „programoz…”, opcionálisan „alapismeretek” / „alapok” → 0;
  - `grades`: a kiolvasott osztályok növekvő sorrendben, ismétlés nélkül; `rest`: a maradék betű- / számsorozatok, az „osztály…” és
    „évfolyam…” kezdetű szavak, valamint a kötőszók / névelők („és”, „vagy”, „a”, „az”) nélkül;
  - pontosítás (megvalósítás közben, a tesztek alapján): a szám utáni képző közvetlenül vagy kötőjellel kapcsolódik („5-ös”,
    „5.-es”), szóközzel nem („5. és 6. osztály” → 5 és 6, az „és” nem képző); a sorszámnév képzője csak „-s / -es / -os”, utána
    legfeljebb többes szám és „-nak / -nek” („ötödikeseknek”) — az „elsősegély”, „elsősorban” nem osztály.
- `matchesMaterialSearch(file: { title: string; description?: string | null; subject?: string | null; classroom?: unknown }, query: string): boolean`:
  - üres / csak szóköz kifejezés → `true`;
  - szöveges találat: a hajtogatott, szóközöktől megtisztított kifejezés részszövege a megjelenítendő címnek, a leírásnak vagy a
    tantárgynévnek (`subjectLabel`, csak ha van tantárgy) → `true`;
  - osztály-találat: `grades` nem üres, az anyag `normalizeClassroom` értéke benne van, és a `rest` minden szava részszövege a
    „megjelenítendő cím + osztály-felirat + leírás + tantárgynév” hajtogatott szövegének → `true`;
  - különben `false`.

## 2. Egységtesztek — `source/tests/material-title.test.ts` (új)

A mérce a terv (E1–E8, edge case-ek), nem a megvalósítás. Táblás esetek:

- megjelenítendő cím: 1–12 és 0; a címben már szereplő osztály minden alakja (terv „Edge case-ek” 2. pont); nem-osztály számok a
  címben (3. pont); ellentmondó cím; érvénytelen értékek; üres cím; programozás a címben;
- osztály-kiolvasás: a terv E4 / E6 minden alakja 1–12-re (szám-alakok) és a 12 sorszámnévre; E8 ellenpéldák;
- keresés: E4 (cím nélküli osztály-találat), E5 (osztály + szavak; nem találat, ha a szó hiányzik vagy az osztály más), E6, E7
  (rögzített anyag- és kifejezéslistán: ami a régi illesztéssel — a teljes kifejezés a nyers címben / leírásban / tantárgynévben —
  találat, az az újjal is), érvénytelen osztályú anyag.

Parancs: `cd source && node --import tsx --test tests/material-title.test.ts` → minden teszt `pass`.

## 3. Főoldali kereső — `source/client/src/lib/home-views.ts`

- `matchesHomeSearch` a közös `matchesMaterialSearch`-re delegál; a paraméter típusa kiegészül: `classroom?: unknown`.
  A helyi `fold` segéd megszűnik, ha más nem használja.
- `source/tests/home-views.test.ts`: új teszt az osztály-keresésre a `matchesHomeSearch`-en át (a meglévő tesztek változatlanok).

Parancs: `cd source && node --import tsx --test tests/home-views.test.ts tests/material-title.test.ts`.

## 4. Főoldali kártya — `source/client/src/components/UserFileList.tsx`, `source/client/src/index.css`

- A `renderCard` címsora:
  `<h3 className="home-card-heading line-clamp-3">` + ha van előtag: `<span className="home-card-title-grade"
  data-testid={"title-grade-" + file.id}>{előtag + TITLE_GRADE_SEPARATOR}</span>` + `<span className="home-card-title">{file.title}</span>`.
- CSS: a `.home-card-title` eddigi szabálya (margó, szín, betűméret, vastagság, sorköz) a `.home-card-heading`-re kerül; a
  `.home-card-title-grade` színe `var(--hc-muted)`.
- A kereső mezőjének helyőrzője: „Keresés: cím, tantárgy, osztály…”.
- A csip (`home-card-grade`), a szűrőgombok, a `data-testid`-k változatlanok.

## 5. Admin „Tananyagok” — `source/client/src/components/AdminFileDashboard.tsx`, `source/client/src/components/FileCard.tsx`

- `AdminFileDashboard.tsx` szűrője: `matchesMaterialSearch(file, searchQuery) ||` a meglévő `classroomDisplayLabel(...)`-részszöveg
  („Nincs osztály” találat megmarad).
- `FileCard.tsx`: a `<h3>` szövege `materialDisplayTitle(title, classroom)`; a `data-testid="card-file-<cím>"` és az ikonválasztás a
  nyers címmel marad.

## 6. Szakasz-kapu

`npm run gate:stage` a munkafa gyökeréből → zöld. Bukásnál az okot kell javítani.

## 7. Böngészős próba — `source/tests/material-title.spec.ts` + `source/playwright.material-title.config.ts` (új)

A `classroom-badge` minta szerint (vite, ál-API, szolgáltatásmunkás tiltva, saját port: 5196, `workers: 1`).
Nézetek: 360×640, 390×844, 1280×800. Ál-adat: osztály nélküli című anyag 4., 12. és 0. osztályban; osztályt megnevező című anyag;
120 karakteres cím; érvénytelen osztályú anyag.

- Főoldal: az előtag szövege és hiánya (E1–E3); a címsor a kártyán belül van, a kártya gombjait nem takarja, nincs vízszintes
  görgetés (E10); keresés „12.o”, „negyedik”, „4. osztály törtek”, „prog” → a várt kártyák (E4–E6).
- Admin: a kártya címe előtaggal; keresés „12 osztaly” → egy találat; „Nincs osztály” → a hibás anyag (E9).
- Képernyőképek: `source/test-results/material-title/` (nem követett).
- „Előtte” képek: ugyanez az ál-adat az `origin/main` kódján (a spec `MATERIAL_TITLE_SHOTS_ONLY=1` módja csak képet készít,
  állítás nélkül), a session scratchpadjébe; az „utána” képeket a spec rendes futása adja.

E2E-sorompó előtte: `docker ps --filter name=websuli-e2e- --format "{{.Names}} {{.RunningFor}}"`; ha legalább 2 db 90 percnél
fiatalabb konténer fut, 60 másodpercenként újra, legfeljebb 30 percig. Egyszerre egy böngészős futás.

Parancsok: `cd source && npx.cmd playwright test -c playwright.material-title.config.ts --workers=1` → minden eset `passed`;
regresszió: `npx.cmd playwright test -c playwright.classroom-badge.config.ts --workers=1` és
`npx.cmd playwright test -c playwright.home-views.config.ts --workers=1` → `passed`.

## 8. Zárás

- A terv elfogadási listájának tételes újraellenőrzése (kód, teszt, böngészős próba alapján).
- `npm run gate:push` → zöld (a `native-arch` C-38 kivétel megengedett).
- Megállás: a fej-hash jelentése az orkesztrátornak; push / PR nincs.

## Kiegészítés a böngészős próba alapján (2026-11-17)

- Az admin kártyán a kijelölő + fogantyú réteg (`AdminFileDashboard.tsx:99-113`, `absolute top-2 left-2`) eddig is rátakart a cím első
  betűjére keskeny nézetben („előtte” kép); az előtaggal ez az osztály SZÁMÁT takarná. Javítás: a `FileCard.tsx` címoszlopa `ml-3`
  bal margót kap; a spec ellenőrzi, hogy a `<h3>` nem kerül a fogantyú alá (360×640, 390×844, asztali).
- A közös modul regex-visszatekintést (lookbehind) nem használhat: a kliens is betölti, és a Safari < 16.4 szintaktikai hibának
  veszi (`source/tests/no-lookbehind-client.test.ts` — a push előtti kapu teljes egységtesztje fogta meg). A szóhatárt a minta
  elején álló határoló karakter adja; a keresőkifejezés elemzésénél elfogott csoportként visszakerül a szövegbe.

## 9. A független ellenőr leletei (fej `7e4ffc78`, 2026-11-17 este) — javítás a PR előtt

Jelentés: a session scratchpadjében (`review-tananyag-cim/jelentes.md`); ítélet: IGEN, FELTÉTELLEL. Javítandó: K1, K2; olcsó kiegészítések: A1, A2, A4, formátum-állandó.

1. `source/shared/material-title.ts`
   - K2: a szöveges ág a TÁROLT címen keres (nem a megjelenítetten); a maradék szavak szókezdetre illenek (A1).
   - A4: `prepareMaterialSearch(query)` (egyszeri elemzés) + `matchesPreparedSearch(file, search)`; a `matchesMaterialSearch` ezekre épül.
   - K1: `searchSpansAllClassrooms(search, selectedClassroom)` — igaz, ha van aktív szűrő és a kifejezés attól eltérő osztályt nevez meg.
   - A2: osztálybetű („5.b”, „5/a”), ragozott alak („5-ösöknek”, „5-ödikes”, „ötödikben”), római szám osztály-szóval („V. osztály”);
     az osztály-szó csak ragozott alakjaiban esik ki („osztályozás” keresőszó marad). A címben a római számos és az osztálybetűs
     megnevezés is osztálynak számít.
   - Formátum: `TITLE_GRADE_STYLE` állandó (`"long"` | `"short"`), `titleGradeLabel`.
2. `source/client/src/lib/home-views.ts`: `filterHomeFiles(files, query, selectedClassroom)` → `{ files, allClassrooms }`.
3. `source/client/src/components/UserFileList.tsx`: a szűrés a `filterHomeFiles`-ra épül; `data-testid="search-all-classrooms"`
   jelzés a kereső alatt; az üres állapot üzenete ilyenkor nem hivatkozik a szűrő osztályára.
4. `source/client/src/components/AdminFileDashboard.tsx`: ugyanez az elv (`useMemo` az elemzésre, jelzés a szűrők fölött).
5. Tesztek: `tests/material-title.test.ts` (K2: 0 / 1 / 2 / 10 / 11 / 12. osztály; A1; A2; A4; K1; formátum), `tests/home-views.test.ts`
   (`filterHomeFiles`), `tests/material-title.spec.ts` (mentett 4. osztály + „5. osztály” keresés mindhárom nézetben; admin szűrő +
   keresés; 1. ↔ 11. osztály).
6. Mérés valós adaton (az ellenőr `a.mts` módszerével, a 243-as listán): recall minden osztályra és alakra 100%, új hamis találat 0,
   81 850 régi találatból 0 veszett el; az új alakok („5.b”, „5-ösöknek”, „V. osztály”, „IX. évfolyam”) 0 téves új találatot adnak;
   „IV. Béla”, „II. Rákóczi”, „i.e.”, „5 osztályozás”, „ötödik elem” → 0 új találat.
7. Képek a döntéshez: a rövid „5. o. · Cím” alak képei az állandó ideiglenes átállításával készültek (scratchpad `rovid-alak`); a
   kódban a hosszú alak marad.
8. A végső fejen: `gate:stage`; böngészős futások egyenként, `--workers=1` (`material-title`, `classroom-badge`, `home-views`), a
   sorompó ellenőrzése és az indítás külön lépésben; `gate:push`.
9. A böngészős spec fogta meg (admin, „1. osztály” → az 1. ÉS a 11. osztály): az admin kereső felirat-részszöveg ága
   (`AdminFileDashboard.tsx`, a #54 óta) ugyanazt a K2-hibát hordozta. Javítás: a felirat-ág csak érvénytelen osztályú anyagra
   („Nincs osztály”) érvényes; az érvényes osztályt a közös illesztés találja.

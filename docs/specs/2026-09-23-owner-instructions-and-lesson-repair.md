# Tanári kérés a készítéshez, javító modul a lecke alatt, lektor-kalibrálás átírási hibára

Dátum: 2026-09-23 · Tulajdonosi kérés (Kósa Zoltán) · Ág: `feat/lesson-instructions-repair`

## Cél

1. **Indításkori kérés.** A feltöltött forrásból induló készítésnél a cím mellett egy pársoros, szabad szöveges kérést is meg lehessen adni az ügynöknek (pl. „5. osztályos szinten, röviden; a kézírás elírásait javítsd”). A kérés eljut a besoroláshoz (évfolyam), a tervkészítőhöz, a szerzőhöz és a lektorhoz.
2. **Javító modul a kész lecke alatt.** A `/preview/:id` oldalon az admin a lecke alá görgetve utasítást írhat, elindíthatja az újragyártást, követheti az állapotot, és a kész, ellenőrzött jelöltet egy gombbal alkalmazhatja (mentéssel, visszaállíthatóan) — nem kell az admin „Okosítás” fülre mennie.
3. **Lektor-kalibrálás.** A lektor ne kövelje vissza az átírási (OCR/kézírás) hibát, és ne dobja el a tulajdonos kifejezett javítását.

## Mért kiindulás (éles DB, csak olvasás, 2026-09-23)

- Lecke „Az időszámítás és az emberiség kezdetei” (html_files 739ec478, map 2c43327f): a forrás kézírásos füzet fotója. A térkép OCR-hibákat tartalmaz: `bódex` (kódex), `bézzel` (kézzel), `Storhenge`, `Sany a visszaszólósi előember` (Samu, a vértesszőlősi előember), c2 `föld-változása – holdnaptár` (a Hold változása). A 7. évfolyam téves (a tanár szerint 5.).
- Javító futás 4756f8c2 (`repair`): a szerző helyesen „Hold-változást” írt, a lektor 4 blokkolóval („a c2 idézete föld-változás… a forrás szavára kell cserélni”) megállította: `A lektor javítást kér, az eredeti érintetlen`. A tanár utasítását a lektor NEM kapta meg.
- Szerkezeti okok (kódból):
  - `buildLektorPrompt` nem kap tulajdonosi utasítást; a D1 szabály („a leckében a forrás állítása marad”) az OCR-átiratot tekinti forrásnak.
  - `checkGrounding` a térkép `term` szavait követeli a blokkban → a „kódex” javítás a kapun bukna, ezért tanítja a lecke a „bódex”-et.
  - `assertRepairTeaching` tiltja a `classroom` változását → az „5. osztály” kérés teljesíthetetlen.
  - `finishStructuredImprovement`: az első lektor-blokkolónál azonnal hibával áll le, javító kör nincs (a Studio-úton van: `previousBlockers` + `applyLektorConvergence`).
  - A javító kérés fix szövege „Ne rövidítsd vázlattá!” ütközik a tanár „rövidítsd le” kérésével.

## Megoldás

### A. Forrás-helyesbítés mint dokumentált kurálás (`server/studio/source-corrections.ts`)
- Egy modellhívás (tervkészítő modell, a meglévő `callStepModel` úton) a térkép + a tanár kérése alapján javaslatot ad: `{ corrections: [{ localId, term?, definition?, basis: "owner"|"transcription", reason }], classroom? }`.
- **Determinisztikus szűrő** (a modell nem „okosíthat”):
  - `localId` létezik; legalább az egyik mező változik.
  - `basis: "owner"`: minden ÚJ szó (ami az eredetiben nincs) szótő-szinten (5 karakter, ékezet nélkül) szerepel a tanár kérésében.
  - `basis: "transcription"`: csak fotó/kézírás-forrásnál; az eredeti és új alak szószáma egyezik, minden eltérő szópár Levenshtein-távolsága ≤ 2 és hossza ≥ 4.
  - `classroom`: csak ha a kérés kifejezetten tartalmazza ugyanazt a számot „osztály”/„évfolyam” mellett.
- Az idézet (`quote`) SOHA nem változik — az marad a bizonyíték; a lektor külön listában kapja a helyesbítéseket.
- Alkalmazás: készítéskor (egylépéses út) a km_concepts sor `term/definition` mezője frissül, `review_state = edited`, `verbatim_reason` = „helyesbítés (tanár|átírás): <régi> → <új>”; javításkor a jelöltbe kerül (`sourceCorrections`, `classroom`), és csak az alkalmazás tranzakciójában íródik a térképbe.

### B. Tanári kérés a készítésnél
- `oneStepRequestSchema.instructions` (opcionális, ≤ 2000 karakter, trimelt). Kliens: `SourceUploadForm` „Kérés az ügynöknek” szövegmező.
- A kérés a scope-modellhez (a kifejezett évfolyam elsőbbséget kap), a helyesbítő lépéshez, és a `studio_jobs.output.ownerInstruction` mezőn át a tervkészítő, szerző és lektor promptjához jut; a tervkészítő bemenet-hash része.
- Ha ugyanaz a forrás már fel volt dolgozva ÉS van kérés: nem a régi leckét adjuk vissza, hanem a meglévő térképből új gyártás indul.
- Fotóforrásnál kérés nélkül is lefut a helyesbítő lépés (csak `transcription` alapon).

### C. Javítás (repair) út
- A tanár kérése a szerző kérésének ELEJÉRE kerül, a fix szöveg: „a forrás tanítását ne hagyd ki; a terjedelmet a tanár kérése szabja meg”.
- Helyesbítő lépés a szerző előtt; a helyesbített forrás megy a szerzőhöz, a kapukhoz és a lektorhoz; az évfolyam a helyesbítés szerint változhat (`assertRepairTeaching` a várt évfolyamhoz mér).
- A lektor megkapja a tanár kérését és a helyesbítés-listát. Lektor-blokkolónál a meglévő szerződés marad (hiba, az eredeti érintetlen — a `lesson-fusion-repair` teszt rögzíti); a tanár a lecke alatti panelen új utasítással újraindíthatja. (Módosítva a megvalósítás közben: az extra szerzői kör elmaradt, mert meglévő, érvényes spec-tesztet írna felül, és a mért hamis blokkoló oka a lektor kontextusa volt.)
- `lessonRepairSchema`: `sourceCorrections?`, `classroom?`, `ownerInstruction?` mezők; az `applyStructuredImprovement` a tranzakcióban frissíti a km_concepts sorokat, a térkép és a html_files évfolyamát.

### D. Lektor-kalibrálás (skill + prompt)
- Lektor skill + prompt új szabálya: átírási hiba (a quote betűhöz közeli, értelmetlen vagy a szövegkörnyezetben lehetetlen alak, a lecke a közeli értelmes olvasatot tanítja) → `book_probably_wrong` info, SOHA blokkoló, soha ne kérd vissza a hibás alakot. Kalibráló példa: `föld-változása – holdnaptár` ↔ „a Hold változása”; `bódex` ↔ „kódex”.
- A tanár kérése és a helyesbítés-lista a lektor promptjában: a helyesbítés dokumentált kurálás; ha a lecke a helyesbített alakot tanítja, az nem `contradicts_source`. A tanár kérése a terjedelmet, hangsúlyt, évfolyamot szabja meg; tényállítást nem ír felül a helyesbítés-listán kívül.
- A D1 konstans szövege változatlan (teszt pinneli); mellé kerül a pontosítás, hogy az átírási betűhiba nem a forrás állítása.

### E. Javító modul a lecke alatt (`client/src/components/LessonRepairPanel.tsx`)
- Csak adminnak, a `Preview` oldal alján, strukturált leckénél. Szövegmező + „Javítás indítása” → `POST /api/admin/improve-material/:id { customPrompt }`; állapot-követés `GET …/status/:jobId` 5 s-onként; a jobId a `localStorage`-ban (fájlonként), újratöltés után folytatódik.
- Kész: a lektor jegyzeteinek száma + „Alkalmazás” (`POST /api/admin/improved-files/:id/apply`) → a lecke újratöltődik; „Elvetés” (`DELETE`). Hiba: a szerver hibaüzenete látható, új utasítással újraindítható.

### F. OCR — kettős olvasás és magyar kézírás-skill (tulajdonosi kiegészítés a munka közben)
- OCR-skill „Magyar kézírás” szakasz: előbb a téma, aztán soronként; tipikus betűtévesztések (k/b/h/l, f/h/t, ö/ő…, kétjegyűek), ékezet-jelentés, tulajdonnevek, rövidítések/nyilak; a leíró SZÁNDÉKOLT betűit írja, a leíró saját tartalmi hibáját nem javítja; a mért esetek (bódex, föld-változása, Storhenge, Sany a visszaszólósi) a skillben.
- `dualReadOcr`: minden képet két független modellcsalád olvas; szószintű LCS-összevetés; eltérésnél döntő olvasás a képpel; determinisztikus őr: csak a vitatott helyen, csak a két olvasat (≤ 2 betű eltérés) közül. Hiba/őrbukás → az első olvasat. Cache kulcsa a két modell + döntő prompt.
- Modellválasztás MÉRVE (3 valódi #190 kézírásos lap, új skill, 2026-09-23): qwen3-vl-32b-instruct 95,4% (elsődleges és döntő), glm-5.3-flash 89,1% (második olvasó, tartalék), gpt-5.6-luna 87,3% (átfogalmaz — kizárva), deepseek-v4.1-flash 0% (a gondolkodás elfogyasztja a keretet, csonkol), Gemini: tulajdonosi tiltás. Független kutatás (OCRBench v2 stb.) a Qwen3-VL családot igazolta; dedikált OCR-modell az OpenRouteren nincs.
- Élő szonda (renderelt kézírás-minta, injektált bódex/bézzel/föld-változása): a döntő olvasás mindhármat javította, egy vitatott helyen rossz alakot választott (őseknél) — a döntés nem hibátlan, a lektor átírási szabálya a második védvonal.

## Nem cél
- A webes (internetes) készítés kérésmezője (ott a `message` már szabad szöveg).
- A tudástérkép-szerkesztő (KnowledgeMapEditor) átalakítása; a from-map indítás UI-ja.
- Tömeges visszamenőleges térkép-javítás; HTML/PDF anyagok alatti javító panel (a Preview HTML-nézete nem görgethető — külön feladat).

## Edge case-ek
- Üres/csak szóköz kérés → nincs kérés (régi viselkedés, régi hash).
- A modell nem létező `localId`-t, szó szerinti egyezés nélküli „owner” javítást, vagy nem-fotó forrásnál „transcription”-t ad → a szűrő eldobja (napló).
- A helyesbítő hívás hibázik → a folyamat helyesbítés nélkül folytatódik (figyelmeztetés), nem hal meg.
- A javítás közben a lecke/forrás változik → a meglévő `assertRepairFresh` továbbra is eldobja (a hash a HELYESBÍTÉS ELŐTTI forrásra számol).
- Párhuzamos javítás ugyanarra a fájlra → a meglévő 409.

## Elfogadás (EARS)
1. HA az admin kérést ad meg a feltöltésnél, AKKOR a tervkészítő, a szerző és a lektor rendszerutasítása tartalmazza a kérés szövegét, és a tervkészítő bemenet-hash eltér a kérés nélkülitől. (unit)
2. HA a kérés „5. osztály”-t mond, AKKOR a helyesbítés `classroom: 5`-öt fogadja el; ha a kérés nem tartalmazza a számot, a javasolt évfolyamot eldobja. (unit)
3. A szűrő elfogadja: `bódex→kódex` (fotóforrás, transcription), `föld-változása→Hold változása` (owner, a kérés tartalmazza „hold”); elutasítja: kitalált új tartalom (owner, a szó nincs a kérésben), transcription nem-fotó forrásnál, ≥3 betűs eltérés. (unit)
4. A lektor promptja tartalmazza az átírási-hiba szabályt, a kalibráló példát, a kérést és a helyesbítés-listát. (unit)
5. Javításnál kéréssel a helyesbítő hívás a szerző előtt fut, a szerző és a lektor promptja tartalmazza a kérést és a helyesbítést, és a kért évfolyam a jelöltben elfogadott. (unit, hamis hívóval)
6. Az apply tranzakció a helyesbítést a km_concepts sorba, az évfolyamot a térképre és a html_files-ra írja. (unit a tiszta segédfüggvényre)
7. A `/preview/:id` oldal adminnak megjeleníti a javító modult, nem-adminnak nem; a gomb a helyes végpontot hívja. (Playwright/böngészős próba a helyi szerveren)
8. Teljes kapu: `tsc`, `eslint`, `node --test tests/*.test.ts`, `npm run build` zöld.

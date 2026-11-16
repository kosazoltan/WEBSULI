# Évfolyam-jelölés a tananyagkártyákon — főoldal és admin (FIX, kanban #54)

**Állapot:** folyamatban – 2026-11-16, ág `fix/tananyag-evfolyam-jeloles`
Végrehajtási utasítás: [`2026-11-16-tananyag-evfolyam-jeloles-vegrehajtas.md`](2026-11-16-tananyag-evfolyam-jeloles-vegrehajtas.md)

## A tulajdonos hibajelentése és pontosítása (szó szerint)

> „A tananyagok készítésekor a címbe nem írja bele, hogy hányadik osztályos tananyag, így nehéz az összes között válogatni.
> Amikor felsorolja mindegyik tananyagot, akkor nem tudni, hogy melyik osztályhoz tartozik.”

> „Számomra a lényeg, hogy a FŐOLDALON látható legyen, hogy mely tananyag melyik osztályhoz tartozik. A 241 darab tananyagból
> nem olyan soknál maradt ki. Tehát először keresd meg, hogy melyiknél nincs, majd utána azokat javítsd csak.”

## Cél

1. A **főoldal** (nyilvános tananyaglista) minden kártyáján egyértelműen, jól láthatóan (mobilon is) álljon az évfolyam
   („4. osztály”, a 0-s sávnál „Programozás”). Hiányzó / érvénytelen értéknél a főoldal ne mutasson hamis évfolyamot.
2. Az admin „Tananyagok” fül kártyáin (az „Összes” nézetben is) látsszon ugyanez; hiányzó / érvénytelen értéknél figyelmeztető
   „Nincs osztály” jelzés, hogy a hiány észrevehető és pótolható legyen.
3. A felirat EGY közös segédfüggvényből jöjjön (`source/shared/classrooms.ts`), és ahol az admin választók / táblák ma kézzel
   írják („`${c}. osztály`”, a programozásnál „0. osztály” vagy üres), ott egy soros cserével ezt használják.

## Nem-cél

- A tárolt címek átírása, adatbázis-módosítás, migráció, tömeges adatjavítás, éles adat módosítása (se DB, se admin végpont).
- Gyártási promptok, a lecke HTML / JSON tartalma, a lecke saját nézete (`LessonRuntime` — már mutatja az évfolyamot).
- Az új tananyagok címének automatikus évfolyam-előtagja — tulajdonosi döntés (lásd lent).
- Levéltárgyak, push, megosztási cím, admin csoportosító nézet — következő lépésként a zárójelentésben (nem egy-két soros).
- Játékfájlok, `docs/agent-csapdak.md`, admin-végpontok jogosultsága.

## A felmérés tényei

### Kód (fájl:sor)

- `source/shared/schema.ts:52` — `html_files.classroom: integer NOT NULL DEFAULT 1`; beszúrási séma 0–12 (`schema.ts:70`).
- `source/shared/classrooms.ts:15-29` — 0 = „Programozási alapismeretek” (rövid: „Prog.”), 1–12 = „N. osztály” (rövid: „N.”).
- Főoldal: `GET /api/html-files` (névtelenül is; `server/routes.ts:1594`), kliens `client/src/lib/home-files-query.ts:8`.
- Főoldal kártya: `client/src/components/UserFileList.tsx:159,196` — `file.classroom ?? 1` → `getClassroomLabel(classroom, true)`:
  a borítókép jobb felső sarkában kicsi csip, szövege csak „4.” vagy „Prog.” (CSS: `client/src/index.css:1279-1291`, 12 px).
  Hiányzó értéknél HAMIS „1.” jelenne meg (`?? 1`).
- Admin kártya: `client/src/components/FileCard.tsx:96-116` — cím, HTML/PDF jelvény, leírás, dátum; **évfolyam nincs**
  (`AdminFileDashboard.tsx:114-127` nem is adja át).
- Kézi, hibás feliratok az admin felületen: `MaterialImprover.tsx:524,598` és `MaterialImprovementBackups.tsx:183` („0. osztály”),
  `LessonRepairWorkbench.tsx:78` és `studio/DraftLessons.tsx:137` (a 0 eltűnik), `pages/admin.tsx:1029-1036` (a 0 „-” lesz),
  `pages/AdminStats.tsx:226` („0. osztály”).
- A cím forrása: Studio-lecke — a lecke JSON `title` mezője (`server/studio/pipeline-store.ts:244-256`), évfolyam nélkül; kézi
  feltöltés — a kliens előtagolja („7. osztály - Cím”, `SimpleHtmlUpload.tsx:102-106`). Ezért a régi címek egy része tartalmazza
  az évfolyamot, az újabb leckéké nem.

### Éles leltár (egyetlen névtelen GET a nyilvános listára, csak olvasva)

- 241 tananyag (= a tulajdonos szerinti 241; lecke 237, HTML 3, PDF 1).
- Érvényes évfolyam-mező: **241**; hiányzó / érvénytelen: **0**.
- Az évfolyam a CÍMBEN szerepel: 132; a címből hiányzik: **109** — ez a tulajdonos által jelzett „kimaradás”.
- A cím és a mező ellentmond: 2 (tulajdonosi döntés).
- A tételes lista (azonosító, cím) a nyilvános repóba NEM kerül; az orkesztrátor scratchpadjében van.

**Következtetés:** az adat megvan, a megjelenítés gyenge. A javítás a kártyák felirata, nem adatpótlás.

## A megoldás

- `shared/classrooms.ts` bővítése (a meglévő API változatlan):
  - `normalizeClassroom(value: unknown): number | null` — egész 0–12, különben `null`;
  - `classroomDisplayLabel(value: unknown): string` — 1–12: „N. osztály”, 0: „Programozás”, egyéb: „Nincs osztály”
    (`NO_CLASSROOM_LABEL`).
- Új `client/src/components/ClassroomBadge.tsx`: `GraduationCap` ikon + felirat; `warnMissing` esetén érvénytelen értékre
  borostyán szín + `AlertTriangle` ikon (a jelentést a szöveg hordozza, nem csak a szín); `data-testid="badge-classroom"`,
  `data-classroom` = normalizált érték vagy `none`.
- `FileCard` új `classroom` propja → jelvény a cím alatt; `AdminFileDashboard` átadja.
- `UserFileList` kártya: a csip a teljes feliratot mutatja (`classroomDisplayLabel`), `data-testid="grade-file-<id>"`; érvénytelen
  értéknél a csip nem jelenik meg (nincs hamis „1.”). A csip a borítón marad, nagyobb, kontrasztos, a sáv színével.
- Egy soros cserék a fenti admin helyeken: `classroomDisplayLabel(...)`.

## Edge case-ek

- 0 → „Programozás” mindenhol (nem „0. osztály”, nem üres, nem „-”).
- Érvénytelen érték (13, -1, 2.5, `null`, `undefined`, `"7"`): admin „Nincs osztály” figyelmeztetéssel; főoldalon nincs csip.
- Hosszú felirat („Programozás”, „12. osztály”) 360 px széles kétoszlopos rácsban: nem lóg ki a kártyából, nem takarja az emblémát.
- A cím már tartalmazza az évfolyamot: a jelvény ettől függetlenül megjelenik (a jelvény a mezőt mutatja; eltérés így látható).

## Döntési kérdés (tulajdonos)

Kerüljön-e az évfolyam az ÚJ tananyagok tárolt címébe is? Előny: a cím önmagában (link, kereső) is hordozza. Hátrány: a tanuló
felé kettőzés (a lecke fejléce már mutatja), a címhez kötött azonosítások (pl. borító: `server/lesson-covers.ts:183`) érintettek,
régi / új címformátum keveredik. Ez a szelet a megjelenítéssel teljesíti, hogy minden kártyán látszik az osztály.

## EARS elfogadás

<!-- acceptance-checklist -->

- [ ] E1 WHEN a főoldal tananyagkártyái megjelennek THEN the system SHALL minden kártyán a teljes évfolyam-feliratot mutatni
  („N. osztály” / „Programozás”) a tananyag `classroom` mezőjéből.
- [ ] E2 WHEN egy tananyag `classroom` értéke érvénytelen THEN the system SHALL a főoldalon nem mutatni évfolyamot (hamis értéket sem).
- [ ] E3 WHEN a nézet 360×640 THEN the system SHALL a főoldali és az admin felirat kilógás és gombtakarás nélkül jelenjen meg.
- [ ] E4 WHEN az admin a „Tananyagok” fülön az „Összes” szűrőt nézi THEN the system SHALL minden kártyán évfolyam-jelvényt mutatni.
- [ ] E5 WHEN egy évfolyam-szűrő aktív THEN the system SHALL a kártyákon ugyanazt a jelvényt mutatni.
- [ ] E6 WHEN az admin kártyán az érték érvénytelen THEN the system SHALL „Nincs osztály” jelvényt mutatni figyelmeztető színnel és ikonnal.
- [ ] E7 WHEN az okosítás, a mentések, a tananyagjavító, a piszkozatlista, a megtekintési napló vagy a statisztika évfolyamot mutat
  THEN the system SHALL a közös feliratot használni (0 = „Programozás”).
- [ ] E8 The system SHALL a feliratot egyetlen közös függvényből képezni, egységteszttel 0–12-re, érvénytelen és hiányzó értékre.
- [ ] E9 The system SHALL nem módosítani adatbázist, migrációt, tárolt címet, éles adatot, gyártási promptot, végpont-jogosultságot.

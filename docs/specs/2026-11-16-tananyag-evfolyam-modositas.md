# Következetes évfolyam-módosítás az adminban — Studio-leckénél is (FIX, kanban #54, 2. szelet)

**Állapot:** folyamatban – 2026-11-16, ág `fix/tananyag-evfolyam-modositas-kovetkezetes`
Végrehajtási utasítás: [`2026-11-16-tananyag-evfolyam-modositas-vegrehajtas.md`](2026-11-16-tananyag-evfolyam-modositas-vegrehajtas.md)
Előzmény: [`2026-11-16-tananyag-evfolyam-jeloles.md`](2026-11-16-tananyag-evfolyam-jeloles.md) (PR #459)

## Háttér

Az éles leltárnál két tétel évfolyamát a tulajdonos javítani kérte (Matek Aréna → 3. osztály; GitHub Kezdőknek →
Programozási alapismeretek). Mindkettő Studio-lecke, és az évfolyamuk a `html_files.classroom` mellett a lecke adatában és a
forrásjegyzékben is szerepel. Az admin évfolyam-módosítása ma csak a `html_files` oszlopot írja → ellentmondás marad, és egy
későbbi újrapublikálás / javítás visszaírja. A javítást a tulajdonos telepítés után az admin felületen végzi el.

## Cél

Az admin két évfolyam-író útja — a szerkesztő (`PATCH /api/html-files/:id`) és a tömeges áthelyezés
(`POST /api/admin/materials/bulk-move`) — EGY közös szerveroldali függvényt hívjon, amely egy tranzakcióban, következetesen
állítja a tétel évfolyamát minden olyan helyen, ahol a lecke évfolyama tárolódik.

## Nem-cél

- Séma-módosítás, migráció; éles adat módosítása (a két tételt a tulajdonos állítja át).
- A lecke tartalma (szöveg, feladatok, kvíz) nem változik; MI-hívás, képgyártás nem indul.
- A lecke saját nézetének „Programozás” felirata 0-s kategóriánál (lásd „Döntési kérdés”).
- Az admin felület (szerkesztő, „Áthelyezés”) változatlan — már küldik az évfolyamot.

## A felmérés tényei (fájl:sor, `source/` alatt)

### Az admin évfolyam-írói

- `server/routes.ts:1858-1913` — `PATCH /api/html-files/:id` (`isAuthenticatedAdmin`): `updates.classroom` → `storage.updateHtmlFile`
  (`server/storage.ts:484-499`), csak `html_files`.
- `server/routes.ts:3548-3572` — `POST /api/admin/materials/bulk-move` (admin router): `.update(htmlFiles).set({ classroom })`, csak
  `html_files`; a lista-gyorsítótárat NEM üríti (a főoldal a következő újraépítésig a régi évfolyamot mutatja).
- `server/routes.ts:140-143` — `bulkMoveSchema`: `materialIds: z.string().uuid()` — a régi, nem UUID azonosítójú anyagok (pl. a
  GitHub-lecke `p0zzBVSIV-…`) tömegesen NEM helyezhetők át (400).

### Hol tárolódik / származik egy lecke évfolyama — és mi történik vele

| Hely | Fájl:sor | Döntés |
|---|---|---|
| `html_files.classroom` (lista, szűrő, játékbank-évfolyam) | `shared/schema.ts:52` | **frissül** |
| `lessons.json.classroom` (a lecke nézete, sáv-arculat, újrapublikálás) | `shared/schema.ts:678-700`, `lesson-runtime/LessonRuntime.tsx:563,578`, `server/studio/pipeline-store.ts:202-260` | **frissül** (0 kivétellel, lásd szabály); `version + 1`, `updatedAt` — mint a meglévő javító út (`server/studio/structured-improvement.ts:294`) |
| `lessons.json.art` (arculat: téma, sáv, borító) | `server/design-assets.ts:96-121` (`withLessonArt`) | **újraszámolódik** a meglévő `withLessonArt`-tal (a kézi / meglévő borítókép megmarad; ugyanaz, mint a javító út, `structured-improvement.ts:277`) |
| `knowledge_maps.classroom` (forrásjegyzék: a jövőbeli javítás / újragyártás promptjai) | `shared/schema.ts:595-600`, `server/studio/step-io.ts:354,475` | **frissül** (0 kivétellel), mint `structured-improvement.ts:293`; ha a forrásjegyzéket MÁS publikált anyag leckéje is használja → 409, semmi nem íródik |
| Főoldali lista-gyorsítótár | `server/routes.ts:1598` (`invalidateHtmlFilesCache`) | **ürül** mindkét úton (a tömeges úton eddig hiányzott) |
| Tanmenet-címke (`curriculum`) | `server/routes.ts:1598-1602` (`withCurriculum` a lista építésekor) | **újraszámolódik** (a gyorsítótár ürítése után) |
| Játék-kvízbank évfolyama | `server/gameQuizBankService.ts:105-119` (a `html_files.classroom`-ból olvas) | **újraszámolódik** (olvasáskor); a `game_quiz_items` sorokban nincs évfolyam |
| Borítókép-sweep (`designThemeForClassroom`) | `server/lesson-covers.ts:159-164` | **szándékosan marad**: a meglévő `art.picture` pinként számít → nincs új képgyártás |
| Okosítási alapvonal-hash (régi HTML) | `server/improve/html-baseline.ts:4-5` (tartalmazza a `classroom`-ot) | **szándékosan marad**: a függő okosítás elavul és nem alkalmazható (védelem) |
| Strukturált javítás frissességi ellenőrzése | `server/studio/structured-improvement.ts:274` (`assertRepairFresh`, `materialHash`) | **szándékosan marad**: a függő lecke-javítás elavul (védelem) |
| Katalógus-besorolás (`catalog_lessons.classroom`) | `scripts/catalog/import.mts:77-88` (offline import) | **szándékosan marad**: a következő katalógus-import újraszámolja |
| Lecke-klipek (sáv-stílus) | `server/lesson-clips.ts:313` | **szándékosan marad**: a már elkészült klip médiája nem gyártódik újra |

### A 0-s kategória („Programozási alapismeretek”) meglévő szabálya

`server/studio/pipeline-store.ts:64-69` (`legacyClassroom`): a 0-s kategóriájú anyag `html_files.classroom = 0`, de a lecke
adata a forrásból felismert valódi évfolyamot tartja (a Stúdió korosztály-regisztere: `ageBandForClassroom(0)` = „kid” lenne,
`shared/lesson-schema.ts:90-92`). Élesben a két meglévő 0-s Studio-lecke ezt mutatja (`html` 0, lecke / forrásjegyzék 9 és 10 —
csak olvasva ellenőrizve). Ezért:

- **0-ra állításkor** csak a `html_files.classroom` változik; a lecke adata és a forrásjegyzék a tartalmi évfolyamot tartja.
- **1–12-re állításkor** mindhárom hely az új értéket kapja (0-ról is).

## A megoldás

Új modul `server/material-classroom.ts`:

- `setMaterialClassroomTx(tx, ids, classroom)` és `setMaterialClassroom(ids, classroom)` (saját tranzakcióval).
- Ellenőrzés: `isValidClassroom` (különben `MaterialClassroomError` 400); üres / ismétlődő azonosítók normalizálva.
- Tranzakció: `html_files` sorok `FOR UPDATE`; hiányzó azonosító → 404 és visszagörgetés. A tételekhez tartozó leckék `FOR UPDATE`;
  futó Stúdió-job (`studio_jobs` `queued|running|processing`) vagy folyamatban lévő okosítás (`improved_html_files.status =
  'processing'`) → 409. Leckénként: ha a cél 1–12 és eltér, `json = withLessonArt({...json, classroom}, lesson.id, tx)`,
  `lessonSchema.parse`, `version + 1`, `updatedAt`; a forrásjegyzék `classroom` + `updatedAt` (megosztott forrásjegyzéknél,
  ha más, nem érintett publikált anyag is használja → 409). Végül `html_files.classroom`.
- Mindkét végpont ezt hívja; a PATCH a többi mezőt (cím, leírás, sorrend) ugyanabban a tranzakcióban írja; mindkettő üríti a
  lista-gyorsítótárat. A `bulkMoveSchema` a meglévő anyag-azonosító formát fogadja (UUID és a régi `[A-Za-z0-9_-]` azonosító).
- A jogosultság nem változik (a PATCH `isAuthenticatedAdmin`, a tömeges út az admin routeren).

## Edge case-ek

- Azonos évfolyamra állítás: nincs lecke-írás (a verzió nem nő).
- Lecke nélküli (sima HTML / PDF) tétel: csak `html_files`.
- Több lecke-sor ugyanahhoz az anyaghoz: mindegyik frissül.
- Érvénytelen évfolyam (13, -1, 2.5, szöveg): 400, semmi nem íródik.
- Tömeges kérésben egy hiányzó / foglalt / ütköző tétel → az egész kérés visszagördül.
- Nem admin: 401 / 403 (a meglévő őr), adatbázis változatlan.

## Döntési kérdés (tulajdonos)

A 0-s kategóriájú Studio-lecke saját oldala ma a lecke tartalmi évfolyamát mutatja (pl. „8. osztály”), mert a meglévő szabály
szerint a lecke adata a valódi évfolyamot tartja. Mutassa-e a lecke oldala is a „Programozás” feliratot (kis megjelenítési szelet),
vagy maradjon a tartalmi évfolyam?

## EARS elfogadás

<!-- acceptance-checklist -->

- [ ] M1 WHEN az admin a szerkesztőben egy Studio-lecke évfolyamát 1–12 közötti értékre állítja THEN the system SHALL egy
  tranzakcióban a `html_files.classroom`, a `lessons.json.classroom` és a `knowledge_maps.classroom` értékét is erre állítani,
  a lecke verzióját növelni, az arculatot újraszámolni, a lecke tartalmát változatlanul hagyni.
- [ ] M2 WHEN ugyanez tömeges áthelyezéssel történik (több tétel, vegyesen lecke és sima HTML) THEN the system SHALL minden tételre
  ugyanígy eljárni, és a régi (nem UUID) azonosítót is elfogadni.
- [ ] M3 WHEN a cél 0 (Programozási alapismeretek) THEN the system SHALL csak a `html_files.classroom`-ot állítani (a lecke adata és
  a forrásjegyzék a tartalmi évfolyamot tartja).
- [ ] M4 WHEN az évfolyam érvénytelen THEN the system SHALL 400-at adni, és semmit nem írni.
- [ ] M5 WHEN bármely tétel hiányzik, futó gyártás / okosítás alatt áll vagy a forrásjegyzéke megosztott THEN the system SHALL az
  egész kérést visszagörgetni (404 / 409).
- [ ] M6 WHEN nem admin hívja THEN the system SHALL 401 / 403-at adni, és az adatbázis változatlan.
- [ ] M7 WHEN az évfolyam megváltozott THEN the system SHALL a főoldali lista-gyorsítótárat mindkét úton üríteni.
- [ ] M8 WHEN az admin felületen átállított Studio-lecke oldalát megnyitják THEN the system SHALL az új évfolyamot mutatni.
- [ ] M9 The system SHALL nem igényelni séma-módosítást, migrációt, MI-hívást; az admin-végpontok jogosultsága változatlan.

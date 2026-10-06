# S5 — Tantárgyi memória (kanban) (2026-10-06)

Terv: `2026-10-05-tantargyi-tudasbank-terv.md` §5 (S5 sor: „`subject_memory` tábla: kártya = visszatérő hibaosztály / nyitott
csapda (tantárgy, lépés, kód, előfordulás, státusz); a tanulási hurok (`lesson_skill_lessons`) tantárgy-dimenzióval | 0 modell |
a futás a tantárgy nyitott kártyáit promptban kapja; admin-nézet”) és az S9-sor megjegyzése („a sikeres javító promptok a
tantárgyi memóriába (S5)”). Ág: `feat/s5-tantargyi-memoria`, az S6-ra (`feat/s6-katalogus-bekotes`, PR #202) épül.

## Kiinduló tények (kódból / éles DB-ből ellenőrizve, 2026-10-06, csak olvasó lekérdezés)
- A tanulási hurok (`server/workflows/learning-store.ts` `saveSkillAudit`) futásonként (execution) egyszer, a terminális
  snapshot TRANZAKCIÓJÁBAN ír a `lesson_skill_lessons` táblába: kulcs `(owner_id, skill, method_version, fingerprint)` —
  **tantárgy-dimenzió nincs**. A lelet csak karbantartott kód (`SKILL_RULES` kulcsai, `unknown`, `infrastructure`), lépés és
  lenyomat; hibaszöveg nem kerül tárolásra (`shared/lesson-skill.ts`: „Only maintained instructions may enter a system prompt.
  Error/source text never does.”).
- A futás tantárgya: `COALESCE(snapshot->>'resourceId', run.id)` = `studio_jobs.id` (a `sweepStudioJobs` kötése,
  `lesson-pipeline-routes.ts`) → `knowledge_maps.subject` → `subjectKeyOf` (S3/S4). Éles DB: 142 futás, ebből 62-nek van
  studio-jobja (a többi web/javító mód, a job előtt bukott vagy törölt jobú futás → nincs tantárgy → kimarad).
- Lektori leletek: `lektor_notes` (`kind`, `subkind`, `severity`, `block_path`, `job_id`); éles: 975 `source_conflict /
  contradicts_source` blokkoló, 16 `not_in_map`, 14 `coverage_gap/core`, 2 `missing_coversConceptIds`.
- Az orkesztrátor (S9) a bukott kísérleteket a `snapshot.failures` listába írja (`step`, `point`, `kind`, `reasons`,
  `orchestrated: { rootCause, outcome: ok|failed|skipped }`) — `server/studio/orchestrated-retry.ts` `orchestratedRetry`.
  A bankcsomag-ág (`correctedSystemFor`) eredményt NEM rögzít (UNVERIFIED hatás: a bank-orkesztráció sikere nem látszik; ez
  S5-ben nem változik). Élesben 1 futásnak van `failures` listája.
- Az S6 bekötése: `server/catalog/s6-context.ts` (`STUDIO_CATALOG_S6=1`), a tervező (pedagogue) és szerző (author) rendszerprompt
  végére fűz blokkot (`step-runner.ts`), a banképítő `deps.catalog`-ot kap (`experience-builder.ts`), a pool jobonként egyszer a
  `job.output.catalog`-ba kerül.
- Migrációk: `main` és S6 utolsó: `0022_subject_catalog.sql`; az S8 ág (`feat/s8-tanuloi-eredmenyesseg`) `0023_catalog_item_outcomes.sql`-t
  hoz → **S5 = `0024_subject_memory.sql`** (nem ütközik; a futtató ábécérendben alkalmaz, `server/migrate.ts`).

## Cél
1. **Kártya-modell** (`subject_memory_cards`): egy kártya = egy tantárgy visszatérő hibaosztálya egy lépésen.
2. **Determinisztikus képzés** (0 modellhívás) három forrásból: workflow-leletek (`skillAudit.findings`), lektori blokkoló
   jegyzetek, orkesztrátor-kimenetek (`failures`; `outcome = ok` → a javítás rövid összefoglalója a kártyára kerül).
3. **Élő rögzítés** a tanulási hurok mellett (ugyanabban a tranzakcióban, mentési ponttal elszigetelve) + **visszamenőleges
   backfill** script (alapból dry-run).
4. **Prompt-bekötés kapcsoló mögött**: `STUDIO_SUBJECT_MEMORY=1` (alapból KI) → a tervező, a szerző és a banképítő a lecke
   tantárgyának NYITOTT kártyáit kapja (korlátos, előfordulás szerint). Kikapcsolva a promptok és a hashek bájtra azonosak.
5. **Admin olvasó API**: `GET /api/admin/subject-memory/summary`, `GET /api/admin/subject-memory/cards?subject=&status=`.

## Nem-cél
- Modellhívás, új LLM-szöveg generálása; a meglévő `lesson_skill_lessons` tábla vagy kulcs módosítása (a tantárgy-dimenzió
  új, mellette futó táblában él — a régi hurok érintetlen).
- Admin-írás (kártya kézi lezárása/átminősítése) és admin-felület (UI): csak olvasó API (a felület külön szelet; lent indokolva).
- A javító összefoglaló promptba emelése (lásd „Rögzített döntések / Prompt-tartalom”).
- Tanulói adat bármilyen olvasása (S8 `catalog_item_outcomes`, `users`, válaszok) — nem forrás.
- A bank-orkesztráció kimenetének rögzítése (`correctedSystemFor`) — külön szelet, ha kell.
- A backfill `--write` futtatása élesen (tulajdonosi engedély után, a migráció telepítése után).

## Érintett fájlok
| Fájl | Változás |
|---|---|
| `source/migrations/0024_subject_memory.sql` (új) | két tábla, additív, `IF NOT EXISTS` |
| `source/shared/schema.ts` | drizzle-tábla definíciók (`subjectMemoryCards`, `subjectMemoryEvents`) |
| `source/server/memory/subject-memory.ts` (új) | TISZTA modul: kódkatalógus, bizonyíték-képzés, fold (dedup/upsert-számok), státusz/lecsengés, prompt-blokk, kapcsoló |
| `source/server/memory/store.ts` (új) | DB-réteg: `applyEvidence` (advisory lock + fold + upsert), `recordSubjectMemory` (élő hook), `loadSubjectMemoryCards` |
| `source/server/memory/admin-routes.ts` (új) | csak olvasó admin API |
| `source/server/routes.ts` | a router felcsatolása (`/api/admin/subject-memory`) |
| `source/server/workflows/learning-store.ts` | `saveSkillAudit` után `recordSubjectMemory(client, record)` |
| `source/server/studio/step-runner.ts` | `PipelineStore.loadSubjectMemory?`, jobonkénti pillanatkép (`job.output.subjectMemory`), blokk a tervező/szerző promptjában, `deps.memory` a banképítőnek |
| `source/server/studio/experience-builder.ts` | opcionális `deps.memory` (kész blokk) → rendszerprompt + csomag-hash |
| `source/scripts/memory/backfill.mts` (új) | dry-run alapból; `--write` csak kifejezett kapcsolóval |
| `source/tests/subject-memory.test.ts` (új) | egységtesztek hamis adatokkal |
| `docs/measurements/2026-10-06-s5-backfill-dryrun.json` (új) | a dry-run mért eredménye |

## Rögzített döntések
### Kártya-modell (`subject_memory_cards`)
| Mező | Jelentés |
|---|---|
| `fingerprint` (PK, 32 hex) | `sha256("s5:1|" + subject + "|" + step + "|" + code)` első 32 jele — a **dedup-kulcs** |
| `subject` | katalógus-bankkulcs (`subjectKeyOf`); ismeretlen/kétértelmű tantárgy → nincs kártya |
| `step` | a lépés, ahol a hiba keletkezett (`animator`, `author`, `bank`, `lektor`, `gate`, …) |
| `code` | karbantartott hibakód (lent) — szabad szöveg soha |
| `occurrences` | a kártyához tartozó **különböző bizonyítékok** száma (futás / lektorált job) |
| `first_seen`, `last_seen` | a legkorábbi / legkésőbbi bizonyíték ideje |
| `status` | `watch` (1 bizonyíték), `open` (≥ 2), `closed` (lecsengett) — a tárolt érték az írás pillanatáé; olvasáskor újraszámoljuk (`statusAt`) |
| `evidence` | a **legújabb** ≤ 10 bizonyíték-kulcs az esemény ideje (`seen_at`) szerint (`run:<id>:<execution>`, `job:<id>`) — belső azonosítók, szöveg nélkül; késői backfill régi kulcsa nem szorítja ki az újabbakat (review #204) |
| `corrective_summary`, `corrective_at`, `corrective_count` | az utolsó sikeres (outcome `ok`) orkesztrátor-javítás oka (`rootCause`, titok-redaktálva, ≤ 300 jel), ideje, a sikeres javítások száma |
| `updated_at` | utolsó írás |

`subject_memory_events (card_fingerprint, evidence_key, seen_at)`, PK `(card_fingerprint, evidence_key)` — az **idempotencia
alapja**: ugyanaz a bizonyíték kétszer soha nem számol (élő hook ismétlése, backfill újrafuttatása, élő + backfill átfedése).

### Bizonyíték-képzés (determinisztikus)
1. **Workflow-lelet** — futásonként a `skillAudit.findings` (ha nincs: `skillFindings`), minden leletnek minden lépésére
   (`steps` ∪ `step`): `{ code: finding.code, step }`. Bizonyíték-kulcs: `run:<runId>:<execution>`. Idő: `skillAudit.at`, különben
   `updatedAt`.
2. **Lektori blokkoló jegyzet** (`severity = 'blocker'`; warn/info nem visszatérő hiba-jelzés) — job-onként: kód
   `source_conflict` + `not_in_map` → `lektor_not_in_map`; `source_conflict` + `missing_coversConceptIds` → `lektor_concept_binding`;
   egyéb `source_conflict` → `lektor_source_conflict`; `coverage_gap` → `lektor_coverage_gap`; más `kind` → `lektor_other`. Lépés:
   `block_path` `experience`-szel kezdődik → `bank`, különben `author`. Kulcs: `job:<jobId>` (egy job = egy bizonyíték, akárhány
   kör/jegyzet). Idő: a jegyzetek legkésőbbi `created_at`-ja.
3. **Orkesztrátor-kimenet** — a `failures` minden eleme: kód `fail_<kind>` (kind ∈ `FailureKind`, más → `fail_other`), lépés
   `failure.step`. Kulcs: `run:<runId>:<execution>`. `outcome = ok` → `corrective_summary = redactSecrets(rootCause)` (≤ 300).
- Egy kártyán belül ugyanaz a kulcs egyszer számol (fold: az összefoglaló az utolsó nem üres, az idő a legnagyobb).
- Futás tantárgy nélkül (nincs `resourceId`, nincs studio-job, ismeretlen tantárgy) → nincs bizonyíték (fail-closed).

### Státusz és lecsengés
- `statusAt(card, now)`: `now − last_seen > 45 nap` → `closed`; különben `occurrences ≥ 2` → `open`; különben `watch`.
- Új bizonyíték egy lezárt kártyán → `last_seen` frissül → újra `open`/`watch` (újranyitás).
- A prompt csak `open` kártyát kap (újraszámolt státusszal).

### Kódkatalógus és szerepek (karbantartott szöveg)
- `SKILL_RULES` kódjai a meglévő karbantartott szabályszöveggel; szerep-hozzárendelés: `bank_cardinality`, `sample_score`,
  `duplicate_question`, `oral_written`, `repair_scope` → bank; `coverage`, `teaching_depth` → tervező + szerző; `source_fidelity`,
  `concept_reference` → szerző + bank; `schema`, `prompt_injection` → mind a három; `typography` → szerző; `review_evidence`,
  `html_complete`, `citations` → egyik sem (nem ezeknek a szerepeknek szólnak).
- Lektor-kódok: saját karbantartott szöveg; szerep a lépésből (`bank` → bank, `author` → szerző; `lektor_coverage_gap` → tervező is).
- `fail_*` kódok: `gate`, `bank_packet`, `lektor_blockers`, `schema`, `invalid_json`, `length`, `empty`, `coverage` saját
  szöveggel, szerep a lépésből (`bank`/`animator`/`banks` → bank, `author` → szerző, `pedagogue` → tervező); `provider`, `other` → nincs.
- `unknown`, `infrastructure`, `lektor_other`, `fail_provider`, `fail_other`: kártya készül (admin látja), promptba NEM kerül.

### Prompt-tartalom (biztonsági döntés)
- A blokk **kizárólag karbantartott szöveget** tartalmaz: kód-cím, szabály, előfordulás-szám, lépés(ek). Hibaüzenet, lektori
  szöveg, forrásszöveg és az orkesztrátor `rootCause`-a NEM kerül promptba (a meglévő elv: `shared/lesson-skill.ts` 12. sor;
  a `rootCause` élesben szó szerint idéz leckeszöveget — mérve: „parasztok és kézművesek”). A javító összefoglaló tárolva van és
  az adminnak látszik; promptba emelése admin-jóváhagyás után külön szelet (döntési opció).
- Formátum (szerepenként, kódonként összevonva):
  ```
  TANTÁRGYI MEMÓRIA (<subject>) — e tantárgy korábbi futásainak visszatérő hibái ebben a szerepben. Karbantartott szabályszöveg; a forrás, a séma és a kötelező kapuk változatlanok.
  - <cím> (<n> futásban; lépés: <lépések>): <szabály>
  ```
- Korlát: szerepenként ≤ **6** sor, a blokk ≤ **1 500** karakter; sorrend: előfordulás ↓, `last_seen` ↓, kód ↑.
- Pontosítás (review #204): a sor `<n>`-je és a rangsor a kódcsoport **különböző** bizonyíték-kulcsainak száma (egy futás, amelynek
  lelete több lépésre szól, egyszer számol), nem a lépés-kártyák előfordulásainak összege. A betöltő a kártyákhoz az összes
  esemény-kulcsot csatolja, a pillanatkép a `runs` (szerep|kód → szám) mezőben viszi a pontos számot; kulcsok nélkül alsó becslés
  (max(legnagyobb előfordulás, a tárolt ≤ 10 kulcs uniója)).
- Pillanatkép: jobonként egyszer (`job.output.subjectMemory = { version: 1, subject, cards }`, ≤ 40 nyitott kártya, a tantárgyra
  szűrve) — a job lépései ugyanazt a memóriát látják, a bank-csomag hash egy jobon belül stabil.
- Banképítő: a blokk a csomag rendszerpromptjába (a katalógus-blokk után) és a csomag-hashbe (`teaching.memory.version`) kerül,
  CSAK ha nem üres.

### Kapcsoló
`STUDIO_SUBJECT_MEMORY=1` → be; minden más érték → ki. Kikapcsolva: nincs DB-lekérés, nincs `job.output.subjectMemory`, a
tervező/szerző/bank prompt és a csomag-hash bájtra változatlan. Az **élő rögzítés** (írás a két új táblába) a kapcsolótól
független: additív, mentési pontban (`SAVEPOINT`) fut — a `to_regclass` előellenőrzés is (review #204) —, és ha a tábla még nincs
(`to_regclass` null) vagy bármely hiba van, a tanulási hurok tranzakciója változatlanul lefut (naplózva).

### Adatvédelem
Források: `lesson_workflow_runs` (gyártási napló), `lektor_notes` (tartalmi lektorálás), orkesztrátor-kivonat — egyik sem
tartalmaz tanulói adatot. A kártyán nincs szabad szöveg a `corrective_summary` kivételével (titok-redaktált gépi ok, leckeszöveg-
idézet lehet benne, tanulói adat nem). Tulajdonos-azonosító (`owner_id`) nem kerül a kártyára (tantárgy-szintű, nem személyes).

### Admin
Csak olvasó API, `isAuthenticatedAdmin` mögött. Admin-felület NEM készül: a meglévő admin-felületen nincs triviális
helye (új nézet + útvonal + teszt = külön szelet); az API JSON-ja közvetlenül olvasható.

## Edge case-ek
- A migráció még nincs telepítve: élő rögzítés kihagyva (to_regclass), a prompt-betöltő hibája → memória nélkül (fail-open,
  naplózva); a gyártás nem áll meg.
- Párhuzamosan záruló futások: `pg_advisory_xact_lock` sorosítja az `applyEvidence`-t (elveszett frissítés ellen).
- Ugyanaz a futás többször ír terminális snapshotot (újravégrehajtás): új `execution` → új kulcs → új előfordulás (helyes: új
  végrehajtás); ugyanaz az execution kétszer → az esemény-PK miatt nem számol.
- Backfill + élő átfedés: azonos kulcsok (`run:<id>:<execution>`, `job:<id>`) → nem számol kétszer.
- Kétértelmű tantárgy („magyar nyelv és irodalom”) → nincs kártya.
- Kártya más tantárgyból soha nem kerül a promptba: a betöltő `subject = $1`-gyel olvas ÉS a blokk-építő eldobja a más
  tantárgyú kártyát (kettős őr, teszt).

## Elfogadás (EARS)
- HA `STUDIO_SUBJECT_MEMORY` nem `1`, AKKOR a tervező, a szerző és a bank rendszerpromptja és a csomag-hash bájtra azonos a
  betöltő nélkülivel, és nincs memória-lekérés (teszt).
- HA be van kapcsolva, AKKOR a tervező/szerző/bank csak a lecke tantárgyának `open` kártyáit kapja, szerepre szűrve, ≤ 6 sorban,
  ≤ 1 500 karakterben, előfordulás szerint rendezve; más tantárgy kártyája soha (teszt).
- AMIKOR ugyanaz a bizonyíték kétszer érkezik, AKKOR az előfordulás egyszer nő (teszt: fold idempotencia).
- AMIKOR ugyanazon (tantárgy, lépés, kód) két különböző bizonyítéka érkezik, AKKOR egy kártya lesz `occurrences = 2`, `open` (teszt).
- AMIKOR az orkesztrátor `ok` kimenete érkezik, AKKOR a kártya `corrective_summary`-t és `corrective_count`-ot kap, és a
  promptban az összefoglaló szövege NEM jelenik meg (teszt).
- HA `last_seen` 45 napnál régebbi, AKKOR a kártya `closed` és nincs a promptban (teszt).
- A backfill alapból csak olvas; `--write` nélkül nem ír (kód + futtatott dry-run).
- A dry-run eredménye: `docs/measurements/2026-10-06-s5-backfill-dryrun.json` (tantárgyankénti kártyaszám, top kódok).
- Teljes unit, `npm run check`, `tsc -p tsconfig.test.json`, lint zöld.

## Mért eredmény (2026-10-06, ingyenes dry-run backfill, csak olvasó DB)
Forrás: `docs/measurements/2026-10-06-s5-backfill-dryrun.json` (`npx tsx scripts/memory/backfill.mts`, írás nélkül).
A futás → job kötés a `sweepStudioJobs` szabálya szerint: `COALESCE(resourceId, run.id) = studio_jobs.id` (élő hook ugyanígy).
- Bemenet: 142 workflow-futás, 1 007 lektori blokkoló jegyzet 51 jobon. Kihagyva 80 futás job/tantárgy nélkül (mérve:
  upload/done 27 — a `resourceId` törölt jobra mutat; web 18, upload/error 13, apply 6, repair 7, upload/egyéb 8, html 1).
- Eredmény: 1 445 bizonyíték → 449 egyedi esemény → **101 kártya** (62 `open`, 39 `watch`, 0 `closed`).

| Tantárgy | Kártya | open | watch | promptba vihető | top visszatérő kódok (előfordulás) |
|---|---|---|---|---|---|
| matematika | 25 | 22 | 3 | 21 | unknown@animator 22 (nem vihető), lektor_source_conflict@bank 21, source_fidelity@lektor 20, sample_score@animator 18, bank_cardinality@animator 17 |
| történelem | 30 | 24 | 6 | 23 | sample_score@animator 17, lektor_source_conflict@bank 15, duplicate_question@animator 14, source_fidelity@lektor 13, coverage@knowledge 9 |
| természetismeret | 24 | 16 | 8 | 17 | lektor_source_conflict@bank 8, sample_score@animator 8, source_fidelity@lektor 6, unknown@gate 5, coverage@lektor 4 |
| földrajz | 11 | 0 | 11 | 10 | mind 1× (watch) |
| informatika | 10 | 0 | 10 | 6 | mind 1× (watch) |
| környezetismeret | 1 | 0 | 1 | 1 | lektor_concept_binding@author 1 |

- Javító összefoglaló: **0** — az egyetlen `failures`-t tartalmazó futás (`d6246a58…`, upload, `resourceId` nélkül, azonos
  azonosítójú job nincs) nem köthető tantárgyhoz. Az S9 kapcsoló (`WORKFLOW_ORCHESTRATOR`) élesben KI, ezért az élő adat is ritka.

## Döntési opciók a tulajdonosnak (a szelet után)
1. Migráció telepítése (deploykor automatikus) + backfill `--write` (engedéllyel) → a kártyák élesben.
2. Kapcsoló BE próbafutásra (fizetős élő A/B engedéllyel): ugyanazon témák KI/BE, bank-hibák és javító körök összevetése.
3. A javító összefoglalók promptba emelése admin-jóváhagyással (új admin-írás + jóváhagyott státusz).

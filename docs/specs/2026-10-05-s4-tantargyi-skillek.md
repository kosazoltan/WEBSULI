# S4 — Tantárgyi és lecketípus-skillek a visszafejtett katalógusból (2026-10-05)

Terv: `2026-10-05-tantargyi-tudasbank-terv.md` (S4). Előzmény: S1 kinyerés, S2 tartalom alapú besorolás, S3 bankok.
Tulajdonosi döntések: minden tantárgy és természettudományi ág külön (nincs közös bank / közös skill); a lektor csak a saját
tantárgya anyagát kapja; a szülő-ellenőrzött régi anyag a minta-forrás.

## Mért kiindulás (feltérképezés 2026-10-05, fájl:sor a felderítésből)
- Skill ma CSAK szerephez kötött: `ROLE_SKILLS` (`server/studio/role-skills.ts:31`), `SUPPORT_SKILLS`
  (`server/studio/support-skills.ts:13`); tantárgy/lecketípus szerinti választás nincs.
- A gyártásban a tantárgy szabad szöveg: `knowledge_maps.subject` (`shared/schema.ts:593`), `map.meta.subject`
  (`step-runner.ts:2006`); normalizált kulcs (`CATALOG_SUBJECTS`) csak a katalógusban van.
- A skill verziója a rendszerpromptban (`v<hash>`) → a lépés-hashbe kerül (`step-runner.ts:698`): szövegváltozás = új hash.
- `lektor_notes`-ban nincs tantárgy; csak `studio_jobs.mapId → knowledge_maps.subject` úton érhető el.

## Cél
1. **Tantárgykulcs-leképezés** `shared/subject-key.ts`: `subjectKeyOf(freeText, grade?) → CatalogSubject | null`.
   Determinisztikus: normalizált egyezés a `SUBJECT_LABELS`-szel és egy explicit szinonimatáblával („Magyar nyelv és
   irodalom” → csak évfolyam/tartalom nélkül NEM dönt: null). Ismeretlen → null (nincs találgatás).
2. **Generált tantárgyi skill-fájlok** `shared/subject-skills/<subject>.md` — a `scripts/catalog/build-subject-skills.mts`
   állítja elő a katalógusból (DB `catalog_items` aktív + `catalog_lessons` egyező), modell NÉLKÜL:
   - témakör-térkép évfolyamonként (téma → tétel-darab, lecke-darab);
   - tételtípus-arányok (kvíz / rövid válasz / nyílt / módszer / fejezet) — „ilyen a jó lecke ebben a tantárgyban”;
   - minta-tételek (determinisztikus választás: szülő-ellenőrzött, aktív, témakörönként legfeljebb 2, lenyomat szerint rendezve);
   - visszatérő csapdák: a lektor-jegyzetek tantárgyankénti csoportjai (kind/subkind gyakoriság + a 3 leggyakoribb
     üzenet-minta, titok/név nélkül) és a jelölt katalógus-tételek hibaosztályai.
   A fájl fejében: forrás (dátum, tétel- és lecke-darab), generátor-verzió. A fájlt ember átnézheti; kódban konstans tölti be.
3. **Lecketípus-skillek** `shared/lesson-type-skills.ts`: a 8 `LESSON_TYPES`-hoz kézzel írt, rövid szerkezeti szabály,
   a katalógus mért arányaival alátámasztva (mely tételtípus, mekkora arány, milyen szakaszrend).
4. **Betöltő + verzió** `server/studio/subject-skills.ts`: `subjectSkillBlock(subject, lessonType)` →
   `=== TANTÁRGY-SKILL: <subject> / <lessonType> (v<hash>) ===` blokk; `subjectSkillVersion()` sha256/12.
   A gyártásba kötés (melyik szerep kapja, A/B) az **S6** — itt csak a betöltő és a verzió, a gyártás viselkedése NEM változik.

## Nem-cél
Bekötés a gyártási promptokba (S6), tantárgyi memória/kanban (S5), modellel írt skill-próza, `knowledge_maps` séma-változás.

## Edge case-ek
- Kevés tételű tantárgy (< 30 aktív tétel): a skill fájl elkészül, de `sparse: true` jelöléssel, minta-tételek nélkül.
- `_besorolatlan` és átnézendő tételek: kimaradnak (csak egyező, aktív, nem jelölt tétel lehet minta).
- Idegen nyelvek: a szókincs-párok a minták közé kerülnek, a nyelvi kulcs megmarad.
- A generátor újrafuttatása azonos adaton bájtra azonos fájlt ad (determinizmus → stabil hash).
- Lektor-jegyzet üzenetéből csak a kód/fajta és rövidített, számot/nevet nem tartalmazó minta kerül át.

## Elfogadás (EARS)
- HA a generátor kétszer fut azonos DB-n, AKKOR a kimenet bájtra azonos.
- MINDEN `CATALOG_SUBJECTS` kulcshoz, amelynek van aktív tétele, készül skill-fájl; minta-tétel csak `parent_verified`,
  `active` lehet.
- `subjectKeyOf` a mért `knowledge_maps.subject` értékek mindegyikére vagy pontos kulcsot, vagy null-t ad (riport:
  lefedettség %); ismert hibás leképezés nincs (kézi lista a tesztben).
- A gyártás promptjai és lépés-hashei változatlanok (nincs bekötés) — a meglévő teljes unit-készlet zöld.
- Teljes unit, tsc, lint zöld.

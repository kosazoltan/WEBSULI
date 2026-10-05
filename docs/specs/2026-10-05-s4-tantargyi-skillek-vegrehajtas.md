# Végrehajtás — S4 tantárgyi és lecketípus-skillek (ügynöknek)

Előfeltétel: S3 importált katalógus (`catalog_items`, `catalog_lessons`) — amíg nincs éles import, a generátor a helyi
`.catalog/<nap>-items.json` + `docs/measurements/<nap>-classify-all.json` párból is tud dolgozni (`--from-files`).

1. `shared/subject-key.ts`: `SUBJECT_SYNONYMS` (explicit tábla), `subjectKeyOf(text)`. Normalizálás: kisbetű, ékezet le,
   évfolyam-szám/„osztály” szavak le. Csak teljes egyezés vagy szinonima; különben null.
   Mérés: `scripts/catalog/subject-key-coverage.mts` (csak olvasó) a `knowledge_maps.subject` különböző értékein → riport.
2. `scripts/catalog/build-subject-skills.mts`: bemenet DB (alap) vagy fájlok; kimenet `shared/subject-skills/<subject>.md`
   + `shared/subject-skills/index.ts` (generált: `SUBJECT_SKILL_TEXTS: Partial<Record<CatalogSubject, string>>`).
   Rendezés mindenhol stabil (téma, évfolyam, lenyomat); időbélyeg NEM kerül a fájlba (csak a forrás-darabszámok és a nap).
3. Lektor-csapdák: csak olvasó lekérdezés `lektor_notes ⋈ studio_jobs ⋈ knowledge_maps` → `subjectKeyOf(subject)` →
   kind/subkind gyakoriság; üzenet-minta: számok → `#`, idézett szöveg → `„…”`, 120 karakterre vágva.
4. `shared/lesson-type-skills.ts`: `LESSON_TYPE_SKILLS: Record<LessonType, string>` — kézzel; mellé
   `docs/measurements/<nap>-lesson-type-shape.json` (a generátor méri: típusonként tételtípus-arány).
5. `server/studio/subject-skills.ts`: `subjectSkillText`, `subjectSkillVersion`, `subjectSkillBlock` — NINCS hívása a
   gyártásból (S6).
6. Tesztek (`tests/subject-skills.test.ts`): leképezés (pontos, szinonima, kétértelmű → null, ismeretlen → null); generátor
   determinizmus (fixture-ből kétszer → azonos); minta csak aktív + szülő-ellenőrzött; ritka tantárgy `sparse`; verzió-hash
   változik szövegváltozásra; a gyártási modulok nem importálják a `subject-skills`-t (S6 előtt).
7. Kapuk: célzott teszt → teljes unit, tsc, lint. Commit atomi szeletekben (1–2 / 3–4 / 5–6).

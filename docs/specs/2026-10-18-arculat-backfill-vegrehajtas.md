# A meglévő leckék arculatának mentése — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-18-arculat-backfill.md`. Ág: `feat/arculat-backfill`. A parancsok a `source/` mappából futnak.

1. **`server/design-assets.ts`:**
   - a `withLessonArt` tiszta magja külön függvény: `computeLessonArt(lesson, seed, storedIds)` → `{ art } | null`;
   - a `withLessonArt` ezt hívja, a viselkedése nem változik;
   - a tiszta mag a `shared/`-ba kerül, hogy szkriptből DB-kapcsolat nélkül is hívható legyen.
2. **`scripts/design-assets/backfill-lesson-art.mts`:**
   - **Próbafutás (alap):** `withReadOnlyDb` → az `art` nélküli leckék listája és a számított `art`.
   - **`--write`:**
     - először mentés: JSON-fájl az érintett leckék azonosítójával és korábbi `json`-jával;
     - utána `withWriteTransaction`, soronként `UPDATE lessons SET json = $1 WHERE id = $2 AND json->'art' IS NULL`;
     - kimenet: az írt sorok száma.
   - **`--restore <fájl>`:** a mentett `json` visszaírása.
3. **Unit teszt:** `computeLessonArt` = `withLessonArt` (azonos bemenetre azonos `art`); `art`-tal rendelkező bemenetet a szkript
   kihagy.
4. **Kapuk:** tsc, check:test, lint, unit.
5. **Élesítés:**
   - próbafutás, átnézés, majd `--write` (futó munkafolyamat nélkül);
   - második próbafutás: 0 érintett;
   - böngészőben két lecke: a képek a `/api/design-assets/…` címről jönnek.

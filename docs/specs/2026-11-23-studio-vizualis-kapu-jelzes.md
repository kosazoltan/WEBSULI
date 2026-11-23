# Terv — a Studio vizuális ellenőrzésének technikai hibája: a futás megy tovább, de jelzi, hogy az ellenőrzés elmaradt (P-066)

Tulajdonosi döntés P-066 (2026-11-23): ha a Studio vizuális ellenőrzése technikai (belső) hiba miatt bukik, a feldolgozás
folytatódik, de a napló ÉS a futás eredménye egyértelműen jelezze, hogy a vizuális ellenőrzés kimaradt. A fizetős próbafutás kemény
költségplafonja nem változik. Az ismert fedettségi bukás `enforce` módban továbbra is bukás (változatlan).

## Tény (kód, `origin/main` ccc5e99f)

- `source/server/studio/single-run/engine.ts` `judgeCoverage`: a forrás-fedettségi kapu kivételét elkapja, `telemetry.gates.gateErrors`
  +1, naplósor, `null` ítélet. A `judge` (pótló forduló utáni mérés) a `null`-t `ok: true`-ként kezeli — csendes átmenés.
- `judgeSourceVisuals`: az érvényesítő kivételénél naplósor + üres leltár; a futás eredményében semmi nem jelzi.
- A futás `warnings` tömbje a `SingleRunResult.warnings`-ba és a job kimenetének `quality.warnings` mezőjébe kerül; az admin
  felülete (`client/src/components/studio/JobMonitor.tsx`) ezt NEM mutatja. A felületen látható csatornák: `output.qualityNotes`
  („Minőségi jelzés” panel, `/api/studio/jobs/:id` → `produced.qualityNotes`) és a telemetria kapusorai (`telemetryView().gates`,
  a `gateErrors` már kiírva).
- A telemetria folytatáskor a mentett kimenetből áll vissza (`new TelemetryRecorder(telemetryOf(input.resume.output))`), a
  `qualityNotes` a mentett kimenet része.

## Döntés

1. `judgeSourceVisuals` hibaága a visszatérési értékben jelzi a hibát (`validatorError: true`); a forrás-állomás ekkor
   `telemetry.gates.visualsValidatorError = 1`-et ír (mentett, folytatáskor visszaáll), a naplósor kimondja, hogy a vizuális
   ellenőrzés elmaradt.
2. A pótló forduló utáni `null` ítélet NEM átmenés: naplósor („a mérés elmaradt, nem átment”), a futás megy tovább (a hibaszámláló
   már nőtt).
3. A futás végén, ha `gates.gateErrors > 0` vagy `gates.visualsValidatorError`, egyszer (deduplikálva, folytatott futásban is) a
   `warnings`-ba és az `output.qualityNotes`-ba (`reason: "visual_check_skipped"`) kerül:
   „A vizuális (forrás-fedettségi) ellenőrzés technikai hiba miatt elmaradt — a lecke ennélkül készült.”
4. A telemetria-nézet új sora: „A forrás vizuális leltárának érvényesítője hibázott — a vizuális ellenőrzés elmaradt”.

## Nem-cél

- A költségplafon, a fedettségi kapu `enforce`-bukása, a pótló forduló száma nem változik.
- A külön térkép-kivonatolás (`/api/studio/maps/extract`) eredménye nem kap új mezőt (ott lecke nem készül); a térképről indított
  gyártás nem örökli egy korábbi kivonatolás érvényesítő-hibáját (UNVERIFIED igény, külön döntés).

## Elfogadás (EARS)

- [ ] E1 WHEN a fedettségi kapu kivételt dob (report vagy enforce) THEN a futás SHALL közzétenni, és a `warnings`, a `quality.warnings`
  és a `qualityNotes` SHALL pontosan egyszer tartalmazni a figyelmeztetést.
- [ ] E2 WHEN az érvényesítő kivételt dob THEN a futás SHALL folytatódni, a figyelmeztetés SHALL megjelenni, a telemetria
  `visualsValidatorError` SHALL 1 lenni.
- [ ] E3 WHEN egy már figyelmeztetéssel mentett futás folytatódik THEN a figyelmeztetés SHALL egyszer szerepelni.
- [ ] E4 WHEN a pótló forduló utáni mérés kivételt dob THEN a napló SHALL „elmaradt”-ot írni, a futás SHALL folytatódni a
  figyelmeztetéssel; ismert bukásnál (nem kivétel) enforce-ban SHALL megállni (változatlan).
- [ ] E5 WHEN nincs kapuhiba THEN figyelmeztetés SHALL NOT megjelenni.

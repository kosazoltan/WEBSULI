# Végrehajtási utasítás — a folytatás szövege a folytatás fajtája szerint

Terv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` (T1b következménye). Ág: `fix/folytatas-szoveg` (a #230-ra épül).

Tulajdonosi képernyőkép (2026-10-15, job `416ad01d`): a piszkozat alatt „A folytatás innen halad tovább, a kész részeket nem gyártja újra.” —
a T1b újraépítésnél (a bank újraépül) és a lektor-újrafuttatásnál ez nem igaz.

1. `server/studio/lesson-pipeline-routes.ts` `oneStepRunView`: hibánál `resumeKind` (a `resumeKindOf` eredménye, ha folytatható) a válaszban;
   a `OneStepRunView` típus kap `resumeKind?: string`.
2. `client/src/components/studio/SourceUploadForm.tsx`: a piszkozat-mondat a fajta szerint:
   - `bank`, `gate`: „A folytatás innen halad tovább, a kész részeket nem gyártja újra.” (változatlan);
   - `review`: „A folytatás a tananyagot megtartja, és a lektori ellenőrzést futtatja újra.”;
   - `rebuild`: „A folytatás a tanítást megtartja, a gyakorlóbankot új tartalékkal újraépíti.”;
   - `lektor`: „A folytatás a lektori ellenőrzést futtatja újra.”
3. `tests/studio-generation-recovery.spec.ts`: új eset — `resumeKind: "rebuild"` mellett a szöveg az újraépítést mondja, a gomb látszik.
4. Ellenőrzés: `npm.cmd run check`, `lint`, a célzott E2E (`npx.cmd playwright test tests/studio-generation-recovery.spec.ts --project=chromium`), teljes `npm.cmd test`.

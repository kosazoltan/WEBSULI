# A folytatás szövege a folytatás fajtája szerint — terv (2026-10-15)

**Eljárási megjegyzés (review #232, P1):** ez az első fázisú terv UTÓLAG készült; a végrehajtási utasítás
(`2026-10-15-folytatas-szoveg-vegrehajtas.md`) és a kód előbb került a PR-be. A háromfázisú sorrend megsértése itt és a záró jelentésben jelölve.

## Kiinduló tény
Tulajdonosi képernyőkép (job `416ad01d`): a piszkozat alatt „A folytatás innen halad tovább, a kész részeket nem gyártja újra.” — a T1b
bank-újraépítésnél (a bank újraépül) és a lektor-újrafuttatásnál ez nem igaz; a felület a tulajdonost félrevezeti a folytatás költségéről.

## Cél
A felület a ténylegesen bekövetkező folytatást írja le, a szerver ugyanazon döntéséből (`resumeKindOf`), amely a folytatást végrehajtja.

## Nem-cél
- A folytatás logikájának, a kereteknek, a gomb láthatóságának változtatása.
- Új végpont; csak a meglévő futásnézet bővül egy mezővel.

## Érintett fájlok
`server/studio/lesson-pipeline-routes.ts` (`resumeKind` a futásnézetben), `client/src/components/studio/SourceUploadForm.tsx` (fajta szerinti mondat),
`tests/studio-generation-recovery.spec.ts` (E2E).

## Határesetek
- Ismeretlen vagy hiányzó fajta → a korábbi, általános mondat (visszafelé kompatibilis).
- Nem folytatható megállás → a meglévő „nem folytatható” mondat, változatlanul.
- Régi kliens az új mezőt figyelmen kívül hagyja.

## Elfogadás (EARS)
- E1: HA a fajta `rebuild`, AKKOR a szöveg az újraépítést mondja, és nem állítja, hogy a kész részeket nem gyártja újra (E2E, 360 px, túlcsordulás nélkül).
- E2: HA a fajta `bank` vagy `gate`, AKKOR a korábbi mondat marad (a meglévő E2E zöld).

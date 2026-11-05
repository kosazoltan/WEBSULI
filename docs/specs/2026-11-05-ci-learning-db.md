# Az adatbázisos integrációs tesztek a CI-ben (2026-11-05)

## Mért ok

A `npm run test:learning-db` (9 integrációs fájl, 73 teszt, eldobható Postgres) csak helyben futott; a
`daily-reminder-db.integration.ts` egyik tesztje 10-20 óta bukott, és senki nem vette észre (#397). Tulajdonosi döntés
2026-11-05: kerüljön a CI-be.

## Cél / nem-cél

- Cél: új CI-job („DB integrációs tesztek”), amely a meglévő harnesst (`source/scripts/run-learning-db-tests.ts`) futtatja.
- Nem-cél: a harness és a tesztek nem változnak; a Playwright E2E adatbázisa nem változik.

## Döntések és edge case-ek

- A harness maga indít `postgres:17` konténert Dockerrel, loopbackre kötve, projekt-ENV nélkül — az `ubuntu-latest`
  runneren a Docker elérhető, külön `services:` blokk nem kell (a harness úgyis saját konténert kér).
- `needs: lint-typecheck` (mint a unit teszteké), `timeout-minutes: 15` (helyben ~30 s, a harness belső korlátja 120 s).
- Amíg a #397 nincs a `main`-en, a job a „review #292” tesztnél bukik — ezért ez a PR a #397 után kerül be.

## Érintett fájl

`.github/workflows/ci.yml`

<!-- acceptance-checklist -->
- [x] A1: a CI-ben új „DB integrációs tesztek” job fut `npm run test:learning-db`-vel.
- [x] A2: a job zöld a #397 összevonása utáni `main`-ről indított PR-on (#399, „DB integrációs tesztek” success).

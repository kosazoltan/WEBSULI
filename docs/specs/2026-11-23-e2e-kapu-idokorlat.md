# Terv — a PR előtti kapu böngészős útja ne ütközzön a harness 60 perces korlátjába

Tulajdonosi utasítás (2026-11-23): az adventi PR-C (főterv H1-A1) kapuját végigvinni; a kapu megkerülése tilos.

## Tény

- 2026-11-23, `feat/advent-c-felulet-es-elesites` (`f6ea03bd`): `npm run gate:pr` → „böngészős út: UI-spec-ek” FAIL, 3603 s,
  „Playwright timed out”. A napló: 556 teszt / 27 spec egy workerrel, **549 ok, 0 bukás** — a futás a
  `source/scripts/run-e2e-tests.ts` kemény 60 perces korlátján halt el, nem hibán.
- A kapu saját korlátja 90 perc, a harnessé 60 → a kapu korlátja sosem érvényesült.

## Döntés

- A harness korlátja `WEBSULI_E2E_TIMEOUT_MIN` env-vel felülírható (alap 60 perc marad: CI és kézi futás változatlan).
- A PR előtti kapu 150 percet ad át, a saját végrehajtási korlátja 160 perc (a harness mindig maga áll le és takarít
  — eldobható Postgres-konténer, Windows-folyamatfa).
- Nem-cél: a spec-választás szűkítése (a CI-azonos lefedettség marad).

## Elfogadás

- [ ] E1 WHEN a kapu a böngészős utat futtatja THEN the system SHALL `WEBSULI_E2E_TIMEOUT_MIN=150`-et adni a harnessnek.
- [ ] E2 WHEN nincs beállítva a változó THEN the harness SHALL 60 perces korláttal futni.
- [ ] E3 THE kapu végrehajtási korlátja SHALL nagyobb lenni a harness korlátjánál.

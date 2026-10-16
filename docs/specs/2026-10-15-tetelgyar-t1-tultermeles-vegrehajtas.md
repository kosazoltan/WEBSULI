# Végrehajtási utasítás — Tételgyár T1: 130%-os túltermelés, kivétel javítás helyett

Terv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` (T1, G4; tulajdonosi döntés D1: 130%). Ág: `feat/tetelgyar-t1-tultermeles`.

## Kódból ellenőrzött kiinduló tények

- `shared/lesson-experience.ts`: `LESSON_BANK_SIZES = { tasks: 45, quiz: 75 }`, `LESSON_BANK_RESERVE = { tasks: 3, quiz: 5 }` (~107%).
- `shared/lesson-bank-plan.ts` `bankUnitQuota`: a `*Count` a fejezetre jutó minimum, a `*Target` a tartalékkal kért darabszám; a tartalék a
  fejezetek között egyenletesen oszlik → sok fejezet 0 tartalékot kap.
- `server/studio/experience-builder.ts`: a csomag a `*Target`-et kéri; az utolsó kísérletnél a `salvagePacket` a név szerint hibás tételt
  kiejti, ha a maradék ≥ `*Count` (a `salvageSchema`) — 0 tartalékú fejezetben EGY kiejtés is a minimum alá visz → a csomag bukik
  (élő, job `e2facc3f`: „A 1. fejezet bankcsomagja a javító kör után sem megfelelő … minWords”).
- `server/studio/step-runner.ts` `runGate`: a kapu ELŐBB kivesz (`resolveChoiceGate`), és csak akkor javít (`repairGateItems`), ha a kivétel
  a padló alá vinne (élő, job `416ad01d`: 48 − 4 = 44 < 45).

## T1.1 — a tartalék 130%, a TÉNYLEGES minimum fölött
Kódból ellenőrzött rés: a `bankUnitQuota` `allocate(kind, reserve)` a tartalékot csak a `LESSON_BANK_SIZES + reserve` összegig tölti
(`extra = max(0, SIZE + reserve − Σbase)`); ha a fejezetek alapkvótája (`Σbase`) már ≥ 48 / 80, a cél = minimum, **tartalék nincs**.
- `shared/lesson-experience.ts`: `LESSON_BANK_RESERVE_RATIO = 0.3` (tulajdonosi döntés D1), a `LESSON_BANK_RESERVE` a minimális tartalék
  `{ tasks: 14, quiz: 23 }` (45 × 0,3 → 14; 75 × 0,3 → 23).
- `shared/lesson-bank-plan.ts` `bankUnitQuota`: `taskCount`/`quizCount` változatlan; a cél = a fejezet minimuma + a fejezetre jutó tartalék, ahol a
  teljes tartalék `max(LESSON_BANK_RESERVE[kind], ceil(LESSON_BANK_RESERVE_RATIO × Σcount))`, a fejezetek között a minimumuk arányában
  (maradékosztás az első fejezetektől) — így minden fejezet kap tartalékot, ha a teljes tartalék ≥ fejezetszám.
- `server/studio/experience-builder.ts` `taskMax`/`quizMax`: VÁLTOZATLAN — a felső korlát `max(cél, 45/75) + LESSON_BANK_RESERVE` a 130%-os célnál is elegendő (ellenőrizve: a csomagcél ≤ a teljes cél).
## T1.2 — tesztek (dokumentált szerződésváltozás: a tartalék értéke)
A tartalék konkrét értékéhez kötött elvárások a konstansból számolt értékre váltanak (a minimum 45/75 mérce változatlan):
- `tests/bank-item-ref.test.ts` 29–35. sor: `≥ 48` / `≥ 80` → `≥ 45 + LESSON_BANK_RESERVE.tasks` / `≥ 75 + LESSON_BANK_RESERVE.quiz`, a teszt neve „E6 célkvóta: a tartalékkal együtt …”.
- `tests/bank-reserve-sign-rules.test.ts` 74–76. sor: a hibaüzenet és a darabszám a konstansból.
- `tests/lesson-experience.test.ts` 133–134. sor: a darabszám a konstansból.
- Új teszt (`tests/bank-item-ref.test.ts`): minden egységszámra (1–12) minden fejezet `taskTarget − taskCount ≥ 1`, és az összes tartalék ≥ 14 / 23 —
  így a mentő kivételnek minden fejezetben van mozgástere.
- Parancsok: `npx.cmd tsx --test tests/bank-item-ref.test.ts tests/bank-reserve-sign-rules.test.ts tests/lesson-experience.test.ts tests/bank-schema.test.ts tests/bank-repair.test.ts tests/catalog-s6.test.ts tests/lesson-pipeline-runner.test.ts`,
  majd `npm.cmd run check`, `lint`, teljes `npm.cmd test`.

## T1.3 — mérés (élő, a tulajdonos engedélyével)
Deploy után egy új, teljes gyártás (feltöltött szöveges forrás): a naplóból a csomagonkénti `bank-salvage` és a kapu kivételei, a bank darabszáma
(≥ 45/75), a token-felhasználás a bank lépésen az alapvonalhoz (job `e2facc3f`: animator 91 534 + 121 663 bemeneti token) képest.

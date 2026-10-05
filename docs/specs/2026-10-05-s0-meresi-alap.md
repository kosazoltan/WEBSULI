# S0 — Mérési alap a tudásbank-programhoz (2026-10-05)

Terv: `2026-10-05-tantargyi-tudasbank-terv.md` (5. pont, S0). Cél: minden későbbi szelet hatása UGYANAZZAL a mércével,
modellköltség nélkül mérhető legyen.

## Cél
`server/studio/run-metrics.ts` — tiszta függvény: jobonként és tantárgyanként
- `success` (step = done), `failed` (step = error), `failureClass` (a bukás-üzenet osztálya — ugyanaz a besorolás, amivel a
  2026-10-05-ös terv mért: bank-padló, egyválasztós, tényhiba, fedettség, séma/kód, infrastruktúra, keret, forrás, bank-csomag,
  animátor-szerződés, egyéb),
- `bankOnlyRounds`, `targetedGate`, `gateBank` (a javítási főkönyvből, régi mezőkkel visszafelé kompatibilisen),
- `lektorNotes`, `lektorBankNotes` (block_path `experience…`), `lektorTeachNotes`,
- tantárgyi összesítés: futás, siker%, bukás-osztályok, átlagos bank-jegyzet/futás, átlagos csak-bank kör/futás.
`scripts/studio/baseline-metrics.mts` — CSAK OLVAS az éles DB-ből, a mért értéket `docs/measurements/<dátum>-baseline.json`
fájlba írja (bizonyíték a későbbi A/B-hez).

## Nem-cél
Tokenköltség (a `studio_jobs.tokens_*` csak az utolsó lépést tárolja — UNKNOWN, külön mérendő a workflow-látogatásokból);
tanulói eredmény (S8).

## Elfogadás (EARS)
- Csak a LEZÁRT futás (step done/error) számít (review #187); a kanonikus mérés: 75 futás / 23 siker / 52 bukás — a terv számai
  ebből származnak. A bukás = step error (a köztes lépés status=error nem). A kapcsolat ellenőrzött TLS-sel, csak olvasó tranzakcióban.
- HA a főkönyv hiányzik, AKKOR a régi mezőkből számol (repair-ledger `repairUse`).
- Teljes unit, tsc, lint zöld.

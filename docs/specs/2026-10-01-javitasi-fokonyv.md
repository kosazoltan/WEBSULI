# Egységes javítási főkönyv (2026-10-01)

Tulajdonosi utasítás: „hibás állapotot nem hagyunk magunk mögött” — a gyökérok-terv (`2026-10-01-gyokerok-egyben.md`, 2.5)
nyitott kockázata: a körlimit-javítások számlálói szétszórtan élnek.

## Mért állapot (fájl:sor, main 7452e67)
- Hat külön jelző, háromféle jelentéssel: `bankOnlyRepairRounds` (darab) + `bankOnlyRepairRound` (régi, körszám)
  `step-runner.ts:1173`, `:1303-1304`; `targetedGateRepairRound` (körszám) `:1189`, `:1529-1533`; `targetedLektorRepairRound`
  (körszám) `:1265-1270`; `instructionRepairRound` (körszám) `:1652`, `:1667`; `gateBankRepairUsed` (logikai) `:1189`, `:1305`.
- Két keret-réteg külön döntéssel: a fajtánkénti limit a lépésfuttatóban, és a workflow látogatási kerete
  (`workflowStepVisitsLeft`, `workflowEnsureRepairBudget`, `REPAIR_BUDGET_GRANTS` — `server/workflows/engine.ts:39-69`), amelyet
  fajtánként máshogy kérdez a kód (a csak-bank kör az animator+lektor látogatást nézi, a kapu-bankkör a dinamikus keretet is).
- `MAX_CHAIN_STEPS` kézzel összeadott képlet (`server/studio/pipeline.ts:55`); minden új javításfajtánál módosítani kell (a #169-nél
  +3 kellett) — ha elmarad, hamis „lépés-határ” hiba (élesen már előfordult: job fd62b66a).

## Cél
1. Egy táblázat (`REPAIR_KINDS`, `pipeline.ts`): fajtánként limit, a javítóút lépései, jár-e dinamikus keret.
2. Egy olvasó (`repairUse`), egy író (`spendRepair`), egy keret-döntés (`canSpendRepair`) — `server/studio/repair-ledger.ts`.
   A főkönyv a `job.output.repairLedger`-ben él; a régi mezőket a főkönyv csak OLVASSA (a telepítés előtt indult, folytatott jobok
   miatt), és egyetlen helyről, tükörként írja (a meglévő, régi mezőket vizsgáló tesztek és folytatások változatlanul működnek).
3. `MAX_CHAIN_STEPS` a táblából számolva (`1 + (MAX_AUTHOR_ROUNDS + 1) × 4 + Σ limit × lépésszám + 1`); az értéke ma 35, utána is.
4. A lépésfuttató minden javítás-döntése a főkönyvön át megy; közvetlen jelző-olvasás/-írás nem marad.

## Nem-cél
A javítások SZÁMA és logikája (limitek változatlanok), a workflow-motor kerete, a kapu-szabályok.

## Viselkedési pontosítás
A csak-bank kör keret-feltétele eddig csak az animator+lektor látogatást nézte, de a kör a kapuig fut (animator → lektor → gate);
a táblában a teljes útja szerepel, így egy elfogyott kapu-látogatás nem okozhat későbbi motor-kivételt. Dinamikus keretet nem kér
(változatlan).

## Elfogadás (EARS)
- HA egy javításfajta limitje elfogyott, AKKOR `canSpendRepair` hamis; HA van limit és a teljes út látogatható, AKKOR igaz; HA a
  látogatás elfogyott, AKKOR csak dinamikus-keretes fajtánál kér többletkeretet.
- HA egy job a régi mezőkkel indult, AKKOR a főkönyv ugyanazt a felhasználást látja (visszafelé kompatibilis).
- `MAX_CHAIN_STEPS` a táblából számolt, értéke 35; a meglévő lánc-tesztek változatlanul zöldek.
- A lépésfuttatóban a hat régi jelzőt csak a főkönyv kezeli (forrás-ellenőrzés teszttel).
- Teljes unit + a három rögzített futás visszajátszása változatlanul zöld.

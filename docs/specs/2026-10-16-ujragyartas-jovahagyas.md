# Újragyártás: a tanulási terv automatikus jóváhagyása + elakadt jobok folytatása (terv, 2026-10-16)

## Mért hiba (élő, 2026-10-16 08:45, csak olvasva)
- **Tulajdonosi jelzés:** eltűntek a piszkozatok és a futások.
- **A piszkozatok:** 44-et a tulajdonos maga törölt (07:58–08:02, egyenkénti „Törlés”; `discardedBy` = a tulajdonos). Ez rendeltetésszerű és visszaállítható.
- **A valódi hiba:** a 3 újragyártott job (`61977256`, `4a65f689`, `193cea1f`) mind `step=author, status=ok` állapotban áll.
  - A tanulási terv (outline) jóváhagyására vár: a `remanufactureFromMap` a `driveTracked`-et jóváhagyás nélkül indítja, és az a terv után `WorkflowWaiting`-gel megáll.
  - Ebben az állapotban a job sem „futó” (nem `pending`/`running`), sem piszkozat (nincs mentett lecke), ezért a lista nem mutatja, és a gyártás nem halad.
  - A feltöltéses út (`driveOneStep`) ugyanezt a pontot automatikusan jóváhagyja (`approveOutline` → fedettségi hiánynál gépi javító kör vagy jelzéses elfogadás).

## Cél
1. **Közös automatikus jóváhagyás:** `autoApproveOutline(jobId)` a `driveOneStep` szabályával. A `driveOneStep` és az újragyártás is ezt használja (egy szabály).
2. **Az újragyártás végigmegy:** `driveRemade(jobId, owner)` a `driveTracked`-et ciklusban hívja. Ha a job a terv jóváhagyására vár, a lízing alatt jóváhagy és folytat (mint a `/approve-outline` út).
3. **Az elakadt jobok a listában:** a saját, 7 napon belüli, tervre váró jobok (`decideOneStepAction` = `approve`, nincs publikált lecke) „A tanulási terv jóváhagyására vár” jelzéssel jelennek meg.
   - Gomb: „Folytatás (a terv jóváhagyásával)” → `POST /api/studio/drafts/:jobId/continue` → `driveRemade`.
   - Törlés is van (ugyanaz az elvetés).
4. A futó gyártás látszik (változatlan).

## Nem-cél
A Studio panel kézi tervjóváhagyó útja nem változik.

## Elfogadás (EARS)
- J1: HA az újragyártás terve elkészül, AKKOR automatikusan jóváhagyódik (fedettségi hiánynál javító kör vagy jelzéses elfogadás), és a gyártás halad tovább.
- J2: HA egy saját job a terv jóváhagyására vár, AKKOR a listában „A tanulási terv jóváhagyására vár” jelzéssel, Folytatás és Törlés gombbal látszik.
- J3: A Folytatás egyetlen kéréssel indul, és utána a tétel futóként, szakaszjelzővel látszik.
- J4: Másik admin jobja nem folytatható (409).

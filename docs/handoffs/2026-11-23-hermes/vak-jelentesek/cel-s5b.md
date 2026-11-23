# Cél (tulajdonosi követelmény)

TGM S5b (`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` 11. szakasz; végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`):
változatos leckenyitás — a nyitás FORMÁJÁT és a hős NEVÉT a kód osztja ki determinisztikusan (a térkép magjából), a gyakorlóbank
módszersorrendje magból keveredik, a kiosztott forma a lecke jelölőjében tárolódik, és a lejátszó a nyitóblokk fejlécét ebből adja.
Minden a `STUDIO_LESSON_VARIETY` kapcsoló mögött (élesben KI); KI állapotban a gyártás minden kérése és a megjelenítés bájtra a főágé.

Invariáns (az S5a óta): a változatossági állapot egy futásra EGY döntés (a futás elején; folytatásnál a mentett job-állapotból;
javításnál a tárolt leckéből) — a futás közben a környezetet olvasni tilos.

Keress:
- olyan utat, ahol KI állapotban megváltozik a prompt, a bank kiosztása vagy a megjelenítés (a főághoz képest);
- a futás közbeni környezet-olvasást (az invariáns megsértését), különösen folytatásnál és javításnál;
- a jelölő (`variety.version`, `openingForm`) elvesztését vagy modelltől eredő felülírását mentés, javítás, alkalmazás során;
- nem determinisztikus kiosztást (ugyanarra a térképre és évfolyamra más forma / név / sorrend);
- a régi (jelöletlen vagy `valtozatossag-1` jelölőjű) leckék megjelenítésének változását.

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.

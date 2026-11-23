# Cél (tulajdonosi követelmény)

TGM S6a (`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` 12. szakasz; végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`):
fejezetív-készlet — hat fejezetminta, a program a tananyagterv elfogadása UTÁN determinisztikusan (a térkép magjából) kiosztja a
fogalom-fejezetekre, hogy a leckék fejezetei ne ugyanazt a blokksort kövessék. Minden a `STUDIO_LESSON_VARIETY` kapcsoló mögött
(élesben KI); KI állapotban a tervező promptja és a terv bájtra a főágé.

Invariáns (az S5a óta): a változatossági állapot egy futásra EGY döntés (a futás elején; folytatásnál a mentett job-állapotból;
javításnál a tárolt leckéből) — a futás közben a környezetet olvasni tilos.

Keress:
- olyan utat, ahol KI állapotban megváltozik a pedagógus-prompt, a terv vagy bármely kérés (a főághoz képest);
- a futás közbeni környezet-olvasást, különösen folytatásnál (mentett terv, `approvedOutline`);
- olyan kiosztást, amely megsérti a szomszéd- vagy a 40%-szabályt, nem determinisztikus, vagy az ívkapun (`shared/lesson-arc.ts`) megbukó
  fejezetet eredményez;
- a különleges fejezetek (kidolgozott feladat, leggyakoribb hibák, ellenőrzés) vagy a tulajdonos jóváhagyott tervének átírását;
- folytatott futásnál a terv kétszeri vagy eltérő átírását.

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.

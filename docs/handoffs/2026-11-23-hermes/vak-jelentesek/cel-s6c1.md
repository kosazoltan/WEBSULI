# Cél (tulajdonosi követelmény)

TGM S6c-1 (`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` 14. szakasz „Bontás” bekezdése; végrehajtás:
`docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md` „S6c” fejezete): ábrafajta-terv a kiszolgáló oldalon — az ábrakészítő a
tantárgyhoz illő ábrafajtákra kap ajánlást (csak olyan fajtára, amelynek paraméter-alakja a szerződésben le van írva), és a program
jelzi (nem kapu), ha a kész lecke nem forráshoz kötött ábráinak több mint 40%-a egy fajta (legalább 5 ábránál). Minden a
`STUDIO_LESSON_VARIETY` kapcsoló mögött (élesben KI). A megjelenítők (S6c-2) NEM részei ennek a PR-nak; a kliens és a
`lesson-visual-params.ts` nem változik.

Invariánsok: (1) a változatossági állapot egy futásra EGY döntés — futás közben a környezetet olvasni tilos; (2) KI állapotban az
ábrakészítő kérése, a telemetria és a `qualityNotes` bájtra a főágé; (3) a jelzés a VÉGLEGES (publikált) leckére szól.

Blokkoló: KI állapotban megváltozó modellkérés vagy mentett kimenet; olyan ajánlás, amely a szerződésben le nem írt fajtát nevez meg;
a gyártás megállása a jelzés miatt; más minőségi jelzés (pl. terjedelem, try-arány) elvesztése a jelzés cseréjekor.

Keress:
- a leírt fajták felismerésének hibáját (a szerződés szövegéből: részszó, sor közepi leírás, hiányzó fajta);
- a 40%-os számítás határeseteit (pontosan 40%, 5 ábra alatt, forráshoz kötött ábrák);
- folytatott futást és lektori tanításcserét: a jelzés és a telemetria a végleges leckét tükrözi-e, duplázódik-e;
- a kérés gyorsítótárazott közös előtagjának változását KI állapotban.

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.

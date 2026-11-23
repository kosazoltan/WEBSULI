# Cél (tulajdonosi követelmény)

TGM S6c (`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` 14. szakasz; végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`):
szebb, a korosztály sávszíneit használó ábrák és ábrafajta-terv — a jelölt (változatossági) leckén a folyamat-, idővonal-, tört-, térkép-,
szóépítő- és mondatelemző ábra új, sávtokenes megjelenítőt kap; az ábrakészítő a tantárgyhoz illő fajtákra kap ajánlást, és a program
jelzi (nem kapu), ha egy ábrafajta a nem forráshoz kötött ábrák több mint 40%-a. Minden a `STUDIO_LESSON_VARIETY` kapcsoló mögött
(élesben KI). Az S6b (#537) folytatása.

Invariánsok: (1) a változatossági állapot egy futásra EGY döntés — futás közben a környezetet olvasni tilos; (2) JELÖLETLEN (régi) lecke
megjelenítése bájtra / képpontra a főágé — az új megjelenítők csak jelölt leckén élnek; (3) KI állapotban az ábrakészítő kérése, a
paraméter-szerződés és a telemetria bájtra a főágé.

Blokkoló: a kiadott (jelöletlen) leckék ábráinak megváltozása vagy eltörése; KI állapotban megváltozó modellkérés; a régi ábrák
paramétereinek el nem fogadása; levágott szöveg / vízszintes oldalgörgetés 360×640, 844×390, 1280×800 nézetben a jelölt leckén.

Keress:
- olyan utat, ahol jelöletlen leckén az új megjelenítő fut (a jelölő olvasása, alapértelmezés, hiányzó kontextus);
- az `animate-blocks.tsx` átszervezésében elveszett vagy megváltozott régi viselkedést (a kivett ~100 sor hova került);
- a paraméter-szerződés bővítésében olyan fajtát / mezőt, amelyet a megjelenítő nem rajzol ki, vagy a séma nem fogad;
- a 40%-os jelzés számítását (forráshoz kötött ábrák kizárása, 5 ábra alatti lecke, kerekítés);
- futás közbeni környezet-olvasást; folytatott futásnál a jelzés kimaradását vagy duplázódását.

Megjegyzés a mérethez: a diff ~700 sor (ebből ~100 az `animate-blocks.tsx`-ből az új fájlba ÁTHELYEZETT megjelenítő-kód). Ha a méret
miatt a szelet nem ítélhető meg felelősen, mondd ki — akkor két PR-ra bontjuk (megjelenítők / ábrafajta-terv).

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.

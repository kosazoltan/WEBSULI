# Cél (tulajdonosi követelmény)

TGM S6b (`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` 13. szakasz; végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`):
több kézzelfogható feladat és változatosabb szerzői hang — a fogalom-fejezetek legalább harmada `try` blokkot kap (a fajtája a fejezet
típusából, forgatva), a kész lecke `try`-aránya jelzésként a telemetriába kerül (nem kapu), és a szerző sávonként a magból választott
leírt hangot kap. Minden a `STUDIO_LESSON_VARIETY` kapcsoló mögött (élesben KI); KI állapotban a terv, a szerzői kérés és a telemetria
bájtra a főágé. Az S6a (#536) folytatása.

Invariánsok: (1) a változatossági állapot egy futásra EGY döntés (folytatásnál a mentett job-állapotból) — futás közben a környezetet
olvasni tilos; (2) az S6a szabályai a szerzőnek átadott VÉGLEGES blokksorokon érvényesek a `try` beszúrása UTÁN is; (3) amit a program
kioszt (blokksor, try-fajta, hang), annak a szerzői KÉRÉSBEN is meg kell jelennie — a beszélgetésben csak a modell eredeti terve áll.

Keress:
- olyan utat, ahol KI állapotban megváltozik a prompt, a terv, a telemetria vagy a `qualityNotes` (a főághoz képest);
- a futás közbeni környezet-olvasást (folytatás, javítás);
- olyan kiosztást, ahol a `try`-minimum nem teljesül, a fajta nem illik a típushoz, vagy a beszúrás után azonos szomszédos sor / 40% fölötti sor keletkezik;
- a kiosztott `try`-fajta vagy hang elvesztését a szerzői kérés és a mentett terv között (friss futás, folytatás, jóváhagyott terv);
- a pontozás vagy a Próba változását a `try` miatt;
- a tulajdonos jóváhagyott tervének vagy a különleges fejezeteknek az átírását.

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.

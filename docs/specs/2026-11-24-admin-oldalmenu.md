# Admin: ragadós, összecsukható oldalsó menü

Forrás: tulajdonosi kérés, 2026-11-24 (feladat #1985), képernyőkép a bejelentkezett admin felső fülsoráról.

## Cél
- A felső csoportos fülsor legyen **oldalsó (hamburger) menü**, igényes ikonokkal.
- A menü **ragadós**: görgetéskor is látszik, a tartalom (pl. a tananyaglista) mellette görgethető, és nem csúszik a menü alá.
- A menü **összecsukható**: összecsukva a tartalom teljes szélességű. Az állapot újratöltés után is megmarad.

## Megoldás
- `AdminTabBar` → `<aside>`, 1024 px-től `sticky top-2`, legfeljebb a nézet magasságáig, belül görgethető.
  - Kinyitva 15 rem széles, a csoportfeliratokkal.
  - Összecsukva 3,5 rem széles ikonsáv; a fülek akadálymentes neve és `title`-je megmarad.
- `ADMIN_TABS_LAYOUT`: a `Tabs` szülő flex sor, az aktív tartalompanel (`role=tabpanel`) tölti ki a maradékot.
- Kapcsoló: hamburger, illetve „panel bezárása” ikon, `aria-expanded` és `aria-controls` attribútummal; az állapot a `localStorage`-ban (`websuli.admin.nav.collapsed`).
- Keskeny kijelzőn marad a tördelt csoportsor, telefonon az alsó menü — változatlanul.

## Elfogadás
- E1: 1366 px-en a menü a tartalomtól balra áll, a tetejük egy vonalban van, és a menü függőleges, legalább 200 px széles.
- E2: 2500 px görgetés után is a nézetben marad, a fülek kattinthatók.
- E3: összecsukva legfeljebb 72 px széles, a tartalom legalább 140 px-lel szélesebb, a fülek név szerint elérhetők. Újratöltés után az állapot megmarad, és nincs vízszintes túlcsordulás.

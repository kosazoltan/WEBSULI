# Cél (tulajdonosi követelmény)

Eredmény-e-mail bontás B1b (`docs/specs/2026-11-22-eredmeny-email-bontas.md`, végrehajtás: `…-bontas-vegrehajtas.md` 1b. pont; R2): a
KLIENS elküldi a kör kezdetét (`startedAt`) és — kvíznél — az utolsó válasz idejét (`lastAnsweredAt`) a végleges beküldésben, és a
7 napnál régebbi utolsó válaszú, LE NEM ZÁRT kör utólag nem megy el. A szerver (B1a, #532, élesben fut) a két mezőt opcionálisként,
szigorú sémával fogadja.

Blokkoló: ha az új kliens olyan törzset küld, amelyet a szerver szigorú sémája elutasít (400 → a tanuló eredménye elvész); ha egy
érvényes, friss kör beküldése elmarad; ha ugyanaz a kör kétszer megy el; ha a régi (mező nélküli) tárolt kör betöltése eltörik.

Keress:
- a két kör-fajta (feladat, kvíz) törzsét a `shared/lesson-result-email.ts` `resultRequestSchema` sémájához mérve (melyik mező melyik
  fajtánál megengedett; nulla / hiányzó kezdés);
- a korhatár határeseteit (pontosan 7 nap; lezárt kör; kezdés nélküli kör; régi tárolt kör `lastAnsweredAt` nélkül; az óra visszaállítása);
- a `localStorage`-ban tárolt régi körök betöltését az új sémával, és a körazonosító (`roundId`) változatlanságát;
- regressziót a feladatkör beküldésében, a döntőbíró-várakozásban és az újrapróbákban;
- a böngészős teszt valódiságát (a korhatár-teszt a javítás nélkül bukik-e).

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.

# Főoldal: felső régió és eszközsor

Forrás: tulajdonosi kérés, 2026-11-24 (feladat #1984), képernyőkép a nyilvános főoldalról.

## Cél
- A „Tananyagkészítést támogatja” kártya kerüljön a Hero mellé, **négyzetes** elrendezésben. A Hero ennyivel keskenyebb.
- A Hero-sor alatt az **adventi naptár**, alatta a **„Szia! Hogy hívnak?”** kártya.
- Ezek alatt egy sorban, **teljes szélességben**: az osztályválasztó, a kereső és a nézetváltó (Legfrissebb / Tantárgyanként).

## Megoldás
- `home-top` rács: 1024 px-től `minmax(0,1fr) auto` két oszlop, a két elem egyforma magas. Keskenyebb kijelzőn egymás alá kerülnek.
- `SponsorBar variant="tile"`: felirat fölül, a két logó egymás alatt, 1:1 oldalarány (212 px). Az alapváltozat változatlan.
- `home-toolbar`: 1024 px-től sorba rendezett flex. Az osztályválasztó legfeljebb 52%, a kereső tölti ki a maradékot, a nézetváltó nem törik. Keskeny kijelzőn a mostani egymás alatti rend marad, és nincs vízszintes görgetés.
- Az advent-kártya helye és magassága (A44–A48) nem változik. A régi forrásőr-tesztek sorrendi elvárása dokumentált spec-változással igazodik.

## Elfogadás
- E1: 1440 és 1100 px-en a csempe a Hero jobb oldalán, egy vonalban, azonos magasságban áll, oldalaránya 0,8–1,6. Alatta jön az advent, a Szia-kártya, majd az eszközsor.
- E2: az eszközsor három eleme egy sorban áll, a sor teljes szélességű, a kereső legalább 240 px széles.
- E3: 390 px-en minden egymás alatt van, vízszintes görgetés nélkül.

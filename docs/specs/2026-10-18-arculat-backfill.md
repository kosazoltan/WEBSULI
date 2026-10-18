# A meglévő leckék arculatának mentése az adatbázisba (backfill) — terv

**Tulajdonosi engedély (2026-10-18):** „A régi leckék arculatának mentése az adatbázisba: … engedélyezem.”

## Helyzet
- **Új vagy javított lecke:** mentéskor kap `json.art`-ot (`withLessonArt`: tantárgyikon, témaköri borító vagy hőskép, 1–5.
  évfolyamon kabala, témakör).
- **A korábban mentett leckék** (éles mérés 2026-10-17: 24-ből 24): `art` nélküliek. A lejátszó futás közben választ (a lecke
  azonosítója a mag), de **témaköri borító nélkül**; a választás nem rögzül.

## Cél
- **A mentés:** minden `art` nélküli lecke `json.art`-ja a mentéskori szabállyal számolódjon ki, és kerüljön az adatbázisba.
  - Ugyanaz a függvény számol, mint mentéskor: a `withLessonArt` tiszta magja (`computeLessonArt`).
  - A mag a lecke azonosítója, mint a lejátszóban és a javításnál.
- **Ennek hatása:** a régi leckék is a témakörükhöz illő borítót kapják, és a kép ezután nem változik.

## Nem-cél
- Már `art`-tal rendelkező lecke felülírása.
- A lecke más mezőjének módosítása; a verziószám sem nő, mert ez csak megjelenési metaadat.

## Biztonság
- **Futtatás:** a szkript alapból csak olvas (próbafutás: lista leckénként a kiválasztott elemekkel); írni a `--write` kapcsolóval
  ír, egyetlen tranzakcióban.
- **Mentés:** írás előtt az érintett leckék azonosítója és a teljes korábbi `json`-ja a munkamenet ideiglenes mappájába kerül.
- **Visszaállítás:** a `json` `art` kulcsának törlése, vagy a mentett `json` visszaírása (a szkript `--restore <fájl>`).
- **Ütközés:** csak ott ír, ahol a sor `json->'art'` még üres (`WHERE json->'art' IS NULL`).
- **Időzítés:** csak akkor fut, ha élesben nincs futó munkafolyamat.

## Elfogadás (EARS)
- HA a backfill lefutott, AKKOR minden `art` nélküli lecke kap `art`-ot, a többi változatlan.
- HA egy lecke `art`-ot kapott, AKKOR a lejátszó az adatbázisból tölti a képeit (`/api/design-assets/<id>`).
- Az írás után egy második próbafutás 0 érintett leckét mutat.

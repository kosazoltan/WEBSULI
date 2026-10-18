# Tanmenet-rendezés kiegészítése: tartalom szerinti illesztés és nyelvi tanmenet — terv

**Tulajdonosi kérés (2026-10-18):**
- A 73 illeszthetetlen anyagból a nyelvi anyagokhoz: „keress egy olyan dokumentumot az interneten ahol valamelyik iskola leírja a
  sajátját és igazítsd ahhoz … magyar iskola, de lehet idegen tannyelvű is”.
- Az évfolyam nélküli és az általános című anyagokhoz: „olvass bele, kiderül belőle”.
- Kiegészítés: „Az informatikai anyagot hagyd, kevés és külön mappa az átlátható.”

## 1. Tartalom szerinti illesztés (általános című anyagok)
- **Mikor:** ha a cím önmagában nem illeszthető, a tartalom alapján próbálkozik:
  - HTML-anyagnál a h1–h3 címsorok;
  - strukturált leckénél a magyarázó blokkok félkövér kulcsfogalmai.
- **Pontozás:** a tartalom szavai fél súllyal számítanak, a küszöb szigorúbb (`HINT_MIN_SCORE`).
- **Szűkítés:** csak az elsődleges tantárgy tanmenetében keres. Ha a cím legalább két tartalmas szót ad, a választott órához a
  címnek is hozzá kell járulnia.
- **Teljesítmény:** a tartalmat a szerver csak a cím alapján nem illeszthető anyagokhoz olvassa be, egyszer; memóriában tartja, és
  a lista-gyorsítótár érvénytelenítésekor üríti.
- **Mérés (éles, csak olvasás):** +5 illesztés, mind helyes:
  - 4. osztályos nyelvtani összefoglaló;
  - 6. osztályos gyakorló feladatlap;
  - 8. osztályos algebra és szöveges feladatok;
  - 9. osztályos Medve-verseny.

  A tévesek (Mezopotámia → hon- és népismeret, Nagy-Britannia → Amerika, Igekötők → Mondatfajták) a szűkítések után eltűntek.

## 2. Évfolyam nélküli (0) anyagok
- **Tartalmuk átnézve:** haladó, felnőtt fejlesztői útmutatók (JWT/OAuth, RBAC, Replit AI, VS Code + Claude Code, Suno AI).
- **Tulajdonosi döntés:** külön informatikai mappa, nem kapnak tanmenet-pozíciót.

## 3. Nyelvi tanmenet (angol, francia)
- **Forrás:** egy magyar (vagy idegen tannyelvű) iskola nyilvános tanmenete, évfolyamonként, a témák tanítási sorrendjével
  (hónap / hét / óraszám). A forrás és az iskola neve a kódban rögzítve.
- **Adat:** `server/data/nyelvi-tanmenet.json`, a NAT-tanmenettel azonos formában (évfolyam, tantárgy, órák / egységek sorrendje).
  Az illesztő ugyanazzal a módszerrel kezeli.

## Nem-cél
- A tárolt anyagok módosítása; az évfolyam nélküli anyagok átsorolása.

## Elfogadás (EARS)
- HA egy anyag címe nem illeszthető, de a tartalma egyértelműen egy tanmenet-órához tartozik, AKKOR a tartalom szerinti pozíciót
  kapja.
- HA egy nyelvi anyag témája szerepel az iskolai tanmenetben, AKKOR a tanmenet szerinti pozíciót kapja.
- Évfolyam nélküli anyag nem kap pozíciót.

## Megvalósítás és mérés (2026-10-18)
- **Nyelvi források** (évfolyamonként egy; a teljes kutatási lista: `source/scripts/curriculum/nyelvi-forrasok.json`):

  | Nyelv, évfolyam | Iskola | Forma |
  |---|---|---|
  | angol 3. | Gárdonyi Ált. Isk., Kaposvár | 8 téma × 4 óra, kulcsszavakkal |
  | angol 4. | Baracska | havi tanmenet, 106 óra |
  | angol 5., 7., 8. | DE Kossuth Lajos Gyakorló (NAT 2020) | témák óraszámmal |
  | angol 6. | Tamási Áron Ált. Isk. | 22 egység, nyelvtani kulcsszavakkal |
  | francia 8. | DE Kossuth Lajos Gyakorló | 10 téma, kulcsszavakkal |

  Havi bontású iskolai tanmenet csak az angol 4. évfolyamra volt nyilvános; a többinél a témák sorrendje és óraszáma adja a
  pozíciót.
- **Tantárgy-felismerés:**
  1. kimondott név;
  2. kulcsszó;
  3. a hivatalos tanmenet szókincse (évfolyam × tantárgy, egyértelmű előnnyel).

  Javítva: a „halmaz” csak önálló szóként matematika („Halmazállapot” nem).
- **Éles mérés (csak olvasás):**
  - cím alapján 143 / 209 (korábban 135);
  - tartalommal együtt 149 / 209;
  - a 10 évfolyam nélküli informatikai anyag szándékosan illesztés nélkül marad.
- **Ismert határ:** az iskolai nyelvi tanmenetek témaszintűek; ahol a tananyag nyelvtani pontot tanít, amit a tanmenet nem nevez
  meg, ott nem illeszkedik, vagy csak közelítően.

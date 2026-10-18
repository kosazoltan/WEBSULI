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

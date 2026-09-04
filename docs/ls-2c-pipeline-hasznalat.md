# LS-2c — A lecke-pipeline életre kelt: így fogod használni

**Mi változott (2026-09-04):** a lecke-készítő gépsor eddig csak „tudta, mi lesz a
következő lépés", de igazi munkát nem végzett — a drága modellhívások (pedagógus,
szerző, lektor) nem voltak bekötve. Ezzel a szelettel a gépsor **ténylegesen le tud
futni**: vázlat, jóváhagyás, teljes lecke, ellenőrzés.

## Amit kapsz

A következő admin-végpontok élnek (`/api/studio`, csak adminnak):

| Végpont | Mit csinál |
|---|---|
| `POST /lessons/from-map/:mapId` | Új lecke-gépsort indítanak egy jóváhagyott térképből. A szervező lépésből (`jobId`) kezdődik |
| `GET /jobs/:id` | Megmutatja, hol tart a gépsor, mi készült el eddig |
| `POST /jobs/:id/approve-outline` | **A gép javasol, te döntesz:** a pedagógus vázlatát itt hagyod jóvá — csak ezután ír a szerző teljes leckét |
| `POST /jobs/:id/resume` | Elakadt / megszakadt gépsort léptet tovább. Ha ugyanazzal a bemenettel már kifizettünk egy modellhívást, **nem fizet kétszer** |

## Hogyan fut egy lecke

1. **Pedagógus:** a jóváhagyott térképből vázlatot készít. Gép ellenőrzi: minden
   kulcsfogalom benne van, a kiegészítők legalább 90%-a, és nincs kitalált fogalom.
   Ahol a vázlat „csal", a gépsor megáll, és pontosan megmondja, mi hiányzik.
2. **Te jóváhagyod** a vázlatot (`approve-outline`). A gép ekkor **újraellenőrzi** a
   térképpel — nem hisz a kliensnek, amit küldesz, azt a szerver is megméri.
3. **Szerző:** teljes leckét ír. Ő is ellenőrizve lesz: ami nem köthető a térképhez,
   az nem mehet ki.
4. **Lektor:** egy **másik modellcsaládból** (szándékosan — a gép ritkán veszi észre
   a saját hibáját) újraolvassa a leckét. Közölni tud, írni nem: a blokkolókat
   visszaküldi a szerzőnek (maximum **2 javítási kör**), a könyv tévedését pedig —
   a D1 szabálynak megfelelően — csak **neked jelzi admin-jegyzetként**, a leckét
   bájtra sem változtatja.
5. **Kapu:** ha a lektor nem talált blokkolót, a gépsor a kapuhoz ér, ahol a lecke a
   publikálás előtt várakozik (a kapu teljes gépesítése a következő szelet).

## Biztonságos viselkedések, amikre érdemes tudni

- **Félkész eredmény nincs.** Ha a modell hibát mond, üres választ ad, vagy a JSON-ja
  hibás, a gépsor `error`-ba megy — soha nem visz tovább torzó leckét.
- **Kulcs nélkül szépen megáll.** Ha nincs `OPENROUTER_API_KEY`, a gépsor hibára fut
  egy magyar üzenettel ahelyett, hogy a szerver elszállna.
- **Két kör után ember dönt.** Ha a lektor a 2. javítási kör után is blokkolót talál,
  a gépsor megáll „emberi döntés szükséges" felirattal — nem fizettetünk végtelen
  köröket.
- **Egy fizetés, egy bemenet.** Ugyanaz a lépés ugyanazzal a bemenettel csak egyszer
  fut le; az ismétlés a tárolt eredményt adja vissza.

## Amit MÉG nem kapsz ebben a szeletben

- **Admin képernyő a gépsorhoz.** A végpontok szerveroldalon készen vannak, a Studio
  felületén gombok még nincsenek hozzájuk (a térképszerkesztő megvan, a job-monitor és
  a vázlat-jóváhagyó képernyő a felületi szeletben jön).
- **A publikálási kapu gépesítése** (5. pont: a lecke a kapunál vár).
- **Animáció, gyakorlat-blokkok, hang** — a 4. szelet tartalma.
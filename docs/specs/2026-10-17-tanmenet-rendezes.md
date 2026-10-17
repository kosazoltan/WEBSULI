# Tananyaglista a NAT 2020 tanítási menetrendje szerint — terv

**Tulajdonosi kérés (2026-10-17):**
> „A tananyagok listában történő megjelenítéséhez olvasd be első osztálytól tizenkettedik osztályig a NAT 2020 tanterv
> menetrendjét, és mindig az adott időszakban, adott hónapban, adott hétben aktuális tananyagokat vedd legelőre. […] mindig azt
> lássa a gyerek, ahol éppen tarthat a tananyagban. […] A főképernyőn, […] illetve akkor is, amikor a tanuló belép a saját
> évfolyamába, ugyanez a rendezőelv érvényesüljön.”

**Szándék:** a tanuló keresgélés nélkül az éppen tanult témát lássa elöl. A meglévő (gyártás szerint rendezett) anyagok így újra
hasznosulnak.

## Forrás (ellenőrzött, 2026-10-17)
- **Oktatási Hivatal, „A 2020-as NAT-hoz illeszkedő tartalmi szabályozók — Mintatanmenetek”:**
  - oldal: https://www.oktatas.hu/kozneveles/kerettantervek/2020_nat/mintatanmenetek (évfolyamonként `…/tanmenet_<N>evf`);
  - 256 tantárgyi tanmenet letöltve (1–12. évfolyam, a nálunk használt tárgyak; .docx, a 17 régi .doc LibreOffice-szal alakítva);
  - **óráról órára** sorolja a témaköröket és az óracímeket.
  - Feldolgozva 283 évfolyam-tanmenet. A kétéves fájlok (pl. Fizika 7–8.) évfolyamjelölés szerint, ennek hiányában felezve.
  - Idegen nyelvi mintatanmenetet az OH nem adott ki.
- **A tanév rendje (Nemzeti Jogszabálytár):**
  - 2026/2027 (1/2026. (VII. 31.) OGYM rendelet): első tanítási nap 2026-09-01, utolsó 2027-06-18;
    - szünetek: őszi 10-23–11-01, téli 12-19–01-03, tavaszi 03-25–04-04;
  - 2025/2026 (27/2025. (VII. 24.) BM rendelet) is.

## Megoldás
1. **Tanmenet-adat (`server/data/tanmenet-2020.json`):**
   - évfolyamonként és tantárgyanként az órák sorrendje (témakör, óracím) és a forrás-URL;
   - a kinyerő szkriptek a repóban (`scripts/curriculum/`), a dokumentumok nem.
2. **Időbeli pozíció:**
   - az *n*-edik óra a tanév tanítási napjainak *n/N*-edik részére esik;
   - a tanítási napok a tanév rendje szerint számolódnak, a szünetek kimaradnak;
   - „ma” ugyanígy egy 0–1 közötti pozíció; nyári szünetben a tanév eleje.
3. **Anyag → tanmenet-óra illesztés (szerveren):**
   - Keresési kör: az anyag évfolyama, és a címből felismert tantárgy. Ismeretlen tantárgynál az évfolyam minden tanmenete.
   - Pontozás: a cím és az óra témaköre + címe közötti szóegyezés, IDF-súllyal, ékezet nélkül, tőalapon.
     - Az általános szavak („tananyag”, „interaktív”, „osztály”, „témazáró” …) nem számítanak.
   - Küszöb alatt nincs illesztés.
   - **Idegen nyelv és ünnepi téma:** évszakos kulcsszavak rögzített időponttal:
     - Halloween → október vége;
     - karácsony / Christmas → december;
     - húsvét / Easter → április;
     - farsang → február;
     - március 15., október 23., anyák napja (május).
4. **API:**
   - a `GET /api/html-files` minden anyaghoz megadja: `curriculum: { pos, label } | null`;
   - a szerver gyorsítótárában számolódik, a cím módosításakor újra.
5. **Rendezés a kliensen** (a főképernyő listája = az évfolyamválasztó szűrt listája, `UserFileList`):
   - **Elöl:** a menetrend szerint „most” tanult anyag, utána a közelgő, majd a nemrég tanult;
     - a távolság a tanévben számolt pozíciók között mérődik;
     - a már tanult anyag távolsága 1,5-szörös súlyt kap: előbb a következő hetek, utána az ismétlés.
   - **Hátul:** a tanmenethez nem illeszthető anyag, a mai sorrendben (legújabb elöl).
   - **Jelölés:** az aktuális (±2 hét) anyag kártyáján egy kis „Most tanuljuk” jelölés.
   - **Az előző / következő lecke navigáció** (`lessonNeighbours`) ugyanazt a sorrendet követi.

## Nem-cél
- A tárolt anyagok módosítása.
- A régi admin-sorrend (`displayOrder`) megtartása. A tanulói lista ma is figyelmen kívül hagyja (createdAt szerint rendez).
- Iskolánként eltérő tanmenet.

## Szélső esetek
- **Évfolyam nélküli (0) anyag:** nincs illesztés, a lista végén marad.
- **Több tanmenet-változat** (TA/TB, heti 3 vagy 4 órás): a legjobban illeszkedő változat pozíciója számít.
- **Kétéves blokk:** az anyag évfolyamához tartozó fél.
- **Nyári szünet:** a „ma” a következő tanév eleje (szeptember eleji témák elöl).
- **Téves illesztés kockázata:** a küszöböt a 207 éles anyag kézi átnézésével kell beállítani; a mérést a PR tartalmazza.

## Elfogadás (EARS)
- HA a tanuló megnyitja a listát (vagy kiválasztja az évfolyamát), AKKOR az elöl álló anyagok a tanmenet szerinti mai témához a
  legközelebbiek.
- HA az anyag nem illeszthető, AKKOR a lista végére kerül, a mai sorrendben.
- HA a dátum a tanév szünetére esik, AKKOR a szünet előtti / utáni tanítási nap pozíciója számít.
- A 207 éles anyagból legalább 60% illeszthető, és a szúrópróbában nincs nyilvánvalóan téves illesztés.

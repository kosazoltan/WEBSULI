# PROJEKT-MEMÓRIA — a teljes WEBSULI projekt-memória helyi SQL-ben

**Állapot:** folyamatban – 2026-11-26, ág `feat/projekt-memoria-sql` (feladat: `PROJEKT-MEMORIA-SQL`)

## Cél

Tulajdonosi utasítás (2026-11-26): a fejlesztés állapota ne csak MD-fájlokban és kanbanon, hanem a helyi SQL adatbázisban legyen
vezetve és egy helyről látható: a **folyamatok**, a **kiadott utasítások**, a **végrehajtott utasítások**, az **elvégzett kódolás**,
a **lezárt folyamatok**, a **hátralékok**, a **hiányosságok** és a **továbbra is elvégzendő feladatok** — a repó szabályai szerint.

A meglévő rendszer (K-FELADATDB, `scripts/kovetelmeny/`) ennek nagy részét már tárolja: követelmények (a munkamenet-üzenetekből,
specekből, PR-okból gyűjtve — `requirements`, `sources`), feladatok (`tasks` + egységek, feltételek, PR / commit kapcsolatok,
idővonal), revíziós leletek (`findings`). Ami hiányzik:

1. **Kiadott utasítás mint saját sor**: a tulajdonos utasítása a beérkezés pillanatában, szó szerint (maszkolva) rögzítve, a hozzá
   tartozó feladat(ok)kal és a végrehajtás állapotával / bizonyítékával. A gyűjtő (`gyujt.py`) a munkamenet-üzeneteket utólag,
   mintákkal köti követelményhez — ez megmarad, de a végrehajtás nyoma (melyik utasítás, mikor, mivel teljesült) eddig nem volt
   közvetlenül lekérdezhető.
2. **Folyamat-futások**: kapulánc, deploy, e2e / unit mérés, modell-elemzés, revízió — indulás, vége, eredmény, összegzés,
   bizonyíték (log-útvonal, SHA). Eddig csak a láncok kimeneti fájljaiban (D:/tmp) és a beszélgetésben éltek.
3. **Egy képernyős projekt-memória jelentés**, amely a fenti nyolc kérdésre egyszerre felel, és gépileg is olvasható (`--json`).

## Nem cél

- A meglévő táblák (`sources`, `requirements`, …, `tasks`, `task_*`) szerkezetének módosítása — csak ÚJ táblák és nézetek.
- A kanban vagy az MD-k írása (olvasva maradnak).
- A DB repóba tétele: a fájl a repón KÍVÜL marad (`%LOCALAPPDATA%\hermes\projekt-tudas\websuli\kovetelmenyek.db`), mert a
  kérésekben valódi nevek lehetnek; a repóban a séma, a szkriptek, a tesztek és a skill vannak.

## Döntések

- D1 Új modul: `scripts/kovetelmeny/memoria.py` (a `feladat.py` 1200 soros; a kapcsolat a `feladat.connect`-en át ugyanaz a DB).
  Saját, idempotens migráció, verzió: `feladat_meta.memoria_sema_verzio`.
- D2 `utasitasok(id, at, forras tulajdonos|ugynok, szoveg, task_code, requirement_code, allapot, vegrehajtva_at, bizonyitek,
  dedupe UNIQUE)` — `allapot`: `kiadva → folyamatban → vegrehajtva` (+ `reszben`, `felulirva`, `elvetve`). A `vegrehajtva` csak
  bizonyítékkal (commit / PR / mérés / élő ellenőrzés) állítható. `felulirva` esetén `felulirta` = az újabb utasítás id-je (az újabb
  utasítás felülírja a régit). Szöveg: `maszk.py`.
- D3 `folyamatok(id, fajta, ref, task_code, started_at, finished_at, eredmeny fut|ok|bukott|megszakadt, osszegzes, bizonyitek)` —
  `fajta`: `kapulanc|deploy|e2e|unit|elemzes|revizio|szinkron|egyeb`. A hosszan „fut” állapotú sor (> 24 óra) a jelentésben
  `elakadt`-ként látszik.
- D4 Jelentés: `memoria.py jelentes [--napok 7] [--json]` — szakaszok: Kiadott utasítások (nyitott), Végrehajtott utasítások
  (időszakban), Futó folyamatok, Lezárt folyamatok (időszakban), Elvégzett kódolás (a main commitjai az időszakban, `Állapot:`
  sorral — a gyűjtő `sources(kind=commit)` soraiból, ennek híján `git log`), Lezárt feladatok (időszakban), Hátralék (nyitott
  feladatok prioritás szerint, %-kal), Hiányosságok (nyitott leletek súlyosság szerint + `elvart|reszben|elfelejtett`
  követelmények), Teendők (a nyitott feladatok következő lépései).
- D5 A kapulánc-futtató (Hermes-agent `scripts/websuli-lanc/lanc-futtat.sh`) indításkor / befejezéskor `folyamat-start` /
  `folyamat-vege` sort ír, ha a modul elérhető (hiánya nem állítja meg a láncot).

## Elfogadás

- [ ] Üres és meglévő DB-n a migráció idempotens; a régi táblák sorszáma nem változik.
- [ ] Utasítás felvehető, feladathoz köthető, végrehajtottnak csak bizonyítékkal jelölhető; felülírás a régit `felulirva`-ra állítja.
- [ ] Folyamat indítható / zárható; a nyitva felejtett (> 24 h) futás `elakadt`.
- [ ] A jelentés mind a kilenc szakaszt adja szövegben és `--json`-ban; a maszkolás a kimenetben is érvényes.
- [ ] A lánc-futtató integráció egy valódi kapuláncon sort ír (mérve).

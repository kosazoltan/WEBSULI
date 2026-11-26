Terv: `docs/specs/2026-11-26-projekt-memoria-sql.md`

# Végrehajtás — PROJEKT-MEMORIA-SQL

1. Bukó tesztek: `scripts/kovetelmeny/test_memoria.py` (ideiglenes DB a `test_feladat.py` mintájára) — migráció idempotens és a régi
   táblákat nem érinti; utasítás felvétel / bizonyíték nélküli végrehajtás elutasítva / felülírás; folyamat indítás / zárás / elakadt;
   jelentés kilenc szakasza (szöveg + JSON); maszkolás.
2. Kód: `scripts/kovetelmeny/memoria.py` (séma, parancsok: `utasitas`, `utasitas-allapot`, `folyamat-start`, `folyamat-vege`,
   `jelentes`), README-szakasz, a `websuli-feladat-nyilvantartas` skill kiegészítése (mikor kell utasítást / folyamatot rögzíteni).
3. Hermes-agent: `lanc-futtat.sh` folyamat-sorok (külön commit a Hermes-agent repóban), mérés egy valódi láncon.
4. Visszatöltés: a 2026-11-26-i tulajdonosi utasítások és a futó láncok felvétele.

Állapot: PROJEKT-MEMORIA 1/3 egység kész — következő: bukó tesztek

# K-FELADATDB — végrehajtási utasítás

Terv: `docs/specs/2026-11-25-feladat-nyilvantartas.md`. Ág: `feat/feladat-nyilvantartas` (munkafa `.claude/worktrees/feladat-db`).
Szeletnév az `Állapot:` sorokban: `feladat-db`; egységek (8): spec → RED → séma/állapotgép → CLI → szinkron → visszatöltés → skill +
integráció → próbahiba + zárás.

1. Spec + ez a fájl (docs-commit, a kód előtt).
2. RED: `scripts/kovetelmeny/test_feladat.py` (unittest, ideiglenes DB; `python -B -m unittest discover -s scripts/kovetelmeny -p
   "test_*.py"`) — migráció idempotens és a meglévő táblák sorszáma változatlan; állapotgép (érvényes / érvénytelen átmenet,
   `kesz` csak teljesült feltételekkel, lezárt újranyitása csak `--force`-szal); pct (egység + feltétel; állapot-alapú tartalék);
   `Állapot:` sor parsolása (fázis, „— kész, következő:”, gondolatjel / kötőjel); szinkron idempotens (ideiglenes git-repón, gh
   nélkül); maszkolás (e-mail, token a DB-ben nem jelenik meg); követelményből képzett feladat; visszatöltés idempotens.
   `scripts/qa/gates/feladat-szinkron.test.mjs`: a kapu-segéd nem blokkoló (hiba, időtúllépés, hiányzó DB, kikapcsolás).
3. GREEN 1: `feladat.py` séma + migráció + állapotgép + `v_keszultseg` / `v_nyitott` / `v_kapcsolo_dontesek`.
4. GREEN 2: alparancsok (`uj`, `terv`, `allapot`, `esemeny`, `kriterium`, `egyseg`, `kapcsol`, `kapcsolo`, `lista`, `tetel`,
   `attekintes`, `kereses`), `--json`, maszkolás, FTS.
5. GREEN 3: `szinkron` (git, gh, spec, kovetelmeny), idempotens; valódi repón kétszer futtatva.
6. GREEN 4: `feladatok.json` + `visszatoltes`; a valódi DB-n (előtte mentés `kovetelmenyek.db.bak-<időbélyeg>`), előtte/utána
   sorszámok.
7. Skill `websuli-feladat-nyilvantartas` + tükrök + `gates.config.json` + skills-sync-check (7); revízió-skill hivatkozás; README;
   `feladat-szinkron.mjs` bekötése a `pre-pr-gate` és `pre-merge-gate` végére (nem blokkoló).
8. Próbahiba a commit után, tiszta munkafán (`git status --porcelain` üres): az állapotgép-őr kikapcsolása → teszt bukik →
   `git checkout` visszaállítás; eredmény ebbe a fájlba. Push / PR / merge a szülő kapuláncával.

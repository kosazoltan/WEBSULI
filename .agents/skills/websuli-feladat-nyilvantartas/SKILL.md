---
name: websuli-feladat-nyilvantartas
description: Use when starting, slicing, opening a PR, merging or closing WEBSULI work. Track tasks in SQL.
---

> Felejthető lépés = szkript, automatikusan: ismétlődő kézi lépést szkriptbe + hookba/kapuba kötni; a futás végét a Stop hook (`loop.mjs auto` + `check`) zárja — lásd ~/.claude/CLAUDE.md.

# WEBSULI feladat-nyilvántartás (K-FELADATDB) — az SQL az igazság forrása

Tulajdonosi döntés (2026-11-25): a beadott és elvégzett feladatokat, a teljesülést és a készültségi fokot a helyi SQL
adatbázis kíséri, nem a kanban / MD. Adatbázis: `%LOCALAPPDATA%\hermes\projekt-tudas\websuli\kovetelmenyek.db` (repón kívül, a
követelmény-DB-vel közös fájl). Eszköz: `python -B scripts/kovetelmeny/feladat.py` (`--json` gépi kimenet; `--help`). Terv és séma:
`docs/specs/2026-11-25-feladat-nyilvantartas.md`, `scripts/kovetelmeny/README.md`. A kanbant és az MD-ket csak OLVASD / hivatkozd.

## Mikor fusson (kötelező)

| Pillanat | Parancs |
|---|---|
| Munkamenet / folytatás eleje, tömörítés után | `feladat.py szinkron` → `feladat.py attekintes` (25 sor: %, következő lépés, blokkoló, PR) |
| Új tulajdonosi kérés | `memoria.py utasitas "<a kérés szövege>" --feladat <KÓD>` (kiadott utasítás, beérkezéskor) + `feladat.py uj <KÓD> "<cím>" --cel … --kovetelmeny <K-kód> --prio 1-5`; az újabb utasítás a régit `--felulirja <id>`-vel váltja |
| Kapulánc / deploy / hosszú mérés / modell-elemzés | `memoria.py folyamat-start <fajta> <ref> --feladat <KÓD>` → `folyamat-vege <id> ok\|bukott\|megszakadt --osszegzes … --bizonyitek <log/SHA>` (a `lanc-futtat.sh` a láncokat magától írja) |
| Utasítás teljesült | `memoria.py utasitas-allapot <id> vegrehajtva --bizonyitek "<PR/commit/mérés/élő ellenőrzés>"` (bizonyíték nélkül elutasítja) |
| Szelet tervezése (spec után) | `feladat.py terv <KÓD> --egyseg "RED" --egyseg "GREEN …" --kriterium "<mérhető feltétel>"`; `uj … --szelet <név> --ag <ág> --spec <út> --szulo <szülő>` |
| Minden commit | a `Állapot: <szelet> k/n egység kész — következő: …` sor (a szinkron ebből vezeti az egységeket és a következő lépést) |
| Szelet vége, PR-nyitás, merge / deploy után | `feladat.py szinkron` (a `gate:pr` és a `gate:merge` végén automatikusan is fut, nem blokkoló) |
| Élesítés / élő ellenőrzés | `feladat.py allapot <KÓD> elesitve\|elo_ellenorizve --bizonyitek "<mérés>"`; kapcsoló-döntés: `feladat.py kapcsolo <NÉV> <érték> --forras "tulajdonos <dátum>" --feladat <KÓD>` |
| Elfogadási feltétel igazolva | `feladat.py kriterium <KÓD> <n> --teljesult --bizonyitek "<commit/PR/fájl:sor/mérés>"` |
| Akadály | `feladat.py allapot <KÓD> blokkolt --blokkolo "<mi és kire vár>"` |
| Munkamenet zárása (záró hurok előtt) | `feladat.py szinkron` + `memoria.py jelentes --napok 1` (kiadott / végrehajtott utasítás, folyamat, kódolás, hátralék, hiányosság, teendő); minden félbehagyott teendő legyen feladat (`uj`) következő lépéssel, minden nyitott futás lezárva |

## Szabályok

- Állapotgép: `beadva → tervezve → folyamatban → review → beolvadt → elesitve → elo_ellenorizve → kesz` (előre ugorható; hátra csak
  `review|beolvadt|elesitve → folyamatban`); mellék: `blokkolt`, `elvetve`, `felulirva`. `kesz` csak teljesült feltételekkel; lezárt
  újranyitása `--force --indok`. A szinkron csak előre léptet, a `blokkolt`-at és a lezártat nem írja felül.
- A `%` számított (egység + feltétel + gyerekfeladatok; `~` = állapotból becsült) — kézzel nem írható; ha pontatlan, a tervet
  (egység / feltétel) pontosítsd.
- A szelet `szelet` neve egyezzen az `Állapot:` sor első szavával (pl. `D1H-2`), és a feladat `--ag`-a a munkaág legyen — így
  köti a szinkron a commitokat és a PR-t. A „feladat nélküli Állapot-szeletek” listáját nézd át: új munka → `uj`.
- Gazdátlan nyitott PR → automatikusan `PR-<n>`; a követelmény-DB nyitott tételei (és a revízió leletei a gyűjtés után) →
  automatikusan feladat. Felülírt utasítás: `allapot <régi> felulirva --bizonyitek <új kód>`.
- Minden szöveg maszkolva kerül a DB-be; titkot, valódi e-mail-címet akkor se írj bele. Éles beállítást ez az eszköz nem olvas és nem ír.

## Lekérdezés-minták

- Projekt-memória egy képernyőn: `memoria.py jelentes [--napok 7] [--json]`; `memoria.py utasitasok --nyitott`.

- `feladat.py attekintes [--minden]`, `lista --nyitott --allapot review,blokkolt`, `tetel <KÓD>` (egységek, feltételek, hivatkozások, idővonal),
  `kereses "kivágott kép"`, `kapcsolo` (tulajdonosi döntés vs. legutóbb mért élő érték: ELTÉR / egyezik / nem mért).
- SQL (csak olvasva: `sqlite3 "file:<db>?mode=ro"`): `SELECT code,status,pct,next_step,blocker,pr,pr_state,szalak FROM v_nyitott
  ORDER BY priority`; `SELECT * FROM task_events WHERE task_id=(SELECT id FROM tasks WHERE code='<KÓD>') ORDER BY at`.

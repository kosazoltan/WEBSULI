# K-FELADATDB — folyamatos SQL feladat-nyilvántartás a helyi követelmény-adatbázisban

**Állapot:** folyamatban – 2026-11-25, ág `feat/feladat-nyilvantartas` (követelmény-kód: `K-FELADATDB`)

## Cél

Tulajdonosi utasítás (2026-11-25): a 180 napos követelménygyűjtés tapasztalatai alapján a beadott feladatokat, az elvégzett munkát, a
teljesülést és a készültségi fokot SQL adatbázis kísérje folyamatosan, mert a szöveges kanban- és MD-nyilvántartásnál pontosabb.
Egy lekérdezéssel látszódjon: mi a feladat, mi a terve (egységek, elfogadási feltételek), hol tart (állapot + MÉRT készültség),
melyik PR / commit / spec / kapcsoló tartozik hozzá, mi blokkolja, mi a következő lépés — és ez a munka közben automatikusan
frissüljön (commitok `Állapot:` sora, PR-állapot, review-szálak, merge), ne kézi MD-szerkesztéssel. A kanban és az MD-k megmaradnak,
de csak OLVASVA (import / hivatkozás); az igazság forrása az SQL.

## Nem cél

- A Hermes-szintű, Docker-Postgresben futó `feladat.mjs` nyilvántartás kiváltása (az a gépszintű, több repós lista marad; a gyűjtő
  `task` forrásként már beolvassa, innen követelményen át feladat lesz).
- A kanban írása, éles beállítás (Render env) olvasása vagy módosítása.
- A meglévő követelmény-táblák (`sources`, `requirements`, `requirement_links`, `flags`, `revisions`, `findings`, `meta`) módosítása:
  az új rész csak ÚJ táblákat és nézeteket ad hozzá; a régi táblák sorszáma a migrációtól nem változik.

## Döntések

- D1 Ugyanaz a DB-fájl: `%LOCALAPPDATA%\hermes\projekt-tudas\websuli\kovetelmenyek.db` (repón kívül; `--db` / `KOVETELMENY_DB`), a
  gyűjtő jogosultság-kezelésével (POSIX: könyvtár 0700, fájl 0600). Így a feladat és a követelmény egy JOIN-nal összeköthető.
- D2 A készültség (`pct`) SZÁMÍTOTT érték egy nézetben, oszlopként nem tárolódik, így kézzel nem írható: ha a feladatnak van egysége
  vagy elfogadási feltétele, `round(100 * (kész egység + teljesült feltétel) / (összes egység + összes feltétel))`; ha egyik sincs,
  az állapotból becsült érték (`alap` jelöléssel): beadva 0, tervezve 5, folyamatban 30, review 70, beolvadt 85, elesitve 90,
  elo_ellenorizve 95, kesz 100, blokkolt/elvetve/felulirva 0.
- D3 Állapotgép (fő lánc): `beadva → tervezve → folyamatban → review → beolvadt → elesitve → elo_ellenorizve → kesz`. A fő láncon
  előre szabad ugrani (pl. tervezve → beolvadt, ha a PR beolvadt), hátra csak `review → folyamatban` (változtatást kértek) és
  `beolvadt|elesitve → folyamatban` (visszavonás, regresszió). Mellékállapotok: `blokkolt` (bármely nem lezártból; onnan a fő lánc
  bármely nem lezárt pontjára), `elvetve`, `felulirva` (lezártak). `kesz` lezárt. A `kesz` csak akkor érhető el, ha minden
  elfogadási feltétel teljesült. Lezárt feladat újranyitása csak `--force` + indok (eseményként naplózva).
- D4 A kapcsolók tulajdonosi döntései külön táblába (`flag_decisions`) kerülnek, nem a `flags`-be: a `flags` sorait a gyűjtő
  (`gyujt.py`) a kódból és a Render-mérésből minden futáskor újraírja, és a meglévő táblák sorszáma nem változhat. A
  `v_kapcsolo_dontesek` nézet a döntést a legutóbbi mért élő értékkel veti össze (eltérés jelzése).
- D5 Minden bevitt szöveg `maszk.py`-n megy át (e-mail, token, DB-URL); a naplóba profilnév nem kerül (`safe`).
- D6 Szinkron: idempotens, kétszer futtatva ugyanazt az állapotot adja; hálózat (gh) nélkül is lefut a helyi részekkel, a gh-részt
  `nem elérhető`-ként jelenti, és semmit nem fokoz le. Az állapotot csak előre (az állapotgép szerint) lépteti; kézzel beállított
  `blokkolt` / lezárt állapotot nem ír felül, csak eseményt naplóz.

## Séma (új táblák, `CREATE … IF NOT EXISTS`, verzió: `feladat_meta.sema_verzio`)

- `tasks(id, code UNIQUE, title, goal, origin, requirement_code, parent, priority 1–5, status CHECK, szelet, next_step,
  next_step_at, blocker, branch, spec, notes, created_at, updated_at, status_source kezi|szinkron|kovetelmeny|visszatoltes)` —
  `szelet` = az `Állapot:` sorokban használt szeletnév (pl. `W1b`, `D1H-1`), ennek alapján köti a szinkron a commitot a feladathoz.
- `task_units(task_id, seq, title, done, done_at, evidence)` — UNIQUE(task_id, seq).
- `task_criteria(task_id, seq, text, met, met_at, evidence)` — UNIQUE(task_id, seq).
- `task_links(task_id, kind, ref, state, extra JSON, updated_at)` — kind: `pr|commit|spec|kanban|finding|flag|requirement|branch|doc|
  feladat_sql`; UNIQUE(task_id, kind, ref). PR-nál `state` = OPEN/MERGED/CLOSED, `extra` = merge-SHA, nyitott review-szálak száma.
- `task_events(task_id, at, actor, kind, detail, evidence, dedupe UNIQUE)` — idővonal; a szinkron eseményei `dedupe`-kulccsal
  (pl. `commit:<sha>`), így újrafuttatva nem duplázódnak.
- `flag_decisions(name, value, decided_at, source, task_code)` — UNIQUE(name, decided_at).
- `feladat_meta(key, value)` — séma-verzió, utolsó szinkron (idő, források eredménye).
- `tasks_fts` (FTS5: kód, cím, cél, következő lépés, blokkoló, megjegyzés) — íráskor feladatonként frissül.
- Nézetek: `v_keszultseg` (egység / feltétel számok, pct, alap), `v_nyitott` (nyitott feladatok pct-vel, következő lépéssel,
  blokkolóval, PR-ral és a nyitott review-szálak számával), `v_kapcsolo_dontesek`.

## Szinkronforrások (`feladat.py szinkron`)

1. **git** (`origin/main` az elmúlt N napban + a feladatokhoz tartozó ágak `origin/main..ág` commitjai): a commitüzenet `Állapot:
   <szelet>[ fázis] k/n egység kész — következő: …` sorai (több is lehet egy squash-commitban: az utolsó számít). A fő fázis (fázis
   nélküli) `k/n` → `task_units` 1..n, ebből k kész; a következő lépés → `next_step` (ha a commit újabb, mint a kézi bejegyzés);
   commit-hivatkozás; ágon lévő commit → legalább `folyamatban`; a main-en lévő squash-commit `(#N)`-je → PR-hivatkozás.
2. **gh** (`gh pr list --state all`, nyitott PR-okra GraphQL `reviewThreads`): a feladathoz kötött (vagy ágnév szerint egyező) PR
   állapota → OPEN: legalább `review`, MERGED: legalább `beolvadt` (+ merge-SHA), CLOSED merge nélkül: esemény. Minden nyitott,
   feladathoz nem kötött PR-ból `PR-<n>` feladat lesz (`review`).
3. **spec** (`docs/specs/*.md` az `origin/main`-en és a nyitott PR-ágakon, nem `-vegrehajtas`, az ablakon belül): ha egyetlen feladat
   sem hivatkozik rá, és a követelmény-DB `SPEC:` tétele nem kész → `SPEC:<téma>` feladat `tervezve` állapotban.
4. **kovetelmeny** (a DB `requirements` táblája, csak olvasva): a nyitott (`elvart|reszben|felkesz|elfelejtett|kapcsolo_ki`), nem
   felülírt tételekből feladat (`beadva` / `folyamatban`, az `elfelejtett` blokkolóval), ha még egyetlen feladat sem fedi le; a
   követelményből automatikusan képzett, kézzel nem érintett feladat követi a követelmény lezárását (kesz/felulirt/elvetve).
5. **kanban, MD** — csak hivatkozás: a követelmény-DB `kanban` / `doc` forrásaira `task_links` mutat; írás nincs.

## Visszatöltés (`feladat.py visszatoltes`)

`scripts/kovetelmeny/feladatok.json` (kurált, nyilvános: név, e-mail, titok nélkül) — az ismert feladatok (W1a/W1b, D1H és D1H-1…4,
U4a–e, V1–V5, K-068, teljes működési revízió, K-FELADATDB, a régi nyitott PR-ok) egységekkel, elfogadási feltételekkel, PR-, spec- és
kapcsolóhivatkozással, valamint a 2026-11-25-i kapcsoló-döntések. Idempotens: meglévő feladatnál csak a hiányzó egységet /
feltételt / hivatkozást pótolja, az állapotot csak előre lépteti. Utána a szinkron `kovetelmeny` része a követelmény-DB nyitott
tételeit hozza be.

## CLI (`scripts/kovetelmeny/feladat.py`)

`migral`, `uj`, `terv`, `allapot`, `esemeny`, `kriterium`, `egyseg`, `kapcsol`, `kapcsolo`, `lista`, `tetel`, `attekintes`,
`kereses`, `szinkron`, `visszatoltes`; mindegyikhez `--json` (gépi kimenet). Kimenet tömör (soronként egy feladat).

## Integráció

- Skill: `.agents/skills/websuli-feladat-nyilvantartas/SKILL.md` (tükör: `.claude/skills`, `.hermes/skills`; `gates.config.json`
  `mirroredSkills`, darabszám 7): szelet elején/végén, PR-nyitáskor, merge/deploy után és munkamenet-záráskor `szinkron` +
  `attekintes`. A revízió-skill a leleteiből feladat képzését erre irányítja.
- Kapuk: a `gate:pr` és a `gate:merge` a végén NEM blokkoló lépésként lefuttatja a szinkront (`scripts/qa/gates/feladat-szinkron.mjs`;
  csak ha a DB létezik; `FELADAT_SZINKRON=off` kikapcsolja; hiba / időtúllépés csak naplósor, a kapu eredményét nem érinti).

## Elfogadás

1. Spec + végrehajtási fájl az első kódcommit előtt.
2. Idempotens migráció a valódi DB-n; a meglévő táblák sorszáma előtte = utána.
3. Minden alparancs működik; `attekintes` egy képernyőn: nyitott feladatok %-kal, következő lépéssel, blokkolóval, PR-ral.
4. `szinkron` a valódi repóból bevezeti az `Állapot:` sorokat és a PR-állapotokat; kétszer futtatva azonos eredmény.
5. Visszatöltés: az ismert feladatok + a követelmény-DB nyitott tételei helyes állapotban; a K-FELADATDB a saját állapotát mutatja.
6. Skill + tükrök + `gates.config.json` + skills-sync-check (7) zöld; README frissítve; a revízió-skill hivatkozik rá.
7. Python unittest (ideiglenes DB): migráció idempotens, állapotgép tilt, pct-számítás, `Állapot:` parsolás, szinkron idempotens,
   maszkolás; a kapu-segéd node-tesztje (nem blokkoló); próbahiba igazolva.

## Kockázatok

- A gyűjtő (`gyujt.py`) ugyanazt a fájlt írja: mindkettő rövid tranzakciókban dolgozik; a gyűjtő a feladat-táblákat nem ismeri és
  nem érinti (`CREATE TABLE IF NOT EXISTS` a saját sémájára).
- Szeletnév-ütközés (két feladat ugyanazzal a `szelet` értékkel): a `szelet` nem egyedi kötelezően, de a szinkron csak egyértelmű
  egyezést köt; a kétértelműt a jelentésben listázza.
- A követelményekből képzett sok feladat zajos lehet: az `attekintes` alapból állapot-sorrendben a legfontosabb 25-öt mutatja, a
  többit számmal jelzi (`lista` szűrőkkel).

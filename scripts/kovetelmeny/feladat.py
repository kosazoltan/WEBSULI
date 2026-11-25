#!/usr/bin/env python3
"""WEBSULI feladat-nyilvántartás (K-FELADATDB) a helyi követelmény-adatbázisban (kovetelmenyek.db, repón kívül).

Egy lekérdezéssel: mi a feladat, mi a terve (egységek, elfogadási feltételek), hol tart (állapot + MÉRT készültség), melyik
PR / commit / spec / kapcsoló tartozik hozzá, mi blokkolja, mi a következő lépés. A készültség (`pct`) a `v_keszultseg` nézetben
számított érték, kézzel nem írható. Terv: docs/specs/2026-11-25-feladat-nyilvantartas.md.

Parancsok (mindegyik `--json`-nal is):
  migral                                  séma létrehozása / frissítése (idempotens)
  uj <kód> <cím> [--cel] [--prio] [--szelet] [--szulo] [--kovetelmeny] [--forras] [--ag] [--spec] [--allapot] [--kovetkezo]
  terv <kód> [--egyseg CÍM]... [--kriterium SZÖVEG]...
  egyseg <kód> <sorszám> (--kesz|--nyitott) [--bizonyitek]
  kriterium <kód> <sorszám> (--teljesult|--nyitott) [--bizonyitek]
  allapot <kód> [<új állapot>] [--kovetkezo] [--blokkolo] [--bizonyitek] [--force --indok]
  esemeny <kód> <szöveg> [--fajta] [--bizonyitek]
  kapcsol <kód> <pr|commit|spec|kanban|finding|flag|requirement|branch|doc|feladat_sql> <ref> [--allapot]
  kapcsolo [<NÉV> <érték> --forras … [--feladat] [--datum]]   tulajdonosi kapcsoló-döntés / döntések vs. élő érték
  lista [--nyitott] [--allapot a,b] [--limit n]
  tetel <kód>                             feladat + egységek + feltételek + hivatkozások + idővonal
  attekintes [--limit 25]                 egy képernyő: nyitott feladatok %, következő lépés, blokkoló, PR
  kereses <kifejezés>                     FTS5 a feladatokban
  szinkron [--alap origin/main] [--napok 45] [--no-gh] [--fetch]   git Állapot-sorok, gh PR, specek, követelmények
  visszatoltes [--fajl feladatok.json]    kurált ismert feladatok + kapcsoló-döntések (idempotens)
Minden bevitt szöveg maszkolva kerül a DB-be (maszk.py); az SQL ?-paraméteres, a dinamikus rész csak fix név vagy '?'-lista.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from maszk import mask, mask_obj, safe  # noqa: E402

LOCAL = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
DEFAULT_DB = LOCAL / "hermes" / "projekt-tudas" / "websuli" / "kovetelmenyek.db"
GH_REPO = "kosazoltan/WEBSULI"
SEMA_VERZIO = 1

# Állapotgép (spec D3): fő lánc előre ugorható; hátra csak a BACK párok; mellékállapotok; lezártak.
STATUSES = ("beadva", "tervezve", "folyamatban", "review", "beolvadt", "elesitve", "elo_ellenorizve", "kesz",
            "blokkolt", "elvetve", "felulirva")
FO_LANC = STATUSES[:8]
LEZART = ("kesz", "elvetve", "felulirva")
MELLEK = ("blokkolt", "elvetve", "felulirva")
BACK = {("review", "folyamatban"), ("beolvadt", "folyamatban"), ("elesitve", "folyamatban")}
PCT_ALAP = {"beadva": 0, "tervezve": 5, "folyamatban": 30, "review": 70, "beolvadt": 85, "elesitve": 90,
            "elo_ellenorizve": 95, "kesz": 100, "blokkolt": 0, "elvetve": 0, "felulirva": 0}
LINK_KINDS = ("pr", "commit", "spec", "kanban", "finding", "flag", "requirement", "branch", "doc", "feladat_sql")
SOURCES = ("kezi", "szinkron", "kovetelmeny", "visszatoltes")
# attekintes / lista sorrend: prioritás, azon belül ami mozgásban van, előre
RANG = {"folyamatban": 0, "review": 1, "blokkolt": 2, "beolvadt": 3, "elesitve": 4, "elo_ellenorizve": 5, "tervezve": 6,
        "beadva": 7}


def _in(vals) -> str:
    """Kódban rögzített konstans-lista SQL-literálként (CHECK-hez); külső bemenet nem kerül ide."""
    return ",".join("'" + v + "'" for v in vals)


SCHEMA = f"""
CREATE TABLE IF NOT EXISTS feladat_meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS tasks(
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, goal TEXT, origin TEXT, requirement_code TEXT,
  parent TEXT, priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'beadva' CHECK(status IN ({_in(STATUSES)})),
  szelet TEXT, next_step TEXT, next_step_at TEXT, blocker TEXT, branch TEXT, spec TEXT, notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  status_source TEXT NOT NULL DEFAULT 'kezi' CHECK(status_source IN ({_in(SOURCES)})));
CREATE INDEX IF NOT EXISTS ix_tasks_req ON tasks(requirement_code);
CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks(status);
CREATE TABLE IF NOT EXISTS task_units(
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, seq INTEGER NOT NULL, title TEXT,
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)), done_at TEXT, evidence TEXT, UNIQUE(task_id, seq));
CREATE TABLE IF NOT EXISTS task_criteria(
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, seq INTEGER NOT NULL,
  text TEXT NOT NULL, met INTEGER NOT NULL DEFAULT 0 CHECK(met IN (0,1)), met_at TEXT, evidence TEXT, UNIQUE(task_id, seq));
CREATE TABLE IF NOT EXISTS task_links(
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ({_in(LINK_KINDS)})), ref TEXT NOT NULL, state TEXT, extra TEXT, updated_at TEXT,
  UNIQUE(task_id, kind, ref));
CREATE INDEX IF NOT EXISTS ix_links_ref ON task_links(kind, ref);
CREATE TABLE IF NOT EXISTS task_events(
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, at TEXT NOT NULL, actor TEXT,
  kind TEXT NOT NULL, detail TEXT, evidence TEXT, dedupe TEXT UNIQUE);
CREATE INDEX IF NOT EXISTS ix_events_task ON task_events(task_id, at);
CREATE TABLE IF NOT EXISTS flag_decisions(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, value TEXT NOT NULL, decided_at TEXT NOT NULL, source TEXT, task_code TEXT,
  UNIQUE(name, decided_at));
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(code, title, goal, next_step, blocker, notes,
  tokenize='unicode61 remove_diacritics 2');
"""

_PCT_CASE = " ".join(f"WHEN '{s}' THEN {p}" for s, p in PCT_ALAP.items())
VIEWS = {
    # saját mérés (egység + feltétel; tartalék: állapot) — a gyerekfeladatok ebből számítanak
    "v_sajat_keszultseg": f"""
SELECT x.*, CASE WHEN x.nu + x.nk > 0 THEN 100.0 * (x.du + x.mk) / (x.nu + x.nk)
                 ELSE CASE x.status {_PCT_CASE} ELSE 0 END END AS sajat
FROM (SELECT t.id AS task_id, t.code, t.parent, t.status,
        (SELECT count(*) FROM task_units u WHERE u.task_id = t.id) AS nu,
        (SELECT coalesce(sum(u.done), 0) FROM task_units u WHERE u.task_id = t.id) AS du,
        (SELECT count(*) FROM task_criteria k WHERE k.task_id = t.id) AS nk,
        (SELECT coalesce(sum(k.met), 0) FROM task_criteria k WHERE k.task_id = t.id) AS mk
      FROM tasks t) x""",
    # a szülő %-a: saját egységek + feltételek + gyerekfeladatonként egy „egység” a gyerek saját %-ával (elvetett / felülírt
    # gyerek nem számít); kézzel nem írható, mindig számított
    "v_keszultseg": f"""
SELECT y.task_id, y.code, y.status, y.nu, y.du, y.nk, y.mk, y.nc,
       CASE WHEN y.nu + y.nk + y.nc > 0 THEN CAST(round((100.0 * (y.du + y.mk) + y.cp) / (y.nu + y.nk + y.nc)) AS INTEGER)
            ELSE CASE y.status {_PCT_CASE} ELSE 0 END END AS pct,
       CASE WHEN y.nu + y.nk + y.nc > 0 THEN 'meres' ELSE 'allapot' END AS alap
FROM (SELECT s.*,
        (SELECT count(*) FROM v_sajat_keszultseg g WHERE g.parent = s.code AND g.status NOT IN ('elvetve', 'felulirva')) AS nc,
        (SELECT coalesce(sum(g.sajat), 0) FROM v_sajat_keszultseg g
          WHERE g.parent = s.code AND g.status NOT IN ('elvetve', 'felulirva')) AS cp
      FROM v_sajat_keszultseg s) y""",
    "v_task_pr": """
SELECT l.task_id, l.ref AS pr, l.state, l.extra FROM task_links l
WHERE l.kind = 'pr' AND l.id = (SELECT l2.id FROM task_links l2 WHERE l2.task_id = l.task_id AND l2.kind = 'pr'
                                ORDER BY (l2.state = 'OPEN') DESC, CAST(l2.ref AS INTEGER) DESC LIMIT 1)""",
    "v_nyitott": """
SELECT t.code, t.title, t.status, t.priority, k.pct, k.alap, k.du || '/' || k.nu AS egyseg, k.mk || '/' || k.nk AS feltetel,
       t.next_step, t.blocker, p.pr, p.state AS pr_state,
       coalesce(json_extract(p.extra, '$.nyitott_szalak'), 0) AS szalak, t.branch, t.spec, t.requirement_code, t.parent,
       t.updated_at
FROM tasks t JOIN v_keszultseg k ON k.task_id = t.id LEFT JOIN v_task_pr p ON p.task_id = t.id
WHERE t.status NOT IN ('kesz', 'elvetve', 'felulirva')""",
    "v_kapcsolo_dontesek": """
SELECT d.name, d.value AS dontes, d.decided_at, d.source, d.task_code, f.live_value AS elo, f.state AS allapot,
       f.live_checked_at AS meres,
       CASE WHEN f.name IS NULL OR f.live_value IS NULL THEN NULL
            WHEN lower(f.live_value) = lower(d.value) THEN 0 ELSE 1 END AS "eltérés"
FROM flag_decisions d LEFT JOIN flags f ON f.name = d.name
WHERE d.decided_at = (SELECT max(d2.decided_at) FROM flag_decisions d2 WHERE d2.name = d.name)""",
}


class AllapotHiba(ValueError):
    """Érvénytelen állapotátmenet / ismeretlen feladat — a CLI nem nulla kóddal lép ki."""


def now() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


def now_tz() -> str:
    """Időzónás helyi időbélyeg (az időrendi összevetéshez: next_step_at)."""
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def _utc(s: str) -> dt.datetime:
    """ISO időbélyeg → UTC; a zóna nélküli (régi) értéket helyi időnek veszi."""
    d = dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.astimezone()
    return d.astimezone(dt.timezone.utc)


def m(t):
    """Maszkolt, üres → None."""
    if t is None:
        return None
    t = mask(str(t)).strip()
    return t or None


# ---------------------------------------------------------------- kapcsolat + migráció
def secure_path(path: Path):
    """Mint a gyűjtőben: POSIX-on könyvtár 0700, fájl 0600; Windowson a %LOCALAPPDATA% ACL-je eleve felhasználónkénti."""
    if os.name != "posix":
        return
    try:
        os.chmod(path.parent, 0o700)
        for p in (path, Path(str(path) + "-journal"), Path(str(path) + "-wal")):
            if p.exists():
                os.chmod(p, 0o600)
    except OSError as e:  # Windowson a %LOCALAPPDATA% felhasználónkénti; a jogosultság-szűkítés hibája nem állítja meg a munkát
        print(f"figyelmeztetés: a DB-jogosultság nem szűkíthető ({e.__class__.__name__})", file=sys.stderr)


def migrate(c: sqlite3.Connection):
    """Idempotens: csak új táblák / nézetek (IF NOT EXISTS; a nézetek fix szövegből újraépülnek). A meglévő
    követelmény-táblák sorait nem érinti."""
    c.executescript(SCHEMA)
    for name, sql in VIEWS.items():  # fix nevek és fix SQL; csak eltérés esetén épül újra (nincs fölösleges írás / zár)
        want = f"CREATE VIEW {name} AS {sql}"
        have = c.execute("SELECT sql FROM sqlite_master WHERE type='view' AND name=?", (name,)).fetchone()
        if not have or have[0] != want:
            c.execute(f"DROP VIEW IF EXISTS {name}")
            c.execute(want)
    c.execute("INSERT INTO feladat_meta(key,value) VALUES('sema_verzio',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value "
              "WHERE value IS NOT excluded.value", (str(SEMA_VERZIO),))
    c.commit()


def connect(path: str) -> sqlite3.Connection:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not p.exists():
        os.close(os.open(p, os.O_CREAT | os.O_WRONLY, 0o600))
    secure_path(p)
    c = sqlite3.connect(p)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    from gyujt import MIGRATE, SCHEMA as KOV_SCHEMA  # a követelmény-séma (üres DB-hez; meglévőn nem változtat)
    c.executescript(KOV_SCHEMA)
    for table, cols in MIGRATE.items():
        have = {r[1] for r in c.execute(f"PRAGMA table_info({table})")}  # fix tábla-/oszlopnevek
        for col, typ in cols.items():
            if col not in have:
                c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
    migrate(c)
    return c


# ---------------------------------------------------------------- alapműveletek
def get_task(c, code: str) -> dict | None:
    r = c.execute("SELECT * FROM tasks WHERE code=?", (code,)).fetchone()
    return dict(r) if r else None


def _tid(c, code: str) -> int:
    t = get_task(c, code)
    if not t:
        raise AllapotHiba(f"nincs ilyen feladat: {code}")
    return t["id"]


def fts_refresh(c, task_id: int):
    r = c.execute("SELECT code,title,goal,next_step,blocker,notes FROM tasks WHERE id=?", (task_id,)).fetchone()
    c.execute("DELETE FROM tasks_fts WHERE rowid=?", (task_id,))
    if r:
        c.execute("INSERT INTO tasks_fts(rowid,code,title,goal,next_step,blocker,notes) VALUES(?,?,?,?,?,?,?)", (task_id, *r))


def add_event(c, code: str, kind: str, detail, actor: str = "kezi", evidence=None, dedupe: str | None = None,
              at: str | None = None) -> bool:
    cur = c.execute("INSERT OR IGNORE INTO task_events(task_id,at,actor,kind,detail,evidence,dedupe) VALUES(?,?,?,?,?,?,?)",
                    (_tid(c, code), at or now(), m(actor), m(kind) or "?", m(detail), m(evidence), dedupe))
    return cur.rowcount > 0


IDENT_FIELDS = ("code", "requirement_code", "parent", "szelet", "branch", "spec")


def _ident(name: str, v) -> None:
    """Azonosítóként használt mező (kód, ág, spec-út…): érzékeny tartalom esetén ELUTASÍTÁS, nem maszkolás — a maszkolt
    azonosító eltörné a kapcsolatokat (ág ↔ PR, szelet ↔ Állapot-sor). Az üzenet az értéket nem ismétli meg."""
    if v is not None and mask(str(v)) != str(v):
        raise AllapotHiba(f"érzékeny adat (e-mail-cím / titok) a(z) {name} mezőben — elutasítva")


def new_task(c, code: str, title: str, *, goal=None, origin=None, requirement_code=None, parent=None, priority: int = 3,
             status: str = "beadva", szelet=None, next_step=None, blocker=None, branch=None, spec=None, notes=None,
             source: str = "kezi", actor: str = "kezi") -> int:
    for name, v in zip(IDENT_FIELDS, (code, requirement_code, parent, szelet, branch, spec)):
        _ident(name, v)
    if get_task(c, code):
        raise AllapotHiba(f"már létezik: {code}")
    if status not in STATUSES:
        raise AllapotHiba(f"ismeretlen állapot: {status}")
    t = now()
    cur = c.execute("""INSERT INTO tasks(code,title,goal,origin,requirement_code,parent,priority,status,szelet,next_step,
                       next_step_at,blocker,branch,spec,notes,created_at,updated_at,status_source)
                       VALUES(?,?,?,?,?,?,?,'beadva',?,?,?,?,?,?,?,?,?,?)""",
                    (code, m(title) or code, m(goal), m(origin), requirement_code, parent, int(priority), szelet, m(next_step),
                     now_tz() if next_step else None, m(blocker), branch, spec, m(notes), t, t, source))
    add_event(c, code, "letrehozva", f"{m(title)} ({source})", actor=actor, dedupe=f"letrehozva:{code}")
    if status != "beadva":
        set_status(c, code, status, actor=actor, source=source, blocker=blocker)
    fts_refresh(c, cur.lastrowid)
    return cur.lastrowid


def can_transition(old: str, new: str) -> bool:
    if old not in STATUSES or new not in STATUSES:
        return False
    if old == new:
        return True
    if old in LEZART:
        return False
    if new in MELLEK:
        return True
    if old == "blokkolt":
        return new in FO_LANC and new != "kesz"
    if FO_LANC.index(new) > FO_LANC.index(old):
        return True
    return (old, new) in BACK


def set_status(c, code: str, new: str, *, actor: str = "kezi", evidence=None, force: bool = False, reason=None,
               source: str = "kezi", blocker=None, dedupe: str | None = None, at: str | None = None) -> bool:
    t = get_task(c, code)
    if not t:
        raise AllapotHiba(f"nincs ilyen feladat: {code}")
    if new not in STATUSES:
        raise AllapotHiba(f"ismeretlen állapot: {new} (lehetséges: {', '.join(STATUSES)})")
    old = t["status"]
    if old == new:  # nincs átmenet, de az explicit blokkoló-módosítás (új szöveg vagy "" = törlés) érvényes
        nb = m(blocker) if blocker is not None else t["blocker"]
        if nb == t["blocker"]:
            return False
        c.execute("UPDATE tasks SET blocker=?, updated_at=? WHERE id=?", (nb, now(), t["id"]))
        add_event(c, code, "blokkolo", f"blokkoló: {nb or '—'}", actor=actor, evidence=evidence, at=at)
        fts_refresh(c, t["id"])
        return True
    if not can_transition(old, new):
        if not force:
            raise AllapotHiba(f"{code}: tiltott átmenet {old} → {new}" + (" (lezárt: --force --indok)" if old in LEZART else ""))
        if not (reason and str(reason).strip()):
            raise AllapotHiba(f"{code}: a --force indokot kíván (--indok)")
    if new == "kesz":
        nyitott = c.execute("SELECT count(*) FROM task_criteria WHERE task_id=? AND met=0", (t["id"],)).fetchone()[0]
        if nyitott:
            raise AllapotHiba(f"{code}: kesz csak teljesült elfogadási feltételekkel ({nyitott} nyitott)")
    blk = m(blocker) if new == "blokkolt" or blocker is not None else (None if old == "blokkolt" else t["blocker"])
    c.execute("UPDATE tasks SET status=?, status_source=?, blocker=?, updated_at=? WHERE id=?",
              (new, source, blk, now(), t["id"]))
    detail = f"{old} → {new}" + (f" (kényszerítve: {reason})" if force and not can_transition(old, new) else "")
    add_event(c, code, "allapot", detail, actor=actor, evidence=evidence, dedupe=dedupe, at=at)
    fts_refresh(c, t["id"])
    return True


def update_fields(c, code: str, **kw) -> bool:
    """Szövegmezők frissítése (maszkolva); csak a tényleges változás ír (updated_at is csak akkor)."""
    t = get_task(c, code)
    if not t:
        raise AllapotHiba(f"nincs ilyen feladat: {code}")
    allowed = ("title", "goal", "origin", "requirement_code", "parent", "priority", "szelet", "next_step", "next_step_at",
               "blocker", "branch", "spec", "notes")
    ch = {}
    for k, v in kw.items():
        if k not in allowed:
            raise AllapotHiba(f"ismeretlen mező: {k}")
        if k in ("title", "goal", "origin", "next_step", "blocker", "notes"):
            v = m(v)
        elif k in IDENT_FIELDS:
            _ident(k, v)
        if t[k] != v:
            ch[k] = v
    if not ch:
        return False
    if "next_step" in ch and "next_step_at" not in kw:
        ch["next_step_at"] = now_tz()
    sets = ", ".join(f"{k}=?" for k in ch)  # a kulcsok a fenti fix listából
    c.execute(f"UPDATE tasks SET {sets}, updated_at=? WHERE id=?", (*ch.values(), now(), t["id"]))
    fts_refresh(c, t["id"])
    return True


def _touch(c, task_id: int):
    c.execute("UPDATE tasks SET updated_at=? WHERE id=?", (now(), task_id))


def add_unit(c, code: str, title: str, evidence=None) -> int:
    tid = _tid(c, code)
    seq = c.execute("SELECT coalesce(max(seq),0)+1 FROM task_units WHERE task_id=?", (tid,)).fetchone()[0]
    c.execute("INSERT INTO task_units(task_id,seq,title,evidence) VALUES(?,?,?,?)", (tid, seq, m(title), m(evidence)))
    _touch(c, tid)
    return seq


def ensure_units(c, code: str, n: int) -> bool:
    """Legalább n egység (a hiányzók „k. egység” címmel); a meglévő címek maradnak."""
    tid = _tid(c, code)
    have = {r[0] for r in c.execute("SELECT seq FROM task_units WHERE task_id=?", (tid,))}
    ch = False
    for seq in range(1, n + 1):
        if seq not in have:
            c.execute("INSERT INTO task_units(task_id,seq,title) VALUES(?,?,?)", (tid, seq, f"{seq}. egység"))
            ch = True
    if ch:
        _touch(c, tid)
    return ch


def set_unit(c, code: str, seq: int, done: bool, evidence=None, at: str | None = None) -> bool:
    tid = _tid(c, code)
    r = c.execute("SELECT done FROM task_units WHERE task_id=? AND seq=?", (tid, seq)).fetchone()
    if not r:
        raise AllapotHiba(f"{code}: nincs {seq}. egység")
    if bool(r[0]) == bool(done):
        return False
    c.execute("UPDATE task_units SET done=?, done_at=?, evidence=coalesce(?, evidence) WHERE task_id=? AND seq=?",
              (1 if done else 0, (at or now()) if done else None, m(evidence), tid, seq))
    _touch(c, tid)
    return True


def add_criterion(c, code: str, text: str, evidence=None) -> int:
    tid = _tid(c, code)
    seq = c.execute("SELECT coalesce(max(seq),0)+1 FROM task_criteria WHERE task_id=?", (tid,)).fetchone()[0]
    c.execute("INSERT INTO task_criteria(task_id,seq,text,evidence) VALUES(?,?,?,?)", (tid, seq, m(text) or "?", m(evidence)))
    _touch(c, tid)
    return seq


def set_criterion(c, code: str, seq: int, met: bool, evidence=None) -> bool:
    tid = _tid(c, code)
    r = c.execute("SELECT met FROM task_criteria WHERE task_id=? AND seq=?", (tid, seq)).fetchone()
    if not r:
        raise AllapotHiba(f"{code}: nincs {seq}. feltétel")
    if met and not (evidence and str(evidence).strip()):
        raise AllapotHiba(f"{code}: teljesült feltételhez bizonyíték kell (--bizonyitek)")
    if bool(r[0]) == bool(met):
        return False
    c.execute("UPDATE task_criteria SET met=?, met_at=?, evidence=coalesce(?, evidence) WHERE task_id=? AND seq=?",
              (1 if met else 0, now() if met else None, m(evidence), tid, seq))
    _touch(c, tid)
    return True


def link(c, code: str, kind: str, ref, state=None, extra: dict | None = None) -> bool:
    """Hivatkozás upsert; None állapot / extra a meglévőt nem írja felül. True, ha változott."""
    if kind not in LINK_KINDS:
        raise AllapotHiba(f"ismeretlen hivatkozásfajta: {kind} (lehetséges: {', '.join(LINK_KINDS)})")
    tid = _tid(c, code)
    ref = m(str(ref))
    state = m(state) if state is not None else None  # szabad szöveg (kapcsol --allapot) is lehet
    ex = json.dumps(mask_obj(extra), ensure_ascii=False, sort_keys=True) if extra is not None else None
    r = c.execute("SELECT state, extra FROM task_links WHERE task_id=? AND kind=? AND ref=?", (tid, kind, ref)).fetchone()
    if not r:
        c.execute("INSERT INTO task_links(task_id,kind,ref,state,extra,updated_at) VALUES(?,?,?,?,?,?)",
                  (tid, kind, ref, state, ex, now()))
        return True
    ns = state if state is not None else r["state"]
    ne = ex if ex is not None else r["extra"]
    if (ns, ne) == (r["state"], r["extra"]):
        return False
    c.execute("UPDATE task_links SET state=?, extra=?, updated_at=? WHERE task_id=? AND kind=? AND ref=?",
              (ns, ne, now(), tid, kind, ref))
    return True


def progress(c, code: str) -> dict:
    r = c.execute("SELECT * FROM v_keszultseg WHERE code=?", (code,)).fetchone()
    if not r:
        raise AllapotHiba(f"nincs ilyen feladat: {code}")
    return {"pct": r["pct"], "alap": r["alap"], "egyseg": f"{r['du']}/{r['nu']}", "feltetel": f"{r['mk']}/{r['nk']}"}


def flag_decision(c, name: str, value: str, decided_at: str, source=None, task_code=None) -> bool:
    """Upsert (name, decided_at) kulcson: azonos értékkel no-op (a visszatöltés idempotens marad), új értékkel felülír —
    az aznapi / azonos időpontú új döntés nem vész el. A kézi CLI másodperc-pontos időbélyeget ad (cmd_kapcsolo)."""
    name = name.strip().upper()
    _ident("kapcsoló", name)
    _ident("feladat", task_code)
    val, src = m(value), m(source)
    r = c.execute("SELECT value, source, task_code FROM flag_decisions WHERE name=? AND decided_at=?", (name, decided_at)).fetchone()
    if r and (r[0], r[1], r[2]) == (val, src, task_code):
        return False
    c.execute("INSERT INTO flag_decisions(name,value,decided_at,source,task_code) VALUES(?,?,?,?,?) "
              "ON CONFLICT(name, decided_at) DO UPDATE SET value=excluded.value, source=excluded.source, task_code=excluded.task_code",
              (name, val, decided_at, src, task_code))
    if task_code and get_task(c, task_code):
        link(c, task_code, "flag", name, state=val)
    return True


# ---------------------------------------------------------------- Állapot-sor
ALLAPOT_RE = re.compile(
    r"^[ \t]*Állapot:[ \t]*(?P<sz>[^\s/]+)(?:[ \t]+(?P<faz>[^\d\s][^\n/]*?))?[ \t]+(?P<k>\d+)[ \t]*/[ \t]*(?P<n>\d+)[ \t]+"
    r"egység[ \t]+kész[ \t]*[—–-]+[ \t]*(?:kész,[ \t]*)?következő:[ \t]*(?P<kov>[^\n]*?)[ \t]*$", re.M)


def parse_allapot(text: str) -> list[dict]:
    """A commitüzenet `Állapot: <szelet>[ fázis] k/n egység kész — következő: …` sorai, sorrendben."""
    out = []
    for mm in ALLAPOT_RE.finditer((text or "").replace("\r\n", "\n")):
        out.append({"szelet": mm["sz"], "fazis": (mm["faz"] or "").strip(), "k": int(mm["k"]), "n": int(mm["n"]),
                    "kovetkezo": mm["kov"].strip()})
    return out


# ---------------------------------------------------------------- kimenet
def _cut(t, n: int) -> str:
    t = (t or "").replace("\n", " ")
    return t if len(t) <= n else t[: n - 1] + "…"


def _pr_cell(r) -> str:
    if not r["pr"]:
        return ""
    s = f"#{r['pr']}" + (f" {r['pr_state'].lower()}" if r["pr_state"] else "")
    return s + (f" {r['szalak']}sz" if r["szalak"] else "")


def _out(a, obj, text_fn):
    if a.json:
        print(json.dumps(obj, ensure_ascii=False, default=str))
    else:
        text_fn()


def _rows(cur) -> list[dict]:
    return [dict(r) for r in cur]


def _ts(s) -> float:
    try:
        return dt.datetime.fromisoformat(str(s)[:19]).timestamp()
    except ValueError:
        return 0.0


def _order(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda r: (r["priority"], RANG.get(r["status"], 9), -_ts(r["updated_at"])))


# ---------------------------------------------------------------- parancsok
def cmd_migral(c, a):
    _out(a, {"sema_verzio": SEMA_VERZIO}, lambda: print(f"séma rendben (verzió {SEMA_VERZIO})"))


def cmd_uj(c, a):
    new_task(c, a.code, a.cim, goal=a.cel, origin=a.forras, requirement_code=a.kovetelmeny, parent=a.szulo,
             priority=a.prio, status=a.allapot, szelet=a.szelet, next_step=a.kovetkezo, branch=a.ag, spec=a.spec)
    if a.spec:
        link(c, a.code, "spec", a.spec)
    if a.kovetelmeny:
        link(c, a.code, "requirement", a.kovetelmeny)
    _out(a, get_task(c, a.code), lambda: print(f"új feladat: {a.code} ({get_task(c, a.code)['status']})"))


def cmd_terv(c, a):
    for t in a.egyseg or []:
        add_unit(c, a.code, t)
    for t in a.kriterium or []:
        add_criterion(c, a.code, t)
    if (a.egyseg or a.kriterium) and get_task(c, a.code)["status"] == "beadva":
        set_status(c, a.code, "tervezve", actor="kezi")
    _out(a, progress(c, a.code), lambda: print(f"{a.code}: {progress(c, a.code)}"))


def cmd_egyseg(c, a):
    set_unit(c, a.code, a.seq, a.kesz, evidence=a.bizonyitek)
    _out(a, progress(c, a.code), lambda: print(f"{a.code}: {progress(c, a.code)}"))


def cmd_kriterium(c, a):
    set_criterion(c, a.code, a.seq, a.teljesult, evidence=a.bizonyitek)
    _out(a, progress(c, a.code), lambda: print(f"{a.code}: {progress(c, a.code)}"))


def cmd_allapot(c, a):
    if a.uj:
        set_status(c, a.code, a.uj, actor="kezi", evidence=a.bizonyitek, force=a.force, reason=a.indok,
                   blocker=a.blokkolo)
    elif a.blokkolo is not None:
        update_fields(c, a.code, blocker=a.blokkolo)
    if a.kovetkezo is not None:
        update_fields(c, a.code, next_step=a.kovetkezo)
    t = get_task(c, a.code)
    _out(a, t, lambda: print(f"{a.code}: {t['status']} | köv.: {t['next_step'] or '—'} | blokkoló: {t['blocker'] or '—'}"))


def cmd_esemeny(c, a):
    add_event(c, a.code, a.fajta, a.szoveg, actor="kezi", evidence=a.bizonyitek)
    _out(a, {"ok": True}, lambda: print("esemény rögzítve"))


def cmd_kapcsol(c, a):
    ch = link(c, a.code, a.fajta, a.ref, state=a.allapot)
    _out(a, {"valtozott": ch}, lambda: print(safe(f"{a.code} ↔ {a.fajta}:{a.ref} ({'új/változott' if ch else 'változatlan'})")))


def cmd_kapcsolo(c, a):
    if a.nev:
        if not a.ertek or not a.forras:
            raise AllapotHiba("kapcsoló-döntéshez: <NÉV> <érték> --forras <ki/hol döntött>")
        flag_decision(c, a.nev, a.ertek, a.datum or now(), source=a.forras, task_code=a.feladat)  # másodperc-pontos
    rows = _rows(c.execute("SELECT * FROM v_kapcsolo_dontesek ORDER BY name"))

    def txt():
        for r in rows:
            el = {None: "nem mért", 0: "egyezik", 1: "ELTÉR"}[r["eltérés"]]
            print(f"{r['name']:<26} döntés={r['dontes']:<6} ({r['decided_at']}, {_cut(r['source'], 30)}) | élő: {r['elo'] or '—'} "
                  f"[{r['allapot'] or '—'}] → {el}" + (f" | {r['task_code']}" if r["task_code"] else ""))
    _out(a, rows, txt)


def cmd_lista(c, a):
    q, p = ("SELECT t.code,t.title,t.status,t.priority,k.pct,k.alap,t.next_step,t.blocker,t.updated_at FROM tasks t "
            "JOIN v_keszultseg k ON k.task_id=t.id WHERE 1=1"), []
    if a.nyitott:
        q += f" AND t.status NOT IN ({_in(LEZART)})"
    if a.allapot:
        st = a.allapot.split(",")
        q += f" AND t.status IN ({','.join('?' * len(st))})"  # csak '?'-helyőrzők
        p += st
    rows = _order(_rows(c.execute(q, p)))[: a.limit]

    def txt():
        for r in rows:
            print(f"{r['code']} | {r['status']} | {r['pct']}% | p{r['priority']} | {_cut(r['title'], 80)}")
    _out(a, rows, txt)


def cmd_tetel(c, a):
    t = get_task(c, a.code)
    if not t:
        raise AllapotHiba(f"nincs ilyen feladat: {a.code}")
    tid = t["id"]
    d = {"task": t, "progress": progress(c, a.code),
         "units": _rows(c.execute("SELECT seq,title,done,done_at,evidence FROM task_units WHERE task_id=? ORDER BY seq", (tid,))),
         "criteria": _rows(c.execute("SELECT seq,text,met,met_at,evidence FROM task_criteria WHERE task_id=? ORDER BY seq",
                                     (tid,))),
         "links": _rows(c.execute("SELECT kind,ref,state,extra FROM task_links WHERE task_id=? ORDER BY kind,ref", (tid,))),
         "events": _rows(c.execute("SELECT at,actor,kind,detail,evidence FROM task_events WHERE task_id=? "
                                   "ORDER BY at DESC, id DESC LIMIT ?", (tid, a.limit))),
         "children": _rows(c.execute("SELECT t.code,t.status,k.pct FROM tasks t JOIN v_keszultseg k ON k.task_id=t.id "
                                     "WHERE t.parent=? ORDER BY t.code", (a.code,)))}
    if t["requirement_code"]:
        r = c.execute("SELECT code,status,title FROM requirements WHERE code=?", (t["requirement_code"],)).fetchone()
        d["requirement"] = dict(r) if r else None

    def txt():
        p = d["progress"]
        print(f"{t['code']} — {t['title']}\n  állapot: {t['status']} ({t['status_source']}) | {p['pct']}% ({p['alap']}; egység "
              f"{p['egyseg']}, feltétel {p['feltetel']}) | prio {t['priority']}")
        for k in ("goal", "requirement_code", "parent", "szelet", "branch", "spec", "next_step", "blocker", "origin", "notes"):
            if t[k]:
                print(f"  {k}: {t[k]}")
        if d.get("requirement"):
            print(f"  követelmény: {d['requirement']['code']} = {d['requirement']['status']}")
        for u in d["units"]:
            print(f"  [{'x' if u['done'] else ' '}] E{u['seq']} {u['title']}" + (f" — {u['evidence']}" if u["evidence"] else ""))
        for k in d["criteria"]:
            print(f"  [{'x' if k['met'] else ' '}] F{k['seq']} {k['text']}" + (f" — {k['evidence']}" if k["evidence"] else ""))
        for ln in d["links"]:
            print(f"  ↔ {ln['kind']}:{_cut(ln['ref'], 60)}" + (f" [{ln['state']}]" if ln["state"] else "")
                  + (f" {ln['extra']}" if ln["extra"] else ""))
        for ch in d["children"]:
            print(f"  ⤷ {ch['code']} {ch['status']} {ch['pct']}%")
        for e in d["events"]:
            print(f"  {e['at'][:16]} {e['actor']}/{e['kind']}: {_cut(e['detail'], 110)}")
    _out(a, d, txt)


def cmd_attekintes(c, a):
    rows = _order(_rows(c.execute("SELECT * FROM v_nyitott")))
    osszes = dict(c.execute("SELECT status, count(*) FROM tasks GROUP BY 1").fetchall())
    meta = c.execute("SELECT value FROM feladat_meta WHERE key='utolso_szinkron'").fetchone()
    sz = json.loads(meta[0]) if meta else None
    shown = rows if a.minden else rows[: a.limit]
    if a.json:
        print(json.dumps({"nyitott": shown, "osszes": osszes, "utolso_szinkron": sz}, ensure_ascii=False, default=str))
        return
    nyitott = {s: n for s, n in osszes.items() if s not in LEZART}
    lezart = sum(n for s, n in osszes.items() if s in LEZART)
    szt = f"{sz['ido'][:16]}, nem elérhető: {', '.join(sz['nem_elerheto']) or '—'}" if sz else "még nem futott"
    print(f"Nyitott feladat: {len(rows)} (" + ", ".join(f"{s} {nyitott[s]}" for s in sorted(nyitott, key=lambda s: RANG.get(s, 9)))
          + f") | lezárt: {lezart} | szinkron: {szt}")
    w = min(max([len(r["code"]) for r in shown] + [4]), 22)
    print(f"{'KÓD':<{w}} {'ÁLLAPOT':<12} {'%':>5} {'PR':<15} {'KÖVETKEZŐ LÉPÉS':<44} BLOKKOLÓ")
    for r in shown:
        pct = f"{r['pct']}%" + ("~" if r["alap"] == "allapot" else " ")
        print(f"{_cut(r['code'], w):<{w}} {r['status']:<12} {pct:>5} {_pr_cell(r):<15} {_cut(r['next_step'], 44):<44} "
              f"{_cut(r['blocker'], 40) or '—'}")
    if len(rows) > len(shown):
        print(f"… +{len(rows) - len(shown)} további nyitott (lista --nyitott / attekintes --minden); ~ = állapotból becsült %")


def cmd_kereses(c, a):
    try:
        rows = _rows(c.execute("SELECT t.code,t.status,t.title FROM tasks_fts f JOIN tasks t ON t.id=f.rowid "
                               "WHERE tasks_fts MATCH ? ORDER BY rank LIMIT ?", (a.q, a.limit)))
    except sqlite3.OperationalError:  # FTS-szintaxishiba: egyszerű részszöveg-keresés
        like = f"%{a.q}%"
        rows = _rows(c.execute("SELECT code,status,title FROM tasks WHERE code LIKE ? OR title LIKE ? OR goal LIKE ? LIMIT ?",
                               (like, like, like, a.limit)))

    def txt():
        for r in rows:
            print(f"{r['code']} | {r['status']} | {_cut(r['title'], 100)}")
    _out(a, rows, txt)


# ---------------------------------------------------------------- szinkron (git, gh, spec, követelmény)
OPEN_REQ = ("elvart", "reszben", "felkesz", "elfelejtett", "kapcsolo_ki")
REQ_PRIO = {"p-tetel": 4, "dontes": 4}
REQ_BLOCKER = {"elfelejtett": "elfelejtett (revízió: régóta elvárt, nincs commit/PR-nyom)", "kapcsolo_ki": "kapcsoló KI élesben"}
PR_SUBJ_RE = re.compile(r"\(#(\d+)\)\s*$")
SPEC_RE = re.compile(r"^docs/specs/(\d{4}-\d{2}-\d{2})-(.+)\.md$")
GH_TIMEOUT = 90


def _git(repo: str, *a: str) -> subprocess.CompletedProcess:
    """Fix argumentumlista, shell nélkül."""
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, encoding="utf-8", errors="replace")


def _advance(c, code: str, target: str, evidence=None, at: str | None = None) -> bool:
    """Szinkron-léptetés: csak előre a fő láncon; blokkolt vagy lezárt feladatot nem ír felül (spec D6)."""
    t = get_task(c, code)
    if not t or t["status"] in LEZART or t["status"] == "blokkolt":
        return False
    if FO_LANC.index(target) <= FO_LANC.index(t["status"]):
        return False
    return set_status(c, code, target, actor="szinkron", evidence=evidence, source="szinkron", at=at)


def sync_requirements(c) -> dict:
    """A követelmény-DB nyitott, nem felülírt tételeiből feladat (ha még semmi nem fedi le); a követelményből képzett
    feladat követi a követelmény lezárását és félkész állapotát. A requirements táblát csak olvassa."""
    rep = {"uj": 0, "valtozas": 0}
    if not c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='requirements'").fetchone():
        return rep
    reqs = _rows(c.execute("SELECT code,title,category,status,superseded_by FROM requirements ORDER BY date, code"))
    covered = {r[0] for r in c.execute("SELECT requirement_code FROM tasks WHERE requirement_code IS NOT NULL")}
    covered |= {r[0] for r in c.execute("SELECT ref FROM task_links WHERE kind='requirement'")}  # „lefedi” kötések
    codes = {r[0] for r in c.execute("SELECT code FROM tasks")}
    for r in reqs:
        if r["status"] not in OPEN_REQ or r["superseded_by"] or r["code"] in covered:
            continue
        pr = re.fullmatch(r"PR#(\d+)", r["code"])
        code = f"PR-{pr.group(1)}" if pr else r["code"]
        if code in codes:  # már van ilyen kódú feladat (pl. a gh-szinkron PR-feladata): csak a kötés
            if not get_task(c, code)["requirement_code"]:
                rep["valtozas"] += update_fields(c, code, requirement_code=r["code"])
            covered.add(r["code"])
            continue
        if pr:
            status = "review"
        else:
            status = "folyamatban" if r["status"] in ("felkesz", "reszben") else "beadva"
        new_task(c, code, r["title"] or code, origin=f"kovetelmeny:{r['code']}", requirement_code=r["code"],
                 priority=REQ_PRIO.get(r["category"], 3), status=status, blocker=REQ_BLOCKER.get(r["status"]),
                 source="kovetelmeny", actor="szinkron")
        link(c, code, "requirement", r["code"])
        if pr:
            link(c, code, "pr", pr.group(1))
        if code.startswith("KANBAN:"):
            link(c, code, "kanban", code.split(":", 1)[1])
        if code.startswith("FELADAT#"):
            link(c, code, "feladat_sql", code[len("FELADAT#"):])
        codes.add(code)
        covered.add(r["code"])
        rep["uj"] += 1
        rep["valtozas"] += 1
    by = {r["code"]: r for r in reqs}
    # csak a kézzel NEM érintett, nem blokkolt, követelményből képzett feladat követi a követelményt (spec D6, 4. pont):
    # a kézi újranyitás / blokkolás (status_source='kezi', status='blokkolt') felülbírálja a követelmény-DB állapotát
    for t in _rows(c.execute("SELECT code,status,requirement_code FROM tasks WHERE origin LIKE 'kovetelmeny:%' "
                             "AND status_source IN ('kovetelmeny','szinkron') AND status <> 'blokkolt'")):
        r = by.get(t["requirement_code"])
        if not r or t["status"] in LEZART:
            continue
        ev = f"követelmény {r['code']} = {r['status']}"
        target = "felulirva" if (r["status"] == "felulirt" or r["superseded_by"]) else {"kesz": "kesz", "elvetve": "elvetve"}.get(r["status"])
        if target:
            try:
                rep["valtozas"] += set_status(c, t["code"], target, actor="szinkron", source="kovetelmeny", evidence=ev)
            except AllapotHiba:  # pl. kesz nyitott elfogadási feltétellel: marad, a revízió dönt
                pass
        elif r["status"] in ("felkesz", "reszben"):
            rep["valtozas"] += _advance(c, t["code"], "folyamatban", evidence=ev)
    return rep


def sync_git(c, repo: str, base: str, napok: int, rep: dict):
    """`Állapot:` sorok a base-ről és a feladatok ágairól → egységek, következő lépés, commit- és PR-hivatkozás."""
    since = f"--since={napok}.days"
    tasks = _rows(c.execute("SELECT code, szelet, branch FROM tasks"))
    by: dict[str, set] = {}
    for t in tasks:
        for key in {(t["szelet"] or "").lower(), t["code"].lower()} - {""}:
            by.setdefault(key, set()).add(t["code"])
    refs = [base]
    for t in tasks:
        if t["branch"]:
            for cand in (f"refs/heads/{t['branch']}", f"refs/remotes/origin/{t['branch']}"):
                if _git(repo, "rev-parse", "-q", "--verify", cand).returncode == 0:
                    refs.append(cand)
                    break
    refs = list(dict.fromkeys(refs))
    r = _git(repo, "log", "--topo-order", since, "--format=%H%x1f%cI%x1f%B%x1e", *refs, "--")
    rb = _git(repo, "rev-list", since, base, "--")
    if r.returncode != 0 or rb.returncode != 0:
        rep["nem_elerheto"].append("git")
        rep["git_hiba"] = safe((r.stderr or rb.stderr).strip()[:200])
        return
    on_base = set(rb.stdout.split())
    latest: dict[str, dict] = {}
    for rec in r.stdout.split("\x1e"):
        if "\x1f" not in rec:
            continue
        sha, date, body = rec.lstrip("\n").split("\x1f", 2)
        lines = parse_allapot(body)
        if not lines:
            continue
        subject = body.strip().split("\n", 1)[0]
        prm = PR_SUBJ_RE.search(subject)
        mine: dict[str, list] = {}
        for ln in lines:
            hit = by.get(ln["szelet"].lower())
            if not hit:
                rep["ismeretlen_szelet"].add(ln["szelet"])
                continue
            if len(hit) > 1:
                rep["ketertelmu"].add(ln["szelet"])
                continue
            code = next(iter(hit))
            mine.setdefault(code, []).append(ln)
            lt = latest.setdefault(code, {})
            lt.setdefault("any", (ln, sha, date))  # topo-sorrend: az első a legújabb; egy commiton belül az utolsó sor
            if code in latest and lt["any"][1] == sha:
                lt["any"] = (ln, sha, date)
            if not ln["fazis"]:
                if "main" not in lt or lt["main"][1] == sha:
                    lt["main"] = (ln, sha, date)
        for code, lns in mine.items():
            st = "main" if sha in on_base else "ag"
            ch = link(c, code, "commit", sha, state=st, extra={"datum": date[:19], "targy": subject[:140]})
            allap = "; ".join(f"{x['szelet']}{' ' + x['fazis'] if x['fazis'] else ''} {x['k']}/{x['n']} → {x['kovetkezo']}"
                              for x in lns)
            ch |= add_event(c, code, "commit", f"{subject[:160]} | {allap}", actor="szinkron", evidence=sha[:12],
                            dedupe=f"commit:{sha}:{code}", at=date[:19])
            if prm:
                ch |= link(c, code, "pr", prm.group(1))
            ch |= _advance(c, code, "folyamatban", evidence=f"commit {sha[:12]}")
            rep["valtozas"] += ch
    for code, lt in latest.items():
        ch = False
        if "main" in lt:
            ln, sha, date = lt["main"]
            ch |= ensure_units(c, code, ln["n"])
            for seq in range(1, ln["n"] + 1):
                ch |= set_unit(c, code, seq, seq <= ln["k"], evidence=f"commit {sha[:12]}", at=date[:19])
        ln, sha, date = lt["any"]
        t = get_task(c, code)
        if ln["kovetkezo"] and (not t["next_step_at"] or _utc(date) > _utc(t["next_step_at"])):
            ch |= update_fields(c, code, next_step=ln["kovetkezo"], next_step_at=date)  # %cI: offsettel együtt
        rep["valtozas"] += ch


def gh_pr_list() -> list[dict]:
    r = subprocess.run(["gh", "pr", "list", "--repo", GH_REPO, "--state", "all", "--limit", "300", "--json",
                        "number,title,state,headRefName,mergeCommit,mergedAt,url,isDraft"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=GH_TIMEOUT)
    if r.returncode != 0:
        raise RuntimeError(safe((r.stderr or r.stdout).strip()[:200]))
    return json.loads(r.stdout or "[]")


def gh_open_threads(n: int, run=subprocess.run) -> int:
    """A nyitott (feloldatlan) review-szálak száma — MINDEN oldalt bejár (pageInfo); hiányos / hibás válasznál RuntimeError,
    hogy a hívó a korábbi számot megőrizze (nem ír 0-t)."""
    owner, name = GH_REPO.split("/")
    q = ("query($o:String!,$r:String!,$n:Int!,$c:String){repository(owner:$o,name:$r){pullRequest(number:$n)"
         "{reviewThreads(first:100,after:$c){nodes{isResolved} pageInfo{hasNextPage endCursor}}}}}")
    total, cursor = 0, None
    for _ in range(100):  # legfeljebb 10 000 szál; végtelen ciklus ellen
        args = ["gh", "api", "graphql", "-f", f"query={q}", "-f", f"o={owner}", "-f", f"r={name}", "-F", f"n={n}"]
        if cursor:
            args += ["-f", f"c={cursor}"]
        r = run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=GH_TIMEOUT)
        if r.returncode != 0:
            raise RuntimeError(safe((r.stderr or r.stdout).strip()[:200]))
        try:
            rt = json.loads(r.stdout)["data"]["repository"]["pullRequest"]["reviewThreads"]
            nodes, info = rt["nodes"], rt["pageInfo"]
            total += sum(1 for x in nodes if not x["isResolved"])
            more, cursor = bool(info["hasNextPage"]), info.get("endCursor")
        except (KeyError, TypeError, ValueError) as e:
            raise RuntimeError(f"hiányos review-szál válasz (PR #{n}): {e.__class__.__name__}") from None
        if not more:
            return total
        if not cursor:
            raise RuntimeError(f"hiányos review-szál válasz (PR #{n}): nincs endCursor")
    raise RuntimeError(f"túl sok review-szál oldal (PR #{n})")


def sync_gh(c, gh_prs, gh_threads, rep: dict) -> list[dict]:
    """PR-állapot → feladat (OPEN: review, MERGED: beolvadt + merge-SHA, CLOSED: esemény); gazdátlan nyitott PR → PR-<n>."""
    # 1) Hálózati gyűjtés NYITOTT írási tranzakció nélkül (a gyűjtő / más CLI közben írhat); 2) alkalmazás röviden.
    c.commit()
    try:
        prs = gh_prs()
    except Exception as e:  # noqa: BLE001 — hálózat / gh hiba: a helyi részek ettől még lefutnak
        rep["nem_elerheto"].append("gh")
        rep["gh_hiba"] = safe(str(e))[:200]
        return []
    threads: dict[str, int | None] = {}
    for pr in prs:
        if pr["state"] == "OPEN":
            try:
                threads[str(pr["number"])] = gh_threads(int(pr["number"])) if gh_threads else 0
            except Exception:  # noqa: BLE001 — a korábbi szálszám marad
                threads[str(pr["number"])] = None
                if "gh-szalak" not in rep["nem_elerheto"]:
                    rep["nem_elerheto"].append("gh-szalak")
    by_branch: dict[str, set] = {}
    for code, b in c.execute("SELECT code, branch FROM tasks WHERE branch IS NOT NULL"):
        by_branch.setdefault(b, set()).add(code)
    by_pr: dict[str, set] = {}
    for code, ref in c.execute("SELECT t.code, l.ref FROM task_links l JOIN tasks t ON t.id=l.task_id WHERE l.kind='pr'"):
        by_pr.setdefault(ref, set()).add(code)
    for pr in prs:
        n, st = str(pr["number"]), pr["state"]
        codes = set(by_pr.get(n, ())) | set(by_branch.get(pr.get("headRefName") or "", ()))
        head = pr.get("headRefName")
        if not codes and st == "OPEN":
            code = f"PR-{n}"
            if not get_task(c, code):
                new_task(c, code, pr["title"], origin="gh:pr", requirement_code=f"PR#{n}", status="review",
                         branch=head if head and mask(head) == head else None, source="szinkron", actor="szinkron")
                rep["uj"] += 1
                rep["valtozas"] += 1
            codes = {code}
        if not codes:
            continue
        merge = (pr.get("mergeCommit") or {}).get("oid")
        extra = {"cim": pr["title"][:140], "merge": merge, "nyitott_szalak": 0}
        if st == "OPEN":
            if threads.get(n) is None:
                extra = None  # sikertelen szál-lekérés: a korábbi szálszám (és extra) marad
            else:
                extra["nyitott_szalak"] = threads[n]
        for code in sorted(codes):
            prev = c.execute("SELECT l.state FROM task_links l JOIN tasks t ON t.id=l.task_id WHERE t.code=? AND l.kind='pr' "
                             "AND l.ref=?", (code, n)).fetchone()
            ch = link(c, code, "pr", n, state=st, extra=extra)
            if st == "OPEN":
                ch |= _advance(c, code, "review", evidence=f"PR #{n} nyitott")
            elif st == "MERGED" and not (prev and prev[0] == "MERGED"):
                # csak a merge ÉSZLELÉSEKOR léptet; a már ismert, régi merge történeti bizonyíték — egy regresszió miatt
                # kézzel újranyitott feladatot nem állít vissza beolvadt-ra
                ch |= _advance(c, code, "beolvadt", evidence=f"PR #{n} beolvadt ({(merge or '?')[:12]})")
                if merge:
                    ch |= link(c, code, "commit", merge, state="main")  # extra: a git-ág tölti (dátum, tárgy)
            elif st == "CLOSED":
                ch |= add_event(c, code, "pr", f"PR #{n} lezárva merge nélkül", actor="szinkron", dedupe=f"pr-closed:{n}:{code}")
            rep["valtozas"] += ch
    return prs


def sync_specs(c, repo: str, base: str, napok: int, extra_refs: list[str], rep: dict):
    """Új terv (még a gyűjtő sem ismeri, és egyetlen feladat sem hivatkozik rá) → SPEC:<téma> feladat, tervezve."""
    hatar = (dt.date.today() - dt.timedelta(days=napok)).isoformat()
    known = {r[0] for r in c.execute("SELECT spec FROM tasks WHERE spec IS NOT NULL")}
    known |= {r[0] for r in c.execute("SELECT ref FROM task_links WHERE kind='spec'")}
    for ref in [base, *extra_refs]:
        r = _git(repo, "ls-tree", "-r", "--name-only", ref, "--", "docs/specs")
        if r.returncode != 0:
            rep["nem_elerheto"].append(f"spec:{ref}")
            continue
        files = set(r.stdout.split())
        for f in sorted(files):
            mm = SPEC_RE.match(f)
            if not mm or mm.group(2).endswith("-vegrehajtas") or mm.group(1) < hatar or f in known:
                continue
            code = f"SPEC:{mm.group(1)}-{mm.group(2)}"
            if get_task(c, code) or c.execute("SELECT 1 FROM requirements WHERE code=?", (code,)).fetchone():
                continue  # a gyűjtő már ismeri: a követelmény-ág kezeli (kész terv nem lesz újra feladat)
            head = _git(repo, "show", f"{ref}:{f}").stdout.split("\n", 1)[0]
            title = head.lstrip("# ").strip() or code
            new_task(c, code, title, origin=f"spec:{ref}", status="tervezve", spec=f, source="szinkron", actor="szinkron")
            link(c, code, "spec", f)
            v = f[:-3] + "-vegrehajtas.md"
            if v in files:
                link(c, code, "spec", v)
            known.add(f)
            rep["uj"] += 1
            rep["valtozas"] += 1


def sync(c, repo: str, base: str = "origin/main", napok: int = 45, gh_prs=None, gh_threads=None, fetch: bool = False) -> dict:
    """Idempotens, újrafuttatható; a nem elérhető forrás semmit nem fokoz le (spec D6)."""
    rep = {"ido": now(), "valtozas": 0, "uj": 0, "nem_elerheto": [], "ismeretlen_szelet": set(), "ketertelmu": set()}
    if fetch and _git(repo, "fetch", "-q", "origin").returncode != 0:
        rep["nem_elerheto"].append("git-fetch")
    rq = sync_requirements(c)
    rep["uj"] += rq["uj"]
    rep["valtozas"] += rq["valtozas"]
    sync_git(c, repo, base, napok, rep)
    c.commit()  # a követelmény- és git-rész írásai lezárva, mielőtt a gh-hívások (hálózat) indulnak
    if gh_prs:
        prs = sync_gh(c, gh_prs, gh_threads, rep)
    else:
        prs = []
        rep["nem_elerheto"].append("gh")
    open_refs = []
    for p in prs:
        ref = f"refs/remotes/origin/{p.get('headRefName')}"
        if p["state"] == "OPEN" and _git(repo, "rev-parse", "-q", "--verify", ref).returncode == 0:
            open_refs.append(ref)
    if "git" not in rep["nem_elerheto"]:
        sync_specs(c, repo, base, napok, open_refs, rep)
    rep["ismeretlen_szelet"] = sorted(rep["ismeretlen_szelet"])
    rep["ketertelmu"] = sorted(rep["ketertelmu"])
    meta = {k: rep[k] for k in ("ido", "valtozas", "uj", "nem_elerheto")}
    c.execute("INSERT INTO feladat_meta(key,value) VALUES('utolso_szinkron',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
              (json.dumps(meta, ensure_ascii=False),))
    c.commit()  # rövid tranzakció: a gyűjtő (gyujt.py) ugyanazt a fájlt írja
    return rep


def cmd_szinkron(c, a):
    rep = sync(c, a.repo, base=a.alap, napok=a.napok, gh_prs=None if a.no_gh else gh_pr_list,
               gh_threads=None if a.no_gh else gh_open_threads, fetch=a.fetch)

    def txt():
        print(f"szinkron: változás {rep['valtozas']} (új feladat {rep['uj']}); nem elérhető: {', '.join(rep['nem_elerheto']) or '—'}")
        if not a.q and rep["ismeretlen_szelet"]:
            sz = rep["ismeretlen_szelet"]
            print(f"  feladat nélküli Állapot-szeletek ({len(sz)}): {', '.join(sz[:12])}{' …' if len(sz) > 12 else ''}")
        if not a.q and rep["ketertelmu"]:
            print(f"  kétértelmű szeletnév (több feladat): {', '.join(rep['ketertelmu'])}")
    _out(a, rep, txt)


# ---------------------------------------------------------------- visszatöltés (kurált ismert feladatok)
FIELDS_VT = ("goal", "origin", "requirement_code", "parent", "szelet", "next_step", "blocker", "branch", "spec", "notes")


def _full_sha(repo: str | None, sha: str) -> str:
    if repo:
        r = _git(repo, "rev-parse", "-q", "--verify", f"{sha}^{{commit}}")
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    return sha


def visszatoltes(c, path: str, repo: str | None = None) -> dict:
    """Idempotens: új feladat létrehozása; meglévőnél csak a hiányzó mező / egység / feltétel / hivatkozás pótlása, és az
    állapot csak előre (az állapotgép szerint) lép. A kapcsoló-döntések INSERT OR IGNORE-ral kerülnek be."""
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    rep = {"uj": 0, "valtozas": 0}
    for f in d.get("feladatok", []):
        code = f["code"]
        fields = {k: f.get(k) for k in FIELDS_VT if f.get(k) is not None}
        t = get_task(c, code)
        if not t:
            new_task(c, code, f["title"], priority=f.get("priority", 3), source="visszatoltes", actor="visszatoltes", **fields)
            rep["uj"] += 1
            rep["valtozas"] += 1
        else:
            fill = {k: v for k, v in fields.items() if t[k] in (None, "")}
            if fill:
                rep["valtozas"] += update_fields(c, code, **fill)
        tid = _tid(c, code)
        n_u = c.execute("SELECT count(*) FROM task_units WHERE task_id=?", (tid,)).fetchone()[0]
        for title in f.get("egysegek", [])[n_u:]:
            add_unit(c, code, title)
            rep["valtozas"] += 1
        for seq in range(1, int(f.get("egysegek_kesz", 0)) + 1):
            rep["valtozas"] += set_unit(c, code, seq, True, evidence=f.get("bizonyitek"))
        n_k = c.execute("SELECT count(*) FROM task_criteria WHERE task_id=?", (tid,)).fetchone()[0]
        for i, k in enumerate(f.get("kriteriumok", []), start=1):
            k = k if isinstance(k, dict) else {"text": k}
            if i > n_k:
                add_criterion(c, code, k["text"])
                rep["valtozas"] += 1
            if k.get("met"):
                rep["valtozas"] += set_criterion(c, code, i, True, evidence=k.get("evidence") or f.get("bizonyitek"))
        links = [("pr", str(n), None) for n in f.get("prs", [])]
        links += [("commit", _full_sha(repo, s), "main") for s in f.get("commits", [])]
        links += [("spec", s, None) for s in ([f["spec"]] if f.get("spec") else []) + f.get("specek", [])]
        links += [("requirement", r, None) for r in ([f["requirement_code"]] if f.get("requirement_code") else []) + f.get("lefedi", [])]
        links += [("flag", n, None) for n in f.get("kapcsolok", [])]
        links += [("kanban", k, None) for k in f.get("kanban", [])]
        links += [(x["kind"], x["ref"], x.get("state")) for x in f.get("linkek", [])]
        for kind, ref, st in links:
            rep["valtozas"] += link(c, code, kind, ref, state=st)
        want = f.get("status", "beadva")
        cur = get_task(c, code)["status"]
        if want != cur and can_transition(cur, want) and (want in MELLEK or cur in MELLEK
                                                           or FO_LANC.index(want) > FO_LANC.index(cur)):
            try:
                rep["valtozas"] += set_status(c, code, want, actor="visszatoltes", source="visszatoltes",
                                              evidence=f.get("bizonyitek"))
            except AllapotHiba:  # pl. kesz nyitott feltétellel: marad, jelentjük
                rep.setdefault("kihagyva", []).append(code)
    for k in d.get("kapcsolo_dontesek", []):
        rep["valtozas"] += flag_decision(c, k["name"], k["value"], k["decided_at"], source=k.get("source"),
                                         task_code=k.get("task_code"))
    c.commit()
    return rep


def cmd_visszatoltes(c, a):
    rep = visszatoltes(c, a.fajl, repo=a.repo)
    _out(a, rep, lambda: print(f"visszatöltés: új feladat {rep['uj']}, változás {rep['valtozas']}"
                                + (f"; kihagyott állapot: {', '.join(rep['kihagyva'])}" if rep.get("kihagyva") else "")))


COMMANDS: dict = {}


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="feladat.py", description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=os.environ.get("KOVETELMENY_DB", str(DEFAULT_DB)))
    ap.add_argument("--repo", default=os.environ.get("WEBSULI_REPO") or str(HERE.parent.parent))
    ap.add_argument("--json", action="store_true", help="gépi (JSON) kimenet")
    ap.add_argument("--ha-van-db", action="store_true", help="ha a DB nem létezik, csendben kilép (kapukból, CI-ben)")
    ap.add_argument("-q", action="store_true", help="tömör kimenet")
    sp = ap.add_subparsers(dest="cmd", required=True)

    def add(name, fn, help_):
        COMMANDS[name] = fn
        return sp.add_parser(name, help=help_)

    add("migral", cmd_migral, "séma létrehozása / frissítése")
    p = add("uj", cmd_uj, "új feladat")
    p.add_argument("code")
    p.add_argument("cim")
    for o in ("--cel", "--szelet", "--szulo", "--kovetelmeny", "--forras", "--ag", "--spec", "--kovetkezo"):
        p.add_argument(o)
    p.add_argument("--prio", type=int, default=3)
    p.add_argument("--allapot", default="beadva", choices=STATUSES)
    p = add("terv", cmd_terv, "egységek / elfogadási feltételek hozzáadása")
    p.add_argument("code")
    p.add_argument("--egyseg", action="append")
    p.add_argument("--kriterium", action="append")
    for name, fn, flag in (("egyseg", cmd_egyseg, "kesz"), ("kriterium", cmd_kriterium, "teljesult")):
        p = add(name, fn, f"{name} állítása")
        p.add_argument("code")
        p.add_argument("seq", type=int)
        g = p.add_mutually_exclusive_group(required=True)
        g.add_argument(f"--{flag}", dest=flag, action="store_true")
        g.add_argument("--nyitott", dest=flag, action="store_false")
        p.add_argument("--bizonyitek")
    p = add("allapot", cmd_allapot, "állapot / következő lépés / blokkoló")
    p.add_argument("code")
    p.add_argument("uj", nargs="?", choices=STATUSES)
    for o in ("--kovetkezo", "--blokkolo", "--bizonyitek", "--indok"):
        p.add_argument(o)
    p.add_argument("--force", action="store_true")
    p = add("esemeny", cmd_esemeny, "idővonal-bejegyzés")
    p.add_argument("code")
    p.add_argument("szoveg")
    p.add_argument("--fajta", default="megjegyzes")
    p.add_argument("--bizonyitek")
    p = add("kapcsol", cmd_kapcsol, "hivatkozás (PR, commit, spec, kanban, lelet, kapcsoló…)")
    p.add_argument("code")
    p.add_argument("fajta", choices=LINK_KINDS)
    p.add_argument("ref")
    p.add_argument("--allapot")
    p = add("kapcsolo", cmd_kapcsolo, "tulajdonosi kapcsoló-döntés / döntések az élő értékkel")
    p.add_argument("nev", nargs="?")
    p.add_argument("ertek", nargs="?")
    for o in ("--forras", "--feladat", "--datum"):
        p.add_argument(o)
    p = add("lista", cmd_lista, "feladatlista")
    p.add_argument("--nyitott", action="store_true")
    p.add_argument("--allapot")
    p.add_argument("--limit", type=int, default=60)
    p = add("tetel", cmd_tetel, "egy feladat részletesen")
    p.add_argument("code")
    p.add_argument("--limit", type=int, default=15)
    p = add("attekintes", cmd_attekintes, "egy képernyős áttekintés")
    p.add_argument("--limit", type=int, default=25)
    p.add_argument("--minden", action="store_true")
    p = add("kereses", cmd_kereses, "FTS-keresés")
    p.add_argument("q")
    p.add_argument("--limit", type=int, default=20)
    p = add("szinkron", cmd_szinkron, "git Állapot-sorok, gh PR-ok, specek, követelmények → feladatok (idempotens)")
    p.add_argument("--alap", default="origin/main")
    p.add_argument("--napok", type=int, default=45)
    p.add_argument("--no-gh", action="store_true")
    p.add_argument("--fetch", action="store_true")
    p = add("visszatoltes", cmd_visszatoltes, "kurált ismert feladatok + kapcsoló-döntések betöltése (idempotens)")
    p.add_argument("--fajl", default=str(HERE / "feladatok.json"))
    return ap


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            pass  # nem újrakonfigurálható kimenet (pl. átirányított cső): az alapkódolás marad — szándékos
    a = build_parser().parse_args(argv)
    if a.ha_van_db and not Path(a.db).exists():
        if not a.q:
            print("feladat-nyilvántartás: nincs DB — kihagyva")
        return 0
    c = connect(a.db)
    try:
        COMMANDS[a.cmd](c, a)
        c.commit()
        return 0
    except AllapotHiba as e:
        c.rollback()
        print(f"HIBA: {safe(e)}", file=sys.stderr)
        return 2
    finally:
        c.close()


if __name__ == "__main__":
    sys.exit(main())

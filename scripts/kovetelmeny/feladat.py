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
# attekintes sorrend: ami mozgásban van, előre
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
    "v_keszultseg": f"""
SELECT x.*, CASE WHEN x.nu + x.nk > 0 THEN CAST(round(100.0 * (x.du + x.mk) / (x.nu + x.nk)) AS INTEGER)
                 ELSE CASE x.status {_PCT_CASE} ELSE 0 END END AS pct,
       CASE WHEN x.nu + x.nk > 0 THEN 'meres' ELSE 'allapot' END AS alap
FROM (SELECT t.id AS task_id, t.code, t.status,
        (SELECT count(*) FROM task_units u WHERE u.task_id = t.id) AS nu,
        (SELECT coalesce(sum(u.done), 0) FROM task_units u WHERE u.task_id = t.id) AS du,
        (SELECT count(*) FROM task_criteria k WHERE k.task_id = t.id) AS nk,
        (SELECT coalesce(sum(k.met), 0) FROM task_criteria k WHERE k.task_id = t.id) AS mk
      FROM tasks t) x""",
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
    except OSError:
        pass


def migrate(c: sqlite3.Connection):
    """Idempotens: csak új táblák / nézetek (IF NOT EXISTS; a nézetek fix szövegből újraépülnek). A meglévő
    követelmény-táblák sorait nem érinti."""
    c.executescript(SCHEMA)
    for name, sql in VIEWS.items():  # fix nevek és fix SQL
        c.execute(f"DROP VIEW IF EXISTS {name}")
        c.execute(f"CREATE VIEW {name} AS {sql}")
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
                    (_tid(c, code), at or now(), actor, kind, m(detail), m(evidence), dedupe))
    return cur.rowcount > 0


def new_task(c, code: str, title: str, *, goal=None, origin=None, requirement_code=None, parent=None, priority: int = 3,
             status: str = "beadva", szelet=None, next_step=None, blocker=None, branch=None, spec=None, notes=None,
             source: str = "kezi", actor: str = "kezi") -> int:
    if get_task(c, code):
        raise AllapotHiba(f"már létezik: {code}")
    if status not in STATUSES:
        raise AllapotHiba(f"ismeretlen állapot: {status}")
    t = now()
    cur = c.execute("""INSERT INTO tasks(code,title,goal,origin,requirement_code,parent,priority,status,szelet,next_step,
                       next_step_at,blocker,branch,spec,notes,created_at,updated_at,status_source)
                       VALUES(?,?,?,?,?,?,?,'beadva',?,?,?,?,?,?,?,?,?,?)""",
                    (code, m(title) or code, m(goal), m(origin), requirement_code, parent, int(priority), szelet, m(next_step),
                     t if next_step else None, m(blocker), branch, spec, m(notes), t, t, source))
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
    if old == new:
        return False
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
        if t[k] != v:
            ch[k] = v
    if not ch:
        return False
    if "next_step" in ch and "next_step_at" not in kw:
        ch["next_step_at"] = now()
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
    cur = c.execute("INSERT OR IGNORE INTO flag_decisions(name,value,decided_at,source,task_code) VALUES(?,?,?,?,?)",
                    (name.strip().upper(), m(value), decided_at, m(source), task_code))
    if cur.rowcount and task_code and get_task(c, task_code):
        link(c, task_code, "flag", name.strip().upper(), state=m(value))
    return cur.rowcount > 0


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
    return sorted(rows, key=lambda r: (RANG.get(r["status"], 9), r["priority"], -_ts(r["updated_at"])))


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
    _out(a, {"valtozott": ch}, lambda: print(f"{a.code} ↔ {a.fajta}:{a.ref} ({'új/változott' if ch else 'változatlan'})"))


def cmd_kapcsolo(c, a):
    if a.nev:
        if not a.ertek or not a.forras:
            raise AllapotHiba("kapcsoló-döntéshez: <NÉV> <érték> --forras <ki/hol döntött>")
        flag_decision(c, a.nev, a.ertek, a.datum or now()[:10], source=a.forras, task_code=a.feladat)
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
    return ap


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            pass
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

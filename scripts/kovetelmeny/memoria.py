#!/usr/bin/env python3
"""WEBSULI projekt-memória (PROJEKT-MEMORIA-SQL) a helyi követelmény-adatbázisban (kovetelmenyek.db, repón kívül).

A feladat-nyilvántartás (feladat.py) és a követelmény-gyűjtő (gyujt.py) tábláit két új táblával egészíti ki — a tulajdonos
KIADOTT utasításai és azok végrehajtása (`utasitasok`), valamint a folyamat-futások (`folyamatok`: kapulánc, deploy, mérés,
elemzés) —, és egy jelentésben felel arra, hogy mi a kiadott / végrehajtott utasítás, mi fut, mi zárult le, milyen kódolás készült,
mi a hátralék, a hiányosság és a teendő. Terv: docs/specs/2026-11-26-projekt-memoria-sql.md.

Parancsok (mindegyik `--json`-nal is):
  utasitas <szöveg> [--forras tulajdonos|ugynok] [--feladat KÓD] [--kovetelmeny KÓD] [--felulirja ID] [--dedupe KULCS]
  utasitas-allapot <id> <kiadva|folyamatban|vegrehajtva|reszben|elvetve> [--bizonyitek]
  utasitasok [--nyitott]
  folyamat-start <fajta> <ref> [--feladat KÓD] [--leiras]
  folyamat-vege <id> <ok|bukott|megszakadt> [--osszegzes] [--bizonyitek]
  jelentes [--napok 7]
Minden bevitt szöveg maszkolva kerül a DB-be (maszk.py); az SQL ?-paraméteres.
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
import feladat as F  # noqa: E402
from maszk import mask, mask_obj, safe  # noqa: E402

SEMA_VERZIO = 1
UTASITAS_ALLAPOT = ("kiadva", "folyamatban", "vegrehajtva", "reszben", "felulirva", "elvetve")
UTASITAS_NYITOTT = ("kiadva", "folyamatban", "reszben")
FORRAS = ("tulajdonos", "ugynok")
FOLYAMAT_FAJTA = ("kapulanc", "deploy", "e2e", "unit", "elemzes", "revizio", "szinkron", "egyeb")
FOLYAMAT_EREDMENY = ("fut", "ok", "bukott", "megszakadt")
ELAKADT_ORA = 24

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS utasitasok(
  id INTEGER PRIMARY KEY, at TEXT NOT NULL,
  forras TEXT NOT NULL DEFAULT 'tulajdonos' CHECK(forras IN ({F._in(FORRAS)})),
  szoveg TEXT NOT NULL, task_code TEXT, requirement_code TEXT,
  allapot TEXT NOT NULL DEFAULT 'kiadva' CHECK(allapot IN ({F._in(UTASITAS_ALLAPOT)})),
  vegrehajtva_at TEXT, bizonyitek TEXT, felulirta INTEGER REFERENCES utasitasok(id), dedupe TEXT UNIQUE, updated_at TEXT);
CREATE INDEX IF NOT EXISTS ix_utasitas_allapot ON utasitasok(allapot);
CREATE TABLE IF NOT EXISTS folyamatok(
  id INTEGER PRIMARY KEY, fajta TEXT NOT NULL CHECK(fajta IN ({F._in(FOLYAMAT_FAJTA)})), ref TEXT, task_code TEXT,
  leiras TEXT, started_at TEXT NOT NULL, finished_at TEXT,
  eredmeny TEXT NOT NULL DEFAULT 'fut' CHECK(eredmeny IN ({F._in(FOLYAMAT_EREDMENY)})), osszegzes TEXT, bizonyitek TEXT);
CREATE INDEX IF NOT EXISTS ix_folyamat_eredmeny ON folyamatok(eredmeny, started_at);
"""


def migrate(c: sqlite3.Connection):
    """Idempotens: csak új táblák (IF NOT EXISTS); a meglévő táblák sorait nem érinti."""
    c.executescript(SCHEMA)
    c.execute("INSERT INTO feladat_meta(key,value) VALUES('memoria_sema_verzio',?) ON CONFLICT(key) DO UPDATE SET "
              "value=excluded.value WHERE value IS NOT excluded.value", (str(SEMA_VERZIO),))
    c.commit()


def connect(path: str) -> sqlite3.Connection:
    c = F.connect(path)
    migrate(c)
    return c


def _m(v):
    return None if v is None else mask(str(v))


# ---------------------------------------------------------------- utasítások
def add_instruction(c, text: str, *, forras: str = "tulajdonos", task_code=None, requirement_code=None, felulirja=None,
                    dedupe=None) -> int:
    if forras not in FORRAS:
        raise F.AllapotHiba(f"ismeretlen forrás: {forras}")
    if not str(text).strip():
        raise F.AllapotHiba("üres utasítás")
    for name, val in (("feladat", task_code), ("kovetelmeny", requirement_code), ("dedupe", dedupe)):
        F._ident(name, val)  # review #623: azonosító — érzékeny tartalomnál elutasítás (a maszkolás eltörné a kapcsolást)
    if task_code and not F.get_task(c, task_code):
        raise F.AllapotHiba(f"ismeretlen feladat: {task_code}")
    # review #623: a felülírt utasítás létezését a beszúrás ELŐTT ellenőrizzük (különben az új sor önmagát írná felül)
    if felulirja is not None and not c.execute("SELECT 1 FROM utasitasok WHERE id=?", (felulirja,)).fetchone():
        raise F.AllapotHiba(f"ismeretlen felülírt utasítás: {felulirja}")
    if dedupe:
        row = c.execute("SELECT id FROM utasitasok WHERE dedupe=?", (dedupe,)).fetchone()
        if row:
            return row["id"]
    ts = F.now()
    cur = c.execute("INSERT INTO utasitasok(at, forras, szoveg, task_code, requirement_code, dedupe, updated_at) "
                    "VALUES(?,?,?,?,?,?,?)", (ts, forras, _m(text), task_code, requirement_code, dedupe, ts))
    uid = cur.lastrowid
    if felulirja is not None:
        c.execute("UPDATE utasitasok SET allapot='felulirva', felulirta=?, updated_at=? WHERE id=?", (uid, ts, felulirja))
    if task_code:
        F.add_event(c, task_code, "utasitas", f"utasítás #{uid}: {_m(text)}", actor=forras)
    return uid


def set_instruction(c, uid: int, allapot: str, evidence=None):
    if allapot not in UTASITAS_ALLAPOT or allapot == "felulirva":
        raise F.AllapotHiba(f"nem állítható állapot: {allapot} (felülírás: új utasítás --felulirja)")
    row = c.execute("SELECT allapot, task_code FROM utasitasok WHERE id=?", (uid,)).fetchone()
    if not row:
        raise F.AllapotHiba(f"ismeretlen utasítás: {uid}")
    if row["allapot"] in ("felulirva", "elvetve"):
        raise F.AllapotHiba(f"lezárt utasítás ({row['allapot']}): {uid}")
    if allapot == "vegrehajtva" and not (evidence and str(evidence).strip()):
        raise F.AllapotHiba("végrehajtottnak csak bizonyítékkal jelölhető (commit / PR / mérés / élő ellenőrzés)")
    ts = F.now()
    c.execute("UPDATE utasitasok SET allapot=?, bizonyitek=coalesce(?, bizonyitek), updated_at=?, "
              "vegrehajtva_at=CASE WHEN ?='vegrehajtva' THEN ? ELSE vegrehajtva_at END WHERE id=?",
              (allapot, _m(evidence), ts, allapot, ts, uid))
    if row["task_code"]:
        F.add_event(c, row["task_code"], "utasitas", f"utasítás #{uid} → {allapot}", evidence=_m(evidence))


# ---------------------------------------------------------------- folyamatok
def start_process(c, fajta: str, ref, *, task_code=None, leiras=None) -> int:
    if fajta not in FOLYAMAT_FAJTA:
        raise F.AllapotHiba(f"ismeretlen folyamat-fajta: {fajta} ({', '.join(FOLYAMAT_FAJTA)})")
    F._ident("feladat", task_code)
    if task_code and not F.get_task(c, task_code):
        raise F.AllapotHiba(f"ismeretlen feladat: {task_code}")
    cur = c.execute("INSERT INTO folyamatok(fajta, ref, task_code, leiras, started_at) VALUES(?,?,?,?,?)",
                    (fajta, _m(ref), task_code, _m(leiras), F.now()))
    return cur.lastrowid


def finish_process(c, fid: int, eredmeny: str, *, summary=None, evidence=None):
    if eredmeny not in FOLYAMAT_EREDMENY or eredmeny == "fut":
        raise F.AllapotHiba(f"érvénytelen eredmény: {eredmeny}")
    row = c.execute("SELECT eredmeny, task_code, fajta, ref FROM folyamatok WHERE id=?", (fid,)).fetchone()
    if not row:
        raise F.AllapotHiba(f"ismeretlen folyamat: {fid}")
    # review #623: atomi — csak a még futó sor zárható le (két párhuzamos lezárásból egy nyer)
    cur = c.execute("UPDATE folyamatok SET eredmeny=?, finished_at=?, osszegzes=?, bizonyitek=? WHERE id=? AND eredmeny='fut'",
                    (eredmeny, F.now(), _m(summary), _m(evidence), fid))
    if cur.rowcount == 0:
        raise F.AllapotHiba(f"a folyamat már lezárult ({row['eredmeny']}): {fid}")
    if row["task_code"] and F.get_task(c, row["task_code"]):
        F.add_event(c, row["task_code"], "folyamat", f"{row['fajta']} {row['ref'] or ''} → {eredmeny}: {_m(summary) or ''}",
                    evidence=_m(evidence))


# ---------------------------------------------------------------- jelentés
def _rows(cur) -> list[dict]:
    return [dict(r) for r in cur]


# review #623: a közös állapotgépből — csak a `kesz`, `elvetve`, `felulirva` lezárt (a beolvadt / élesített még élő ellenőrzésre vár).
LEZART_FELADAT = F.LEZART
NYITOTT_FELADAT = tuple(s for s in F.STATUSES if s not in F.LEZART)


def _git_commits(repo: str | None, tol: str) -> list[dict]:
    """A main commitjai az időszakban (`origin/main`, ennek híján `main`), az `Állapot:` sorral. Git-hiba: üres lista."""
    if not repo:
        return []
    for ref in ("origin/main", "main"):
        try:
            r = subprocess.run(["git", "-C", repo, "log", ref, f"--since={tol}", "--format=%H%x1f%cI%x1f%s%x1f%b%x1e"],
                               capture_output=True, text=True, encoding="utf-8", timeout=60)
        except (OSError, subprocess.SubprocessError):
            return []
        if r.returncode == 0:
            out = []
            for rec in r.stdout.split("\x1e"):
                parts = rec.strip("\n").split("\x1f")
                if len(parts) < 4:
                    continue
                m = re.search(r"^Állapot:\s*(.+)$", parts[3], re.M)
                out.append({"ref": parts[0], "date": parts[1], "title": parts[2], "allapot": m.group(1).strip() if m else None})
            return out
    return []


def report(c, napok: int = 7, repo: str | None = None) -> dict:
    tol = (dt.datetime.now() - dt.timedelta(days=napok)).isoformat(timespec="seconds")
    tol_nap = tol[:10]  # review #623: a gyűjtő a commit dátumát nap pontossággal tárolja (gyujt.py: date[:10])
    elakadt_hatar = (dt.datetime.now() - dt.timedelta(hours=ELAKADT_ORA)).isoformat(timespec="seconds")
    q = lambda sql, *p: _rows(c.execute(sql, p))  # noqa: E731
    nyitott = F._in(UTASITAS_NYITOTT)
    rep = {
        "idoszak_napok": napok,
        "kiadott_utasitasok": q(f"SELECT id, at, forras, szoveg, task_code, allapot FROM utasitasok WHERE allapot IN ({nyitott}) "
                                "ORDER BY at"),
        "vegrehajtott_utasitasok": q("SELECT id, at, szoveg, task_code, vegrehajtva_at, bizonyitek FROM utasitasok "
                                     "WHERE allapot='vegrehajtva' AND vegrehajtva_at >= ? ORDER BY vegrehajtva_at DESC", tol),
        "futo_folyamatok": q("SELECT id, fajta, ref, task_code, started_at, leiras FROM folyamatok WHERE eredmeny='fut' "
                             "AND started_at >= ? ORDER BY started_at", elakadt_hatar),
        "elakadt_folyamatok": q("SELECT id, fajta, ref, task_code, started_at FROM folyamatok WHERE eredmeny='fut' "
                                "AND started_at < ? ORDER BY started_at", elakadt_hatar),
        "lezart_folyamatok": q("SELECT id, fajta, ref, task_code, started_at, finished_at, eredmeny, osszegzes FROM folyamatok "
                               "WHERE eredmeny<>'fut' AND finished_at >= ? ORDER BY finished_at DESC", tol),
        "elvegzett_kodolas": _merge_commits(
            [{"ref": r["ref"], "date": r["date"], "title": r["title"], "allapot": json.loads(r["extra"] or "{}").get("allapot")}
             for r in c.execute("SELECT ref, date, title, extra FROM sources WHERE kind='commit' AND date >= ? "
                                "AND json_extract(coalesce(extra,'{}'), '$.main') = 1", (tol_nap,))],
            _git_commits(repo, tol)),
        "lezart_feladatok": q(f"SELECT code, title, status, updated_at FROM tasks WHERE status IN ({F._in(LEZART_FELADAT)}) "
                              "AND updated_at >= ? ORDER BY updated_at DESC", tol),
        "hatralek": [r for r in q(f"SELECT t.code, t.title, t.status, t.priority, k.pct, t.blocker FROM tasks t "
                                  f"JOIN v_keszultseg k ON k.task_id = t.id WHERE t.status IN ({F._in(NYITOTT_FELADAT)})")
                     ],
        "hianyossagok": (
            [{"fajta": "lelet", "code": r["code"], "sulyossag": r["severity"], "leiras": r["detail"]}
             for r in c.execute("SELECT r.code, f.severity, f.detail FROM findings f LEFT JOIN requirements r "
                                "ON r.id = f.requirement_id WHERE f.status='nyitott' ORDER BY "
                                "CASE f.severity WHEN 'magas' THEN 0 WHEN 'kozepes' THEN 1 ELSE 2 END, f.id")]
            + [{"fajta": "kovetelmeny", "code": r["code"], "sulyossag": r["status"], "leiras": r["title"]}
               for r in c.execute("SELECT code, title, status FROM requirements WHERE status IN "
                                  "('elvart','reszben','elfelejtett','felkesz') AND superseded_by IS NULL ORDER BY code")]),
        "teendok": [{"code": r["code"], "prioritas": r["priority"], "kovetkezo": r["next_step"], "blokkolo": r["blocker"]}
                    for r in c.execute("SELECT code, priority, next_step, blocker FROM tasks WHERE status NOT IN "
                                       "('kesz','elvetve','felulirva') AND coalesce(next_step,'') <> '' "
                                       "ORDER BY priority, updated_at DESC")],
    }
    rep["hatralek"].sort(key=lambda r: (r["priority"], F.RANG.get(r["status"], 9), -(r["pct"] or 0)))
    return rep


def _merge_commits(a: list[dict], b: list[dict]) -> list[dict]:
    """A gyűjtő (sources) és a git-napló commitjai hash szerint egyesítve, legújabb elöl (a git a frissebb)."""
    by = {r["ref"]: r for r in a}
    by.update({r["ref"]: r for r in b})
    return sorted(by.values(), key=lambda r: str(r["date"]), reverse=True)[:300]


CIMEK = (("kiadott_utasitasok", "Kiadott utasítások (nyitott)"), ("vegrehajtott_utasitasok", "Végrehajtott utasítások"),
         ("futo_folyamatok", "Futó folyamatok"), ("elakadt_folyamatok", "Elakadt folyamatok (> 24 óra)"),
         ("lezart_folyamatok", "Lezárt folyamatok"), ("elvegzett_kodolas", "Elvégzett kódolás (main)"),
         ("lezart_feladatok", "Lezárt feladatok"), ("hatralek", "Hátralék"), ("hianyossagok", "Hiányosságok"),
         ("teendok", "Teendők"))


def _line(key: str, r: dict) -> str:
    if key in ("kiadott_utasitasok", "vegrehajtott_utasitasok"):
        return f"#{r['id']} [{r.get('task_code') or '—'}] {F._cut(r['szoveg'], 110)}" + (
            f" — {F._cut(r.get('bizonyitek'), 50)}" if r.get("bizonyitek") else f" ({r.get('allapot', '')})")
    if key.endswith("folyamatok"):
        return (f"#{r['id']} {r['fajta']} {r.get('ref') or ''} [{r.get('task_code') or '—'}] {r.get('started_at')}"
                + (f" → {r['eredmeny']}: {F._cut(r.get('osszegzes'), 60)}" if r.get("eredmeny") else ""))
    if key == "elvegzett_kodolas":
        return f"{str(r['ref'])[:8]} {F._cut(r['title'], 90)}" + (f" | {F._cut(r['allapot'], 50)}" if r.get("allapot") else "")
    if key == "lezart_feladatok":
        return f"{r['code']} {r['status']} {F._cut(r['title'], 90)}"
    if key == "hatralek":
        return f"p{r['priority']} {r['code']} {r['status']} {r['pct']}% {F._cut(r['title'], 80)}" + (
            f" | blokkoló: {F._cut(r['blocker'], 40)}" if r.get("blocker") else "")
    if key == "hianyossagok":
        return f"[{r['fajta']}] {r.get('code') or '—'} ({r.get('sulyossag') or '—'}) {F._cut(r['leiras'], 100)}"
    return f"p{r['prioritas']} {r['code']}: {F._cut(r['kovetkezo'], 100)}" + (
        f" | blokkoló: {F._cut(r['blokkolo'], 40)}" if r.get("blokkolo") else "")


def print_report(rep: dict, limit: int):
    print(f"WEBSULI projekt-memória — időszak: {rep['idoszak_napok']} nap")
    for key, cim in CIMEK:
        rows = rep[key]
        print(f"\n## {cim} ({len(rows)})")
        for r in rows[:limit]:
            print("  " + safe(_line(key, r)))
        if len(rows) > limit:
            print(f"  … és még {len(rows) - limit}")


# ---------------------------------------------------------------- CLI
def _out(a, obj, text_fn):
    if a.json:
        print(json.dumps(obj, ensure_ascii=False, default=str))
    else:
        text_fn()


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="memoria.py", description=(__doc__ or "").split("\n")[0])
    ap.add_argument("--db", default=os.environ.get("KOVETELMENY_DB", str(F.DEFAULT_DB)))
    ap.add_argument("--repo", default=os.environ.get("WEBSULI_REPO") or str(HERE.parent.parent))
    ap.add_argument("--json", action="store_true", help="gépi (JSON) kimenet")
    sp = ap.add_subparsers(dest="cmd", required=True)

    def add(name, help_):
        p = sp.add_parser(name, help=help_)
        p.add_argument("--json", action="store_true", default=argparse.SUPPRESS)
        return p

    p = add("utasitas", "kiadott utasítás felvétele")
    p.add_argument("szoveg")
    p.add_argument("--forras", default="tulajdonos", choices=FORRAS)
    p.add_argument("--feladat")
    p.add_argument("--kovetelmeny")
    p.add_argument("--felulirja", type=int)
    p.add_argument("--dedupe")
    p = add("utasitas-allapot", "utasítás állapota (végrehajtva: csak bizonyítékkal)")
    p.add_argument("id", type=int)
    p.add_argument("allapot", choices=[s for s in UTASITAS_ALLAPOT if s != "felulirva"])
    p.add_argument("--bizonyitek")
    p = add("utasitasok", "utasítások listája")
    p.add_argument("--nyitott", action="store_true")
    p = add("folyamat-start", "folyamat-futás indítása")
    p.add_argument("fajta", choices=FOLYAMAT_FAJTA)
    p.add_argument("ref")
    p.add_argument("--feladat")
    p.add_argument("--leiras")
    p = add("folyamat-vege", "folyamat-futás lezárása")
    p.add_argument("id", type=int)
    p.add_argument("eredmeny", choices=[s for s in FOLYAMAT_EREDMENY if s != "fut"])
    p.add_argument("--osszegzes")
    p.add_argument("--bizonyitek")
    p = add("jelentes", "projekt-memória jelentés (kiadott / végrehajtott utasítás, folyamat, kódolás, hátralék, hiányosság, teendő)")
    p.add_argument("--napok", type=int, default=7)
    p.add_argument("--limit", type=int, default=25)
    return ap


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            pass  # nem újrakonfigurálható kimenet: az alapkódolás marad — szándékos
    a = build_parser().parse_args(argv)
    c = connect(a.db)
    try:
        if a.cmd == "utasitas":
            uid = add_instruction(c, a.szoveg, forras=a.forras, task_code=a.feladat, requirement_code=a.kovetelmeny,
                                  felulirja=a.felulirja, dedupe=a.dedupe)
            _out(a, {"id": uid}, lambda: print(f"utasítás #{uid} felvéve"))
        elif a.cmd == "utasitas-allapot":
            set_instruction(c, a.id, a.allapot, a.bizonyitek)
            _out(a, {"id": a.id, "allapot": a.allapot}, lambda: print(f"utasítás #{a.id}: {a.allapot}"))
        elif a.cmd == "utasitasok":
            # review #623 (Sourcery): paraméterezett IN-lista (a konstans-literál helyett is) — SQL-összefűzés nélkül.
            sql = "SELECT id, at, forras, allapot, task_code, szoveg, bizonyitek FROM utasitasok"
            params: tuple = ()
            if a.nyitott:
                sql += " WHERE allapot IN (" + ",".join("?" * len(UTASITAS_NYITOTT)) + ")"
                params = tuple(UTASITAS_NYITOTT)
            rows = _rows(c.execute(sql + " ORDER BY at", params))
            _out(a, rows, lambda: [print(safe(f"#{r['id']} {r['allapot']:<11} [{r['task_code'] or '—'}] "
                                              f"{F._cut(r['szoveg'], 120)}")) for r in rows])
        elif a.cmd == "folyamat-start":
            fid = start_process(c, a.fajta, a.ref, task_code=a.feladat, leiras=a.leiras)
            _out(a, {"id": fid}, lambda: print(f"folyamat #{fid} indult"))
        elif a.cmd == "folyamat-vege":
            finish_process(c, a.id, a.eredmeny, summary=a.osszegzes, evidence=a.bizonyitek)
            _out(a, {"id": a.id, "eredmeny": a.eredmeny}, lambda: print(f"folyamat #{a.id}: {a.eredmeny}"))
        elif a.cmd == "jelentes":
            rep = report(c, a.napok, a.repo)
            # review #623: a gépi kimenet is maszkolt (a git-napló nyers commitcímei / Állapot-sorai is)
            _out(a, mask_obj(rep), lambda: print_report(rep, a.limit))
        c.commit()
        return 0
    except F.AllapotHiba as e:
        c.rollback()
        print(f"HIBA: {safe(e)}", file=sys.stderr)
        return 2
    finally:
        c.close()


if __name__ == "__main__":
    sys.exit(main())

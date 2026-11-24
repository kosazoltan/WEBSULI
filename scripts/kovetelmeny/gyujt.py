#!/usr/bin/env python3
"""WEBSULI követelmény-adatbázis gyűjtő (idempotens, újrafuttatható).

Források (180 nap): git-commitok, GitHub PR-ok (+ nyitott PR-ok feloldatlan review-szálai), docs/specs (terv + végrehajtás),
tulajdonosi döntések (P-0xx, D1–D6, „Döntés:” sorok), TRAP/TUDAS/AGENTS/RETRO, munkamenetek (Claude Code, Hermes, Codex,
régi gép mentése — csak a felhasználói üzenetek), kanban (Hermes táblák + régi kanban.db), SQL feladat-nyilvántartás
(Docker Postgres), élő kapcsolók (kód + Render env — csak on/off/hiányzik).

Csak stdlib + sqlite3; a gh / git / docker subprocess-szel. Titkot és valódi e-mail-címet nem ír ki és nem tárol (maszkolás).
Használat: python scripts/kovetelmeny/gyujt.py [--db <út>] [--repo <út>] [--napok 180] [--no-render] [--no-gh] [-q]
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOCAL = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
DEFAULT_DB = LOCAL / "hermes" / "projekt-tudas" / "websuli" / "kovetelmenyek.db"
HOME = Path.home()
GH_REPO = "kosazoltan/WEBSULI"
RENDER_SERVICE = "srv-d6h9oq9drdic73cied30"
RESTORE = Path("D:/restore/kibontva/repo/WEBSULI")
ONOFF = {"on", "off", "1", "0", "true", "false", "yes", "no"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources(
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, date TEXT, title TEXT, raw_excerpt TEXT,
  extra TEXT, UNIQUE(kind, ref));
CREATE TABLE IF NOT EXISTS requirements(
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT, statement TEXT, category TEXT,
  origin_source_id INTEGER REFERENCES sources(id), date TEXT,
  status TEXT NOT NULL DEFAULT 'ismeretlen' CHECK(status IN
   ('elvart','kesz','reszben','felkesz','elfelejtett','kapcsolo_ki','felulirt','elvetve','ismeretlen')),
  superseded_by TEXT, evidence TEXT, verify_hint TEXT, last_checked TEXT, notes TEXT,
  auto_status TEXT, status_source TEXT NOT NULL DEFAULT 'auto', parent TEXT, rule TEXT);
CREATE TABLE IF NOT EXISTS requirement_links(
  requirement_id INTEGER NOT NULL REFERENCES requirements(id), source_id INTEGER NOT NULL REFERENCES sources(id),
  relation TEXT NOT NULL CHECK(relation IN ('kert','dontes','megvalositja','reszben','felulirja','teszt','kapcsolo')),
  PRIMARY KEY(requirement_id, source_id, relation));
CREATE TABLE IF NOT EXISTS flags(
  name TEXT PRIMARY KEY, code_default TEXT, live_value TEXT, owner_decision TEXT, checked_at TEXT, code_ref TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY, started_at TEXT, finished_at TEXT, summary TEXT);
CREATE TABLE IF NOT EXISTS findings(
  id INTEGER PRIMARY KEY, revision_id INTEGER REFERENCES revisions(id), requirement_id INTEGER REFERENCES requirements(id),
  kind TEXT NOT NULL CHECK(kind IN ('hianyzo','felkesz','elfelejtett','kapcsolo_ki','regressziot','felulirt_de_nem_atvezetve')),
  detail TEXT, evidence TEXT, severity TEXT, proposed_slice TEXT, status TEXT NOT NULL DEFAULT 'nyitott',
  first_seen TEXT, last_seen TEXT, kulcs TEXT);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS ix_src_kind_date ON sources(kind, date);
CREATE INDEX IF NOT EXISTS ix_req_status ON requirements(status);
CREATE INDEX IF NOT EXISTS ix_find_open ON findings(status, kind);
CREATE VIRTUAL TABLE IF NOT EXISTS requirements_fts USING fts5(code, title, statement, notes, evidence);
CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(kind, ref, title, raw_excerpt);
"""

# ---------------------------------------------------------------- maszkolás
EMAIL_RE = re.compile(r"([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})")
SECRET_RES = [
    re.compile(r"sk-(?:ant|or|proj)?[-_A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{30,}"),
    re.compile(r"AIza[0-9A-Za-z_-]{30,}"),
    re.compile(r"\b(?:re|rnd|xai)_[A-Za-z0-9]{20,}"),
    re.compile(r"xai-[A-Za-z0-9]{20,}"),
    re.compile(r"postgres(?:ql)?://\S+"),
    re.compile(r"(?i)\b(api[_-]?key|secret|password|jelszó|token)(\s*[:=]\s*)['\"]?[^\s'\"]{8,}"),
]


def mask(text: str | None) -> str:
    if not text:
        return text or ""
    t = EMAIL_RE.sub(lambda m: f"{m.group(1)}***@{m.group(2)}", text)
    for r in SECRET_RES:
        t = r.sub(lambda m: (m.group(1) + m.group(2) + "[TITOK]") if m.re.groups >= 2 else "[TITOK]", t)
    return t


def cut(t: str | None, n: int) -> str:
    t = t or ""
    return t if len(t) <= n else t[:n] + " …"


# ---------------------------------------------------------------- segédek
def run(cmd: list[str], **kw) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} hiba: {(r.stderr or r.stdout).strip()[:300]}")
    return r.stdout


class Db:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.c = sqlite3.connect(path)
        self.c.execute("PRAGMA foreign_keys=ON")
        self.c.executescript(SCHEMA)
        self.src_cache: dict[tuple[str, str], int] = {}
        self.touched: set[str] = set()

    def source(self, kind: str, ref: str, date: str | None, title: str, raw: str, extra: dict | None = None) -> int:
        key = (kind, ref)
        ex = json.dumps(extra or {}, ensure_ascii=False, sort_keys=True)
        self.c.execute(
            """INSERT INTO sources(kind,ref,date,title,raw_excerpt,extra) VALUES(?,?,?,?,?,?)
               ON CONFLICT(kind,ref) DO UPDATE SET date=excluded.date,title=excluded.title,
               raw_excerpt=excluded.raw_excerpt,extra=excluded.extra""",
            (kind, ref, date, mask(cut(title, 300)), mask(raw), ex))
        sid = self.c.execute("SELECT id FROM sources WHERE kind=? AND ref=?", key).fetchone()[0]
        self.src_cache[key] = sid
        return sid

    def req(self, code: str, **f) -> int:
        self.touched.add(code)
        row = self.c.execute("SELECT id,status_source FROM requirements WHERE code=?", (code,)).fetchone()
        auto = f.get("status", "ismeretlen")
        vals = {k: (mask(v) if isinstance(v, str) and k in ("title", "statement", "evidence", "notes") else v)
                for k, v in f.items() if k != "status"}
        if row is None:
            cols = ["code", "status", "auto_status"] + list(vals)
            self.c.execute(f"INSERT INTO requirements({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                           [code, auto, auto] + list(vals.values()))
            return self.c.execute("SELECT id FROM requirements WHERE code=?", (code,)).fetchone()[0]
        rid, ssrc = row
        sets = dict(vals, auto_status=auto)
        if ssrc == "auto":
            sets["status"] = auto
        self.c.execute(f"UPDATE requirements SET {','.join(k + '=?' for k in sets)} WHERE id=?", list(sets.values()) + [rid])
        return rid

    def link(self, rid: int, sid: int, rel: str):
        self.c.execute("INSERT OR IGNORE INTO requirement_links VALUES(?,?,?)", (rid, sid, rel))


def log(msg: str):
    if not ARGS.q:
        print(msg, flush=True)


# ---------------------------------------------------------------- 1. git
def collect_git(db: Db, repo: str, since: str, unavailable: list):
    try:
        main_set = set(run(["git", "-C", repo, "rev-list", "origin/main", f"--since={since}"]).split())
        out = run(["git", "-C", repo, "log", "--all", f"--since={since}", "--format=%H%x1f%aI%x1f%an%x1f%s%x1f%b%x1e"])
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"git: {e}")
        return []
    commits = []
    for rec in out.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        parts = rec.split("\x1f")
        if len(parts) < 5:
            continue
        h, date, author, subj, body = parts[:5]
        allapot = [ln.strip() for ln in body.splitlines() if ln.strip().startswith("Állapot")]
        on_main = h in main_set
        pr = re.findall(r"\(#(\d+)\)\s*$", subj)
        sid = db.source("commit", h, date[:10], subj, cut(body, 2500),
                        {"author": author, "main": on_main, "allapot": allapot[-1] if allapot else None,
                         "pr": int(pr[-1]) if pr else None})
        commits.append((sid, h, date, subj, body, on_main))
    log(f"  commit: {len(commits)}")
    return commits


# ---------------------------------------------------------------- 2. PR
def collect_prs(db: Db, since: str, unavailable: list, use_gh: bool):
    if not use_gh:
        unavailable.append("gh: --no-gh")
        return []
    try:
        data = json.loads(run(["gh", "pr", "list", "-R", GH_REPO, "--state", "all", "--limit", "1000", "--json",
                               "number,title,body,state,createdAt,mergedAt,headRefName,mergeCommit"]))
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"gh pr list: {e}")
        return []
    prs = []
    for p in data:
        d = (p.get("mergedAt") or p.get("createdAt") or "")[:10]
        if (p.get("createdAt") or "")[:10] < since and d < since:
            continue
        mc = (p.get("mergeCommit") or {}) or {}
        sid = db.source("pr", f"#{p['number']}", (p.get("createdAt") or "")[:10], p["title"], cut(p.get("body"), 3000),
                        {"state": p["state"], "mergedAt": p.get("mergedAt"), "head": p.get("headRefName"),
                         "mergeCommit": mc.get("oid")})
        prs.append((sid, p))
    # nyitott PR-ok feloldatlan review-szálai (csak a lényeges, nyitva maradt javaslatok)
    q = ("query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:60)"
         "{nodes{id isResolved path comments(first:1){nodes{author{login} body createdAt}}}}}}}")
    owner, name = GH_REPO.split("/")
    for sid, p in prs:
        if p["state"] != "OPEN":
            continue
        try:
            r = json.loads(run(["gh", "api", "graphql", "-f", f"query={q}", "-F", f"o={owner}", "-F", f"r={name}",
                                "-F", f"n={p['number']}"]))
            nodes = r["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
        except Exception as e:  # noqa: BLE001
            unavailable.append(f"review-szálak #{p['number']}: {e}")
            continue
        for t in nodes:
            if t["isResolved"] or not t["comments"]["nodes"]:
                continue
            c0 = t["comments"]["nodes"][0]
            db.source("pr", f"#{p['number']}:szal:{t['id']}", (c0.get("createdAt") or "")[:10],
                      f"#{p['number']} nyitott review-szál ({t.get('path')})", cut(c0.get("body"), 1500),
                      {"author": (c0.get("author") or {}).get("login"), "pr": p["number"], "unresolved": True})
    log(f"  pr: {len(prs)}")
    return prs


# ---------------------------------------------------------------- 3. spec + döntések + tudásfájlok
def git_show(repo: str, path: str) -> str:
    return run(["git", "-C", repo, "show", f"origin/main:{path}"])


def collect_specs(db: Db, repo: str, since: str, unavailable: list):
    try:
        files = [f for f in run(["git", "-C", repo, "ls-tree", "--name-only", "origin/main", "docs/specs/"]).split()
                 if f.endswith(".md")]
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"specs: {e}")
        return {}
    specs = {}
    for f in files:
        base = Path(f).stem
        m = re.match(r"(\d{4}-\d{2}-\d{2})", base)
        date = m.group(1) if m else None
        if date and date < since:
            continue
        try:
            text = git_show(repo, f)
        except Exception:  # noqa: BLE001
            continue
        title = next((ln.lstrip("# ").strip() for ln in text.splitlines() if ln.startswith("#")), base)
        allapot = [ln.strip() for ln in text.splitlines() if re.match(r"^\W{0,4}Állapot", ln.strip())]
        dontes = []
        lines = text.splitlines()
        for i, ln in enumerate(lines):
            if "Döntés:" not in ln:
                continue
            label = None
            for j in range(i, max(-1, i - 12), -1):
                mm = re.match(r"^\s*\*\*(D-?\d+[a-z]?)\b", lines[j]) or re.match(r"^#+\s*(D-?\d+)\b", lines[j])
                if mm:
                    label = mm.group(1).replace("-", "")
                    break
            seg = " ".join(lines[i:i + 3])
            txt = re.sub(r"\s+", " ", seg[seg.index("Döntés:"):])[:500]
            dontes.append({"label": label, "text": txt, "line": i + 1})
        sid = db.source("spec", f, date, title, cut(text, 3000),
                        {"allapot": allapot[-5:], "dontes": len(dontes), "vegrehajtas": base.endswith("-vegrehajtas")})
        specs[f] = {"sid": sid, "base": base, "date": date, "title": title, "allapot": allapot, "dontes": dontes}
    log(f"  spec: {len(specs)}")
    return specs


def collect_docs(db: Db, repo: str, unavailable: list):
    """TUDAS/SZALAK/AGENTS/lesson-improvement/agent-csapdak szakaszonként, TRAP soronként, RETRO fájlonként."""
    docs = ["AGENTS.md", ".hermes/projekt/TUDAS.md", ".hermes/projekt/SZALAK.md", "docs/lesson-improvement.md",
            "docs/agent-csapdak.md", "docs/websuli-potlasok.md"]
    try:
        retro = [f for f in run(["git", "-C", repo, "ls-tree", "-r", "--name-only", "origin/main",
                                 ".hermes/projekt/RETRO/"]).split() if f.endswith(".md")]
    except Exception:  # noqa: BLE001
        retro = []
    n = 0
    for f in docs + retro:
        try:
            text = git_show(repo, f)
        except Exception as e:  # noqa: BLE001
            unavailable.append(f"{f}: {str(e)[:80]}")
            continue
        sections = re.split(r"(?m)^(?=## )", text)
        for k, sec in enumerate(sections):
            head = sec.strip().splitlines()[0] if sec.strip() else f
            dm = re.search(r"(20\d\d-\d\d-\d\d)", head) or re.search(r"(20\d\d-\d\d-\d\d)", f)
            db.source("doc", f"{f}#{k}", dm.group(1) if dm else None, f"{f}: {head.lstrip('# ')}", cut(sec, 3000))
            n += 1
    # TRAP soronként
    try:
        trap = git_show(repo, ".hermes/projekt/TRAP.md")
        for ln in trap.splitlines():
            if not ln.startswith("|") or ln.startswith("|---") or "Dátum" in ln[:20]:
                continue
            cells = [c.strip() for c in ln.strip("|").split("|")]
            dm = re.search(r"20\d\d-\d\d-\d\d", cells[0]) if cells else None
            ref = "TRAP:" + hashlib.sha1(ln.encode("utf-8")).hexdigest()[:16]
            db.source("trap", ref, dm.group(0) if dm else None, cut(cells[1] if len(cells) > 1 else ln, 200), cut(ln, 2000))
            n += 1
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"TRAP.md: {e}")
    log(f"  doc+trap: {n}")


# ---------------------------------------------------------------- 4. munkamenetek
SKIP_PREFIX = ("<", "[IMPORTANT", "[INTERNAL", "[SYSTEM", "Caveat:", "Base directory for this skill", "Cronjob Response",
               "This session is being continued", "[Request interrupted")


def owner_text(t: str) -> str | None:
    t = (t or "").strip()
    if t.startswith("[OUT-OF-BAND USER MESSAGE"):
        t = re.sub(r"^\[OUT-OF-BAND USER MESSAGE[^\]]*\]\s*", "", t)
        t = re.sub(r"\s*\[/OUT-OF-BAND USER MESSAGE\]\s*$", "", t).strip()
    if not t or t.startswith(SKIP_PREFIX):
        return None
    t = re.split(r"\n<memory-context>|\n\[zaro-hurok\]", t)[0].strip()
    return t or None


def collect_sessions(db: Db, since: str, unavailable: list):
    n = 0
    seen: set[tuple[str, str]] = set()

    def add(tool: str, sess: str, mid: str, ts: str, text: str, cwd: str | None):
        nonlocal n
        key = (sess, text[:400])
        if key in seen:
            return
        seen.add(key)
        db.source("session", f"{tool}:{sess}:{mid}", ts[:10], cut(text.replace("\n", " "), 160), cut(text, 8000),
                  {"tool": tool, "session": sess, "ts": ts, "cwd": cwd})
        n += 1

    # Claude Code (jelenlegi gép + régi gép mentése)
    files = [f for f in glob.glob(str(HOME / ".claude" / "projects" / "*")) if "websuli" in f.lower()]
    jsonls = [j for d in files for j in glob.glob(os.path.join(d, "*.jsonl"))]
    jsonls += glob.glob(str(RESTORE / "**" / "*.jsonl"), recursive=True) if RESTORE.exists() else []
    if not jsonls:
        unavailable.append("Claude Code: nincs WEBSULI jsonl")
    for f in jsonls:
        try:
            fh = open(f, encoding="utf-8", errors="replace")
        except OSError as e:
            unavailable.append(f"{f}: {e}")
            continue
        with fh:
            for line in fh:
                if '"type":"user"' not in line:
                    continue
                try:
                    o = json.loads(line)
                except ValueError:
                    continue
                if o.get("type") != "user" or o.get("isMeta") or o.get("isSidechain"):
                    continue
                ts = o.get("timestamp") or ""
                if ts[:10] < since:
                    continue
                ct = (o.get("message") or {}).get("content")
                texts = [ct] if isinstance(ct, str) else [b.get("text", "") for b in (ct or [])
                                                         if isinstance(b, dict) and b.get("type") == "text"]
                for t in texts:
                    t2 = owner_text(t)
                    if t2:
                        add("cc", o.get("sessionId") or Path(f).stem, o.get("uuid") or ts, ts, t2, o.get("cwd"))
    # Hermes state.db (fő + profilok), csak olvasva
    for p in [LOCAL / "hermes" / "state.db"] + [Path(x) for x in glob.glob(str(LOCAL / "hermes" / "profiles" / "*" / "state.db"))]:
        try:
            c = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
            rows = c.execute(
                """SELECT m.session_id, m.id, m.timestamp, m.content, s.cwd FROM messages m JOIN sessions s ON s.id=m.session_id
                   WHERE m.role='user' AND COALESCE(s.title,'') NOT LIKE 'Subagent:%'
                     AND (lower(COALESCE(s.cwd,'')) LIKE '%websuli%' OR lower(COALESCE(s.title,'')) LIKE '%websuli%'
                          OR lower(COALESCE(m.content,'')) LIKE '%websuli%')""").fetchall()
            c.close()
        except Exception as e:  # noqa: BLE001
            unavailable.append(f"Hermes {p.parent.name}: {e}")
            continue
        for sess, mid, tsf, content, cwd in rows:
            ts = dt.datetime.fromtimestamp(tsf).isoformat(timespec="seconds")
            if ts[:10] < since:
                continue
            t2 = owner_text(content)
            if t2:
                add("hm", sess, str(mid), ts, t2, cwd)
    # Codex
    cx = glob.glob(str(HOME / ".codex" / "sessions" / "**" / "*.jsonl"), recursive=True)
    cx_ws = 0
    for f in cx:
        cwd, msgs = None, []
        with open(f, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    o = json.loads(line)
                except ValueError:
                    continue
                pl = o.get("payload") or {}
                if o.get("type") == "session_meta":
                    cwd = pl.get("cwd")
                if o.get("type") == "response_item" and pl.get("role") == "user":
                    for b in pl.get("content") or []:
                        t2 = owner_text(b.get("text", ""))
                        if t2:
                            msgs.append((o.get("timestamp") or "", t2))
        blob = (cwd or "") + " ".join(m[1] for m in msgs)
        if "websuli" not in blob.lower():
            continue
        cx_ws += 1
        for i, (ts, t2) in enumerate(msgs):
            if ts[:10] >= since:
                add("cx", Path(f).stem, str(i), ts, t2, cwd)
    if cx and not cx_ws:
        unavailable.append(f"Codex: {len(cx)} munkamenet, egyik sem WEBSULI")
    log(f"  session (felhasználói üzenet): {n}")


# ---------------------------------------------------------------- 5. kanban + SQL feladatok
def collect_kanban(db: Db, unavailable: list):
    out = []
    boards = {"websuli": LOCAL / "hermes" / "kanban" / "boards" / "websuli" / "kanban.db",
              "hermes-agent": LOCAL / "hermes" / "kanban" / "boards" / "hermes-agent" / "kanban.db"}
    for board, p in boards.items():
        if not p.exists():
            unavailable.append(f"kanban {board}: nincs {p}")
            continue
        c = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
        q = "SELECT id,title,body,status,created_at FROM tasks"
        if board != "websuli":
            q += " WHERE lower(title||COALESCE(body,'')) LIKE '%websuli%' OR id='t_49cdc6eb'"
        for tid, title, body, status, created in c.execute(q):
            date = dt.datetime.fromtimestamp(created).date().isoformat() if isinstance(created, (int, float)) else None
            sid = db.source("kanban", f"{board}:{tid}", date, title, cut(body, 3000), {"board": board, "status": status})
            out.append((sid, board, tid, title, status, date))
        c.close()
    old = RESTORE / ".hermes" / "kanban.db"
    if old.exists():
        c = sqlite3.connect(f"file:{old}?mode=ro", uri=True)
        for iid, ticket, title, status, created in c.execute("SELECT id,ticket,title,status,created_at FROM items"):
            sid = db.source("kanban", f"regi:{iid}", (created or "")[:10], f"{ticket}: {title}", title,
                            {"board": "regi-websuli", "status": status, "ticket": ticket})
            out.append((sid, "regi", str(iid), f"{ticket}: {title}", status, (created or "")[:10]))
        c.close()
    else:
        unavailable.append("régi kanban.db: nincs mentés")
    # SQL feladat-nyilvántartás (Docker Postgres, csak olvasás)
    try:
        sql = ("SELECT json_agg(t) FROM (SELECT id,title,body,status,priority,source,kanban_id,"
               "to_char(created_at,'YYYY-MM-DD') d, notes FROM feladat.tasks WHERE repo='websuli' ORDER BY id) t;")
        raw = run(["docker", "exec", "-i", os.environ.get("FELADAT_PG_CONTAINER", "hermes-mem0-pg"), "psql", "-U", "mem0",
                   "-d", "mem0", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], input=sql)
        for t in json.loads(raw.strip() or "[]") or []:
            notes = t.get("notes") or []
            last = notes[-1] if notes else None
            sid = db.source("task", f"feladat:{t['id']}", t["d"], t["title"],
                            cut((t.get("body") or "") + ("\nUtolsó jegyzet: " + json.dumps(last, ensure_ascii=False) if last else ""), 3000),
                            {"status": t["status"], "priority": t["priority"], "source": t["source"], "kanban": t["kanban_id"]})
            out.append((sid, "feladat", str(t["id"]), t["title"], t["status"], t["d"]))
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"SQL feladat-nyilvántartás: {str(e)[:120]}")
    log(f"  kanban+feladat: {len(out)}")
    return out


# ---------------------------------------------------------------- 6. kapcsolók
def collect_flags(db: Db, repo: str, unavailable: list, use_render: bool):
    now = dt.datetime.now().isoformat(timespec="seconds")
    found: dict[str, dict] = {}
    try:
        g = run(["git", "-C", repo, "grep", "-nE", r'(===|!==) *"(on|off|0|1|true)"', "origin/main", "--",
                 "source/server", "source/shared"])
    except Exception as e:  # noqa: BLE001
        g = ""
        unavailable.append(f"flag-grep: {e}")
    for ln in g.splitlines():
        if ".test." in ln:
            continue
        m = re.search(r"env(?:\.|\[\")([A-Z][A-Z0-9_]+).*?(===|!==) *\"(on|off|0|1|true)\"", ln)
        if not m:
            continue
        name, op, val = m.groups()
        path = ln.split(":", 2)[1] if ln.count(":") >= 2 else ""
        if name in ("NODE_ENV", "RENDER", "WEBSULI_E2E", "CI"):
            continue
        default = "BE (vészfék: =0/off kapcsol ki)" if val in ("0", "off") else "KI"
        found.setdefault(name, {"code_default": default, "code_ref": path})
    # *-flag.ts: production-alapértelmezés
    for f in run(["git", "-C", repo, "ls-tree", "-r", "--name-only", "origin/main", "source/server"]).split():
        if not f.endswith("-flag.ts"):
            continue
        txt = git_show(repo, f)
        for name in set(re.findall(r'env(?:\.|\[)"?([A-Z][A-Z0-9_]+)', txt) + re.findall(r'"((?:STUDIO|LESSON|RESULT)_[A-Z0-9_]+)"', txt)):
            if name in ("NODE_ENV",) or re.search(rf"\bconst {name}\b", txt):
                continue
            prod = "production" in txt and name in txt
            found[name] = {"code_default": "BE élesben (NODE_ENV=production), egyébként KI" if prod and "NODE_ENV" in txt else "KI",
                           "code_ref": f}
    for name in ("ADVENT_CALENDAR", "PLAYER_ACCOUNTS", "MP_MODE", "RESULT_COMBINED_EMAIL", "RESULT_PARTIAL_EMAIL",
                 "LESSON_CLIPS_AUTO", "STUDIO_SOURCE_VISUALS", "STUDIO_LESSON_VARIETY", "STUDIO_LESSON_OPENER"):
        found.setdefault(name, {"code_default": "KI (pontos on/1/true kapcsol)", "code_ref": "kurált lista"})
    live: dict[str, str] = {}
    if use_render:
        key = os.environ.get("RENDER_API_KEY")
        envf = LOCAL / "hermes" / ".env"
        if not key and envf.exists():
            for line in envf.read_text(encoding="utf-8", errors="replace").splitlines():
                if line.startswith("RENDER_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("'\"")
        if not key:
            unavailable.append("Render: nincs RENDER_API_KEY")
        else:
            try:
                req = urllib.request.Request(f"https://api.render.com/v1/services/{RENDER_SERVICE}/env-vars?limit=100",
                                             headers={"Authorization": "Bearer " + key, "Accept": "application/json"})
                for e in json.load(urllib.request.urlopen(req, timeout=30)):
                    ev = e.get("envVar", e)
                    v = (ev.get("value") or "").strip().lower()
                    live[ev["key"]] = v if v in ONOFF else "beállítva (érték rejtve)"
            except Exception as e:  # noqa: BLE001
                unavailable.append(f"Render env: {str(e)[:100]}")
            finally:
                key = None
    else:
        unavailable.append("Render: --no-render")
    for name, v in sorted(live.items()):
        if v in ONOFF or name.startswith(("STUDIO_", "LESSON_", "RESULT_", "ADVENT", "PLAYER", "MP_", "WORKFLOW")):
            found.setdefault(name, {"code_default": "nem található a kódban", "code_ref": None})
    for name, f in found.items():
        lv = live.get(name, "hiányzik") if live else "nem ellenőrzött"
        if name.endswith("_ENV"):
            continue
        db.c.execute("""INSERT INTO flags(name,code_default,live_value,checked_at,code_ref) VALUES(?,?,?,?,?)
                        ON CONFLICT(name) DO UPDATE SET code_default=excluded.code_default,live_value=excluded.live_value,
                        checked_at=excluded.checked_at,code_ref=excluded.code_ref""",
                     (name, f["code_default"], lv, now, f["code_ref"]))
        db.source("config", f"flag:{name}", now[:10], f"{name} = {lv}", f"kód-alap: {f['code_default']}; hely: {f['code_ref']}",
                  {"live": lv})
    log(f"  flags: {len(found)} (élő: {len(live)})")
    return {n: db.c.execute("SELECT live_value FROM flags WHERE name=?", (n,)).fetchone()[0] for n in found}


# ---------------------------------------------------------------- követelmények
STATUS_MAP = {"KÉSZ": "kesz", "RÉSZ": "reszben", "ÁG": "felkesz", "NINCS": "elvart", "DÖNT": "elvart", "ELAV": "elvetve"}


def spec_status(allapot: list[str]) -> str | None:
    if not allapot:
        return None
    last = " ".join(allapot[-2:]).lower()
    if re.search(r"folyamatban|részben|következő|hátra|nyitott|tervezve", last):
        return "reszben" if "tervezve" not in last else "elvart"
    if re.search(r"kész|beolvadt|merged|lezárva|teljesült", last):
        return "kesz"
    return None


def build_requirements(db: Db, repo: str, specs: dict, commits: list, prs: list, tasks: list, flags: dict, since: str):
    c = db.c
    c.execute("DELETE FROM requirement_links")  # a kapcsolatok minden futáskor újraépülnek (nincs elavult link)
    pr_by_num = {p["number"]: (sid, p) for sid, p in prs}
    impl_re = re.compile(r"^(feat|fix|perf|refactor|test|ci|chore\(qa\))", re.I)

    # --- A) spec-tervek (minden nem -vegrehajtas terv egy követelmény; a végrehajtás és a hivatkozó PR-ok kötve)
    spec_req: dict[str, int] = {}
    mention: dict[str, list] = {}
    for sid, p in prs:
        for base in set(re.findall(r"docs/specs/([\w.-]+?)(?:-vegrehajtas)?\.md", (p.get("body") or "") + p["title"])):
            mention.setdefault(base, []).append(("pr", sid, p))
    for sid, h, date, subj, body, on_main in commits:
        for base in set(re.findall(r"docs/specs/([\w.-]+?)(?:-vegrehajtas)?\.md", body)):
            mention.setdefault(base, []).append(("commit", sid, (subj, on_main)))
    for f, s in specs.items():
        if s["base"].endswith("-vegrehajtas"):
            continue
        vf = f.replace(".md", "-vegrehajtas.md")
        v = specs.get(vf)
        st = spec_status((v or {}).get("allapot") or []) or spec_status(s["allapot"])
        refs = mention.get(s["base"], [])
        merged_impl = [x for x in refs if x[0] == "pr" and x[2]["state"] == "MERGED" and impl_re.match(x[2]["title"])]
        open_prs = [x for x in refs if x[0] == "pr" and x[2]["state"] == "OPEN"]
        evid = []
        if st is None:
            if open_prs:
                st = "felkesz"
            elif merged_impl:
                st = "kesz"
                evid.append("becslés: beolvadt implementációs PR hivatkozik rá")
            else:
                st = "ismeretlen"
        evid += [f"PR #{x[2]['number']} {x[2]['state']}" for x in refs if x[0] == "pr"][:8]
        if v and v["allapot"]:
            evid.append("Állapot: " + v["allapot"][-1][:200])
        rid = db.req(f"SPEC:{s['base']}", title=s["title"][:200], statement=f"Terv: {f}" + (f" + {vf}" if v else ""),
                     category="spec", origin_source_id=s["sid"], date=s["date"], status=st, evidence="; ".join(evid),
                     verify_hint=f"Állapot-sor a {vf if v else f} fájlban; beolvadt PR-ok", rule="spec")
        spec_req[s["base"]] = rid
        db.link(rid, s["sid"], "kert")
        if v:
            db.link(rid, v["sid"], "dontes")
        for kind, ssid, extra in refs:
            if kind == "pr":
                db.link(rid, ssid, "megvalositja" if extra["state"] == "MERGED" else "reszben")
            else:
                db.link(rid, ssid, "megvalositja" if extra[1] else "reszben")
        # „Döntés:” sorok → külön döntés-követelmény (az örökölt státusszal)
        for k, d in enumerate(s["dontes"] + ((v or {}).get("dontes") or [])):
            code = f"DONTES:{s['base']}:{d['label'] or k + 1}"
            drid = db.req(code, title=(d["label"] or "Döntés") + " — " + d["text"][8:120], statement=d["text"],
                          category="dontes", origin_source_id=s["sid"], date=s["date"],
                          status=st if st in ("kesz", "reszben", "felkesz") else "ismeretlen",
                          evidence=f"{f}:{d['line']}", parent=f"SPEC:{s['base']}", rule="spec-dontes")
            db.link(drid, s["sid"], "dontes")

    # --- B) pótlási leltár P-001…P-068 + hiányleltár-pillanatkép + tulajdonosi döntések (4/a, TUDAS H0)
    def sfile(name):
        return next((v for k, v in specs.items() if k.endswith(name)), None)
    goals, snap, dec = {}, {}, {}
    pt = sfile("2026-11-19-websuli-potlasok-terv.md")
    hl = sfile("2026-11-23-teljes-hianyleltar.md")
    try:
        for ln in git_show(repo, "docs/specs/2026-11-19-websuli-potlasok-terv.md").splitlines():
            m = re.match(r"^\| (P-0\d\d) \| ([^|]+)\| ([^|]+)\|", ln)
            if m:
                goals[m.group(1)] = (m.group(2).strip(), m.group(3).strip())
        htxt = git_show(repo, "docs/specs/2026-11-23-teljes-hianyleltar.md")
        for ln in htxt.splitlines():
            m = re.match(r"^\| (P-0\d\d)([^|]*)\| ([^|]+)\| ([^|]*)\| ([^|]*)\|", ln)
            if m:
                snap[m.group(1)] = (m.group(2).strip(), m.group(3).strip(), m.group(4).strip(), m.group(5).strip())
            m = re.match(r"^- \*\*(P-0\d\d|BL [^*]+)\*\* — (.+)", ln)
            if m:
                dec[m.group(1)] = m.group(2).strip()
        ptxt = git_show(repo, "docs/websuli-potlasok.md")
        ptitles = {m.group(1): (m.group(2).strip(), m.group(3).strip()) for m in
                   re.finditer(r"^\| (P-0\d\d) \| ([^|]+)\| ([^|]+)\|", ptxt, re.M)}
    except Exception:  # noqa: BLE001
        ptitles = {}
    src_pl = c.execute("SELECT id FROM sources WHERE kind='doc' AND ref LIKE 'docs/websuli-potlasok.md#%' ORDER BY id").fetchone()
    for code in sorted(set(goals) | set(snap) | set(ptitles)):
        g = goals.get(code, ("", ""))
        sn = snap.get(code)
        tag = (sn[1].split()[0] if sn else "").strip()
        st = STATUS_MAP.get(tag, "ismeretlen")
        title = (sn[0] if sn and sn[0] else ptitles.get(code, ("", ""))[0]) or g[0]
        rid = db.req(code, title=title[:200], statement=g[0] or title, category="p-tetel",
                     origin_source_id=src_pl[0] if src_pl else None, date="2026-11-19", status=st,
                     evidence=f"hiányleltár 2026-11-23: {sn[1]} — hátra: {sn[2]} ({sn[3]})" if sn else f"leltár: {g[1]}",
                     verify_hint="feladat.tasks [P-..] sor + PR/commit a kódra", rule="p-tetel")
        if pt:
            db.link(rid, pt["sid"], "kert")
        if sn:  # a pillanatképben hivatkozott PR-ok és ágak (pl. „ÁG #513”, „`feat/advent-c-…`”)
            blob = sn[0] + " " + sn[1]  # cím + állapot (a „hátra” oszlop hivatkozása nem bizonyíték)
            hits = [pr_by_num[int(n)] for n in re.findall(r"#(\d{3,4})", blob) if int(n) in pr_by_num]
            hits += [x for b in re.findall(r"`([\w./-]+)`", blob) for x in prs if x[1].get("headRefName") == b]
            for psid, pp in hits:
                db.link(rid, psid, "megvalositja" if pp["state"] == "MERGED" else "reszben")
        if hl:
            db.link(rid, hl["sid"], "reszben" if st != "kesz" else "megvalositja")
    for key, text in dec.items():
        code = "DONTES:" + key.replace(" ", "-")
        dst = "elvetve" if "ELVETVE" in text else "elvart"
        if dst == "elvetve" and key.startswith("P-"):
            c.execute("UPDATE requirements SET auto_status='elvetve', status=CASE WHEN status_source='auto' THEN 'elvetve' ELSE status END "
                      "WHERE code=?", (key,))
        rid = db.req(code, title=f"{key} tulajdonosi döntés", statement=text[:800], category="dontes",
                     origin_source_id=hl["sid"] if hl else None, date="2026-11-23", status=dst,
                     evidence="docs/specs/2026-11-23-teljes-hianyleltar.md 4/a", parent=key if key.startswith("P-") else None,
                     rule="p-dontes")
        if hl:
            db.link(rid, hl["sid"], "dontes")
    # főterv D1–D6
    fo = sfile("2026-11-23-foterv.md")
    if fo:
        for ln in git_show(repo, "docs/specs/2026-11-23-foterv.md").splitlines():
            m = re.match(r"^\| (D[1-6]) \| ([^|]+)\| ([^|]+)\|", ln)
            if m:
                rid = db.req(f"FOTERV-{m.group(1)}", title=f"Főterv {m.group(1)} ({m.group(2).strip()}): {m.group(3).strip()[:120]}",
                             statement=m.group(3).strip(), category="dontes", origin_source_id=fo["sid"], date="2026-11-23",
                             status="elvart", verify_hint="tulajdonosi válasz (űrlap) + végrehajtás", rule="foterv")
                db.link(rid, fo["sid"], "dontes")

    # --- C) kurált tulajdonosi elvárások
    cur = json.loads((HERE / "kovetelmenyek.json").read_text(encoding="utf-8"))["items"]
    for it in cur:
        st = it.get("status", "ismeretlen")
        ev = []
        if it.get("flag"):
            fl = it["flag"]
            lv = flags.get(fl["name"], "hiányzik")
            ev.append(f"{fl['name']}={lv} (elvárt: {fl['expect']})")
            if lv not in ("nem ellenőrzött",) and lv != fl["expect"] and st in ("kesz", "kapcsolo_ki"):
                st = "kapcsolo_ki"
        open_pr = [n for n in it.get("prs", []) if n in pr_by_num and pr_by_num[n][1]["state"] == "OPEN"]
        if open_pr and st in ("kesz", "ismeretlen", "elvart"):
            st = "felkesz"
        rid = db.req(it["code"], title=it["title"], statement=it["statement"], category=it.get("category", "kert"),
                     date=it.get("date"), status=st, superseded_by=it.get("superseded_by"),
                     evidence="; ".join(ev + [f"PR #{n} {pr_by_num[n][1]['state']}" for n in it.get("prs", []) if n in pr_by_num]),
                     verify_hint=it.get("verify_hint"), notes=it.get("notes"), parent=it.get("parent"),
                     rule=json.dumps({k: it[k] for k in ("flag", "grep", "old_grep", "prs", "kanban") if k in it}, ensure_ascii=False))
        for n in it.get("prs", []):
            if n in pr_by_num:
                db.link(rid, pr_by_num[n][0], "megvalositja" if pr_by_num[n][1]["state"] == "MERGED" else "reszben")
        for kid in it.get("kanban", []):
            r = c.execute("SELECT id FROM sources WHERE kind='kanban' AND ref LIKE ?", (f"%:{kid}",)).fetchone()
            if r:
                db.link(rid, r[0], "kert")
        if it.get("flag"):
            r = c.execute("SELECT id FROM sources WHERE kind='config' AND ref=?", ("flag:" + it["flag"]["name"],)).fetchone()
            if r:
                db.link(rid, r[0], "kapcsolo")
        for old in it.get("supersedes", []):
            c.execute("UPDATE requirements SET superseded_by=? WHERE code=?", (it["code"], old))
            c.execute("UPDATE requirements SET status='felulirt', auto_status='felulirt' WHERE code=? AND status_source='auto'", (old,))
        # minták → munkamenet- (kert) és commit/PR-források (megvalositja/reszben)
        pats = [re.compile(p, re.I) for p in it.get("patterns", [])]
        if pats:
            for sid, raw in c.execute("SELECT id, raw_excerpt FROM sources WHERE kind='session'"):
                if any(p.search(raw or "") for p in pats):
                    db.link(rid, sid, "kert")
        cps = [re.compile(p, re.I) for p in it.get("commit_patterns", [])]
        if cps:
            for sid, h, date, subj, body, on_main in commits:
                if any(p.search(subj) for p in cps):
                    db.link(rid, sid, "megvalositja" if on_main else "reszben")
            for sid, p in prs:
                if any(cp.search(p["title"]) for cp in cps):
                    db.link(rid, sid, "megvalositja" if p["state"] == "MERGED" else "reszben")
        first = c.execute("""SELECT s.id FROM requirement_links l JOIN sources s ON s.id=l.source_id
                             WHERE l.requirement_id=? AND l.relation='kert' ORDER BY s.date, s.id LIMIT 1""", (rid,)).fetchone()
        if first:
            c.execute("UPDATE requirements SET origin_source_id=? WHERE id=?", (first[0], rid))

    # --- D) P-kódok, U4x, PR-számok hivatkozásai commitokban / PR-okban / kanbanban / feladatokban
    codes = {r[0]: r[1] for r in c.execute("SELECT code,id FROM requirements WHERE code GLOB 'P-0[0-9][0-9]' OR code GLOB 'U4?'")}
    for sid, h, date, subj, body, on_main in commits:
        for code in set(re.findall(r"\b(P-0\d\d|U4[a-e])\b", subj)):
            if code in codes:
                db.link(codes[code], sid, "megvalositja" if on_main else "reszben")
    for sid, p in prs:
        for code in set(re.findall(r"\b(P-0\d\d|U4[a-e])\b", p["title"])):
            if code in codes:
                db.link(codes[code], sid, "megvalositja" if p["state"] == "MERGED" else "reszben")
    # NINCS/ÁG + beolvadt PR a címben → kész (bizonyítékkal); RÉSZ marad részben
    for code, rid in codes.items():
        merged = c.execute("""SELECT s.ref FROM requirement_links l JOIN sources s ON s.id=l.source_id
                              WHERE l.requirement_id=? AND s.kind='pr' AND json_extract(s.extra,'$.state')='MERGED'""", (rid,)).fetchall()
        if merged:
            cur_st = c.execute("SELECT auto_status, evidence FROM requirements WHERE id=?", (rid,)).fetchone()
            has_open = c.execute("""SELECT 1 FROM requirement_links l JOIN sources s ON s.id=l.source_id WHERE l.requirement_id=?
                                    AND s.kind='pr' AND json_extract(s.extra,'$.state')='OPEN'""", (rid,)).fetchone()
            new = "kesz" if cur_st[0] in ("elvart", "felkesz") and not has_open else cur_st[0]
            evid = (cur_st[1] or "")
            add = "beolvadt: " + ", ".join(sorted({m[0] for m in merged}))
            if add not in evid:
                evid = (evid + "; " + add).strip("; ")
            c.execute("UPDATE requirements SET auto_status=?, evidence=?, status=CASE WHEN status_source='auto' THEN ? ELSE status END WHERE id=?",
                      (new, evid, new, rid))

    # döntés ← a P-tétel kész állapota (a döntés végrehajtva)
    c.execute("""UPDATE requirements SET auto_status='kesz', status=CASE WHEN status_source='auto' THEN 'kesz' ELSE status END,
                 evidence=COALESCE(evidence,'') || ' | végrehajtva: ' || (SELECT p.code || ' kész' FROM requirements p WHERE p.code=requirements.parent)
                 WHERE code GLOB 'DONTES:P-0[0-9][0-9]' AND parent IN (SELECT code FROM requirements WHERE status='kesz')""")

    # --- E) nyitott PR-ok → félkész követelmény
    for sid, p in prs:
        if p["state"] != "OPEN":
            continue
        rid = db.req(f"PR#{p['number']}", title=p["title"][:200], statement=f"Nyitott PR ({p.get('headRefName')}) — beolvasztásra vagy lezárásra vár.",
                     category="pr", origin_source_id=sid, date=(p.get("createdAt") or "")[:10], status="felkesz",
                     evidence=f"PR #{p['number']} OPEN", verify_hint=f"gh pr view {p['number']} --json state,mergeable,statusCheckRollup",
                     rule="open-pr")
        db.link(rid, sid, "reszben")
        for (tsid,) in c.execute("SELECT id FROM sources WHERE kind='pr' AND ref LIKE ?", (f"#{p['number']}:szal:%",)).fetchall():
            db.link(rid, tsid, "reszben")
        for code in set(re.findall(r"\b(P-0\d\d)\b", p["title"] + (p.get("body") or "")[:2000])):
            if code in codes:
                db.link(codes[code], sid, "reszben")

    # --- F) kanban- és SQL-feladatok: kódhoz kötés, a nem kötött nyitottakból követelmény
    known_kanban = {k for it in cur for k in it.get("kanban", [])}
    for sid, board, tid, title, status, date in tasks:
        pcodes = set(re.findall(r"\b(P-0\d\d)\b", title))
        for code in pcodes:
            if code in codes:
                db.link(codes[code], sid, "kert")
        if board == "regi" or status in ("done", "dropped", "archived") or pcodes or tid in known_kanban:
            continue
        if title.startswith("Záró hurok bukott"):
            continue
        stmap = {"in_progress": "reszben", "blocked": "elvart", "open": "elvart", "ready": "elvart", "todo": "elvart",
                 "triage": "elvart", "running": "reszben"}
        code = f"FELADAT#{tid}" if board == "feladat" else f"KANBAN:{board}:{tid}"
        rid = db.req(code, title=title[:200], statement=title, category="feladat", origin_source_id=sid, date=date,
                     status=stmap.get(status, "ismeretlen"), evidence=f"{board} {status}", rule="task",
                     verify_hint="node D:/repo/Hermes-agent/scripts/feladat.mjs list --repo D:/repo/WEBSULI")
        db.link(rid, sid, "kert")


def settle_untouched(db: Db):
    """A korábbi futásban felvett, most már nem nyitott PR / lezárt feladat követelménye: státusz a forrás szerint."""
    c = db.c
    for rid, code, rule, ssrc in c.execute("SELECT id, code, rule, status_source FROM requirements WHERE rule IN ('open-pr','task')").fetchall():
        if code in db.touched:
            continue
        if rule == "open-pr":
            r = c.execute("SELECT id, json_extract(extra,'$.state') FROM sources WHERE kind='pr' AND ref=?", ("#" + code[3:],)).fetchone()
            st = {"MERGED": "kesz", "CLOSED": "elvetve"}.get(r[1] if r else "", "ismeretlen")
        else:
            tid = code.split("#", 1)[1] if code.startswith("FELADAT#") else code.split(":", 2)[2]
            ref = f"feladat:{tid}" if code.startswith("FELADAT#") else f"{code.split(':')[1]}:{tid}"
            r = c.execute("SELECT id, json_extract(extra,'$.status') FROM sources WHERE kind IN ('task','kanban') AND ref=?", (ref,)).fetchone()
            st = {"done": "kesz", "dropped": "elvetve", "archived": "elvetve"}.get(r[1] if r else "", "ismeretlen")
        c.execute("UPDATE requirements SET auto_status=?, status=CASE WHEN status_source='auto' THEN ? ELSE status END WHERE id=?",
                  (st, st, rid))
        if r:
            db.link(rid, r[0], "megvalositja" if st == "kesz" else "kert")


def rebuild_fts(db: Db):
    c = db.c
    c.execute("DELETE FROM requirements_fts")
    c.execute("INSERT INTO requirements_fts(rowid,code,title,statement,notes,evidence) SELECT id,code,title,statement,notes,evidence FROM requirements")
    c.execute("DELETE FROM sources_fts")
    c.execute("INSERT INTO sources_fts(rowid,kind,ref,title,raw_excerpt) SELECT id,kind,ref,title,raw_excerpt FROM sources")


def counts(db: Db) -> dict:
    return {t: db.c.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            for t in ("sources", "requirements", "requirement_links", "flags", "revisions", "findings")}


def main():
    global ARGS
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=os.environ.get("KOVETELMENY_DB", str(DEFAULT_DB)))
    ap.add_argument("--repo", default=os.environ.get("WEBSULI_REPO") or run(["git", "-C", str(HERE), "rev-parse", "--show-toplevel"]).strip())
    ap.add_argument("--napok", type=int, default=180)
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--no-gh", action="store_true")
    ap.add_argument("--fetch", action="store_true", help="git fetch origin előtte")
    ap.add_argument("-q", action="store_true")
    ARGS = ap.parse_args()
    since = (dt.date.today() - dt.timedelta(days=ARGS.napok)).isoformat()
    if ARGS.fetch:
        run(["git", "-C", ARGS.repo, "fetch", "-q", "origin"])
    db = Db(Path(ARGS.db))
    unavailable: list[str] = []
    log(f"Gyűjtés {since} óta → {ARGS.db}")
    commits = collect_git(db, ARGS.repo, since, unavailable)
    prs = collect_prs(db, since, unavailable, not ARGS.no_gh)
    specs = collect_specs(db, ARGS.repo, since, unavailable)
    collect_docs(db, ARGS.repo, unavailable)
    collect_sessions(db, since, unavailable)
    tasks = collect_kanban(db, unavailable)
    flags = collect_flags(db, ARGS.repo, unavailable, not ARGS.no_render)
    build_requirements(db, ARGS.repo, specs, commits, prs, tasks, flags, since)
    settle_untouched(db)
    rebuild_fts(db)
    cnt = counts(db)
    db.c.execute("INSERT OR REPLACE INTO meta VALUES('utolso_gyujtes',?)",
                 (json.dumps({"ido": dt.datetime.now().isoformat(timespec="seconds"), "since": since, "counts": cnt,
                              "nem_elerheto": unavailable}, ensure_ascii=False),))
    db.c.commit()
    log("Sorszámok: " + json.dumps(cnt, ensure_ascii=False))
    if unavailable:
        log("Nem elérhető / kihagyva:\n  - " + "\n  - ".join(unavailable))


ARGS = None
if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

#!/usr/bin/env python3
"""WEBSULI követelmény-adatbázis gyűjtő (idempotens, újrafuttatható).

Források (180 nap): git-commitok, GitHub PR-ok (minden nyitott PR korától függetlenül + feloldatlan review-szálaik),
docs/specs (terv + végrehajtás), tulajdonosi döntések (P-0xx, D1–D6, „Döntés:” sorok), TRAP/TUDAS/AGENTS/RETRO,
munkamenetek (Claude Code, Hermes, Codex, régi gép mentése — csak a felhasználói üzenetek), kanban (Hermes táblák +
régi kanban.db), SQL feladat-nyilvántartás (Docker Postgres), élő kapcsolók (kód + Render env — csak az állapot).

Elvek: a nem elérhető forrás (--no-gh, --no-render, hálózati/git-hiba) semmit nem töröl és nem fokoz le — a
kapcsolatok a DB-ben tárolt forrásokból épülnek újra, és csak a sikeresen újraszámolt családé cserélődik. Titok és
e-mail-cím csak maszkolva kerül a DB-be (maszk.py), a naplóba profilnév nem kerül.
Csak stdlib + sqlite3; a gh / git / docker fix argumentumlistás subprocess-szel (shell nélkül).
Használat: python scripts/kovetelmeny/gyujt.py [--db <út>] [--repo <út>] [--napok 180] [--no-render] [--no-gh] [--fetch] [-q]
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
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from maszk import mask, mask_obj, safe  # noqa: E402

LOCAL = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
DEFAULT_DB = LOCAL / "hermes" / "projekt-tudas" / "websuli" / "kovetelmenyek.db"
HOME = Path.home()
GH_REPO = "kosazoltan/WEBSULI"
RENDER_SERVICE = "srv-d6h9oq9drdic73cied30"
RESTORE = Path("D:/restore/kibontva/repo/WEBSULI")
BOOLISH = {"on", "off", "1", "0", "true", "false", "yes", "no", "admin"}
NUM_RE = re.compile(r"-?\d+(\.\d+)?")
NEM_ELL = "nem ellenőrzött"
REJTETT = "beállítva (érték rejtve)"

# Kapcsolónkénti bekapcsolási szabály a kód szerint (nem egységes normalizálás):
FLAG_RULES: dict[str, dict] = {
    "PLAYER_ACCOUNTS": {"on": {"on", "1", "true"}, "ref": "source/server/player/require-player.ts:11-12"},
    "ADVENT_CALENDAR": {"on": {"on", "1", "true"}, "ref": "source/server/advent/clock.ts:9-10"},
    "MP_MODE": {"on": {"on"}, "partial": {"admin"}, "ref": "source/server/realtime/config.ts:46-47"},
    "STUDIO_SOURCE_VISUALS": {"on": {"on"}, "ref": "source/server/studio/source-visuals-flag.ts"},
    "STUDIO_LESSON_OPENER": {"on": {"on"}, "ref": "source/server/studio/lesson-opener-flag.ts"},
    "STUDIO_LESSON_VARIETY": {"on": {"on"}, "missing": "be",
                              "ref": "source/server/studio/lesson-variety-flag.ts (hiány + NODE_ENV=production → BE)"},
    "LESSON_CLIPS_AUTO": {"on": {"on"}, "ref": "source/server/lesson-clips.ts:55"},
    "RESULT_PARTIAL_EMAIL": {"on": {"on"}, "ref": "source/server/lesson-result-email.ts:105"},
    "RESULT_COMBINED_EMAIL": {"on": {"on"}, "ref": "docs/specs/2026-11-24-osszevont-eredmenylevel*.md (U4e)"},
    "STUDIO_CATALOG_S6": {"on": {"1"}, "ref": "git grep STUDIO_CATALOG_S6"},
    "STUDIO_SUBJECT_MEMORY": {"on": {"1"}, "ref": "git grep STUDIO_SUBJECT_MEMORY"},
    "LESSON_CLIPS": {"kill": {"0"}, "ref": "source/server/lesson-clips.ts:52"},
    "LESSON_COVERS": {"kill": {"0"}, "ref": "source/server/lesson-covers.ts:267"},
    "STUDIO_QUIZ_BLIND": {"kill": {"0"}, "ref": "source/server/studio/single-run/engine.ts:322"},
    "STUDIO_ANSWER_KEY_TESTS": {"kill": {"0"}, "ref": "source/server/studio/answer-key-writer.ts:89"},
    # 2026-11-25 revízió: felsorolásos kapcsoló — csak a `values` készlet értékei tárolódnak nyíltan (docs/specs/2026-11-25-gyujt-enum-kapcsolo.md).
    "ADVENT_RESULT_EMAIL_MODE": {"on": {"send"}, "values": {"send", "dry-run"}, "ref": "source/server/advent/result-email.ts:39"},
}


def live_value(key: str, raw: str | None) -> str:
    """Az élő érték tárolható alakja: logikai / szám nyíltan, a szabályban felsorolt érték nyíltan, minden más REJTETT (titokvédelem)."""
    v = (raw or "").strip().lower()
    if v in BOOLISH or NUM_RE.fullmatch(v) or v in FLAG_RULES.get(key, {}).get("values", ()):
        return v
    return REJTETT

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
  auto_status TEXT, status_source TEXT NOT NULL DEFAULT 'auto', parent TEXT, rule TEXT, manual_evidence TEXT);
CREATE TABLE IF NOT EXISTS requirement_links(
  requirement_id INTEGER NOT NULL REFERENCES requirements(id), source_id INTEGER NOT NULL REFERENCES sources(id),
  relation TEXT NOT NULL CHECK(relation IN ('kert','dontes','megvalositja','reszben','felulirja','teszt','kapcsolo')),
  origin TEXT, PRIMARY KEY(requirement_id, source_id, relation));
CREATE TABLE IF NOT EXISTS flags(
  name TEXT PRIMARY KEY, code_default TEXT, live_value TEXT, owner_decision TEXT, checked_at TEXT, code_ref TEXT, notes TEXT,
  state TEXT, live_checked_at TEXT, stale INTEGER NOT NULL DEFAULT 0);
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
# Régebbi DB-k kiegészítése (fix tábla- és oszlopnevek, nincs külső bemenet); a meglévő sorok megmaradnak.
MIGRATE = {"requirements": {"manual_evidence": "TEXT"}, "requirement_links": {"origin": "TEXT"},
           "flags": {"state": "TEXT", "live_checked_at": "TEXT", "stale": "INTEGER NOT NULL DEFAULT 0"},
           "findings": {"kulcs": "TEXT"}}
REQ_COLS = {"title", "statement", "category", "origin_source_id", "date", "superseded_by", "evidence", "verify_hint",
            "notes", "parent", "rule"}


def cut(t: str | None, n: int) -> str:
    t = t or ""
    return t if len(t) <= n else t[:n] + " …"


def run(cmd: list[str], **kw) -> str:
    """Fix argumentumlista, shell nélkül (nincs parancsinjekció); hiba → RuntimeError (profilnév nélküli üzenettel)."""
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} hiba: {safe((r.stderr or r.stdout).strip()[:300])}")
    return r.stdout


def secure_path(path: Path):
    """Csak a tulajdonos olvashassa (POSIX: könyvtár 0700, fájl 0600). Windowson a %LOCALAPPDATA% ACL-je eleve
    felhasználónkénti, az os.chmod ott csak az írásvédettséget állítja — ott nincs mit szigorítani (README)."""
    if os.name != "posix":
        return
    try:
        os.chmod(path.parent, 0o700)
        for p in (path, Path(str(path) + "-journal"), Path(str(path) + "-wal")):
            if p.exists():
                os.chmod(p, 0o600)
    except OSError:
        pass


class Db:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not path.exists():
            os.close(os.open(path, os.O_CREAT | os.O_WRONLY, 0o600))
        secure_path(path)
        self.c = sqlite3.connect(path)
        self.c.execute("PRAGMA foreign_keys=ON")
        self.c.executescript(SCHEMA)
        for table, cols in MIGRATE.items():
            have = {r[1] for r in self.c.execute(f"PRAGMA table_info({table})")}
            for col, typ in cols.items():
                if col not in have:
                    self.c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
        self._migrate_manual_evidence()
        self.touched: set[str] = set()
        self.origin = "egyeb"

    def _migrate_manual_evidence(self):
        """A korábbi verzió a kézi bizonyítékot az evidence-be fűzte: egyszeri áthelyezés a manual_evidence oszlopba."""
        for rid, ev in self.c.execute("SELECT id, evidence FROM requirements WHERE status_source='revizio' "
                                      "AND manual_evidence IS NULL AND evidence LIKE '%revízió]%'").fetchall():
            parts = re.findall(r"\[\d{4}-\d\d-\d\d revízió\][^;]*", ev or "")
            if parts:
                self.c.execute("UPDATE requirements SET manual_evidence=? WHERE id=?", (mask("; ".join(p.strip() for p in parts)), rid))

    def source(self, kind: str, ref: str, date: str | None, title: str, raw: str, extra: dict | None = None) -> int:
        ex = json.dumps(mask_obj(extra or {}), ensure_ascii=False, sort_keys=True)
        self.c.execute(
            """INSERT INTO sources(kind,ref,date,title,raw_excerpt,extra) VALUES(?,?,?,?,?,?)
               ON CONFLICT(kind,ref) DO UPDATE SET date=excluded.date,title=excluded.title,
               raw_excerpt=excluded.raw_excerpt,extra=excluded.extra""",
            (kind, ref, date, mask(cut(title, 300)), mask(raw), ex))
        return self.c.execute("SELECT id FROM sources WHERE kind=? AND ref=?", (kind, ref)).fetchone()[0]

    def req(self, code: str, **f) -> int:
        """Upsert. Az oszlopnevek a REQ_COLS fehérlistából (a kódból), az értékek ?-paraméterek. A manual_evidence-hez nem nyúl."""
        bad = set(f) - REQ_COLS - {"status"}
        if bad:
            raise ValueError(f"ismeretlen oszlop: {bad}")
        self.touched.add(code)
        row = self.c.execute("SELECT id,status_source FROM requirements WHERE code=?", (code,)).fetchone()
        auto = f.get("status", "ismeretlen")
        vals = {k: (mask(v) if isinstance(v, str) else v) for k, v in f.items() if k != "status"}
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

    def set_auto(self, rid: int, status: str, evidence: str | None = None):
        """Automatikus státusz; kézi (revizio) státuszt nem ír felül, a manual_evidence-hez nem nyúl."""
        if evidence is None:
            self.c.execute("UPDATE requirements SET auto_status=?, status=CASE WHEN status_source='auto' THEN ? ELSE status END "
                           "WHERE id=?", (status, status, rid))
        else:
            self.c.execute("UPDATE requirements SET auto_status=?, evidence=?, status=CASE WHEN status_source='auto' THEN ? "
                           "ELSE status END WHERE id=?", (status, mask(evidence), status, rid))

    def link(self, rid: int, sid: int, rel: str):
        self.c.execute("INSERT OR IGNORE INTO requirement_links VALUES(?,?,?,?)", (rid, sid, rel, self.origin))

    def family(self, name: str):
        """Egy kapcsolat-család újraépítése: csak a sajátjait törli (a ki nem számolt családok kapcsolatai maradnak).
        A korábbi verzió origin nélküli kapcsolatai az első (spec) családdal együtt cserélődnek."""
        self.origin = name
        if name == "spec":
            self.c.execute("DELETE FROM requirement_links WHERE origin=? OR origin IS NULL", (name,))
        else:
            self.c.execute("DELETE FROM requirement_links WHERE origin=?", (name,))


def log(msg: str):
    if not ARGS.q:
        print(safe(msg), flush=True)


# ---------------------------------------------------------------- 1. git
def collect_git(db: Db, repo: str, since: str, ok: dict, unavailable: list):
    try:
        main_set = set(run(["git", "-C", repo, "rev-list", "origin/main", f"--since={since}"]).split())
        out = run(["git", "-C", repo, "log", "--all", f"--since={since}", "--format=%H%x1f%aI%x1f%an%x1f%s%x1f%b%x1e"])
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"git: {e}")
        return
    n = 0
    for rec in out.split("\x1e"):
        parts = rec.strip("\n").split("\x1f")
        if len(parts) < 5:
            continue
        h, date, author, subj, body = parts[:5]
        allapot = [ln.strip() for ln in body.splitlines() if ln.strip().startswith("Állapot")]
        pr = re.findall(r"\(#(\d+)\)\s*$", subj)
        db.source("commit", h, date[:10], subj, cut(body, 2500),
                  {"author": author, "main": h in main_set, "allapot": allapot[-1] if allapot else None,
                   "pr": int(pr[-1]) if pr else None})
        n += 1
    ok["commit"] = True
    log(f"  commit: {n}")


# ---------------------------------------------------------------- 2. PR
THREADS_Q = ("query($o:String!,$r:String!,$n:Int!,$c:String){repository(owner:$o,name:$r){pullRequest(number:$n){"
             "reviewThreads(first:100,after:$c){pageInfo{hasNextPage endCursor}nodes{id isResolved path "
             "comments(first:1){nodes{author{login} body createdAt}}}}}}}")


def collect_prs(db: Db, since: str, ok: dict, unavailable: list, use_gh: bool):
    if not use_gh:
        unavailable.append("gh: --no-gh (a meglévő PR-források és kapcsolatok változatlanok)")
        return
    try:
        data = json.loads(run(["gh", "pr", "list", "-R", GH_REPO, "--state", "all", "--limit", "1000", "--json",
                               "number,title,body,state,createdAt,mergedAt,headRefName,mergeCommit"]))
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"gh pr list: {e}")
        return
    n, opened = 0, []
    for p in data:
        d = (p.get("mergedAt") or p.get("createdAt") or "")[:10]
        # nyitott PR korától függetlenül; lezárt/beolvadt csak az ablakon belül
        if p["state"] != "OPEN" and (p.get("createdAt") or "")[:10] < since and d < since:
            continue
        mc = (p.get("mergeCommit") or {}) or {}
        db.source("pr", f"#{p['number']}", (p.get("createdAt") or "")[:10], p["title"], cut(p.get("body"), 3000),
                  {"state": p["state"], "mergedAt": p.get("mergedAt"), "head": p.get("headRefName"), "mergeCommit": mc.get("oid"),
                   "number": p["number"],
                   # review #587: a 3000 karakteres csonkolás után álló hivatkozások se vesszenek el (a kapcsolatépítés ebből is dolgozik)
                   "refs": sorted(set(REF_RE.findall(p.get("body") or "")))})
        n += 1
        if p["state"] == "OPEN":
            opened.append(p["number"])
    ok["pr"] = True
    owner, name = GH_REPO.split("/")
    for num in opened:
        current, cursor, failed = set(), None, False
        while True:  # lapozás (100/lap), amíg van következő
            args = ["gh", "api", "graphql", "-f", f"query={THREADS_Q}", "-F", f"o={owner}", "-F", f"r={name}", "-F", f"n={num}"]
            if cursor:
                args += ["-F", f"c={cursor}"]
            try:
                rt = json.loads(run(args))["data"]["repository"]["pullRequest"]["reviewThreads"]
            except Exception as e:  # noqa: BLE001
                unavailable.append(f"review-szálak #{num}: {e}")
                failed = True
                break
            for t in rt["nodes"]:
                if t["isResolved"] or not t["comments"]["nodes"]:
                    continue
                c0 = t["comments"]["nodes"][0]
                ref = f"#{num}:szal:{t['id']}"
                current.add(ref)
                db.source("pr", ref, (c0.get("createdAt") or "")[:10], f"#{num} nyitott review-szál ({t.get('path')})",
                          cut(c0.get("body"), 1500), {"author": (c0.get("author") or {}).get("login"), "pr": num, "unresolved": True})
            if not rt["pageInfo"]["hasNextPage"]:
                break
            cursor = rt["pageInfo"]["endCursor"]
        if not failed:  # sikeres, teljes lekérés: a többi tárolt szál feloldott/eltűnt → nem aktuális
            for sid, ref, ex in db.c.execute("SELECT id, ref, extra FROM sources WHERE kind='pr' AND ref LIKE ?",
                                             (f"#{num}:szal:%",)).fetchall():
                if ref not in current:
                    e = json.loads(ex or "{}")
                    e["unresolved"] = False
                    db.c.execute("UPDATE sources SET extra=? WHERE id=?", (json.dumps(e, ensure_ascii=False, sort_keys=True), sid))
    log(f"  pr: {n} (nyitott: {len(opened)})")


# ---------------------------------------------------------------- 3. spec + tudásfájlok
def git_show(repo: str, path: str) -> str:
    return run(["git", "-C", repo, "show", f"origin/main:{path}"])


def parse_spec(text: str) -> tuple[str, list, list]:
    lines = text.splitlines()
    title = next((ln.lstrip("# ").strip() for ln in lines if ln.startswith("#")), "")
    allapot = [ln.strip() for ln in lines if re.match(r"^\W{0,4}Állapot", ln.strip())]
    dontes = []
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
        dontes.append({"label": label, "text": re.sub(r"\s+", " ", seg[seg.index("Döntés:"):])[:500], "line": i + 1})
    return title, allapot, dontes


def collect_specs(db: Db, repo: str, since: str, ok: dict, unavailable: list):
    try:  # rekurzív lista a docs/specs fán belül (nem a könyvtár mint fa-bejegyzés)
        files = [f for f in run(["git", "-C", repo, "ls-tree", "-r", "--name-only", "origin/main", "--", "docs/specs"]).splitlines()
                 if f.startswith("docs/specs/") and f.endswith(".md")]
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"specs: {e}")
        return
    n, fails = 0, 0
    for f in files:
        base = Path(f).stem
        m = re.match(r"(\d{4}-\d{2}-\d{2})", base)
        date = m.group(1) if m else None
        if date and date < since:
            continue
        try:
            text = git_show(repo, f)
        except Exception:  # noqa: BLE001
            fails += 1
            continue
        title, allapot, dontes = parse_spec(text)
        db.source("spec", f, date, title or base, cut(text, 3000),
                  {"base": base, "allapot": allapot, "dontes": dontes, "vegrehajtas": base.endswith("-vegrehajtas")})
        n += 1
    if fails:
        unavailable.append(f"specs: {fails} fájl nem olvasható")
    if not n:
        unavailable.append("specs: 0 spec a docs/specs alatt — gyanús")
    ok["spec"] = n > 0 and not fails
    log(f"  spec: {n}")


def collect_docs(db: Db, repo: str, ok: dict, unavailable: list):
    docs = ["AGENTS.md", ".hermes/projekt/TUDAS.md", ".hermes/projekt/SZALAK.md", "docs/lesson-improvement.md",
            "docs/agent-csapdak.md", "docs/websuli-potlasok.md"]
    try:
        retro = [f for f in run(["git", "-C", repo, "ls-tree", "-r", "--name-only", "origin/main", "--",
                                 ".hermes/projekt/RETRO"]).splitlines() if f.endswith(".md")]
    except Exception:  # noqa: BLE001
        retro = []
    n = 0
    for f in docs + retro:
        try:
            text = git_show(repo, f)
        except Exception as e:  # noqa: BLE001
            unavailable.append(f"{f}: {str(e)[:80]}")
            continue
        for k, sec in enumerate(re.split(r"(?m)^(?=## )", text)):
            head = sec.strip().splitlines()[0] if sec.strip() else f
            dm = re.search(r"(20\d\d-\d\d-\d\d)", head) or re.search(r"(20\d\d-\d\d-\d\d)", f)
            db.source("doc", f"{f}#{k}", dm.group(1) if dm else None, f"{f}: {head.lstrip('# ')}", cut(sec, 3000))
            n += 1
    try:
        for ln in git_show(repo, ".hermes/projekt/TRAP.md").splitlines():
            if not ln.startswith("|") or ln.startswith("|---") or "Dátum" in ln[:20]:
                continue
            cells = [c.strip() for c in ln.strip("|").split("|")]
            dm = re.search(r"20\d\d-\d\d-\d\d", cells[0]) if cells else None
            db.source("trap", "TRAP:" + hashlib.sha1(ln.encode("utf-8")).hexdigest()[:16], dm.group(0) if dm else None,
                      cut(cells[1] if len(cells) > 1 else ln, 200), cut(ln, 2000))
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


def collect_sessions(db: Db, since: str, ok: dict, unavailable: list):
    seen: dict[str, set] = {"cc": set(), "hm": set(), "cx": set()}
    tool_ok = {"cc": True, "hm": True, "cx": True}

    def add(tool: str, sess: str, mid: str, ts: str, text: str, cwd: str | None):
        ref = f"{tool}:{sess}:{mid}"  # stabil üzenet-azonosító szerinti egyediség (nem szövegelőtag)
        if ref in seen[tool]:
            return
        seen[tool].add(ref)
        db.source("session", ref, ts[:10], cut(text.replace("\n", " "), 160), cut(text, 8000),
                  {"tool": tool, "session": sess, "ts": ts, "cwd": safe(cwd) if cwd else None})

    # Claude Code (jelenlegi gép + régi gép mentése) — a projektkönyvtár maga WEBSULI-specifikus
    dirs = [f for f in glob.glob(str(HOME / ".claude" / "projects" / "*")) if "websuli" in f.lower()]
    jsonls = [j for d in dirs for j in glob.glob(os.path.join(d, "*.jsonl"))]
    jsonls += glob.glob(str(RESTORE / "**" / "*.jsonl"), recursive=True) if RESTORE.exists() else []
    if not jsonls:
        unavailable.append("Claude Code: nincs WEBSULI jsonl")
        tool_ok["cc"] = False
    for k, f in enumerate(jsonls):
        try:
            with open(f, encoding="utf-8", errors="replace") as fh:
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
                    for i, t in enumerate(texts):
                        t2 = owner_text(t)
                        if t2:
                            add("cc", o.get("sessionId") or Path(f).stem, f"{o.get('uuid') or ts}:{i}", ts, t2, o.get("cwd"))
        except OSError as e:
            unavailable.append(f"Claude Code jsonl #{k}: {type(e).__name__}")
            tool_ok["cc"] = False
    # Hermes state.db (fő + profilok), csak olvasva; a naplóba profilnév nem kerül (sorszám)
    dbs = [LOCAL / "hermes" / "state.db"] + [Path(x) for x in sorted(glob.glob(str(LOCAL / "hermes" / "profiles" / "*" / "state.db")))]
    for k, p in enumerate(dbs):
        try:
            c = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
            rows = c.execute(
                """SELECT m.session_id, m.id, m.timestamp, m.content, s.cwd FROM messages m JOIN sessions s ON s.id=m.session_id
                   WHERE m.role='user' AND COALESCE(s.title,'') NOT LIKE 'Subagent:%'
                     AND (lower(COALESCE(s.cwd,'')) LIKE '%websuli%' OR lower(COALESCE(s.title,'')) LIKE '%websuli%'
                          OR lower(COALESCE(m.content,'')) LIKE '%websuli%')""").fetchall()
            c.close()
        except Exception as e:  # noqa: BLE001
            unavailable.append(f"Hermes state.db #{k}: {type(e).__name__}")
            tool_ok["hm"] = False
            continue
        for sess, mid, tsf, content, cwd in rows:
            ts = dt.datetime.fromtimestamp(tsf).isoformat(timespec="seconds")
            t2 = owner_text(content) if ts[:10] >= since else None
            if t2:
                add("hm", sess, str(mid), ts, t2, cwd)
    # Codex: üzenetenkénti szűrés (WEBSULI munkakönyvtár vagy az üzenet maga említi) — nincs ülésszintű egyezés
    cx = glob.glob(str(HOME / ".codex" / "sessions" / "**" / "*.jsonl"), recursive=True)
    cx_n = 0
    for k, f in enumerate(cx):
        cwd = None
        try:
            with open(f, encoding="utf-8", errors="replace") as fh:
                for i, line in enumerate(fh):
                    try:
                        o = json.loads(line)
                    except ValueError:
                        continue
                    pl = o.get("payload") or {}
                    if o.get("type") == "session_meta":
                        cwd = pl.get("cwd")
                    if o.get("type") == "response_item" and pl.get("role") == "user":
                        ts = o.get("timestamp") or ""
                        for j, b in enumerate(pl.get("content") or []):
                            t2 = owner_text(b.get("text", ""))
                            if t2 and ts[:10] >= since and ("websuli" in (cwd or "").lower() or "websuli" in t2.lower()):
                                add("cx", Path(f).stem, f"{i}:{j}", ts, t2, cwd)
                                cx_n += 1
        except OSError as e:
            unavailable.append(f"Codex munkamenet #{k}: {type(e).__name__}")
            tool_ok["cx"] = False
    if cx and not cx_n:
        unavailable.append(f"Codex: {len(cx)} munkamenet, WEBSULI-üzenet nincs bennük")
    # megőrzés: az ablakon kívüli üzenet törlődik (adatvédelem); a forrásból eltűnt csak sikeres eszközolvasás után
    stale = {sid for (sid,) in db.c.execute("SELECT id FROM sources WHERE kind='session' AND date < ?", (since,))}
    for tool, good in tool_ok.items():
        if good:
            stale |= {sid for sid, ref in db.c.execute("SELECT id, ref FROM sources WHERE kind='session' AND ref LIKE ?", (tool + ":%",))
                      if ref not in seen[tool]}
    for sid in stale:
        db.c.execute("DELETE FROM requirement_links WHERE source_id=?", (sid,))
        db.c.execute("UPDATE requirements SET origin_source_id=NULL WHERE origin_source_id=?", (sid,))  # a kurált lépés újraszámolja
        db.c.execute("DELETE FROM sources WHERE id=?", (sid,))
    ok["session"] = any(tool_ok.values())
    log(f"  session (felhasználói üzenet): {sum(len(s) for s in seen.values())}; törölt (ablakon kívül/eltűnt): {len(stale)}")


# ---------------------------------------------------------------- 5. kanban + SQL feladatok
def collect_kanban(db: Db, ok: dict, unavailable: list):
    n = 0
    boards = {"websuli": LOCAL / "hermes" / "kanban" / "boards" / "websuli" / "kanban.db",
              "hermes-agent": LOCAL / "hermes" / "kanban" / "boards" / "hermes-agent" / "kanban.db"}
    for board, p in boards.items():
        if not p.exists():
            unavailable.append(f"kanban {board}: nincs adatbázis")
            continue
        try:
            c = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
            q = "SELECT id,title,body,status,created_at FROM tasks"
            if board != "websuli":
                q += " WHERE lower(title||COALESCE(body,'')) LIKE '%websuli%' OR id='t_49cdc6eb'"
            rows = c.execute(q).fetchall()
            c.close()
        except sqlite3.Error as e:
            unavailable.append(f"kanban {board}: {type(e).__name__}")
            continue
        for tid, title, body, status, created in rows:
            date = dt.datetime.fromtimestamp(created).date().isoformat() if isinstance(created, (int, float)) else None
            db.source("kanban", f"{board}:{tid}", date, title, cut(body, 3000), {"board": board, "status": status, "tid": tid})
            n += 1
    old = RESTORE / ".hermes" / "kanban.db"
    if old.exists():
        try:
            c = sqlite3.connect(f"file:{old}?mode=ro", uri=True)
            rows = c.execute("SELECT id,ticket,title,status,created_at FROM items").fetchall()
            c.close()
            for iid, ticket, title, status, created in rows:
                db.source("kanban", f"regi:{iid}", (created or "")[:10], f"{ticket}: {title}", title,
                          {"board": "regi", "status": status, "ticket": ticket, "tid": str(iid)})
                n += 1
        except sqlite3.Error as e:
            unavailable.append(f"régi kanban.db: {type(e).__name__}")
    else:
        unavailable.append("régi kanban.db: nincs mentés")
    try:
        sql = ("SELECT json_agg(t) FROM (SELECT id,title,body,status,priority,source,kanban_id,"
               "to_char(created_at,'YYYY-MM-DD') d, notes FROM feladat.tasks WHERE repo='websuli' ORDER BY id) t;")
        raw = run(["docker", "exec", "-i", os.environ.get("FELADAT_PG_CONTAINER", "hermes-mem0-pg"), "psql", "-U", "mem0",
                   "-d", "mem0", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], input=sql)
        for t in json.loads(raw.strip() or "[]") or []:
            notes = t.get("notes") or []
            last = notes[-1] if notes else None
            db.source("task", f"feladat:{t['id']}", t["d"], t["title"],
                      cut((t.get("body") or "") + ("\nUtolsó jegyzet: " + json.dumps(last, ensure_ascii=False) if last else ""), 3000),
                      {"status": t["status"], "priority": t["priority"], "source": t["source"], "kanban": t["kanban_id"],
                       "board": "feladat", "tid": str(t["id"])})
            n += 1
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"SQL feladat-nyilvántartás: {str(e)[:120]}")
    log(f"  kanban+feladat: {n}")


# ---------------------------------------------------------------- 6. kapcsolók
def flag_state(live: str, rule: dict | None, code_default: str) -> str:
    """be | ki | reszleges | nem_ellenorzott | nem_logikai — az adott kapcsoló SAJÁT szabálya szerint.
    A „nem ellenőrzött” és a nem logikai (pl. numerikus) érték soha nem KI."""
    if not live or live == NEM_ELL:
        return "nem_ellenorzott"
    v = "" if live == "hiányzik" else live
    rule = rule or {}
    if v and v not in BOOLISH and v not in (rule or {}).get("values", ()):
        return "nem_logikai"
    if "kill" in rule:
        return "ki" if v in rule["kill"] else "be"
    if v == "" and rule.get("missing") == "be":
        return "be"
    if v in rule.get("on", {"on", "1", "true", "yes"}):
        return "be"
    if v in rule.get("partial", set()):
        return "reszleges"
    return "ki"


def collect_flags(db: Db, repo: str, ok: dict, unavailable: list, use_render: bool) -> dict:
    now = dt.datetime.now().isoformat(timespec="seconds")
    found: dict[str, dict] = {}
    code_ok = True
    try:
        g = run(["git", "-C", repo, "grep", "-nE", r'(===|!==) *"(on|off|0|1|true)"', "origin/main", "--",
                 "source/server", "source/shared"])
    except Exception as e:  # noqa: BLE001
        g, code_ok = "", False
        unavailable.append(f"flag-grep: {e}")
    for ln in g.splitlines():
        if ".test." in ln:
            continue
        m = re.search(r"env(?:\.|\[\")([A-Z][A-Z0-9_]+).*?(===|!==) *\"(on|off|0|1|true)\"", ln)
        if not m or m.group(1) in ("NODE_ENV", "RENDER", "WEBSULI_E2E", "CI"):
            continue
        name, _op, val = m.groups()
        rule = {"kill": {"0", "off"}} if val in ("0", "off") else {"on": {val}}
        found.setdefault(name, {"code_default": "BE (vészfék: =0/off kapcsol ki)" if "kill" in rule else "KI",
                                "code_ref": ln.split(":", 2)[1] if ln.count(":") >= 2 else "", "rule": rule})
    try:
        for f in run(["git", "-C", repo, "ls-tree", "-r", "--name-only", "origin/main", "--", "source/server"]).splitlines():
            if not f.endswith("-flag.ts"):
                continue
            txt = git_show(repo, f)
            names = set(re.findall(r'env(?:\.|\[)"?([A-Z][A-Z0-9_]+)', txt) + re.findall(r'"((?:STUDIO|LESSON|RESULT)_[A-Z0-9_]+)"', txt))
            for name in names:
                if name == "NODE_ENV" or re.search(rf"\bconst {name}\b", txt):
                    continue
                prod = "NODE_ENV" in txt and "production" in txt
                found[name] = {"code_default": "BE élesben (NODE_ENV=production), egyébként KI" if prod else "KI", "code_ref": f}
    except Exception as e:  # noqa: BLE001
        code_ok = False
        unavailable.append(f"flag-fájlok: {e}")
    for name, rule in FLAG_RULES.items():
        d = found.setdefault(name, {"code_default": "BE (vészfék)" if "kill" in rule else "KI", "code_ref": rule["ref"]})
        d["rule"] = rule
    live: dict[str, str] = {}
    render_ok = False
    if use_render:
        key = os.environ.get("RENDER_API_KEY")
        envf = LOCAL / "hermes" / ".env"
        if not key and envf.exists():
            for line in envf.read_text(encoding="utf-8", errors="replace").splitlines():
                if line.startswith("RENDER_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("'\"")
        if not key:
            unavailable.append("Render: nincs RENDER_API_KEY (a korábbi élő értékek megmaradnak)")
        else:
            try:
                cursor = None
                while True:  # lapozás a Render kurzorával, amíg teljes lap jön
                    url = f"https://api.render.com/v1/services/{RENDER_SERVICE}/env-vars?limit=100"
                    if cursor:
                        url += "&cursor=" + urllib.parse.quote(cursor)
                    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key, "Accept": "application/json"})
                    page = json.load(urllib.request.urlopen(req, timeout=30))
                    for e in page:
                        ev = e.get("envVar", e)
                        live[ev["key"]] = live_value(ev["key"], ev.get("value"))
                    if len(page) < 100 or not page[-1].get("cursor"):
                        break
                    cursor = page[-1]["cursor"]
                render_ok = True
            except Exception as e:  # noqa: BLE001
                live = {}
                unavailable.append(f"Render env: {type(e).__name__} (a korábbi élő értékek megmaradnak)")
            finally:
                key = None
    else:
        unavailable.append("Render: --no-render (a korábbi élő értékek megmaradnak)")
    for name, v in live.items():
        if name in found:
            continue
        if v in BOOLISH or NUM_RE.fullmatch(v) or name.startswith(("STUDIO_", "LESSON_", "RESULT_", "ADVENT", "PLAYER", "MP_", "WORKFLOW")):
            used = subprocess.run(["git", "-C", repo, "grep", "-qw", name, "origin/main", "--", "source"],
                                  capture_output=True).returncode
            found[name] = {"code_default": {0: "a kód olvassa (nem kapcsoló-minta)", 1: "nem található a kódban"}
                           .get(used, "kódkeresés sikertelen"), "code_ref": None}
    seen = set()
    for name, f in found.items():
        if name.endswith("_ENV"):
            continue
        seen.add(name)
        prev = db.c.execute("SELECT live_value, live_checked_at FROM flags WHERE name=?", (name,)).fetchone()
        if render_ok:
            lv, lchk = live.get(name, "hiányzik"), now
        elif prev and prev[0]:  # nem elérhető Render: a korábbi mérés marad (a dátumával)
            lv, lchk = prev
        else:
            lv, lchk = NEM_ELL, None
        st = flag_state(lv, f.get("rule"), f["code_default"])
        db.c.execute("""INSERT INTO flags(name,code_default,live_value,checked_at,code_ref,state,live_checked_at,stale)
                        VALUES(?,?,?,?,?,?,?,0) ON CONFLICT(name) DO UPDATE SET code_default=excluded.code_default,
                        live_value=excluded.live_value,checked_at=excluded.checked_at,code_ref=excluded.code_ref,
                        state=excluded.state,live_checked_at=excluded.live_checked_at,stale=0""",
                     (name, f["code_default"], lv, now, f["code_ref"], st, lchk))
        db.source("config", f"flag:{name}", (lchk or now)[:10], f"{name} = {lv} ({st})",
                  f"kód-alap: {f['code_default']}; hely: {f['code_ref']}", {"live": lv, "state": st})
    if render_ok and code_ok:  # teljes, sikeres mérés: a nem látott sorok elavultak (a revízió kihagyja őket)
        for (name,) in db.c.execute("SELECT name FROM flags").fetchall():
            if name not in seen:
                db.c.execute("UPDATE flags SET stale=1 WHERE name=?", (name,))
    ok["config"] = render_ok and code_ok
    log(f"  flags: {len(seen)} (élő: {len(live)}{'' if render_ok else ', Render nem mért'})")
    return {r[0]: {"live": r[1], "state": r[2]} for r in db.c.execute("SELECT name, live_value, state FROM flags WHERE stale=0")}


# ---------------------------------------------------------------- követelmények (a DB-ben tárolt forrásokból)
STATUS_MAP = {"KÉSZ": "kesz", "RÉSZ": "reszben", "ÁG": "felkesz", "NINCS": "elvart", "DÖNT": "elvart", "ELAV": "elvetve"}
IMPL_RE = re.compile(r"^(feat|fix|perf|refactor|test|ci|chore\(qa\))", re.I)
# A PR-törzs teljes hivatkozáslistája (spec-fájl, P-/K-tétel, döntés) — a csonkolt kivonat mellé, az `extra.refs`-be.
REF_RE = re.compile(r"docs/specs/[\w.-]+\.md|\b(?:P|K)-\d{3}\b|\bDONTES:P-\d{3}\b|\bFOTERV-D\d\b")
SPEC_RE = re.compile(r"docs/specs/([\w.-]+?)(?:-vegrehajtas)?\.md")


def spec_status(allapot: list[str]) -> str | None:
    if not allapot:
        return None
    last = " ".join(allapot[-2:]).lower()
    if re.search(r"folyamatban|részben|következő|hátra|nyitott|tervezve", last):
        return "reszben" if "tervezve" not in last else "elvart"
    if re.search(r"kész|beolvadt|merged|lezárva|teljesült", last):
        return "kesz"
    return None


def load_sources(c) -> dict:
    """A kapcsolatépítés alapja a DB (nem az aktuális futás listái): a nem elérhető forrás bizonyítéka is megmarad."""
    prs, threads, commits, specs, tasks = {}, {}, [], {}, []
    for sid, ref, title, raw, ex, date in c.execute("SELECT id, ref, title, raw_excerpt, extra, date FROM sources WHERE kind='pr'"):
        e = json.loads(ex or "{}")
        if ":szal:" in ref:
            threads.setdefault(int(ref[1:].split(":")[0]), []).append((sid, e))
        else:
            prs[int(ref[1:])] = {"sid": sid, "title": title or "", "body": (raw or "") + "\n" + " ".join(e.get("refs") or []), "state": e.get("state"),
                                 "head": e.get("head"), "date": date}
    for sid, title, raw, ex in c.execute("SELECT id, title, raw_excerpt, extra FROM sources WHERE kind='commit'"):
        commits.append((sid, title or "", raw or "", bool(json.loads(ex or "{}").get("main"))))
    for sid, ref, title, date, ex in c.execute("SELECT id, ref, title, date, extra FROM sources WHERE kind='spec'"):
        e = json.loads(ex or "{}")
        specs[ref] = {"sid": sid, "base": e.get("base") or Path(ref).stem, "title": title or "", "date": date,
                      "allapot": e.get("allapot") or [], "dontes": e.get("dontes") or []}
    for sid, ref, title, date, ex in c.execute("SELECT id, ref, title, date, extra FROM sources WHERE kind IN ('kanban','task')"):
        e = json.loads(ex or "{}")
        tasks.append((sid, e.get("board") or ref.split(":")[0], str(e.get("tid") or ref.split(":", 1)[1]), title or "",
                      e.get("status"), date))
    return {"prs": prs, "threads": threads, "commits": commits, "specs": specs, "tasks": tasks}


def pr_rel(p: dict) -> str:
    return "megvalositja" if p["state"] == "MERGED" else "reszben"


def build_requirements(db: Db, repo: str, flags: dict, unavailable: list):
    c = db.c
    S = load_sources(c)
    prs, commits, specs = S["prs"], S["commits"], S["specs"]

    # --- A) spec-tervek
    db.family("spec")
    mention: dict[str, list] = {}
    for num, p in prs.items():
        for base in set(SPEC_RE.findall(p["body"] + p["title"])):
            mention.setdefault(base, []).append(("pr", num, p))
    for sid, subj, body, on_main in commits:
        for base in set(SPEC_RE.findall(body)):
            mention.setdefault(base, []).append(("commit", sid, on_main))
    for f, s in specs.items():
        if s["base"].endswith("-vegrehajtas"):
            continue
        vf = f.replace(".md", "-vegrehajtas.md")
        v = specs.get(vf)
        st = spec_status((v or {}).get("allapot") or []) or spec_status(s["allapot"])
        refs = mention.get(s["base"], [])
        prefs = [dict(x[2], number=x[1]) for x in refs if x[0] == "pr"]
        evid = []
        if st is None:
            if any(p["state"] == "OPEN" for p in prefs):
                st = "felkesz"
            elif any(p["state"] == "MERGED" and IMPL_RE.match(p["title"]) for p in prefs):
                st = "kesz"
                evid.append("becslés: beolvadt implementációs PR hivatkozik rá")
            else:
                st = "ismeretlen"
        evid += [f"PR #{p['number']} {p['state']}" for p in prefs][:8]
        if v and v["allapot"]:
            evid.append("Állapot: " + v["allapot"][-1][:200])
        rid = db.req(f"SPEC:{s['base']}", title=s["title"][:200], statement=f"Terv: {f}" + (f" + {vf}" if v else ""),
                     category="spec", origin_source_id=s["sid"], date=s["date"], status=st, evidence="; ".join(evid),
                     verify_hint=f"Állapot-sor a {vf if v else f} fájlban; beolvadt PR-ok", rule="spec")
        db.link(rid, s["sid"], "kert")
        if v:
            db.link(rid, v["sid"], "dontes")
        for kind, key, extra in refs:
            if kind == "pr":
                db.link(rid, extra["sid"], pr_rel(extra))
            else:
                db.link(rid, key, "megvalositja" if extra else "reszben")
        for k, d in enumerate(s["dontes"] + ((v or {}).get("dontes") or [])):
            drid = db.req(f"DONTES:{s['base']}:{d.get('label') or k + 1}", title=(d.get("label") or "Döntés") + " — " + d["text"][8:120],
                          statement=d["text"], category="dontes", origin_source_id=s["sid"], date=s["date"],
                          status=st if st in ("kesz", "reszben", "felkesz") else "ismeretlen",
                          evidence=f"{f}:{d.get('line')}", parent=f"SPEC:{s['base']}", rule="spec-dontes")
            db.link(drid, s["sid"], "dontes")

    # --- B) pótlási leltár + hiányleltár-pillanatkép + tulajdonosi döntések + főterv (git show kell; hiba → család kimarad)
    def sfile(name):
        return next((v for k, v in specs.items() if k.endswith(name)), None)
    try:
        ptxt_terv = git_show(repo, "docs/specs/2026-11-19-websuli-potlasok-terv.md")
        htxt = git_show(repo, "docs/specs/2026-11-23-teljes-hianyleltar.md")
        ptxt = git_show(repo, "docs/websuli-potlasok.md")
        ftxt = git_show(repo, "docs/specs/2026-11-23-foterv.md")
    except Exception as e:  # noqa: BLE001
        unavailable.append(f"P-leltár: {e} (a P-tételek és kapcsolataik változatlanok)")
        ptxt_terv = htxt = ptxt = ftxt = None
    if ptxt_terv is not None:
        db.family("p")
        goals, snap, dec = {}, {}, {}
        for ln in ptxt_terv.splitlines():
            m = re.match(r"^\| (P-0\d\d) \| ([^|]+)\| ([^|]+)\|", ln)
            if m:
                goals[m.group(1)] = (m.group(2).strip(), m.group(3).strip())
        for ln in htxt.splitlines():
            m = re.match(r"^\| (P-0\d\d)([^|]*)\| ([^|]+)\| ([^|]*)\| ([^|]*)\|", ln)
            if m:
                snap[m.group(1)] = (m.group(2).strip(), m.group(3).strip(), m.group(4).strip(), m.group(5).strip())
            m = re.match(r"^- \*\*(P-0\d\d|BL [^*]+)\*\* — (.+)", ln)
            if m:
                dec[m.group(1)] = m.group(2).strip()
        ptitles = {m.group(1): m.group(2).strip() for m in re.finditer(r"^\| (P-0\d\d) \| ([^|]+)\|", ptxt, re.M)}
        pt, hl, fo = sfile("2026-11-19-websuli-potlasok-terv.md"), sfile("2026-11-23-teljes-hianyleltar.md"), sfile("2026-11-23-foterv.md")
        src_pl = c.execute("SELECT id FROM sources WHERE kind='doc' AND ref LIKE 'docs/websuli-potlasok.md#%' ORDER BY id").fetchone()
        heads = {p["head"]: p for p in prs.values() if p.get("head")}
        for code in sorted(set(goals) | set(snap) | set(ptitles)):
            g, sn = goals.get(code, ("", "")), snap.get(code)
            st = STATUS_MAP.get((sn[1].split()[0] if sn and sn[1] else "").strip(), "ismeretlen")
            title = (sn[0] if sn and sn[0] else ptitles.get(code, "")) or g[0]
            rid = db.req(code, title=title[:200], statement=g[0] or title, category="p-tetel",
                         origin_source_id=src_pl[0] if src_pl else None, date="2026-11-19", status=st,
                         evidence=f"hiányleltár 2026-11-23: {sn[1]} — hátra: {sn[2]} ({sn[3]})" if sn else f"leltár: {g[1]}",
                         verify_hint="feladat.tasks [P-..] sor + PR/commit a kódra", rule="p-tetel")
            if pt:
                db.link(rid, pt["sid"], "kert")
            if sn:  # cím + állapot oszlop hivatkozása (a „hátra” oszlopé nem bizonyíték)
                blob = sn[0] + " " + sn[1]
                hits = [prs[int(n)] for n in re.findall(r"#(\d{3,4})", blob) if int(n) in prs]
                hits += [heads[b] for b in re.findall(r"`([\w./-]+)`", blob) if b in heads]
                for p in hits:
                    db.link(rid, p["sid"], pr_rel(p))
            if hl:
                db.link(rid, hl["sid"], "reszben" if st != "kesz" else "megvalositja")
        for key, text in dec.items():
            dst = "elvetve" if "ELVETVE" in text else "elvart"
            if dst == "elvetve" and key.startswith("P-"):
                r = c.execute("SELECT id FROM requirements WHERE code=?", (key,)).fetchone()
                if r:
                    db.set_auto(r[0], "elvetve")
            rid = db.req("DONTES:" + key.replace(" ", "-"), title=f"{key} tulajdonosi döntés", statement=text[:800], category="dontes",
                         origin_source_id=hl["sid"] if hl else None, date="2026-11-23", status=dst,
                         evidence="docs/specs/2026-11-23-teljes-hianyleltar.md 4/a", parent=key if key.startswith("P-") else None,
                         rule="p-dontes")
            if hl:
                db.link(rid, hl["sid"], "dontes")
        for ln in ftxt.splitlines():
            m = re.match(r"^\| (D[1-6]) \| ([^|]+)\| ([^|]+)\|", ln)
            if m:
                rid = db.req(f"FOTERV-{m.group(1)}", title=f"Főterv {m.group(1)} ({m.group(2).strip()}): {m.group(3).strip()[:120]}",
                             statement=m.group(3).strip(), category="dontes", origin_source_id=fo["sid"] if fo else None,
                             date="2026-11-23", status="elvart", verify_hint="tulajdonosi válasz (űrlap) + végrehajtás", rule="foterv")
                if fo:
                    db.link(rid, fo["sid"], "dontes")

    # --- C) kurált tulajdonosi elvárások
    db.family("kuralt")
    cur = json.loads((HERE / "kovetelmenyek.json").read_text(encoding="utf-8"))["items"]
    for it in cur:
        st, ev = it.get("status", "ismeretlen"), []
        if it.get("flag"):
            fl = it["flag"]
            info = flags.get(fl["name"], {"live": NEM_ELL, "state": "nem_ellenorzott"})
            ev.append(f"{fl['name']}={info['live']} ({info['state']}; elvárt: BE)")
            if info["state"] in ("ki", "reszleges") and st in ("kesz", "kapcsolo_ki"):
                st = "kapcsolo_ki"
            # nem_ellenorzott / nem_logikai: SOHA nem számít KI-nek → a kurált státusz marad
        nums = [n for n in it.get("prs", []) if n in prs]
        if any(prs[n]["state"] == "OPEN" for n in nums) and st in ("kesz", "ismeretlen", "elvart"):
            st = "felkesz"
        rid = db.req(it["code"], title=it["title"], statement=it["statement"], category=it.get("category", "kert"),
                     date=it.get("date"), status=st, superseded_by=it.get("superseded_by"),
                     evidence="; ".join(ev + [f"PR #{n} {prs[n]['state']}" for n in nums]),
                     verify_hint=it.get("verify_hint"), notes=it.get("notes"), parent=it.get("parent"),
                     rule=json.dumps({k: it[k] for k in ("flag", "grep", "old_grep", "prs", "kanban") if k in it}, ensure_ascii=False))
        for n in nums:
            db.link(rid, prs[n]["sid"], pr_rel(prs[n]))
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
            r = c.execute("SELECT id FROM requirements WHERE code=?", (old,)).fetchone()
            if r:
                db.set_auto(r[0], "felulirt")
        pats = [re.compile(p, re.I) for p in it.get("patterns", [])]
        if pats:
            for sid, raw in c.execute("SELECT id, raw_excerpt FROM sources WHERE kind='session'").fetchall():
                if any(p.search(raw or "") for p in pats):
                    db.link(rid, sid, "kert")
        cps = [re.compile(p, re.I) for p in it.get("commit_patterns", [])]
        if cps:
            for sid, subj, body, on_main in commits:
                if any(p.search(subj) for p in cps):
                    db.link(rid, sid, "megvalositja" if on_main else "reszben")
            for p in prs.values():
                if any(cp.search(p["title"]) for cp in cps):
                    db.link(rid, p["sid"], pr_rel(p))
        first = c.execute("""SELECT s.id FROM requirement_links l JOIN sources s ON s.id=l.source_id
                             WHERE l.requirement_id=? AND l.relation='kert' ORDER BY s.date, s.id LIMIT 1""", (rid,)).fetchone()
        if first:
            c.execute("UPDATE requirements SET origin_source_id=? WHERE id=?", (first[0], rid))

    # --- D) kódhivatkozások: P-0xx / U4x commitban, PR címében és a nyitott PR törzsében — a „kész” becslés ELŐTT
    db.family("kod")
    codes = {r[0]: r[1] for r in c.execute("SELECT code,id FROM requirements WHERE code GLOB 'P-0[0-9][0-9]' OR code GLOB 'U4?'")}
    for sid, subj, body, on_main in commits:
        for code in set(re.findall(r"\b(P-0\d\d|U4[a-e])\b", subj)):
            if code in codes:
                db.link(codes[code], sid, "megvalositja" if on_main else "reszben")
    for p in prs.values():
        for code in set(re.findall(r"\b(P-0\d\d|U4[a-e])\b", p["title"])):
            if code in codes:
                db.link(codes[code], p["sid"], pr_rel(p))
        if p["state"] == "OPEN":
            for code in set(re.findall(r"\b(P-0\d\d|U4[a-e])\b", p["body"][:4000])):
                if code in codes:
                    db.link(codes[code], p["sid"], "reszben")
    for code, rid in codes.items():
        if not code.startswith("P-"):
            continue
        linked = c.execute("""SELECT s.ref, json_extract(s.extra,'$.state') FROM requirement_links l JOIN sources s ON s.id=l.source_id
                              WHERE l.requirement_id=? AND s.kind='pr' AND s.ref NOT LIKE '%:szal:%'""", (rid,)).fetchall()
        merged = sorted({r[0] for r in linked if r[1] == "MERGED"})
        if not merged:
            continue
        has_open = any(r[1] == "OPEN" for r in linked)
        auto, evid = c.execute("SELECT auto_status, evidence FROM requirements WHERE id=?", (rid,)).fetchone()
        new = "kesz" if auto in ("elvart", "felkesz") and not has_open else auto
        add = "beolvadt: " + ", ".join(merged)
        evid = evid or ""
        if add not in evid:
            evid = (evid + "; " + add).strip("; ")
        db.set_auto(rid, new, evid)
    # döntés ← a P-tétel kész állapota; a jegyzet csak egyszer kerül az evidence-be
    for rid, parent, evid in c.execute("""SELECT d.id, d.parent, d.evidence FROM requirements d JOIN requirements p ON p.code=d.parent
                                          WHERE d.code GLOB 'DONTES:P-0[0-9][0-9]' AND p.status='kesz'""").fetchall():
        note = f"végrehajtva: {parent} kész"
        db.set_auto(rid, "kesz", evid if note in (evid or "") else f"{evid or ''} | {note}".strip(" |"))

    # --- E) nyitott PR-ok → félkész követelmény (minden nyitott PR, korától függetlenül; csak az aktuális szálak)
    db.family("openpr")
    for num, p in prs.items():
        if p["state"] != "OPEN":
            continue
        rid = db.req(f"PR#{num}", title=p["title"][:200], statement=f"Nyitott PR ({p.get('head')}) — beolvasztásra vagy lezárásra vár.",
                     category="pr", origin_source_id=p["sid"], date=p["date"], status="felkesz",
                     evidence=f"PR #{num} OPEN", verify_hint=f"gh pr view {num} --json state,mergeable,statusCheckRollup", rule="open-pr")
        db.link(rid, p["sid"], "reszben")
        for tsid, e in S["threads"].get(num, []):
            if e.get("unresolved"):
                db.link(rid, tsid, "reszben")

    # --- F) kanban- és SQL-feladatok
    db.family("task")
    known_kanban = {k for it in cur for k in it.get("kanban", [])}
    stmap = {"in_progress": "reszben", "blocked": "elvart", "open": "elvart", "ready": "elvart", "todo": "elvart",
             "triage": "elvart", "running": "reszben"}
    for sid, board, tid, title, status, date in S["tasks"]:
        pcodes = set(re.findall(r"\b(P-0\d\d)\b", title))
        for code in pcodes:
            if code in codes:
                db.link(codes[code], sid, "kert")
        if board == "regi" or status in ("done", "dropped", "archived") or pcodes or tid in known_kanban \
                or title.startswith("Záró hurok bukott"):
            continue
        code = f"FELADAT#{tid}" if board == "feladat" else f"KANBAN:{board}:{tid}"
        rid = db.req(code, title=title[:200], statement=title, category="feladat", origin_source_id=sid, date=date,
                     status=stmap.get(status, "ismeretlen"), evidence=f"{board} {status}", rule="task",
                     verify_hint="node D:/repo/Hermes-agent/scripts/feladat.mjs list --repo D:/repo/WEBSULI")
        db.link(rid, sid, "kert")
    settle_untouched(db)


def settle_untouched(db: Db):
    """Korábban felvett nyitott PR / feladat, ami most nem nyitott: csak VÉGLEGES forrásállapot (MERGED/CLOSED,
    done/dropped) módosít, az evidence-szel együtt; egyébként (nincs adat, még nyitott) a korábbi státusz marad."""
    c = db.c
    for rid, code, rule in c.execute("SELECT id, code, rule FROM requirements WHERE rule IN ('open-pr','task')").fetchall():
        if code in db.touched:
            continue
        if rule == "open-pr":
            num = code.split("#", 1)[1]
            r = c.execute("SELECT id, json_extract(extra,'$.state') FROM sources WHERE kind='pr' AND ref=?", ("#" + num,)).fetchone()
            st = {"MERGED": "kesz", "CLOSED": "elvetve"}.get(r[1] if r else "")
            if st:
                db.set_auto(rid, st, f"PR #{num} {r[1]}")
                db.origin = "openpr"
                db.link(rid, r[0], "megvalositja" if st == "kesz" else "kert")
        else:
            if code.startswith("FELADAT#"):
                ref = "feladat:" + code.split("#", 1)[1]
            else:
                _, board, tid = code.split(":", 2)
                ref = f"{board}:{tid}"
            r = c.execute("SELECT id, json_extract(extra,'$.status') FROM sources WHERE kind IN ('task','kanban') AND ref=?",
                          (ref,)).fetchone()
            st = {"done": "kesz", "dropped": "elvetve", "archived": "elvetve"}.get(r[1] if r else "")
            if st:
                db.set_auto(rid, st, f"{ref} {r[1]}")
                db.origin = "task"
                db.link(rid, r[0], "megvalositja" if st == "kesz" else "kert")


def rebuild_fts(db: Db):
    c = db.c
    c.execute("DELETE FROM requirements_fts")
    c.execute("INSERT INTO requirements_fts(rowid,code,title,statement,notes,evidence) "
              "SELECT id,code,title,statement,notes,COALESCE(evidence,'')||' '||COALESCE(manual_evidence,'') FROM requirements")
    c.execute("DELETE FROM sources_fts")
    c.execute("INSERT INTO sources_fts(rowid,kind,ref,title,raw_excerpt) SELECT id,kind,ref,title,raw_excerpt FROM sources")


TABLES = ("sources", "requirements", "requirement_links", "flags", "revisions", "findings")  # fix táblanév-lista


def counts(db: Db) -> dict:
    return {t: db.c.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in TABLES}


def main():
    global ARGS
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=os.environ.get("KOVETELMENY_DB", str(DEFAULT_DB)))
    ap.add_argument("--repo", default=os.environ.get("WEBSULI_REPO") or run(["git", "-C", str(HERE), "rev-parse", "--show-toplevel"]).strip())
    ap.add_argument("--napok", type=int, default=180)
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--no-gh", action="store_true")
    ap.add_argument("--fetch", action="store_true", help="git fetch origin előtte (hiba → leáll)")
    ap.add_argument("-q", action="store_true")
    ARGS = ap.parse_args()
    since = (dt.date.today() - dt.timedelta(days=ARGS.napok)).isoformat()
    if ARGS.fetch:
        try:
            run(["git", "-C", ARGS.repo, "fetch", "-q", "origin"])
        except RuntimeError as e:
            sys.exit(safe(f"git fetch sikertelen, a gyűjtés leáll: {e}"))
    db = Db(Path(ARGS.db))
    unavailable: list[str] = []
    ok: dict[str, bool] = {}
    log(f"Gyűjtés {since} óta → {ARGS.db}")
    collect_git(db, ARGS.repo, since, ok, unavailable)
    collect_prs(db, since, ok, unavailable, not ARGS.no_gh)
    collect_specs(db, ARGS.repo, since, ok, unavailable)
    collect_docs(db, ARGS.repo, ok, unavailable)
    collect_sessions(db, since, ok, unavailable)
    collect_kanban(db, ok, unavailable)
    flags = collect_flags(db, ARGS.repo, ok, unavailable, not ARGS.no_render)
    build_requirements(db, ARGS.repo, flags, unavailable)
    rebuild_fts(db)
    cnt = counts(db)
    unavailable = [safe(u) for u in unavailable]
    db.c.execute("INSERT OR REPLACE INTO meta VALUES('utolso_gyujtes',?)",
                 (json.dumps({"ido": dt.datetime.now().isoformat(timespec="seconds"), "since": since, "counts": cnt,
                              "sikeres": sorted(k for k, v in ok.items() if v), "nem_elerheto": unavailable}, ensure_ascii=False),))
    db.c.commit()
    secure_path(Path(ARGS.db))
    log("Sorszámok: " + json.dumps(cnt, ensure_ascii=False))
    if unavailable:
        log("Nem elérhető / kihagyva:\n  - " + "\n  - ".join(unavailable))


ARGS = None
if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

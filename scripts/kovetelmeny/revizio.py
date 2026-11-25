#!/usr/bin/env python3
"""WEBSULI követelmény-revízió: lekérdezések és automatikus elvárt ↔ valós összevetés a kovetelmenyek.db-n.

Parancsok:
  allapot                         státuszeloszlás kategóriánként
  lista [--status s1,s2] [--kategoria k] [--limit n] [--nyitott]
  tetel <code>                    egy követelmény + források + leletek
  kereses <fts-kifejezés>         FTS5 a követelményekben és a forrásokban
  felulirasok                     felülírási láncok (régi → új)
  ellenoriz [--napok 3] [--fetch] automatikus revízió → revisions + findings (idempotens: a nyitott leletet frissíti)
  lelet-add --code C --kind K --detail D --evidence E [--severity s] [--slice s]
  lelet-lista [--minden] [--kind k]
  lelet-zar <id> --evidence E [--status megoldva|elvetve]   nyitott (főleg kézi) lelet lezárása bizonyítékkal
  allit <code> <status> --evidence E   kézi státusz + kézi bizonyíték (manual_evidence; a gyűjtő nem írja felül)
Minden kézi bevitel maszkolva kerül a DB-be (maszk.py); az SQL mindenhol ?-paraméteres, a dinamikus rész csak '?'-lista.
Git-hiba vagy sikertelen --fetch esetén a revízió nem ír „tiszta” eredményt: leáll, illetve az érintett leletet megőrzi.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from maszk import mask, safe  # noqa: E402

LOCAL = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
DEFAULT_DB = LOCAL / "hermes" / "projekt-tudas" / "websuli" / "kovetelmenyek.db"
STATUSES = ("elvart", "kesz", "reszben", "felkesz", "elfelejtett", "kapcsolo_ki", "felulirt", "elvetve", "ismeretlen")
NOW = dt.datetime.now().isoformat(timespec="seconds")


def git(repo: str, *a: str) -> subprocess.CompletedProcess:
    """Fix argumentumlista, shell nélkül."""
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, encoding="utf-8", errors="replace")


def grep(repo: str, pattern: str, paths: list[str], files: bool = False) -> tuple[bool | None, str]:
    """(True, kimenet) találat; (False, '') szabályos nincs-találat (git grep rc=1); (None, hiba) minden más hiba."""
    r = git(repo, "grep", "-liE" if files else "-qiE", pattern, "origin/main", "--", *paths)
    if r.returncode == 0:
        return True, r.stdout.strip()
    if r.returncode == 1 and not r.stderr.strip():
        return False, ""
    return None, safe((r.stderr or r.stdout).strip()[:200])


def connect(path: str, migrate: bool = True) -> sqlite3.Connection:
    """`migrate=False`: sémamódosítás nélkül (review #601 — a `lelet-zar` sikertelen futása sem írhat)."""
    if not Path(path).exists():
        sys.exit("Nincs adatbázis — előbb: python scripts/kovetelmeny/gyujt.py")
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    if not migrate:
        return c
    for table, col in (("findings", "kulcs"), ("requirements", "manual_evidence"), ("flags", "state"), ("flags", "stale")):
        if col not in {r[1] for r in c.execute(f"PRAGMA table_info({table})")}:  # fix tábla-/oszlopnevek
            c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {'INTEGER NOT NULL DEFAULT 0' if col == 'stale' else 'TEXT'}")
    return c


# ---------------------------------------------------------------- lekérdezések
def cmd_allapot(c, a):
    rows = c.execute("SELECT category, status, count(*) n FROM requirements GROUP BY 1,2 ORDER BY 1,2").fetchall()
    tot = c.execute("SELECT status, count(*) FROM requirements GROUP BY 1 ORDER BY 2 DESC").fetchall()
    print("Összesen:", ", ".join(f"{s}={n}" for s, n in tot))
    cur = None
    for r in rows:
        if r["category"] != cur:
            cur = r["category"]
            print(f"\n{cur}:", end="")
        print(f" {r['status']}={r['n']}", end="")
    print()
    m = c.execute("SELECT value FROM meta WHERE key='utolso_gyujtes'").fetchone()
    if m:
        d = json.loads(m[0])
        print(f"\nUtolsó gyűjtés: {d['ido']}; nem elérhető: {d['nem_elerheto'] or '—'}")
    print("Nyitott leletek:", dict(c.execute("SELECT kind,count(*) FROM findings WHERE status='nyitott' GROUP BY 1").fetchall()))


def cmd_lista(c, a):
    q, p = "SELECT code,status,category,title,evidence,manual_evidence FROM requirements WHERE 1=1", []
    if a.status:
        st = a.status.split(",")
        q += f" AND status IN ({','.join('?' * len(st))})"  # csak '?'-helyőrzők; az értékek paraméterek
        p += st
    if a.kategoria:
        q += " AND category=?"
        p.append(a.kategoria)
    if a.nyitott:
        q += " AND status NOT IN ('kesz','felulirt','elvetve')"
    q += " ORDER BY date DESC, code LIMIT ?"
    p.append(a.limit)
    for r in c.execute(q, p):
        ev = r["manual_evidence"] or r["evidence"] or ""
        print(f"{r['code']} | {r['status']} | {r['category']} | {r['title'][:90]} | {ev[:120]}")


def cmd_tetel(c, a):
    r = c.execute("SELECT * FROM requirements WHERE code=?", (a.code,)).fetchone()
    if not r:
        sys.exit("nincs ilyen kód")
    for k in r.keys():
        if r[k] not in (None, ""):
            print(f"{k}: {r[k]}")
    print("\nForrások:")
    for s in c.execute("""SELECT l.relation, s.kind, s.ref, s.date, s.title FROM requirement_links l JOIN sources s ON s.id=l.source_id
                          WHERE l.requirement_id=? ORDER BY s.date DESC LIMIT ?""", (r["id"], a.limit)):
        print(f"  [{s['relation']}] {s['kind']} {s['ref'][:60]} {s['date']} — {(s['title'] or '')[:90]}")
    print("\nLeletek:")
    for f in c.execute("SELECT kind,status,severity,detail,proposed_slice FROM findings WHERE requirement_id=?", (r["id"],)):
        print(f"  {f['kind']} [{f['status']}/{f['severity']}] {f['detail'][:140]} → {f['proposed_slice']}")


def cmd_kereses(c, a):
    for r in c.execute("SELECT r.code,r.status,r.title FROM requirements_fts f JOIN requirements r ON r.id=f.rowid "
                       "WHERE requirements_fts MATCH ? LIMIT ?", (a.q, a.limit)):
        print(f"K {r['code']} | {r['status']} | {r['title'][:100]}")
    for r in c.execute("SELECT s.kind,s.ref,s.date,s.title FROM sources_fts f JOIN sources s ON s.id=f.rowid "
                       "WHERE sources_fts MATCH ? ORDER BY s.date DESC LIMIT ?", (a.q, a.limit)):
        print(f"F {r['kind']} {r['ref'][:50]} {r['date']} | {(r['title'] or '')[:100]}")


def chains(c):
    sup = {r["code"]: r["superseded_by"] for r in c.execute("SELECT code, superseded_by FROM requirements WHERE superseded_by IS NOT NULL")}
    out = []
    for h in [k for k in sup if k not in set(sup.values())]:
        ch, cur, seen = [h], h, {h}
        while cur in sup and sup[cur] not in seen:
            cur = sup[cur]
            ch.append(cur)
            seen.add(cur)
        out.append(ch)
    return out


def cmd_felulirasok(c, a):
    ch = chains(c)
    print(f"{len(ch)} felülírási lánc")
    for x in ch:
        last = c.execute("SELECT status FROM requirements WHERE code=?", (x[-1],)).fetchone()
        print("  " + " → ".join(x) + f"   (érvényes: {x[-1]} = {last[0] if last else 'NINCS ILYEN KÓD'})")


# ---------------------------------------------------------------- leletek
class Rev:
    def __init__(self, c):
        self.c = c
        c.execute("INSERT INTO revisions(started_at, summary) VALUES(?, 'fut')", (NOW,))
        self.id = c.execute("SELECT last_insert_rowid()").fetchone()[0]
        self.keys: set[str] = set()
        self.nem_mert: list[str] = []

    def add(self, rid, kind, detail, evidence, severity, slice_, kulcs=None):
        kulcs = kulcs or f"auto:{rid}:{kind}"
        self.keys.add(kulcs)
        detail, evidence, slice_ = mask(detail), mask(evidence), mask(slice_)
        row = self.c.execute("SELECT id FROM findings WHERE kulcs=? AND status='nyitott'", (kulcs,)).fetchone()
        if row:
            self.c.execute("UPDATE findings SET revision_id=?, detail=?, evidence=?, severity=?, proposed_slice=?, last_seen=? WHERE id=?",
                           (self.id, detail, evidence, severity, slice_, NOW, row[0]))
        else:
            self.c.execute("""INSERT INTO findings(revision_id,requirement_id,kind,detail,evidence,severity,proposed_slice,status,
                              first_seen,last_seen,kulcs) VALUES(?,?,?,?,?,?,?,'nyitott',?,?,?)""",
                           (self.id, rid, kind, detail, evidence, severity, slice_, NOW, NOW, kulcs))

    def keep(self, kulcs: str, why: str):
        """Nem mérhető ellenőrzés: a meglévő nyitott leletet megőrzi (nem zárja le), újat nem nyit."""
        self.keys.add(kulcs)
        self.nem_mert.append(why)


def links(c, rid, kinds=("commit", "pr"), rels=("megvalositja", "reszben")):
    return c.execute(f"""SELECT s.kind, s.ref, s.extra, l.relation FROM requirement_links l JOIN sources s ON s.id=l.source_id
                         WHERE l.requirement_id=? AND s.kind IN ({','.join('?' * len(kinds))})
                         AND l.relation IN ({','.join('?' * len(rels))})""", (rid, *kinds, *rels)).fetchall()


def cmd_ellenoriz(c, a):
    repo = a.repo
    if a.fetch:
        r = git(repo, "fetch", "-q", "origin")
        if r.returncode != 0:
            sys.exit(safe(f"git fetch sikertelen — a revízió nem fut elavult origin/main-en: {(r.stderr or '').strip()[:200]}"))
    if git(repo, "rev-parse", "--verify", "-q", "origin/main").returncode != 0:
        sys.exit("origin/main nem olvasható (hibás --repo?) — a revízió leáll, leletet nem ír és nem zár le")
    rev = Rev(c)
    flags = {r["name"]: r for r in c.execute("SELECT * FROM flags")}
    reqs = c.execute("SELECT * FROM requirements").fetchall()
    by_code = {r["code"]: r for r in reqs}
    cutoff = (dt.date.today() - dt.timedelta(days=a.napok)).isoformat()
    old_cut = (dt.date.today() - dt.timedelta(days=14)).isoformat()

    def rule_of(r):
        return json.loads(r["rule"]) if (r["rule"] or "").startswith("{") else {}

    for r in reqs:
        rule = rule_of(r)
        superseded = bool(r["superseded_by"])
        # 1) kapcsoló: kész kód, de az élő állapot a kapcsoló saját szabálya szerint KI / részleges
        fl = rule.get("flag")
        if fl and not superseded and r["status"] in ("kesz", "kapcsolo_ki"):
            f = flags.get(fl["name"])
            kul = f"auto:{r['id']}:kapcsolo_ki"
            if f is None or f["stale"] or f["state"] in (None, "nem_ellenorzott", "nem_logikai"):
                rev.keep(kul, f"{fl['name']}: élő állapot nem mért / nem logikai")
            elif f["state"] in ("ki", "reszleges"):
                rev.add(r["id"], "kapcsolo_ki", f"{fl['name']} élesben = {f['live_value']} ({f['state']}), elvárt: BE",
                        f"Render env {fl['name']}={f['live_value']} (mérve: {f['live_checked_at']}); {r['verify_hint'] or ''}", "magas",
                        f"élesítő szelet: {fl['name']} bekapcsolása a Renderen — csak tulajdonosi döntés után", kulcs=kul)
        # 2) félkész
        if r["status"] in ("reszben", "felkesz") and not superseded:
            lk = links(c, r["id"])
            open_prs = sorted({x["ref"] for x in lk if x["kind"] == "pr" and ":szal:" not in x["ref"]
                               and json.loads(x["extra"] or "{}").get("state") == "OPEN"})
            ev = "; ".join(filter(None, [r["manual_evidence"], r["evidence"], ("nyitott PR: " + ", ".join(open_prs)) if open_prs else None]))
            sev = "magas" if r["category"] in ("pr", "p-tetel", "email", "tananyag") else "kozepes"
            sl = (f"PR {', '.join(open_prs)} lezárása/beolvasztása (zöld CI + gate:merge)" if open_prs else
                  "hátralévő szelet: végrehajtási utasítás → bukó teszt → kód → kapulánc → PR")
            rev.add(r["id"], "felkesz", f"{r['code']} {r['status']}: {r['title'][:120]}", ev[:1500], sev, sl)
        # 3) elfelejtett
        if not superseded and r["category"] != "spec" and r["date"]:
            impl = links(c, r["id"])
            if r["status"] == "elvart" and r["date"] <= cutoff and not impl:
                rev.add(r["id"], "elfelejtett", f"{r['code']} {r['date']} óta elvárt, nincs commit/PR nyom: {r['title'][:120]}",
                        r["evidence"] or (r["verify_hint"] or ""), "magas" if r["category"] in ("p-tetel", "kert", "tananyag", "email") else "kozepes",
                        "spec (vagy meglévő spec szeletpontja) → végrehajtási utasítás → bukó teszt → kód")
            elif r["status"] == "ismeretlen" and r["date"] <= old_cut and not impl and r["category"] != "dontes":
                rev.add(r["id"], "elfelejtett", f"{r['code']} {r['date']}: nincs megvalósítási nyom, igazolandó — {r['title'][:110]}",
                        r["verify_hint"] or "", "alacsony", "igazolás grep/teszt/élő nézet alapján; ha hiányzik: szelet")
        # 4) kódjelenlét (grep a main-en): hiba ≠ nincs találat
        g = rule.get("grep")
        if g and r["status"] in ("kesz", "kapcsolo_ki") and not superseded:
            kul = f"auto:{r['id']}:regressziot"
            hit, msg = grep(repo, g["pattern"], g["path"].split())
            if hit is None:
                rev.keep(kul, f"{r['code']} grep: {msg}")
            elif hit is False:
                rev.add(r["id"], "regressziot", f"{r['code']}: kész, de a minta nincs a main-en: /{g['pattern']}/ ({g['path']})",
                        "git grep origin/main (rc=1)", "magas", "regresszió-vizsgálat: git log -S / bisect, majd visszaállító szelet", kulcs=kul)
        # 5) felülírt, de nem átvezetett
        og = rule.get("old_grep")
        if og:
            kul = f"auto:{r['id']}:felulirt_de_nem_atvezetve"
            hit, out = grep(repo, og["pattern"], og["path"].split(), files=True)
            if hit is None:
                rev.keep(kul, f"{r['code']} old_grep: {out}")
            elif hit:
                rev.add(r["id"], "felulirt_de_nem_atvezetve", f"{r['code']}: a felülírt minta még él: /{og['pattern']}/",
                        out[:600], "kozepes", "a régi utasítás törlése a felsorolt fájlokból (docs-PR)", kulcs=kul)
        if superseded:
            new = by_code.get(r["superseded_by"])
            if new is None:
                rev.add(r["id"], "felulirt_de_nem_atvezetve", f"{r['code']} → {r['superseded_by']}: az új követelmény nincs az adatbázisban",
                        "", "kozepes", "az új elvárás felvétele (kovetelmenyek.json)", kulcs=f"auto:{r['id']}:felulirt-uj")
            elif new["status"] != "kesz" and not new["superseded_by"]:
                rev.add(r["id"], "felulirt_de_nem_atvezetve",
                        f"{r['code']} felülírva ({r['superseded_by']} = {new['status']}): a régi működés él, az új még nincs átvezetve",
                        f"régi: {r['title'][:120]} | új: {new['title'][:160]}", "kozepes",
                        f"{r['superseded_by']} szeletei (a régi utasítást visszaállítani TILOS)", kulcs=f"auto:{r['id']}:felulirt-uj")
    # 6) élő env-változók: árva (kód nem olvassa) és követelmény nélküli KI-kapcsolók — elavult sort kihagy
    k077 = by_code.get("K-077")
    owned = {rule_of(r).get("flag", {}).get("name") for r in reqs} - {None}
    for name, f in flags.items():
        if not k077 or f["stale"]:
            continue
        st = f["state"]
        if st in (None, "nem_ellenorzott"):
            rev.keep(f"auto:flag-arva:{name}", f"{name}: nem mért")
            rev.keep(f"auto:flag-ki:{name}", f"{name}: nem mért")
            continue
        # nem logikai (pl. numerikus STUDIO_BANK_CONCURRENCY) soha nem árva és nem KI: csak be/ki állapot vizsgálható
        if f["code_default"] in ("nem található a kódban", "kódkeresés sikertelen") and st in ("be", "ki"):
            kul = f"auto:flag-arva:{name}"
            hit, msg = grep(repo, rf"\b{name}\b", ["source", "scripts"])  # a kódbeli használat friss ellenőrzése
            if hit is None:
                rev.keep(kul, f"{name} árva-ellenőrzés: {msg}")
            elif hit is False:
                rev.add(k077["id"], "felulirt_de_nem_atvezetve", f"{name}: élő Render-változó, de a kód nem olvassa (elavult beállítás?)",
                        f"live={f['live_value']}; git grep -w {name} origin/main -- source scripts: nincs találat", "alacsony",
                        "tulajdonosi döntéssel törlés a Renderről", kulcs=kul)
        elif st == "ki" and name not in owned and str(f["code_default"]).startswith("KI"):
            rev.add(k077["id"], "kapcsolo_ki", f"{name}: a kódban kész ág, élesben {f['live_value']} (KI) — nincs rögzített tulajdonosi döntés",
                    f"kód: {f['code_ref']}; mérve: {f['live_checked_at']}", "alacsony",
                    "élesítési döntés űrlapon (javaslattal), majd élesítő szelet", kulcs=f"auto:flag-ki:{name}")
    # 7) munkafa-higiénia
    k071 = by_code.get("K-071")
    if k071:
        w = git(repo, "worktree", "list", "--porcelain")
        if w.returncode != 0:
            rev.keep("auto:worktree", "worktree list hiba")
        elif w.stdout.count("worktree ") > 10:
            rev.add(k071["id"], "felkesz", f"{w.stdout.count('worktree ')} munkafa a repóban (beolvadtak is) — a higiénia elmaradt",
                    "git worktree list", "alacsony", "zaro-hurok hygiene (száraz) → --apply; beolvadt PR-ágak törlése", kulcs="auto:worktree")
    # lezárás: csak a sikeresen mért, most nem reprodukált automatikus lelet szűnik meg
    for f in c.execute("SELECT id,kulcs FROM findings WHERE status='nyitott' AND kulcs LIKE 'auto:%'").fetchall():
        if f["kulcs"] not in rev.keys:
            c.execute("UPDATE findings SET status='megszunt', last_seen=? WHERE id=?", (NOW, f["id"]))
    c.execute("UPDATE requirements SET last_checked=?", (NOW,))
    summ = dict(c.execute("SELECT kind,count(*) FROM findings WHERE status='nyitott' GROUP BY 1").fetchall())
    summ["nem_mert"] = len(rev.nem_mert)
    c.execute("UPDATE revisions SET finished_at=?, summary=? WHERE id=?",
              (dt.datetime.now().isoformat(timespec="seconds"), json.dumps(summ, ensure_ascii=False), rev.id))
    c.commit()
    print(f"Revízió #{rev.id}: nyitott leletek {summ}")
    if rev.nem_mert:
        print("Nem mérhető ellenőrzések (a korábbi lelet megmaradt):\n  - " + "\n  - ".join(safe(x) for x in rev.nem_mert[:20]))


def cmd_lelet_add(c, a):
    r = c.execute("SELECT id FROM requirements WHERE code=?", (a.code,)).fetchone()
    if not r:
        sys.exit("nincs ilyen kód")
    rev = c.execute("SELECT max(id) FROM revisions").fetchone()[0]
    c.execute("""INSERT INTO findings(revision_id,requirement_id,kind,detail,evidence,severity,proposed_slice,status,first_seen,last_seen,kulcs)
                 VALUES(?,?,?,?,?,?,?,'nyitott',?,?,?)""",
              (rev, r[0], a.kind, mask(a.detail), mask(a.evidence), a.severity, mask(a.slice), NOW, NOW, f"kezi:{a.code}:{a.kind}:{NOW}"))
    c.commit()
    print("rögzítve (maszkolva)")


def cmd_lelet_zar(c, a):
    """Nyitott lelet lezárása; a bizonyíték maszkolva a meglévő mögé fűződik. Zárt / nem létező lelet → kilépési kód 1.
    Review #601: üres / csak szóközös bizonyíték írás nélkül elutasítva."""
    if not a.evidence.strip():
        sys.exit("a --evidence nem lehet üres (commit, PR, fájl:sor vagy mérés)")
    n = c.execute("UPDATE findings SET status=?, evidence=coalesce(evidence,'') || ?, last_seen=? WHERE id=? AND status='nyitott'",
                  (a.status, f" | lezárva: {mask(a.evidence)}", NOW, a.id)).rowcount
    c.commit()
    if not n:
        sys.exit("nincs ilyen nyitott lelet")
    print(f"#{a.id} → {a.status} (maszkolva)")


def cmd_lelet_lista(c, a):
    q = """SELECT f.id,f.kind,f.severity,f.status,r.code,f.detail,f.proposed_slice FROM findings f JOIN requirements r ON r.id=f.requirement_id
           WHERE 1=1""" + ("" if a.minden else " AND f.status='nyitott'") + (" AND f.kind=?" if a.kind else "") + \
        " ORDER BY CASE f.severity WHEN 'magas' THEN 0 WHEN 'kozepes' THEN 1 ELSE 2 END, f.kind, r.code LIMIT ?"
    for f in c.execute(q, ([a.kind] if a.kind else []) + [a.limit]):
        print(f"#{f['id']} {f['kind']} [{f['severity']}] {f['code']}: {f['detail'][:130]} → {(f['proposed_slice'] or '')[:80]}")


def cmd_allit(c, a):
    if a.status not in STATUSES:
        sys.exit(f"status: {STATUSES}")
    note = mask(f"[{NOW[:10]} revízió] {a.evidence}")
    n = c.execute("""UPDATE requirements SET status=?, status_source='revizio', last_checked=?,
                     manual_evidence=CASE WHEN manual_evidence IS NULL OR manual_evidence='' THEN ? ELSE manual_evidence||'; '||? END
                     WHERE code=?""", (a.status, NOW, note, note, a.code)).rowcount
    c.commit()
    print("frissítve (maszkolva)" if n else "nincs ilyen kód")


def main():
    ap = argparse.ArgumentParser(description="WEBSULI követelmény-revízió")
    ap.add_argument("--db", default=os.environ.get("KOVETELMENY_DB", str(DEFAULT_DB)))
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("allapot")
    p = sp.add_parser("lista")
    p.add_argument("--status")
    p.add_argument("--kategoria")
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--nyitott", action="store_true")
    p = sp.add_parser("tetel")
    p.add_argument("code")
    p.add_argument("--limit", type=int, default=25)
    p = sp.add_parser("kereses")
    p.add_argument("q")
    p.add_argument("--limit", type=int, default=20)
    sp.add_parser("felulirasok")
    p = sp.add_parser("ellenoriz")
    p.add_argument("--napok", type=int, default=3)
    p.add_argument("--fetch", action="store_true")
    p.add_argument("--repo", default=os.environ.get("WEBSULI_REPO") or
                   subprocess.run(["git", "-C", str(HERE), "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip())
    p = sp.add_parser("lelet-add")
    p.add_argument("--code", required=True)
    p.add_argument("--kind", required=True,
                   choices=["hianyzo", "felkesz", "elfelejtett", "kapcsolo_ki", "regressziot", "felulirt_de_nem_atvezetve"])
    p.add_argument("--detail", required=True)
    p.add_argument("--evidence", required=True)
    p.add_argument("--severity", default="kozepes")
    p.add_argument("--slice", default="")
    p = sp.add_parser("lelet-lista")
    p.add_argument("--minden", action="store_true")
    p.add_argument("--kind")
    p.add_argument("--limit", type=int, default=60)
    p = sp.add_parser("lelet-zar")
    p.add_argument("id", type=int)
    p.add_argument("--evidence", required=True)
    p.add_argument("--status", default="megoldva", choices=["megoldva", "elvetve"])
    p = sp.add_parser("allit")
    p.add_argument("code")
    p.add_argument("status")
    p.add_argument("--evidence", required=True)
    a = ap.parse_args()
    c = connect(a.db, migrate=a.cmd != "lelet-zar")
    {"allapot": cmd_allapot, "lista": cmd_lista, "tetel": cmd_tetel, "kereses": cmd_kereses, "felulirasok": cmd_felulirasok,
     "ellenoriz": cmd_ellenoriz, "lelet-add": cmd_lelet_add, "lelet-lista": cmd_lelet_lista, "lelet-zar": cmd_lelet_zar,
     "allit": cmd_allit}[a.cmd](c, a)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

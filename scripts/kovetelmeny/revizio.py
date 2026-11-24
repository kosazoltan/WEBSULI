#!/usr/bin/env python3
"""WEBSULI követelmény-revízió: lekérdezések és automatikus elvárt ↔ valós összevetés a kovetelmenyek.db-n.

Parancsok:
  allapot                         státuszeloszlás kategóriánként
  lista [--status s1,s2] [--kategoria k] [--limit n] [--nyitott]
  tetel <code>                    egy követelmény + források + leletek
  kereses <fts-kifejezés>         FTS5 a követelményekben és a forrásokban
  felulirasok                     felülírási láncok (régi → új)
  ellenoriz [--napok 3]           automatikus revízió → revisions + findings (idempotens: a meglévő nyitott leletet frissíti)
  lelet-add --code C --kind K --detail D --evidence E [--severity s] [--slice s]
  lelet-lista [--minden] [--kind k]
  allit <code> <status> --evidence E   kézi státusz (revízió után; a gyűjtő ezt nem írja felül)
Titkot és valódi címet nem ír ki (a DB már maszkolt).
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
LOCAL = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
DEFAULT_DB = LOCAL / "hermes" / "projekt-tudas" / "websuli" / "kovetelmenyek.db"
STATUSES = ("elvart", "kesz", "reszben", "felkesz", "elfelejtett", "kapcsolo_ki", "felulirt", "elvetve", "ismeretlen")
NOW = dt.datetime.now().isoformat(timespec="seconds")


def git(repo: str, *a: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, encoding="utf-8", errors="replace")


def connect(path: str) -> sqlite3.Connection:
    if not Path(path).exists():
        sys.exit(f"Nincs adatbázis: {path} — előbb: python scripts/kovetelmeny/gyujt.py")
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    cols = {r[1] for r in c.execute("PRAGMA table_info(findings)")}
    if "kulcs" not in cols:
        c.execute("ALTER TABLE findings ADD COLUMN kulcs TEXT")
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
    q, p = "SELECT code,status,category,title,evidence FROM requirements WHERE 1=1", []
    if a.status:
        st = a.status.split(",")
        q += f" AND status IN ({','.join('?' * len(st))})"
        p += st
    if a.kategoria:
        q += " AND category=?"
        p.append(a.kategoria)
    if a.nyitott:
        q += " AND status NOT IN ('kesz','felulirt','elvetve')"
    q += " ORDER BY date DESC, code LIMIT ?"
    p.append(a.limit)
    for r in c.execute(q, p):
        print(f"{r['code']} | {r['status']} | {r['category']} | {r['title'][:90]} | {(r['evidence'] or '')[:120]}")


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
    heads = [k for k in sup if k not in set(sup.values())]
    out = []
    for h in heads:
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

    def add(self, rid, kind, detail, evidence, severity, slice_, kulcs=None):
        kulcs = kulcs or f"auto:{rid}:{kind}"
        self.keys.add(kulcs)
        row = self.c.execute("SELECT id FROM findings WHERE kulcs=? AND status='nyitott'", (kulcs,)).fetchone()
        if row:
            self.c.execute("UPDATE findings SET revision_id=?, detail=?, evidence=?, severity=?, proposed_slice=?, last_seen=? WHERE id=?",
                           (self.id, detail, evidence, severity, slice_, NOW, row[0]))
        else:
            self.c.execute("""INSERT INTO findings(revision_id,requirement_id,kind,detail,evidence,severity,proposed_slice,status,
                              first_seen,last_seen,kulcs) VALUES(?,?,?,?,?,?,?,'nyitott',?,?,?)""",
                           (self.id, rid, kind, detail, evidence, severity, slice_, NOW, NOW, kulcs))


def links(c, rid, kinds=("commit", "pr"), rels=("megvalositja", "reszben")):
    return c.execute(f"""SELECT s.kind, s.ref, s.extra, l.relation FROM requirement_links l JOIN sources s ON s.id=l.source_id
                         WHERE l.requirement_id=? AND s.kind IN ({','.join('?' * len(kinds))})
                         AND l.relation IN ({','.join('?' * len(rels))})""", (rid, *kinds, *rels)).fetchall()


def cmd_ellenoriz(c, a):
    repo = a.repo
    git(repo, "fetch", "-q", "origin") if a.fetch else None
    rev = Rev(c)
    flags = {r["name"]: r for r in c.execute("SELECT * FROM flags")}
    reqs = c.execute("SELECT * FROM requirements").fetchall()
    by_code = {r["code"]: r for r in reqs}
    cutoff = (dt.date.today() - dt.timedelta(days=a.napok)).isoformat()
    old_cut = (dt.date.today() - dt.timedelta(days=14)).isoformat()
    for r in reqs:
        rule = json.loads(r["rule"]) if (r["rule"] or "").startswith("{") else {}
        superseded = bool(r["superseded_by"])
        # 1) kapcsoló: kész kód, de az élő érték nem az elvárt
        fl = rule.get("flag")
        if fl and not superseded:
            lv = (flags.get(fl["name"]) or {"live_value": "hiányzik"})["live_value"]
            if lv != fl["expect"] and r["status"] in ("kesz", "kapcsolo_ki"):
                rev.add(r["id"], "kapcsolo_ki", f"{fl['name']} élesben = {lv}, elvárt: {fl['expect']}",
                        f"Render env {fl['name']}={lv}; {r['verify_hint'] or ''}", "magas",
                        f"élesítő szelet: {fl['name']}={fl['expect']} a Renderen — csak tulajdonosi döntés után")
        # 2) félkész
        if r["status"] in ("reszben", "felkesz") and not superseded:
            lk = links(c, r["id"])
            open_prs = sorted({x["ref"] for x in lk if x["kind"] == "pr" and json.loads(x["extra"] or "{}").get("state") == "OPEN"
                               and ":szal:" not in x["ref"]})
            ev = "; ".join(filter(None, [r["evidence"], ("nyitott PR: " + ", ".join(open_prs)) if open_prs else None]))
            sev = "magas" if r["category"] in ("pr", "p-tetel", "email", "tananyag") else "kozepes"
            sl = (f"PR {', '.join(open_prs)} lezárása/beolvasztása (zöld CI + gate:merge)" if open_prs else
                  "hátralévő szelet: végrehajtási utasítás → bukó teszt → kód → kapulánc → PR")
            rev.add(r["id"], "felkesz", f"{r['code']} {r['status']}: {r['title'][:120]}", ev[:1500], sev, sl)
        # 3) elfelejtett: elvárt, régóta nincs megvalósítási nyom
        if not superseded and r["category"] not in ("spec",) and r["date"]:
            impl = links(c, r["id"])
            if r["status"] == "elvart" and r["date"] <= cutoff and not impl:
                rev.add(r["id"], "elfelejtett", f"{r['code']} {r['date']} óta elvárt, nincs commit/PR nyom: {r['title'][:120]}",
                        r["evidence"] or (r["verify_hint"] or ""), "magas" if r["category"] in ("p-tetel", "kert", "tananyag", "email") else "kozepes",
                        "spec (vagy meglévő spec szeletpontja) → végrehajtási utasítás → bukó teszt → kód")
            elif r["status"] == "ismeretlen" and r["date"] <= old_cut and not impl and r["rule"] not in ("spec-dontes",) \
                    and r["category"] not in ("dontes",):
                rev.add(r["id"], "elfelejtett", f"{r['code']} {r['date']}: nincs megvalósítási nyom, igazolandó — {r['title'][:110]}",
                        r["verify_hint"] or "", "alacsony", "igazolás grep/teszt/élő nézet alapján; ha hiányzik: szelet")
        # 4) kódjelenlét (grep a main-en)
        g = rule.get("grep")
        if g and r["status"] in ("kesz", "kapcsolo_ki") and not superseded:
            res = git(repo, "grep", "-qiE", g["pattern"], "origin/main", "--", *g["path"].split())
            if res.returncode == 1:
                rev.add(r["id"], "regressziot", f"{r['code']}: kész, de a minta nincs a main-en: /{g['pattern']}/ ({g['path']})",
                        "git grep origin/main", "magas", "regresszió-vizsgálat: git log -S / bisect, majd visszaállító szelet")
        # 5) felülírt, de nem átvezetett
        og = rule.get("old_grep")
        if og:
            res = git(repo, "grep", "-liE", og["pattern"], "origin/main", "--", *og["path"].split())
            if res.returncode == 0 and res.stdout.strip():
                rev.add(r["id"], "felulirt_de_nem_atvezetve", f"{r['code']}: a felülírt minta még él: /{og['pattern']}/",
                        res.stdout.strip()[:600], "kozepes", "a régi utasítás törlése a felsorolt fájlokból (docs-PR)")
        if superseded:
            new = by_code.get(r["superseded_by"])
            if new is None:
                rev.add(r["id"], "felulirt_de_nem_atvezetve", f"{r['code']} → {r['superseded_by']}: az új követelmény nincs az adatbázisban",
                        "", "kozepes", "az új elvárás felvétele (kovetelmenyek.json)")
            elif new["status"] not in ("kesz",) and not new["superseded_by"]:
                rev.add(r["id"], "felulirt_de_nem_atvezetve",
                        f"{r['code']} felülírva ({r['superseded_by']} = {new['status']}): a régi működés él, az új még nincs átvezetve",
                        f"régi: {r['title'][:120]} | új: {new['title'][:160]}", "kozepes",
                        f"{r['superseded_by']} szeletei (a régi utasítást visszaállítani TILOS)")
    # 6) élő env-változók, amelyeket a kód már nem olvas; parkoló KI-kapcsolók a K-077 alatt
    k077 = by_code.get("K-077")
    for name, f in flags.items():
        if f["code_default"] == "nem található a kódban" and k077:
            rev.add(k077["id"], "felulirt_de_nem_atvezetve", f"{name}: élő Render-változó, de a kód nem olvassa (elavult beállítás?)",
                    f"live={f['live_value']}", "alacsony", "tulajdonosi döntéssel törlés a Renderről", kulcs=f"auto:flag-arva:{name}")
        elif f["code_default"].startswith("KI") and f["live_value"] in ("hiányzik", "off", "0") and k077:
            owner = [r["code"] for r in reqs if (json.loads(r["rule"]) if (r["rule"] or "").startswith("{") else {}).get("flag", {}).get("name") == name]
            if owner:  # követelményhez kötött kapcsolót az 1) pont kezeli (csak kész kódnál lelet)
                continue
            rev.add(k077["id"], "kapcsolo_ki", f"{name}: a kódban kész ág, élesben {f['live_value']} (KI)" +
                    (f" — kötött követelmény: {', '.join(owner)}" if owner else " — nincs rögzített tulajdonosi döntés"),
                    f"kód: {f['code_ref']}", "kozepes" if owner else "alacsony",
                    "élesítési döntés űrlapon (javaslattal), majd élesítő szelet", kulcs=f"auto:flag-ki:{name}")
    # 7) munkafa-higiénia
    k071 = by_code.get("K-071")
    wt = git(repo, "worktree", "list", "--porcelain").stdout.count("worktree ")
    if k071 and wt > 10:
        rev.add(k071["id"], "felkesz", f"{wt} munkafa a repóban (beolvadtak is) — a higiénia elmaradt",
                "git worktree list", "alacsony", "zaro-hurok hygiene (száraz) → --apply; beolvadt PR-ágak törlése", kulcs="auto:worktree")
    # lezárás: a most nem reprodukált automatikus leletek megszűnnek
    for f in c.execute("SELECT id,kulcs FROM findings WHERE status='nyitott' AND kulcs LIKE 'auto:%'").fetchall():
        if f["kulcs"] not in rev.keys:
            c.execute("UPDATE findings SET status='megszunt', last_seen=? WHERE id=?", (NOW, f["id"]))
    c.execute("UPDATE requirements SET last_checked=?", (NOW,))
    summ = dict(c.execute("SELECT kind,count(*) FROM findings WHERE status='nyitott' GROUP BY 1").fetchall())
    c.execute("UPDATE revisions SET finished_at=?, summary=? WHERE id=?",
              (dt.datetime.now().isoformat(timespec="seconds"), json.dumps(summ, ensure_ascii=False), rev.id))
    c.commit()
    print(f"Revízió #{rev.id}: nyitott leletek {summ}")


def cmd_lelet_add(c, a):
    r = c.execute("SELECT id FROM requirements WHERE code=?", (a.code,)).fetchone()
    if not r:
        sys.exit("nincs ilyen kód")
    rev = c.execute("SELECT max(id) FROM revisions").fetchone()[0]
    c.execute("""INSERT INTO findings(revision_id,requirement_id,kind,detail,evidence,severity,proposed_slice,status,first_seen,last_seen,kulcs)
                 VALUES(?,?,?,?,?,?,?,'nyitott',?,?,?)""",
              (rev, r[0], a.kind, a.detail, a.evidence, a.severity, a.slice, NOW, NOW, f"kezi:{a.code}:{a.kind}:{NOW}"))
    c.commit()
    print("rögzítve")


def cmd_lelet_lista(c, a):
    q = """SELECT f.id,f.kind,f.severity,f.status,r.code,f.detail,f.proposed_slice FROM findings f JOIN requirements r ON r.id=f.requirement_id
           WHERE 1=1""" + ("" if a.minden else " AND f.status='nyitott'") + (" AND f.kind=?" if a.kind else "") + \
        " ORDER BY CASE f.severity WHEN 'magas' THEN 0 WHEN 'kozepes' THEN 1 ELSE 2 END, f.kind, r.code LIMIT ?"
    for f in c.execute(q, ([a.kind] if a.kind else []) + [a.limit]):
        print(f"#{f['id']} {f['kind']} [{f['severity']}] {f['code']}: {f['detail'][:130]} → {f['proposed_slice'][:80]}")


def cmd_allit(c, a):
    if a.status not in STATUSES:
        sys.exit(f"status: {STATUSES}")
    n = c.execute("UPDATE requirements SET status=?, status_source='revizio', last_checked=?, evidence=COALESCE(evidence||'; ','')||? WHERE code=?",
                  (a.status, NOW, f"[{NOW[:10]} revízió] {a.evidence}", a.code)).rowcount
    c.commit()
    print("frissítve" if n else "nincs ilyen kód")


def main():
    ap = argparse.ArgumentParser(description="WEBSULI követelmény-revízió")
    ap.add_argument("--db", default=os.environ.get("KOVETELMENY_DB", str(DEFAULT_DB)))
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("allapot")
    p = sp.add_parser("lista"); p.add_argument("--status"); p.add_argument("--kategoria"); p.add_argument("--limit", type=int, default=50); p.add_argument("--nyitott", action="store_true")
    p = sp.add_parser("tetel"); p.add_argument("code"); p.add_argument("--limit", type=int, default=25)
    p = sp.add_parser("kereses"); p.add_argument("q"); p.add_argument("--limit", type=int, default=20)
    sp.add_parser("felulirasok")
    p = sp.add_parser("ellenoriz"); p.add_argument("--napok", type=int, default=3); p.add_argument("--fetch", action="store_true")
    p.add_argument("--repo", default=os.environ.get("WEBSULI_REPO") or
                   subprocess.run(["git", "-C", str(HERE), "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip())
    p = sp.add_parser("lelet-add"); p.add_argument("--code", required=True); p.add_argument("--kind", required=True,
        choices=["hianyzo", "felkesz", "elfelejtett", "kapcsolo_ki", "regressziot", "felulirt_de_nem_atvezetve"])
    p.add_argument("--detail", required=True); p.add_argument("--evidence", required=True); p.add_argument("--severity", default="kozepes"); p.add_argument("--slice", default="")
    p = sp.add_parser("lelet-lista"); p.add_argument("--minden", action="store_true"); p.add_argument("--kind"); p.add_argument("--limit", type=int, default=60)
    p = sp.add_parser("allit"); p.add_argument("code"); p.add_argument("status"); p.add_argument("--evidence", required=True)
    a = ap.parse_args()
    c = connect(a.db)
    {"allapot": cmd_allapot, "lista": cmd_lista, "tetel": cmd_tetel, "kereses": cmd_kereses, "felulirasok": cmd_felulirasok,
     "ellenoriz": cmd_ellenoriz, "lelet-add": cmd_lelet_add, "lelet-lista": cmd_lelet_lista, "allit": cmd_allit}[a.cmd](c, a)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

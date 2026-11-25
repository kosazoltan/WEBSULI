"""K-FELADATDB — a feladat-nyilvántartás (feladat.py) tesztjei ideiglenes adatbázison és ideiglenes git-repón.

Futtatás (a repó gyökeréből, bytecode nélkül, hogy a munkafa tiszta maradjon):
    python -B -m unittest discover -s scripts/kovetelmeny -p "test_*.py"
Minden adat fiktív (nyilvános repó): név, valódi e-mail-cím, titok nem szerepelhet.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import feladat as F  # noqa: E402
from gyujt import SCHEMA as KOV_SCHEMA  # noqa: E402

REGI_TABLAK = ("sources", "requirements", "requirement_links", "flags", "revisions", "findings", "meta")


def git(repo, *a):
    env = {**os.environ, "GIT_AUTHOR_NAME": "Teszt", "GIT_AUTHOR_EMAIL": "teszt@example.invalid",
           "GIT_COMMITTER_NAME": "Teszt", "GIT_COMMITTER_EMAIL": "teszt@example.invalid"}
    r = subprocess.run(["git", "-C", str(repo), *a], capture_output=True, text=True, encoding="utf-8", env=env)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout


class Alap(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="feladat-teszt-"))
        self.db = self.dir / "kov.db"
        k = sqlite3.connect(self.db)
        k.executescript(KOV_SCHEMA)
        k.execute("INSERT INTO meta(key,value) VALUES('utolso_gyujtes','{}')")
        k.execute("INSERT INTO flags(name,live_value,state) VALUES('PROBA_KAPCSOLO','off','ki')")
        k.executemany("INSERT INTO requirements(code,title,category,status,superseded_by) VALUES(?,?,?,?,?)", [
            ("K-900", "Nyitott elvárás", "feladat", "elvart", None),
            ("K-901", "Félkész tétel", "tananyag", "felkesz", None),
            ("K-902", "Elfelejtett tétel", "tananyag", "elfelejtett", None),
            ("K-903", "Kész tétel", "tananyag", "kesz", None),
            ("K-904", "Felülírt tétel", "tananyag", "elvart", "K-900"),
        ])
        k.commit()
        k.close()
        self.c = F.connect(str(self.db))

    def tearDown(self):
        self.c.close()
        shutil.rmtree(self.dir, ignore_errors=True)

    def cli(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = F.main(["--db", str(self.db), *args])
        return rc, out.getvalue()


class Migracio(Alap):
    def test_idempotens_es_a_regi_tablak_sorszama_valtozatlan(self):
        def szamok():
            return {t: self.c.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in REGI_TABLAK}
        elotte = szamok()
        for _ in range(3):
            F.migrate(self.c)
        self.assertEqual(szamok(), elotte)
        nevek = {r[0] for r in self.c.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view')")}
        for t in ("tasks", "task_units", "task_criteria", "task_links", "task_events", "flag_decisions", "feladat_meta",
                  "tasks_fts", "v_sajat_keszultseg", "v_keszultseg", "v_nyitott", "v_kapcsolo_dontesek"):
            self.assertIn(t, nevek)
        self.assertEqual(self.c.execute("SELECT value FROM feladat_meta WHERE key='sema_verzio'").fetchone()[0],
                         str(F.SEMA_VERZIO))

    def test_a_keszultseg_nem_tarolt_oszlop(self):
        cols = {r[1] for r in self.c.execute("PRAGMA table_info(tasks)")}
        self.assertNotIn("progress_pct", cols)
        self.assertNotIn("pct", cols)


class Allapotgep(Alap):
    def test_ervenyes_es_ervenytelen_atmenetek(self):
        self.assertTrue(F.can_transition("beadva", "tervezve"))
        self.assertTrue(F.can_transition("tervezve", "beolvadt"))  # előre ugrás
        self.assertTrue(F.can_transition("review", "folyamatban"))  # változtatást kértek
        self.assertTrue(F.can_transition("folyamatban", "blokkolt"))
        self.assertTrue(F.can_transition("blokkolt", "review"))
        self.assertFalse(F.can_transition("beolvadt", "tervezve"))
        self.assertFalse(F.can_transition("kesz", "folyamatban"))
        self.assertFalse(F.can_transition("elvetve", "folyamatban"))
        self.assertFalse(F.can_transition("review", "beadva"))
        self.assertFalse(F.can_transition("folyamatban", "nincs_ilyen"))

    def test_set_status_tilt_es_naploz(self):
        F.new_task(self.c, "T-1", "Próba")
        F.set_status(self.c, "T-1", "folyamatban", actor="teszt")
        with self.assertRaises(F.AllapotHiba):
            F.set_status(self.c, "T-1", "beadva", actor="teszt")
        self.assertEqual(F.get_task(self.c, "T-1")["status"], "folyamatban")
        ev = [r["kind"] for r in self.c.execute("SELECT kind FROM task_events e JOIN tasks t ON t.id=e.task_id WHERE t.code='T-1'")]
        self.assertIn("allapot", ev)

    def test_kesz_csak_teljesult_feltetelekkel(self):
        F.new_task(self.c, "T-2", "Feltételes")
        F.add_criterion(self.c, "T-2", "A teszt zöld")
        F.set_status(self.c, "T-2", "beolvadt", actor="teszt")
        with self.assertRaises(F.AllapotHiba):
            F.set_status(self.c, "T-2", "kesz", actor="teszt")
        F.set_criterion(self.c, "T-2", 1, True, evidence="teszt: zöld")
        F.set_status(self.c, "T-2", "kesz", actor="teszt")
        self.assertEqual(F.get_task(self.c, "T-2")["status"], "kesz")

    def test_lezart_ujranyitasa_csak_force_indokkal(self):
        F.new_task(self.c, "T-3", "Lezárt")
        F.set_status(self.c, "T-3", "kesz", actor="teszt")
        with self.assertRaises(F.AllapotHiba):
            F.set_status(self.c, "T-3", "folyamatban", actor="teszt")
        with self.assertRaises(F.AllapotHiba):
            F.set_status(self.c, "T-3", "folyamatban", actor="teszt", force=True)  # indok nélkül
        F.set_status(self.c, "T-3", "folyamatban", actor="teszt", force=True, reason="regresszió")
        self.assertEqual(F.get_task(self.c, "T-3")["status"], "folyamatban")


class Keszultseg(Alap):
    def test_egysegek_es_feltetelek_alapjan(self):
        F.new_task(self.c, "T-4", "Mért")
        for i in range(3):
            F.add_unit(self.c, "T-4", f"egység {i + 1}")
        F.add_criterion(self.c, "T-4", "feltétel")
        self.assertEqual(F.progress(self.c, "T-4"), {"pct": 0, "alap": "meres", "egyseg": "0/3", "feltetel": "0/1"})
        F.set_unit(self.c, "T-4", 1, True)
        F.set_unit(self.c, "T-4", 2, True)
        F.set_criterion(self.c, "T-4", 1, True, evidence="mérés")
        self.assertEqual(F.progress(self.c, "T-4")["pct"], 75)

    def test_allapot_alapu_tartalek(self):
        F.new_task(self.c, "T-5", "Egység nélkül")
        self.assertEqual(F.progress(self.c, "T-5"), {"pct": 0, "alap": "allapot", "egyseg": "0/0", "feltetel": "0/0"})
        F.set_status(self.c, "T-5", "review", actor="teszt")
        self.assertEqual(F.progress(self.c, "T-5")["pct"], 70)
        F.set_status(self.c, "T-5", "beolvadt", actor="teszt")
        self.assertEqual(F.progress(self.c, "T-5")["pct"], 85)

    def test_szulo_a_gyerekek_meresevel(self):
        F.new_task(self.c, "SZ", "Szülő")
        F.add_criterion(self.c, "SZ", "összesített feltétel")
        F.new_task(self.c, "SZ-1", "Gyerek 1", parent="SZ")
        for i in range(2):
            F.add_unit(self.c, "SZ-1", f"e{i}")
        F.set_unit(self.c, "SZ-1", 1, True)
        F.new_task(self.c, "SZ-2", "Gyerek 2", parent="SZ", status="kesz")
        F.new_task(self.c, "SZ-3", "Elvetett gyerek", parent="SZ", status="elvetve")
        # (0 feltétel-teljesülés + 50% + 100%) / (1 feltétel + 2 gyerek) = 50
        self.assertEqual(F.progress(self.c, "SZ")["pct"], 50)
        self.assertEqual(F.progress(self.c, "SZ")["alap"], "meres")


class AllapotSor(unittest.TestCase):
    def test_parsolas(self):
        txt = ("feat: valami\n\nÁllapot: W1b 2/3 egység kész — következő: GREEN\n"
               "Állapot: W1b review 1/1 egység kész — következő: próbahiba + kapulánc\n")
        p = F.parse_allapot(txt)
        self.assertEqual(len(p), 2)
        self.assertEqual(p[0], {"szelet": "W1b", "fazis": "", "k": 2, "n": 3, "kovetkezo": "GREEN"})
        self.assertEqual(p[1]["fazis"], "review")
        self.assertEqual(p[1]["kovetkezo"], "próbahiba + kapulánc")

    def test_kesz_valtozat_es_kotojel(self):
        p = F.parse_allapot("Állapot: D1H-1 4/4 egység kész — kész, következő: kapulánc")
        self.assertEqual(p[0]["szelet"], "D1H-1")
        self.assertEqual((p[0]["k"], p[0]["n"], p[0]["kovetkezo"]), (4, 4, "kapulánc"))
        p = F.parse_allapot("Állapot: lr-toredek 1/3 egység kész - következő: RED teszt")
        self.assertEqual((p[0]["szelet"], p[0]["k"], p[0]["kovetkezo"]), ("lr-toredek", 1, "RED teszt"))

    def test_nem_illeszkedo_sor(self):
        self.assertEqual(F.parse_allapot("**Állapot:** kész – 2026-11-23, ág `fix/x`"), [])


class Maszkolas(Alap):
    def test_email_es_token_nem_kerul_a_db_be(self):
        F.new_task(self.c, "T-6", "Kérés: valaki.pelda@example.com írta", goal="token=abcdef1234567890 kulccsal")
        F.add_event(self.c, "T-6", "megjegyzes", "Bearer abcdefghijklmnop1234 a fejlécben", actor="teszt")
        F.link(self.c, "T-6", "doc", "postgres://felhasznalo:jelszo@db.example.invalid/x")
        dump = "\n".join(self.c.iterdump())
        self.assertNotIn("valaki.pelda@", dump)
        self.assertNotIn("abcdef1234567890", dump)
        self.assertNotIn("abcdefghijklmnop1234", dump)
        self.assertNotIn("felhasznalo:jelszo", dump)
        self.assertIn("v***@example.com", dump)


class Cli(Alap):
    def test_alparancsok_es_attekintes(self):
        self.assertEqual(self.cli("uj", "T-7", "CLI próba", "--cel", "egy cél", "--prio", "2", "--szelet", "cli")[0], 0)
        self.assertEqual(self.cli("terv", "T-7", "--egyseg", "RED", "--egyseg", "GREEN", "--kriterium", "zöld teszt")[0], 0)
        self.assertEqual(self.cli("egyseg", "T-7", "1", "--kesz", "--bizonyitek", "abc1234")[0], 0)
        self.assertEqual(self.cli("kriterium", "T-7", "1", "--teljesult", "--bizonyitek", "teszt OK")[0], 0)
        self.assertEqual(self.cli("allapot", "T-7", "folyamatban", "--kovetkezo", "GREEN", "--blokkolo", "")[0], 0)
        self.assertEqual(self.cli("esemeny", "T-7", "megjegyzés szövege")[0], 0)
        self.assertEqual(self.cli("kapcsol", "T-7", "pr", "123", "--allapot", "OPEN")[0], 0)
        self.assertEqual(self.cli("kapcsolo", "PROBA_KAPCSOLO", "on", "--forras", "tulajdonos 2026-11-25",
                                  "--feladat", "T-7")[0], 0)
        rc, out = self.cli("attekintes")
        self.assertEqual(rc, 0)
        sor = next(s for s in out.splitlines() if s.startswith("T-7"))
        self.assertIn("folyamatban", sor)
        self.assertIn("67%", sor)  # 1/2 egység + 1/1 feltétel = 2/3
        self.assertIn("#123", sor)
        self.assertIn("GREEN", sor)
        rc, out = self.cli("--json", "tetel", "T-7")
        d = json.loads(out)
        self.assertEqual(d["task"]["code"], "T-7")
        self.assertEqual(d["progress"]["pct"], 67)
        self.assertEqual(len(d["units"]), 2)
        rc, out = self.cli("--json", "lista", "--nyitott")
        self.assertIn("T-7", [r["code"] for r in json.loads(out)])
        rc, out = self.cli("kereses", "próba")
        self.assertIn("T-7", out)
        rc, out = self.cli("--json", "kapcsolo")
        dd = {r["name"]: r for r in json.loads(out)}
        self.assertEqual(dd["PROBA_KAPCSOLO"]["eltérés"], 1)

    def test_ervenytelen_atmenet_nem_nulla_kilepes(self):
        self.cli("uj", "T-8", "x")
        self.cli("allapot", "T-8", "beolvadt")
        rc, _ = self.cli("allapot", "T-8", "tervezve")
        self.assertNotEqual(rc, 0)


class Kovetelmeny(Alap):
    def test_nyitott_kovetelmenyekbol_feladat_idempotensen(self):
        r1 = F.sync_requirements(self.c)
        r2 = F.sync_requirements(self.c)
        self.assertGreater(r1["uj"], 0)
        self.assertEqual(r2["uj"], 0)
        self.assertEqual(r2["valtozas"], 0)
        allapot = {r["requirement_code"]: r["status"] for r in self.c.execute("SELECT requirement_code,status FROM tasks")}
        self.assertEqual(allapot["K-900"], "beadva")
        self.assertEqual(allapot["K-901"], "folyamatban")
        self.assertEqual(allapot["K-902"], "beadva")
        self.assertNotIn("K-903", allapot)  # kész
        self.assertNotIn("K-904", allapot)  # felülírt
        self.assertIn("elfelejtett", F.get_task(self.c, "K-902")["blocker"])

    def test_lezart_kovetelmeny_lezarja_az_auto_feladatot(self):
        F.sync_requirements(self.c)
        self.c.execute("UPDATE requirements SET status='kesz' WHERE code='K-900'")
        F.sync_requirements(self.c)
        self.assertEqual(F.get_task(self.c, "K-900")["status"], "kesz")

    def test_lefedett_kovetelmenybol_nem_lesz_masodik_feladat(self):
        F.new_task(self.c, "SAJAT", "Kézi feladat", requirement_code="K-900")
        F.sync_requirements(self.c)
        self.assertEqual(self.c.execute("SELECT count(*) FROM tasks WHERE requirement_code='K-900'").fetchone()[0], 1)


class Szinkron(Alap):
    def setUp(self):
        super().setUp()
        self.repo = self.dir / "repo"
        self.repo.mkdir()
        git(self.repo, "init", "-q", "-b", "main")
        (self.repo / "docs" / "specs").mkdir(parents=True)
        (self.repo / "docs" / "specs" / "2026-11-25-proba-terv.md").write_text("# Próba terv\n", encoding="utf-8")
        (self.repo / "docs" / "specs" / "2026-11-25-proba-terv-vegrehajtas.md").write_text("# V\n", encoding="utf-8")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-q", "-m", "docs: terv\n\nÁllapot: PROBA 1/3 egység kész — következő: RED")
        (self.repo / "a.txt").write_text("1", encoding="utf-8")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-q", "-m", "feat: próba (#77)\n\nÁllapot: PROBA 2/3 egység kész — következő: GREEN\n"
                                            "Állapot: PROBA review 1/1 egység kész — következő: kapulánc")
        git(self.repo, "checkout", "-q", "-b", "feat/proba")
        (self.repo / "b.txt").write_text("2", encoding="utf-8")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-q", "-m", "feat: ág\n\nÁllapot: PROBA 3/3 egység kész — következő: próbahiba")
        git(self.repo, "checkout", "-q", "main")
        F.new_task(self.c, "PROBA", "Próba feladat", szelet="PROBA", branch="feat/proba",
                   spec="docs/specs/2026-11-25-proba-terv.md")
        self.prs = [
            {"number": 77, "title": "feat: próba", "state": "MERGED", "headRefName": "feat/proba-regi",
             "mergeCommit": {"oid": "a" * 40}, "mergedAt": "2026-11-25T10:00:00Z", "url": "u", "isDraft": False},
            {"number": 88, "title": "fix: gazdátlan nyitott PR", "state": "OPEN", "headRefName": "fix/gazdatlan",
             "mergeCommit": None, "mergedAt": None, "url": "u", "isDraft": False},
        ]

    def futtat(self, gh=True):
        return F.sync(self.c, str(self.repo), base="main", napok=3650,
                      gh_prs=(lambda: self.prs) if gh else None, gh_threads=lambda n: 2 if n == 88 else 0)

    def allapotkep(self):
        q = {"tasks": "SELECT code,status,next_step,blocker,branch,spec,requirement_code FROM tasks ORDER BY code",
             "units": "SELECT task_id,seq,done FROM task_units ORDER BY 1,2",
             "links": "SELECT task_id,kind,ref,state,extra FROM task_links ORDER BY 1,2,3",
             "events": "SELECT count(*) FROM task_events"}
        return {k: [tuple(r) for r in self.c.execute(v)] for k, v in q.items()}

    def test_allapot_sorok_pr_es_idempotencia(self):
        r1 = self.futtat()
        kep1 = self.allapotkep()
        r2 = self.futtat()
        self.assertEqual(self.allapotkep(), kep1)
        self.assertEqual(r2["valtozas"], 0)
        self.assertGreater(r1["valtozas"], 0)
        t = F.get_task(self.c, "PROBA")
        self.assertEqual(F.progress(self.c, "PROBA")["egyseg"], "3/3")  # az ág commitja a legújabb
        self.assertEqual(t["next_step"], "próbahiba")
        self.assertEqual(t["status"], "beolvadt")  # a (#77) squash-commit PR-ja beolvadt
        linkek = {(r["kind"], r["ref"]) for r in self.c.execute(
            "SELECT kind,ref FROM task_links l JOIN tasks t ON t.id=l.task_id WHERE t.code='PROBA'")}
        self.assertIn(("pr", "77"), linkek)
        self.assertTrue(any(k == "commit" for k, _ in linkek))
        gazdatlan = F.get_task(self.c, "PR-88")
        self.assertEqual(gazdatlan["status"], "review")
        rc, out = self.cli("attekintes")
        sor = next(s for s in out.splitlines() if s.startswith("PR-88"))
        self.assertIn("2sz", sor)

    def test_gh_nelkul_is_lefut_es_nem_fokoz_le(self):
        r = self.futtat(gh=False)
        self.assertIn("gh", r["nem_elerheto"])
        self.assertEqual(F.get_task(self.c, "PROBA")["status"], "folyamatban")
        self.futtat()
        self.assertEqual(F.get_task(self.c, "PROBA")["status"], "beolvadt")
        self.futtat(gh=False)
        self.assertEqual(F.get_task(self.c, "PROBA")["status"], "beolvadt")

    def test_spec_bol_tervezett_feladat_csak_ha_nincs_gazdaja(self):
        (self.repo / "docs" / "specs" / "2026-11-25-uj-terv.md").write_text("# Új\n", encoding="utf-8")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-q", "-m", "docs: új terv")
        self.futtat()
        self.futtat()
        self.assertEqual(F.get_task(self.c, "SPEC:2026-11-25-uj-terv")["status"], "tervezve")
        self.assertIsNone(F.get_task(self.c, "SPEC:2026-11-25-proba-terv"))  # a PROBA feladat hivatkozik rá

    def test_blokkolt_kezi_allapotot_nem_ir_felul(self):
        F.set_status(self.c, "PROBA", "blokkolt", actor="teszt", blocker="tulajdonosi döntésre vár")
        self.futtat(gh=False)
        self.assertEqual(F.get_task(self.c, "PROBA")["status"], "blokkolt")


class Visszatoltes(Alap):
    def test_kurallt_json_idempotens(self):
        p = self.dir / "f.json"
        p.write_text(json.dumps({
            "feladatok": [{"code": "X-1", "title": "Kurált", "status": "review", "szelet": "X-1", "prs": [5],
                           "egysegek": ["a", "b"], "kriteriumok": ["k1"], "spec": "docs/specs/x.md",
                           "kapcsolok": ["PROBA_KAPCSOLO"]}],
            "kapcsolo_dontesek": [{"name": "PROBA_KAPCSOLO", "value": "on", "decided_at": "2026-11-25",
                                   "source": "tulajdonos", "task_code": "X-1"}],
        }), encoding="utf-8")
        F.visszatoltes(self.c, str(p))
        kep = list(self.c.iterdump())
        F.visszatoltes(self.c, str(p))
        self.assertEqual(list(self.c.iterdump()), kep)
        t = F.get_task(self.c, "X-1")
        self.assertEqual(t["status"], "review")
        self.assertEqual(F.progress(self.c, "X-1")["egyseg"], "0/2")
        self.assertEqual(self.c.execute("SELECT count(*) FROM flag_decisions").fetchone()[0], 1)

    def test_repo_feladatok_json_ervenyes_es_nincs_benne_email(self):
        p = HERE / "feladatok.json"
        d = json.loads(p.read_text(encoding="utf-8"))
        kodok = [t["code"] for t in d["feladatok"]]
        self.assertEqual(len(kodok), len(set(kodok)))
        for kell in ("K-FELADATDB", "W1a", "W1b", "D1H-1", "D1H-4", "U4e", "V5", "K-068", "PR-576", "PR-484"):
            self.assertIn(kell, kodok)
        for t in d["feladatok"]:
            self.assertIn(t.get("status", "beadva"), F.STATUSES)
        self.assertNotRegex(p.read_text(encoding="utf-8"), r"[\w.]+@[\w-]+\.\w+")
        F.visszatoltes(self.c, str(p))
        self.assertEqual(F.get_task(self.c, "W1b")["status"], "beolvadt")


if __name__ == "__main__":
    unittest.main()

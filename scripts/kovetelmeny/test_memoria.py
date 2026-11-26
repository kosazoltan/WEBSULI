"""PROJEKT-MEMORIA-SQL — a projekt-memória (memoria.py) tesztjei ideiglenes adatbázison.

Futtatás (a repó gyökeréből, bytecode nélkül):
    python -B -m unittest discover -s scripts/kovetelmeny -p "test_*.py"
Minden adat fiktív (nyilvános repó): név, valódi e-mail-cím, titok nem szerepelhet.
"""
from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import shutil
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import feladat as F  # noqa: E402
import memoria as M  # noqa: E402
from gyujt import SCHEMA as KOV_SCHEMA  # noqa: E402

REGI_TABLAK = ("sources", "requirements", "findings", "tasks", "task_events")


class Alap(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="memoria-teszt-"))
        self.db = self.dir / "kov.db"
        k = sqlite3.connect(self.db)
        k.executescript(KOV_SCHEMA)
        k.executemany("INSERT INTO requirements(code,title,category,status) VALUES(?,?,?,?)", [
            ("K-900", "Nyitott elvárás", "feladat", "elvart"),
            ("K-901", "Kész tétel", "tananyag", "kesz"),
        ])
        rid = k.execute("SELECT id FROM requirements WHERE code='K-900'").fetchone()[0]
        k.execute("INSERT INTO findings(requirement_id,kind,severity,detail,status,kulcs) VALUES(?,?,?,?,?,?)",
                  (rid, "hianyzo", "magas", "a próba-lelet nyitott", "nyitott", "kezi:proba"))
        k.execute("INSERT INTO sources(kind,ref,date,title,extra) VALUES('commit','abc123',?,?,?)",
                  (dt.datetime.now().isoformat(timespec="seconds"), "feat(x): próba-commit",
                   json.dumps({"main": True, "allapot": "X 1/3 egység kész"})))
        k.commit()
        k.close()
        self.c = M.connect(str(self.db))
        F.new_task(self.c, "PROBA", "Próba-feladat", priority=1, status="folyamatban", next_step="a következő lépés")
        self.c.commit()  # a CLI-s tesztek külön kapcsolattal írnak

    def tearDown(self):
        self.c.close()
        shutil.rmtree(self.dir, ignore_errors=True)

    def run_cli(self, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = M.main(["--db", str(self.db), *argv])
        return rc, out.getvalue()


class Migracio(Alap):
    def test_idempotens_es_a_regi_tablak_nem_valtoznak(self):
        elotte = {t: self.c.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in REGI_TABLAK}
        M.migrate(self.c)
        M.migrate(self.c)
        utana = {t: self.c.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in REGI_TABLAK}
        self.assertEqual(elotte, utana)
        nevek = {r[0] for r in self.c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"utasitasok", "folyamatok"} <= nevek)
        v = self.c.execute("SELECT value FROM feladat_meta WHERE key='memoria_sema_verzio'").fetchone()[0]
        self.assertEqual(v, str(M.SEMA_VERZIO))


class Utasitasok(Alap):
    def test_felvetel_feladathoz_kotve_maszkolva(self):
        uid = M.add_instruction(self.c, "Írj levelet a proba@example.invalid címre", forras="tulajdonos", task_code="PROBA")
        row = self.c.execute("SELECT * FROM utasitasok WHERE id=?", (uid,)).fetchone()
        self.assertEqual(row["allapot"], "kiadva")
        self.assertEqual(row["task_code"], "PROBA")
        self.assertNotIn("proba@example.invalid", row["szoveg"])

    def test_vegrehajtva_csak_bizonyitekkal(self):
        uid = M.add_instruction(self.c, "Csináld meg", forras="tulajdonos")
        with self.assertRaises(F.AllapotHiba):
            M.set_instruction(self.c, uid, "vegrehajtva")
        M.set_instruction(self.c, uid, "vegrehajtva", evidence="#999 merged abc123")
        row = self.c.execute("SELECT allapot, vegrehajtva_at, bizonyitek FROM utasitasok WHERE id=?", (uid,)).fetchone()
        self.assertEqual(row["allapot"], "vegrehajtva")
        self.assertTrue(row["vegrehajtva_at"])
        self.assertIn("#999", row["bizonyitek"])

    def test_felulirt_utasitas(self):
        regi = M.add_instruction(self.c, "Régi utasítás", forras="tulajdonos")
        uj = M.add_instruction(self.c, "Új utasítás", forras="tulajdonos", felulirja=regi)
        row = self.c.execute("SELECT allapot, felulirta FROM utasitasok WHERE id=?", (regi,)).fetchone()
        self.assertEqual(row["allapot"], "felulirva")
        self.assertEqual(row["felulirta"], uj)

    def test_ismetelt_felvetel_nem_dupla(self):
        a = M.add_instruction(self.c, "Ugyanaz", forras="tulajdonos", dedupe="hm:1:2")
        b = M.add_instruction(self.c, "Ugyanaz", forras="tulajdonos", dedupe="hm:1:2")
        self.assertEqual(a, b)
        self.assertEqual(self.c.execute("SELECT count(*) FROM utasitasok").fetchone()[0], 1)


class Folyamatok(Alap):
    def test_inditas_zaras(self):
        fid = M.start_process(self.c, "kapulanc", "feat/x", task_code="PROBA")
        M.finish_process(self.c, fid, "ok", summary="#1 MERGED", evidence="D:/tmp/x.out")
        row = self.c.execute("SELECT * FROM folyamatok WHERE id=?", (fid,)).fetchone()
        self.assertEqual(row["eredmeny"], "ok")
        self.assertTrue(row["finished_at"])
        with self.assertRaises(F.AllapotHiba):
            M.finish_process(self.c, fid, "bukott")

    def test_ismeretlen_fajta_elutasitva(self):
        with self.assertRaises(F.AllapotHiba):
            M.start_process(self.c, "varazslat", "x")

    def test_elakadt_futas(self):
        fid = M.start_process(self.c, "e2e", "x")
        regi = (dt.datetime.now() - dt.timedelta(hours=25)).isoformat(timespec="seconds")
        self.c.execute("UPDATE folyamatok SET started_at=? WHERE id=?", (regi, fid))
        rep = M.report(self.c, napok=7)
        self.assertEqual([f["id"] for f in rep["elakadt_folyamatok"]], [fid])


class Jelentes(Alap):
    SZAKASZOK = ("kiadott_utasitasok", "vegrehajtott_utasitasok", "futo_folyamatok", "lezart_folyamatok", "elvegzett_kodolas",
                 "lezart_feladatok", "hatralek", "hianyossagok", "teendok")

    def test_minden_szakasz_json_es_szoveg(self):
        uid = M.add_instruction(self.c, "Nyitott utasítás", forras="tulajdonos", task_code="PROBA")
        kesz = M.add_instruction(self.c, "Kész utasítás", forras="tulajdonos")
        M.set_instruction(self.c, kesz, "vegrehajtva", evidence="mérve")
        M.start_process(self.c, "kapulanc", "feat/fut")
        zart = M.start_process(self.c, "deploy", "abc123")
        M.finish_process(self.c, zart, "ok", summary="health 200")
        self.c.commit()
        rc, out = self.run_cli("jelentes", "--json")
        self.assertEqual(rc, 0)
        rep = json.loads(out)
        for k in self.SZAKASZOK:
            self.assertIn(k, rep)
        self.assertEqual([u["id"] for u in rep["kiadott_utasitasok"]], [uid])
        self.assertEqual([u["id"] for u in rep["vegrehajtott_utasitasok"]], [kesz])
        self.assertEqual(len(rep["futo_folyamatok"]), 1)
        self.assertEqual(len(rep["lezart_folyamatok"]), 1)
        self.assertEqual(rep["elvegzett_kodolas"][0]["ref"], "abc123")
        self.assertEqual(rep["hatralek"][0]["code"], "PROBA")
        self.assertTrue(any("próba-lelet" in h["leiras"] for h in rep["hianyossagok"]))
        self.assertTrue(any(h["code"] == "K-900" for h in rep["hianyossagok"]))
        self.assertEqual(rep["teendok"][0]["kovetkezo"], "a következő lépés")
        rc, szoveg = self.run_cli("jelentes")
        self.assertEqual(rc, 0)
        for cim in ("Kiadott utasítások", "Végrehajtott utasítások", "Futó folyamatok", "Lezárt folyamatok", "Elvégzett kódolás",
                    "Lezárt feladatok", "Hátralék", "Hiányosságok", "Teendők"):
            self.assertIn(cim, szoveg)

    def test_cli_utasitas_es_folyamat(self):
        rc, out = self.run_cli("utasitas", "CLI-ből felvett utasítás", "--feladat", "PROBA", "--json")
        self.assertEqual(rc, 0)
        uid = json.loads(out)["id"]
        rc, _ = self.run_cli("utasitas-allapot", str(uid), "vegrehajtva")
        self.assertEqual(rc, 2, "bizonyíték nélkül hiba")
        rc, out = self.run_cli("folyamat-start", "unit", "feat/x", "--json")
        fid = json.loads(out)["id"]
        rc, _ = self.run_cli("folyamat-vege", str(fid), "bukott", "--osszegzes", "1 bukás")
        self.assertEqual(rc, 0)


if __name__ == "__main__":
    unittest.main()

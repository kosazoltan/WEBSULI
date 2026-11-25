"""revizio.py — a kézi lelet lezárásának (lelet-zar) tesztjei ideiglenes adatbázison.

Futtatás (a repó gyökeréből): python -B -m unittest discover -s scripts/kovetelmeny -p "test_*.py"
Minden adat fiktív (nyilvános repó).
"""
from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from gyujt import SCHEMA  # noqa: E402

SCRIPT = str(HERE / "revizio.py")


def run(db, *args):
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8")
    return subprocess.run([sys.executable, "-B", SCRIPT, "--db", db, *args], capture_output=True, text=True,
                          encoding="utf-8", env=env)


class LeletZar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.tmp.name) / "k.db")
        c = sqlite3.connect(self.db)
        c.executescript(SCHEMA)
        c.commit()
        c.close()
        c = sqlite3.connect(self.db)
        cols = {r[1] for r in c.execute("PRAGMA table_info(requirements)")}
        vals = {"code": "T-1", "title": "Próbakövetelmény", "status": "elvart"}
        for col in ("kategoria", "category"):
            if col in cols:
                vals[col] = "teszt"
        c.execute(f"INSERT INTO requirements({','.join(vals)}) VALUES({','.join('?' * len(vals))})", tuple(vals.values()))
        c.commit()
        c.close()
        r = run(self.db, "lelet-add", "--code", "T-1", "--kind", "hianyzo", "--detail", "nincs kész", "--evidence", "kód")
        self.assertEqual(r.returncode, 0, r.stderr)
        c = sqlite3.connect(self.db)
        self.fid = c.execute("SELECT id FROM findings").fetchone()[0]
        c.close()

    def tearDown(self):
        self.tmp.cleanup()

    def row(self):
        c = sqlite3.connect(self.db)
        r = c.execute("SELECT status, evidence FROM findings WHERE id=?", (self.fid,)).fetchone()
        c.close()
        return r

    def test_nyitott_lelet_lezarhato_bizonyitekkal(self):
        r = run(self.db, "lelet-zar", str(self.fid), "--evidence", "PR #1 beolvadt")
        self.assertEqual(r.returncode, 0, r.stderr)
        status, evidence = self.row()
        self.assertEqual(status, "megoldva")
        self.assertIn("lezárva: PR #1 beolvadt", evidence)
        self.assertIn("kód", evidence)
        self.assertNotIn("hianyzo", run(self.db, "allapot").stdout.split("Nyitott leletek:")[-1])

    def test_elvetve_allapot(self):
        r = run(self.db, "lelet-zar", str(self.fid), "--evidence", "téves", "--status", "elvetve")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.row()[0], "elvetve")

    def test_zart_vagy_nem_letezo_lelet_nem_modosul(self):
        self.assertEqual(run(self.db, "lelet-zar", str(self.fid), "--evidence", "első").returncode, 0)
        before = self.row()
        r = run(self.db, "lelet-zar", str(self.fid), "--evidence", "második")
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(self.row(), before)
        self.assertNotEqual(run(self.db, "lelet-zar", "99999", "--evidence", "x").returncode, 0)

    def test_bizonyitek_kotelezo(self):
        self.assertNotEqual(run(self.db, "lelet-zar", str(self.fid)).returncode, 0)
        self.assertEqual(self.row()[0], "nyitott")


class LeletZarReview601(unittest.TestCase):
    """Review #601: üres bizonyíték elutasítva; a sikertelen lezárás régi sémán sem ír (nincs migráció)."""
    setUp, tearDown, row = LeletZar.setUp, LeletZar.tearDown, LeletZar.row

    def test_ures_vagy_szokozos_bizonyitek_elutasitva_iras_nelkul(self):
        for ev in ("", "   ", "\t"):
            r = run(self.db, "lelet-zar", str(self.fid), "--evidence", ev)
            self.assertNotEqual(r.returncode, 0, ev)
            self.assertEqual(self.row(), ("nyitott", "kód"))

    def test_regi_semán_a_sikertelen_lezaras_nem_migral(self):
        c = sqlite3.connect(self.db)
        c.execute("ALTER TABLE requirements DROP COLUMN manual_evidence")
        c.commit()
        c.close()
        self.assertNotEqual(run(self.db, "lelet-zar", "99999", "--evidence", "x").returncode, 0)
        c = sqlite3.connect(self.db)
        cols = {r[1] for r in c.execute("PRAGMA table_info(requirements)")}
        c.close()
        self.assertNotIn("manual_evidence", cols, "a sikertelen lezárás nem módosíthatja a sémát")


if __name__ == "__main__":
    unittest.main()

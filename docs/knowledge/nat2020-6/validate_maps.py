#!/usr/bin/env python3
"""Validate NAT 2020 grade-6 knowledge maps without node_modules (mirrors source/tests/nat2020-grade6-maps.test.ts)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAPS = ROOT / "maps"
EXTRACTS = ROOT / "extracts"
REQUIRED = {"id", "term", "definition", "quote", "sourceRef", "type", "examWeight"}
EXPECTED_MAPS = {
    "Digitalis_kultura_F.json", "Etika_F.json", "Magyar_nyelv_es_irodalom_F.json", "Matematika_F.json",
    "OH-MAT06TA_matematika_6_tanmenet.json", "Termeszettudomany_5_6.json", "Tortenelem_F.json",
    "elo_idegen_nyelv_F_egyben.json",
}
EXTRACT_NAME = re.compile(r"^[A-Za-z0-9_-]+(?:_[0-9]+)*\.grade6\.txt$")
GRADE_7_8_BLOCK = "A 7–8. évfolyam tananyaga"
TANMENET_MAP = "OH-MAT06TA_matematika_6_tanmenet.json"
TANMENET_TOPICS = [
    "EGÉSZ SZÁMOK, OSZTHATÓSÁG", "TÖRTEK", "GEOMETRIA, TENGELYES TÜKRÖZÉS", "ARÁNY, SZÁZALÉK, SZÖVEGES FELADATOK",
    "KERÜLET, TERÜLET, FELSZÍN, TÉRFOGAT", "STATISZTIKA", "ÉV VÉGI ISMÉTLÉS",
]


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def read_extract(name: str) -> str | None:
    """Only plain extract filenames inside extracts/ (no traversal); universal newlines -> LF."""
    if not EXTRACT_NAME.match(name):
        return None
    path = (EXTRACTS / name).resolve()
    if path.parent != EXTRACTS.resolve() or not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def main() -> int:
    files = {p.name for p in MAPS.glob("*.json")}
    errors = 0
    # Same rules as source/tests/nat2020-grade6-maps.test.ts (review #392): no grade 7–8 block in any extract.
    for extract in sorted(EXTRACTS.glob("*.txt")):
        if GRADE_7_8_BLOCK in extract.read_text(encoding="utf-8"):
            print(f"FAIL {extract.name} contains the grade 7–8 block")
            errors += 1
    if files != EXPECTED_MAPS:
        print(f"FAIL maps missing={sorted(EXPECTED_MAPS - files)} extra={sorted(files - EXPECTED_MAPS)}")
        errors += 1
    for name in sorted(files & EXPECTED_MAPS):
        data = json.loads((MAPS / name).read_text(encoding="utf-8"))
        if data.get("classroom") != 6:
            print(f"FAIL {name} classroom={data.get('classroom')}")
            errors += 1
        concepts = data.get("concepts") or []
        if len(concepts) < 5:
            print(f"FAIL {name} concepts={len(concepts)}")
            errors += 1
        if name == TANMENET_MAP:
            headings = {str(c.get("quote", "")).replace("\r\n", "\n").split("\n")[0].strip() for c in concepts}
            for topic in TANMENET_TOPICS:
                if topic not in headings:
                    print(f"FAIL {name} missing tanmenet topic {topic}")
                    errors += 1
        ids = [c.get("id") for c in concepts]
        if len(ids) != len(set(ids)):
            print(f"FAIL {name} duplicate ids")
            errors += 1
        extracts = {}
        for src in data.get("sourceFiles") or []:
            text = read_extract(src["name"])
            if text is None:
                print(f"FAIL {name} invalid source file {src['name']!r}")
                errors += 1
            else:
                extracts[src["name"]] = text
        for c in concepts:
            missing = REQUIRED - set(c)
            if missing:
                print(f"FAIL {name}/{c.get('id')} missing {missing}")
                errors += 1
                continue
            text = extracts.get(c["sourceRef"]["file"])
            if text is None:
                print(f"FAIL {name}/{c['id']} source not declared in sourceFiles")
                errors += 1
                continue
            quote = c["quote"].replace("\r\n", "\n")
            if quote not in text:
                print(f"FAIL {name}/{c['id']} quote not in extract")
                errors += 1
            elif norm(c["definition"]) not in norm(quote):
                print(f"FAIL {name}/{c['id']} definition not supported by quote")
                errors += 1
    print(f"maps={len(files)} errors={errors}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

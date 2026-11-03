#!/usr/bin/env python3
"""Validate NAT 2020 grade-6 knowledge maps without node_modules."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAPS = ROOT / "maps"
EXTRACTS = ROOT / "extracts"
REQUIRED = {"id", "term", "definition", "quote", "sourceRef", "type", "examWeight"}


def main() -> int:
    files = sorted(MAPS.glob("*.json"))
    if len(files) < 6:
        print(f"FAIL maps={len(files)} need>=6", file=sys.stderr)
        return 1
    errors = 0
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("classroom") != 6:
            print(f"FAIL {path.name} classroom={data.get('classroom')}")
            errors += 1
        concepts = data.get("concepts") or []
        if len(concepts) < 5:
            print(f"FAIL {path.name} concepts={len(concepts)}")
            errors += 1
        ids = [c.get("id") for c in concepts]
        if len(ids) != len(set(ids)):
            print(f"FAIL {path.name} duplicate ids")
            errors += 1
        extracts = {}
        for src in data.get("sourceFiles") or []:
            name = src["name"]
            extracts[name] = (EXTRACTS / name).read_text(encoding="utf-8")
        for c in concepts:
            missing = REQUIRED - set(c)
            if missing:
                print(f"FAIL {path.name}/{c.get('id')} missing {missing}")
                errors += 1
                continue
            text = extracts.get(c["sourceRef"]["file"])
            if text is None:
                print(f"FAIL {path.name}/{c['id']} unknown source")
                errors += 1
                continue
            if c["quote"] not in text:
                print(f"FAIL {path.name}/{c['id']} quote not in extract")
                errors += 1
    print(f"maps={len(files)} errors={errors}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

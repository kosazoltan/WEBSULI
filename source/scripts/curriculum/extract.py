"""Mintatanmenet .docx -> JSON (táblázatsorok szövege). Csak stdlib; a fájlokat adatként olvassa."""
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def cell_text(tc):
    paras = []
    for p in tc.iter(W + "p"):
        t = "".join(x.text or "" for x in p.iter(W + "t"))
        if t.strip():
            paras.append(t.strip())
    return " / ".join(paras)


def extract(path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    tables = []
    for tbl in root.iter(W + "tbl"):
        rows = []
        for tr in tbl.findall(W + "tr"):
            cells = [cell_text(tc) for tc in tr.findall(W + "tc")]
            if any(cells):
                rows.append(cells)
        if rows:
            tables.append(rows)
    return tables


def main(src, dst):
    out = {}
    bad = []
    for f in sorted(os.listdir(src)):
        p = os.path.join(src, f)
        if not f.lower().endswith(".docx"):
            bad.append((f, "nem docx"))
            continue
        try:
            out[f] = extract(p)
        except Exception as e:  # sérült / nem zip
            bad.append((f, str(e)[:80]))
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
    print("ok", len(out), "hibás", len(bad))
    for b in bad:
        print("  ", b)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

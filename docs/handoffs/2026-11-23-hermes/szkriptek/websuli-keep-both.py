"""Ütközés feloldása mindkét oldal megtartásával (előbb a mienk, aztán az övék): python keep_both.py <fájl>...

Csak a kétoldalas (merge.conflictStyle=merge) alakot kezeli. diff3 / zdiff3 alaknál (`|||||||` sor) vagy csonka jelölősorozatnál
a fájlt NEM írja, és 1-es kóddal kilép (1. vak kör L11).
"""
import io, sys

rc = 0
for path in sys.argv[1:]:
    s = io.open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in s else '\n'
    L = s.split(nl)
    if any(l.startswith('||||||| ') or l == '|||||||' for l in L):
        print(path, 'diff3 alakú ütközés — nem írom. Kézzel oldd fel (a `|||||||` és a `=======` közötti alapblokk törlésével). '
              'A `git checkout --conflict=merge` csak ÉRINTETLEN konfliktusfájlon használható: a már kézzel feloldott részeket is felülírja.')
        rc = 1
        continue
    out, i, n, bad = [], 0, 0, False
    while i < len(L):
        if not L[i].startswith('<<<<<<< '):
            out.append(L[i]); i += 1; continue
        try:
            m = next(j for j in range(i + 1, len(L)) if L[j] == '=======')
            b = next(j for j in range(m + 1, len(L)) if L[j].startswith('>>>>>>> '))
        except StopIteration:
            bad = True; break
        if any(L[j].startswith('<<<<<<< ') for j in range(i + 1, b)):
            bad = True; break
        out.extend(L[i + 1:m] + L[m + 1:b]); i = b + 1; n += 1
    if bad:
        print(path, 'csonka vagy egymásba ágyazott jelölősorozat — nem írom')
        rc = 1
        continue
    io.open(path, 'w', encoding='utf-8', newline='').write(nl.join(out))
    print(path, n, 'ütközés feloldva')
sys.exit(rc)

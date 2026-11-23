"""Ütközés feloldása mindkét oldal megtartásával (előbb a mienk, aztán az övék): python keep_both.py <fájl>..."""
import io, sys
for path in sys.argv[1:]:
    s = io.open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in s else '\n'
    L = s.split(nl)
    n = 0
    while True:
        a = next((i for i, l in enumerate(L) if l.startswith('<<<<<<< ')), None)
        if a is None:
            break
        m = next(i for i, l in enumerate(L) if i > a and l == '=======')
        b = next(i for i, l in enumerate(L) if i > m and l.startswith('>>>>>>> '))
        L[a:b + 1] = L[a + 1:m] + L[m + 1:b]
        n += 1
    io.open(path, 'w', encoding='utf-8', newline='').write(nl.join(L))
    print(path, n, 'ütközés feloldva')

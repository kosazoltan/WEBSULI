"""Terv-szakasz beszúrása a régi commit hozzáadott soraiból: python doc_insert.py <commit> <fájl> <a következő szakasz fejlécének eleje>"""
import io, subprocess, sys
commit, path, before = sys.argv[1], sys.argv[2], sys.argv[3]
diff = subprocess.run(['git', 'show', '--format=', commit, '--', path], capture_output=True).stdout.decode('utf-8')
added = [l[1:] for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]
added = [l.rstrip('\r') for l in added]
s = io.open(path, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'
L = s.split(nl)
at = next((i for i, l in enumerate(L) if l.startswith(before)), len(L))
while added and not added[0].strip():
    added.pop(0)
while added and not added[-1].strip():
    added.pop()
L[at:at] = added + ['']
io.open(path, 'w', encoding='utf-8', newline='').write(nl.join(L))
print(path, 'beszúrva', len(added), 'sor a(z)', at + 1, '. sor elé')

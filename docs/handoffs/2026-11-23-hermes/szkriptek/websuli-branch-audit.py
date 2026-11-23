"""Csak olvasó ág-osztályozás: van-e új tartalom a főághoz képest, hol létezik az ág.

Használat: python websuli-branch-audit.py <repó-útvonal> <kimeneti.tsv>
A verziózott mintát (branch-audit.tsv) NEM írja felül; parancshibánál (git / gh) leáll, és nem ír kimenetet (1. vak kör L10).
A „backup” jelölés csak azt mondja, hogy van ilyen nevű távoli mentő-ág, NEM igazolja, hogy a helyi fej benne van.
"""
import json, os, subprocess, sys

if len(sys.argv) != 3:
    sys.exit('Használat: python websuli-branch-audit.py <repó-útvonal> <kimeneti.tsv>')
REPO, OUT = sys.argv[1], os.path.abspath(sys.argv[2])
if os.path.basename(OUT) == 'branch-audit.tsv' and os.path.dirname(OUT) == os.path.dirname(os.path.abspath(__file__)):
    sys.exit('A verziózott branch-audit.tsv nem írható felül — adj meg más kimenetet.')


def git(*args):
    r = subprocess.run(['git', '-C', REPO, *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        sys.exit(f'git {" ".join(args)} hibával állt le ({r.returncode}): {r.stderr.strip()[:300]}')
    return r.stdout.strip()


def git_soft(*args):
    r = subprocess.run(['git', '-C', REPO, *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode, r.stdout.strip()

main_tree = git('rev-parse', 'origin/main^{tree}')
remote = {r[len('origin/'):] for r in git('branch', '-r', '--format=%(refname:short)').splitlines() if r.startswith('origin/')}
worktree_branches = set()
for line in git('worktree', 'list', '--porcelain').splitlines():
    if line.startswith('branch '):
        worktree_branches.add(line.split(' ', 1)[1].replace('refs/heads/', ''))
gh = subprocess.run(['gh', 'pr', 'list', '--repo', 'kosazoltan/WEBSULI', '--state', 'open', '--json', 'headRefName'], capture_output=True, text=True, encoding='utf-8')
if gh.returncode != 0:
    sys.exit(f'gh pr list hibával állt le: {gh.stderr.strip()[:300]}')
open_heads = {p['headRefName'] for p in json.loads(gh.stdout or '[]')}

rows = []
for b in git('branch', '--format=%(refname:short)').splitlines():
    if b == 'main':
        continue
    code, mt = git_soft('merge-tree', '--write-tree', 'origin/main', b)  # 1 = ütközés: ettől még van új tartalom
    merged = mt.splitlines()
    content = 'NINCS_UJ' if code == 0 and merged and merged[0] == main_tree else 'VAN_UJ'
    if b in remote:
        ahead = git('rev-list', '--count', f'origin/{b}..{b}')
        where = 'tavoli' if ahead == '0' else f'tavoli(+{ahead} helyi)'
    elif f'higienia-backup/{b}' in remote:
        where = 'backup'
    else:
        where = 'CSAK_HELYI'
    date = git('log', '-1', '--format=%cs', b)
    rows.append((content, where, 'munkafa' if b in worktree_branches else '-', 'nyitottPR' if b in open_heads else '-', date, b))

out = OUT
tmp = out + '.tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    for r in sorted(rows):
        f.write('\t'.join(r) + '\n')
os.replace(tmp, out)
from collections import Counter
c = Counter((r[0], r[1].split('(')[0]) for r in rows)
for k, v in sorted(c.items()):
    print(v, *k)
print('összesen', len(rows), '->', out)

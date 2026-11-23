"""Csak olvasó ág-osztályozás: van-e új tartalom a főághoz képest, hol létezik az ág. Kimenet: branch-audit.tsv a szkript mellett."""
import json, os, subprocess, sys

REPO = r'D:\repo\WEBSULI'

def git(*args):
    return subprocess.run(['git', '-C', REPO, *args], capture_output=True, text=True, encoding='utf-8', errors='replace').stdout.strip()

main_tree = git('rev-parse', 'origin/main^{tree}')
remote = {r[len('origin/'):] for r in git('branch', '-r', '--format=%(refname:short)').splitlines() if r.startswith('origin/')}
worktree_branches = set()
for line in git('worktree', 'list', '--porcelain').splitlines():
    if line.startswith('branch '):
        worktree_branches.add(line.split(' ', 1)[1].replace('refs/heads/', ''))
open_prs = subprocess.run(['gh', 'pr', 'list', '--repo', 'kosazoltan/WEBSULI', '--state', 'open', '--json', 'headRefName'], capture_output=True, text=True, encoding='utf-8').stdout
open_heads = {p['headRefName'] for p in json.loads(open_prs or '[]')}

rows = []
for b in git('branch', '--format=%(refname:short)').splitlines():
    if b == 'main':
        continue
    merged = git('merge-tree', '--write-tree', 'origin/main', b).splitlines()
    content = 'NINCS_UJ' if merged and merged[0] == main_tree else 'VAN_UJ'
    if b in remote:
        ahead = git('rev-list', '--count', f'origin/{b}..{b}')
        where = 'tavoli' if ahead == '0' else f'tavoli(+{ahead} helyi)'
    elif f'higienia-backup/{b}' in remote:
        where = 'backup'
    else:
        where = 'CSAK_HELYI'
    date = git('log', '-1', '--format=%cs', b)
    rows.append((content, where, 'munkafa' if b in worktree_branches else '-', 'nyitottPR' if b in open_heads else '-', date, b))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'branch-audit.tsv')
with open(out, 'w', encoding='utf-8') as f:
    for r in sorted(rows):
        f.write('\t'.join(r) + '\n')
from collections import Counter
c = Counter((r[0], r[1].split('(')[0]) for r in rows)
for k, v in sorted(c.items()):
    print(v, *k)
print('összesen', len(rows), '->', out)

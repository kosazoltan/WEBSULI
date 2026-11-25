// Főterv H3 K2 (docs/specs/2026-11-23-foterv-vegrehajtas.md): bizonyíték-átvitel — ha az új fej és a megítélt fej kód-patch-id-ja
// azonos (csak összefésülés vagy dokumentum változott), a korábbi helyi ítélet az új fejre is érvényes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codePatchId, realExec, resolveVerdict, transferReviewEvidence } from './lib.mjs';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'k2-'));
  const git = (...args) => {
    const r = realExec('git', ['-c', 'user.name=k2', '-c', 'user.email=k2@websuli.example', '-c', 'commit.gpgsign=false', ...args], { cwd: dir });
    assert.equal(r.code, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const write = (rel, text) => { mkdirSync(join(dir, rel, '..'), { recursive: true }); writeFileSync(join(dir, rel), text); };
  git('init', '-q', '-b', 'main');
  write('src/a.ts', 'export const a = 1;\n');
  write('docs/x.md', '# x\n');
  git('add', '-A'); git('commit', '-q', '-m', 'alap');
  git('checkout', '-q', '-b', 'feat');
  write('src/a.ts', 'export const a = 2;\n');
  git('add', '-A'); git('commit', '-q', '-m', 'kód');
  const reviewed = git('rev-parse', 'HEAD');
  return { dir, git, write, reviewed };
}

const evidenceDir = (records) => {
  // `at`: a rekordok időrendje (a legújabb dönt)
  const dir = mkdtempSync(join(tmpdir(), 'k2-ev-'));
  for (const r of records) writeFileSync(join(dir, `review-${r.head}.json`), JSON.stringify(r));
  return dir;
};

test('K2: a main beolvasztása és a dokumentum-változás után a kód-patch-id változatlan → az ítélet átvihető', () => {
  const { dir, git, write, reviewed } = repo();
  git('checkout', '-q', 'main');
  write('src/b.ts', 'export const b = 1;\n');
  git('add', '-A'); git('commit', '-q', '-m', 'main halad');
  git('checkout', '-q', 'feat');
  git('merge', '-q', '--no-edit', 'main');
  write('docs/x.md', '# x\n\nmegjegyzés\n');
  git('add', '-A'); git('commit', '-q', '-m', 'doksi');
  const head = git('rev-parse', 'HEAD');
  assert.ok(codePatchId(realExec, dir, 'main', reviewed));
  assert.equal(codePatchId(realExec, dir, 'main', head), codePatchId(realExec, dir, 'main', reviewed));
  const evDir = evidenceDir([{ head: reviewed, verdict: 'IGEN, FELTÉTELLEL', reviewer: 'local-review' }]);
  const ev = transferReviewEvidence({ evDir, head, base: 'main', exec: realExec, cwd: dir });
  assert.equal(ev?.head, head);
  assert.equal(ev?.transferredFrom, reviewed);
  assert.equal(ev?.reviewer, 'local-review', 'az eredeti rekord mezői (pl. futtató) megmaradnak');
  const v = resolveVerdict({ head, evidence: ev });
  assert.equal(v?.verdict, 'IGEN, FELTÉTELLEL');
  assert.match(v?.source ?? '', /átvett/);
});

test('K2: kódváltozás után NEM vihető át; NEM-ítélet és sérült rekord sem; az azonos fej saját rekordja nem „átvitel”', () => {
  const { dir, git, write, reviewed } = repo();
  write('src/a.ts', 'export const a = 3;\n');
  git('add', '-A'); git('commit', '-q', '-m', 'újabb kód');
  const head = git('rev-parse', 'HEAD');
  assert.notEqual(codePatchId(realExec, dir, 'main', head), codePatchId(realExec, dir, 'main', reviewed));
  assert.equal(transferReviewEvidence({ evDir: evidenceDir([{ head: reviewed, verdict: 'IGEN' }]), head, base: 'main', exec: realExec, cwd: dir }), null);
  // Azonos kód, de a megítélt fej ítélete NEM → nem vihető át (a NEM-et a saját fejen kell javítani).
  git('reset', '-q', '--hard', reviewed);
  write('docs/x.md', '# y\n'); git('add', '-A'); git('commit', '-q', '-m', 'doksi');
  const docHead = git('rev-parse', 'HEAD');
  assert.equal(transferReviewEvidence({ evDir: evidenceDir([{ head: reviewed, verdict: 'NEM' }]), head: docHead, base: 'main', exec: realExec, cwd: dir }), null);
  assert.equal(transferReviewEvidence({ evDir: evidenceDir([{ head: reviewed, verdict: 'TALÁN' }]), head: docHead, base: 'main', exec: realExec, cwd: dir }), null);
  assert.equal(transferReviewEvidence({ evDir: evidenceDir([{ head: 'f'.repeat(40), verdict: 'IGEN' }]), head: docHead, base: 'main', exec: realExec, cwd: dir }), null, 'nem létező fej');
});

test('K2: csak dokumentumot érintő ág (üres kód-diff) ítélete nem visz át kódváltozásra', () => {
  const { dir, git, write } = repo();
  git('checkout', '-q', '-b', 'docs', 'main');
  write('docs/x.md', '# z\n'); git('add', '-A'); git('commit', '-q', '-m', 'doksi');
  const docsHead = git('rev-parse', 'HEAD');
  assert.equal(codePatchId(realExec, dir, 'main', docsHead), null, 'üres kód-diff: nincs azonosító');
  write('src/a.ts', 'export const a = 9;\n'); git('add', '-A'); git('commit', '-q', '-m', 'kód');
  const head = git('rev-parse', 'HEAD');
  assert.equal(transferReviewEvidence({ evDir: evidenceDir([{ head: docsHead, verdict: 'IGEN' }]), head, base: 'main', exec: realExec, cwd: dir }), null);
});

test('K2: a merge-kapu saját bizonyíték híján az átvitelt kéri', () => {
  const src = readFileSync(new URL('./pre-merge-gate.mjs', import.meta.url), 'utf8');
  assert.match(src, /readEvidence\(ctx\.evDir, `review-\$\{head\}`\) \?\? transferReviewEvidence\(\{ evDir: ctx\.evDir, head, base: 'origin\/main', exec, cwd: root, accept: \(ev\) => mergeVerdict\(/, 'a kapu alkalmassági feltétele (vak-mód) a keresésnek is szól');
});

test('K2 (PR #568 review): sztringliterál szóköz-változása más kód → nincs átvitel', () => {
  const { dir, git, write, reviewed } = repo();
  write('src/a.ts', "export const label = 'a b';\n"); git('add', '-A'); git('commit', '-q', '-m', 'címke');
  const withSpace = git('rev-parse', 'HEAD');
  write('src/a.ts', "export const label = 'ab';\n"); git('add', '-A'); git('commit', '-q', '-m', 'szóköz nélkül');
  const head = git('rev-parse', 'HEAD');
  assert.notEqual(codePatchId(realExec, dir, 'main', head), codePatchId(realExec, dir, 'main', withSpace));
  assert.equal(transferReviewEvidence({ evDir: evidenceDir([{ head: withSpace, verdict: 'IGEN' }]), head, base: 'main', exec: realExec, cwd: dir }), null);
  void reviewed;
});

test('K2 (PR #568 review): a main ugyanabban a fájlban, szomszédos sorban változik — tiszta merge után is átvihető', () => {
  const { dir, git, write } = repo();
  git('checkout', '-q', 'main');
  write('src/big.ts', ['// 1', '// 2', '// 3', '// 4', '// 5', '// 6', '// 7', '// 8'].join('\n') + '\n'); git('add', '-A'); git('commit', '-q', '-m', 'nagy fájl');
  git('checkout', '-q', 'feat'); git('merge', '-q', '--no-edit', 'main');
  write('src/big.ts', ['// 1', '// 2', '// 3', '// 4 PR', '// 5', '// 6', '// 7', '// 8'].join('\n') + '\n'); git('add', '-A'); git('commit', '-q', '-m', 'PR-sor');
  const reviewed = git('rev-parse', 'HEAD');
  git('checkout', '-q', 'main');
  write('src/big.ts', ['// 1', '// 2', '// 3', '// 4', '// 5', '// 6 main', '// 7', '// 8'].join('\n') + '\n'); git('add', '-A'); git('commit', '-q', '-m', 'main-sor');
  git('checkout', '-q', 'feat'); git('merge', '-q', '--no-edit', 'main');
  const head = git('rev-parse', 'HEAD');
  assert.equal(codePatchId(realExec, dir, 'main', head), codePatchId(realExec, dir, 'main', reviewed));
});

test('K2 (PR #568 review): az azonos kódú legújabb ítélet dönt — NEM után nincs visszaesés egy régebbi IGEN-re; az alkalmatlan rekordot kihagyja', () => {
  const { dir, git, write, reviewed } = repo();
  write('docs/x.md', '# h2\n'); git('add', '-A'); git('commit', '-q', '-m', 'doksi 2');
  const h2 = git('rev-parse', 'HEAD');
  write('docs/x.md', '# h3\n'); git('add', '-A'); git('commit', '-q', '-m', 'doksi 3');
  const h3 = git('rev-parse', 'HEAD');
  const ev = evidenceDir([{ head: reviewed, verdict: 'IGEN', at: '2026-11-24T08:00:00Z' }, { head: h2, verdict: 'NEM', at: '2026-11-24T09:00:00Z' }]);
  assert.equal(transferReviewEvidence({ evDir: ev, head: h3, base: 'main', exec: realExec, cwd: dir }), null);
  const blind = evidenceDir([{ head: reviewed, verdict: 'IGEN', at: '2026-11-24T08:00:00Z', reviewer: 'local-review' }, { head: h2, verdict: 'IGEN, FELTÉTELLEL', at: '2026-11-24T07:00:00Z', reviewer: 'blind-review' }]);
  const got = transferReviewEvidence({ evDir: blind, head: h3, base: 'main', exec: realExec, cwd: dir, accept: (e) => e.reviewer === 'blind-review' });
  assert.equal(got?.transferredFrom, h2, 'a kapu feltételét nem teljesítő (újabb) rekord után a megfelelőt találja');
});

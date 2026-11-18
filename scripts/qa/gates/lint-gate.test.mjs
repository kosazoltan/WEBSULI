// docs/specs/2026-11-17-minosegkapuk.md E1–E3: a lint kapu lépései és a tiltott minták.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS } from './lib.mjs';
import { applyRepoRules, classifyHookOutput, runLintSteps, scanAddedLines } from './lint-gate.mjs';
import { fakeCtx, statusOf } from './_fake.mjs';

// A minták futásidőben, darabokból — a saját kapunk ne bukjon a tesztfájl szövegén.
const dot = '.';
const ONLY = `it${dot}only(`;
const SKIP = `describe${dot}skip(`;
const NOVERIFY = `git commit --no-${'verify'} -m x`;
const PK = `-----BEGIN RSA PRIVATE ${'KEY'}-----`;
const AWS = `AKIA${'QWERTYUIOP123456'}`;
const GH = `ghp_${'abcDEF123456'.repeat(3)}`;
const at = '@';
const DB_REMOTE = `postgres://u:jelszo99${at}ep-valami.neon.tech/db`;
const DB_LOCAL = `postgres://postgres:postgres${at}127.0.0.1:5432/websuli`;
const DB_TEMPLATE = `postgresql://postgres:\${password}${at}\${address}/x`;

const L = (file, text, line = 1) => ({ file, line, text });

test('scanAddedLines: .only / .skip csak tesztfájlban bukás, érték nélküli lelettel', () => {
  const f = scanAddedLines([L('source/tests/a.test.ts', `  ${ONLY}"x", () => {});`, 7), L('source/tests/b.spec.ts', `test.${SKIP}"y")`), L('source/server/a.ts', ONLY)]);
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => `${x.file}:${x.line}`), ['source/tests/a.test.ts:7', 'source/tests/b.spec.ts:1']);
  assert.ok(f.every((x) => x.level === STATUS.FAIL && !x.rule.includes('"x"')));
  const opt = scanAddedLines([L('source/tests/c.test.ts', `test("z", { ${'only'}: true }, () => {})`), L('source/tests/d.test.ts', 'test("z", { skip: process.platform !== "win32" }, () => {})')]);
  assert.deepEqual(opt.map((x) => x.file), ['source/tests/c.test.ts'], 'a feltételes skip megengedett, a literális only: true nem');
});

test('scanAddedLines: --no-verify szkriptben bukás, doksiban és tesztben nem', () => {
  const f = scanAddedLines([L('scripts/x.sh', NOVERIFY), L('source/package.json', `"p": "${NOVERIFY}"`), L('.github/workflows/ci.yml', NOVERIFY),
    L('docs/x.md', NOVERIFY), L('scripts/qa/x.test.mjs', NOVERIFY), L('source/server/x.ts', NOVERIFY)]);
  assert.deepEqual(f.map((x) => x.file).sort(), ['.github/workflows/ci.yml', 'scripts/x.sh', 'source/package.json']);
});

test('scanAddedLines: titok-minták bárhol bukás; loopback / sablon adatbázis-URL nem', () => {
  const f = scanAddedLines([L('a.ts', PK), L('b.ts', `const k = "${AWS}"`), L('c.md', GH), L('d.ts', DB_REMOTE), L('e.yml', DB_LOCAL), L('f.ts', DB_TEMPLATE)]);
  assert.deepEqual(f.map((x) => x.file), ['a.ts', 'b.ts', 'c.md', 'd.ts']);
  assert.ok(f.every((x) => !x.rule.includes('jelszo99') && !x.rule.includes(AWS)));
});

test('classifyHookOutput / applyRepoRules: a hook figyelmeztetése WARN, a deny FAIL; csak az Edit|Write szabályok', () => {
  assert.equal(classifyHookOutput(''), null);
  assert.equal(classifyHookOutput('nem json kimenet').level, STATUS.WARN, 'kanban #100: értelmezhetetlen kimenet nem nyelhető el');
  assert.equal(classifyHookOutput(JSON.stringify({ systemMessage: '[agentic-qa-kit] REPO-SZABÁLY figyelmeztetés: kódinjekció-kockázat' })).level, STATUS.WARN);
  assert.equal(classifyHookOutput(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'x' } })).level, STATUS.FAIL);
  const rules = [{ tool: 'Bash|PowerShell', pattern: 'x', level: 'deny' }, { tool: 'Edit|Write', pattern: 'tilos', level: 'deny', message: 'm' }, { tool: 'Edit|Write', pattern: 'gyanus', level: 'warn' }];
  assert.deepEqual(applyRepoRules(rules, 'ez tilos és gyanus').map((h) => h.level), [STATUS.FAIL, STATUS.WARN]);
});

test('runLintSteps --fast: a változott lintelhető fájlra fut ESLint, a teljes lint nem; ESLint-bukás → FAIL', async () => {
  const { ctx, calls, gate } = fakeCtx({
    changed: ['source/server/x.ts', 'docs/a.md'],
    respond: (cmd, args) => (cmd === 'node' && args[0].endsWith('eslint.js') ? { code: 1, stdout: 'x.ts 1:1 error' } : undefined),
  });
  await runLintSteps({ gate, ctx, mode: 'fast' });
  assert.equal(statusOf(gate, 'ESLint'), STATUS.FAIL);
  assert.ok(!calls.some((c) => c.cmd === 'npm' && c.args.join(' ') === 'run lint'), 'gyors módban nincs teljes lint');
  assert.ok(calls.some((c) => c.cmd === 'npm' && c.args.join(' ') === 'run check'), 'változott .ts → tsc');
  assert.equal(statusOf(gate, 'npm run check:test'), STATUS.SKIP);
  const eslint = calls.find((c) => c.cmd === 'node' && c.args[0].endsWith('eslint.js'));
  assert.deepEqual(eslint.args.slice(1), ['--max-warnings', '0', 'server/x.ts']);
  assert.equal(gate.finish(), 1);
});

test('runLintSteps --full: minden lépés külön fut (diff --check, teljes lint, két tsc, e-mail-őr)', async () => {
  const { ctx, calls, gate } = fakeCtx({ changed: ['docs/a.md'] });
  await runLintSteps({ gate, ctx, mode: 'full' });
  const npm = calls.filter((c) => c.cmd === 'npm').map((c) => c.args.join(' '));
  assert.deepEqual(npm, ['run lint', 'run check', 'run check:test']);
  assert.ok(calls.some((c) => c.cmd === 'node' && c.args.includes('tests/no-real-emails-guard.test.ts')));
  assert.equal(statusOf(gate, 'ESLint'), STATUS.SKIP);
  assert.equal(statusOf(gate, 'git diff --check'), STATUS.PASS);
  assert.equal(gate.finish(), 0);
});

test('runLintSteps: whitespace-hiba és tiltott minta a diffben → FAIL; nem követett fájl → WARN', async () => {
  const diff = ['+++ b/source/tests/x.test.ts', '@@ -0,0 +1 @@', `+${ONLY}"x")`].join('\n');
  const { ctx, gate } = fakeCtx({ changed: ['source/tests/x.test.ts'], diffCheck: 1, diff, untracked: ['uj.txt'] });
  await runLintSteps({ gate, ctx, mode: 'fast' });
  assert.equal(statusOf(gate, 'git diff --check'), STATUS.FAIL);
  assert.equal(statusOf(gate, 'tiltott minták'), STATUS.FAIL);
  assert.equal(statusOf(gate, 'nem követett'), STATUS.WARN);
});

// docs/specs/2026-11-17-minosegkapuk.md E10–E12: a minőségkapu-hook munkafában és a fő checkoutban, valódi git-repóval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAction, findActions, splitSegments } from './check-quality-gates.mjs';

const hook = fileURLToPath(new URL('./check-quality-gates.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Teszt', '-c', `user.email=teszt${'@'}pelda.hu`, ...args], { cwd, encoding: 'utf8' }).trim();

function makeRepo() {
  const main = mkdtempSync(join(tmpdir(), 'qg-main-'));
  git(main, 'init', '-q', '-b', 'main');
  mkdirSync(join(main, 'scripts', 'qa', 'gates'), { recursive: true });
  writeFileSync(join(main, 'scripts', 'qa', 'gates', 'pre-push-gate.mjs'), '// jelző\n');
  writeFileSync(join(main, 'scripts', 'qa', 'gates', 'gates.config.json'), '{"mergeEvidenceMaxMinutes":15}\n');
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'init');
  const wt = join(main, '.claude', 'worktrees', 'szelet');
  git(main, 'worktree', 'add', '-q', '-b', 'szelet', wt);
  writeFileSync(join(wt, 'x.txt'), 'x\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'szelet');
  const common = join(main, '.git');
  return { main, wt, ev: join(common, 'websuli-qa-evidence'), headMain: git(main, 'rev-parse', 'HEAD'), headWt: git(wt, 'rev-parse', 'HEAD') };
}

function writeEv(ev, name, obj) {
  mkdirSync(ev, { recursive: true });
  writeFileSync(join(ev, `${name}.json`), JSON.stringify(obj));
}

const runHook = (command, cwd, tool = 'Bash') => {
  const env = { ...process.env };
  delete env.WEBSULI_QA_EVIDENCE_DIR;
  const out = execFileSync(process.execPath, [hook], { input: JSON.stringify({ tool_name: tool, tool_input: { command }, cwd }), encoding: 'utf8', env });
  return out ? JSON.parse(out) : null;
};
const denied = (r) => r?.hookSpecificOutput?.permissionDecision === 'deny';

test('splitSegments / findActions: idézett „git push” nem számít; cd és -C követése; törlés és dry-run kivétel', () => {
  assert.deepEqual(splitSegments('echo "git push" && git status'), [['echo', 'git push'], ['git', 'status']]);
  assert.deepEqual(findActions('echo "git push origin x"', '/r'), []);
  assert.deepEqual(findActions('git commit -F m.txt -m "git push"', '/r'), []);
  const a = findActions('cd /tmp/a && git -C sub push -u origin feat/x', '/r');
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'push');
  assert.deepEqual(a[0].refs, ['feat/x']);
  assert.ok(a[0].dir.replace(/\\/g, '/').endsWith('/a/sub'));
  for (const c of ['git push origin --delete feat/x', 'git push origin :feat/x', 'git push -d origin feat/x', 'git push --dry-run']) assert.equal(findActions(c, '/r')[0].skip, true, c);
  assert.equal(findActions('GIT_TRACE=1 git push', '/r')[0].skip, false);
  assert.deepEqual(findActions('gh pr merge 482 --squash', '/r').map((x) => [x.kind, x.pr]), [['pr-merge', '482']]);
  assert.deepEqual(findActions('gh pr create --title x --body-file b.md', '/r').map((x) => x.kind), ['pr-create']);
  assert.deepEqual(findActions('gh pr view 5; gh pr merge --disable-auto 5', '/r'), []);
});

test('review-javítások: burkolók, beágyazott shell, vegyes törlés, több ref, értékes kapcsolók, --all, --auto, gh api merge', () => {
  const kinds = (c) => findActions(c, '/r').map((x) => x.kind);
  for (const c of ['env git push', 'sudo git push', 'command git push', '& git push', "& 'C:/Program Files/Git/cmd/git.exe' push", '(git push)', '{ git push; }',
    'bash -c "git push origin x"', 'powershell -NoProfile -Command "git push"', 'time git push', 'GIT_TRACE=1 env git push']) {
    assert.deepEqual(kinds(c), ['push'], c);
  }
  const mixed = findActions('git push origin feat/a :torolt', '/r')[0];
  assert.equal(mixed.skip, false, 'vegyes push + törlés nem vizsgálat nélküli');
  assert.deepEqual(mixed.refs, ['feat/a']);
  assert.deepEqual(findActions('git push origin feat/a feat/b', '/r')[0].refs, ['feat/a', 'feat/b']);
  assert.deepEqual(findActions('git push -o ci.skip origin feat/c', '/r')[0].refs, ['feat/c'], 'a -o értéke nem remote');
  assert.equal(findActions('git push origin :a :b', '/r')[0].skip, true);
  assert.deepEqual(kinds('git push --all origin'), ['deny']);
  assert.deepEqual(kinds('git push --dry-run --all origin'), []);
  assert.deepEqual(kinds('git --git-dir=/x/.git push'), ['deny']);
  assert.deepEqual(kinds('gh pr merge 5 --auto --squash'), ['deny']);
  assert.deepEqual(kinds('powershell -EncodedCommand ZwBpAHQA'), ['deny']);
  const api = findActions('gh api -X PUT repos/kosazoltan/WEBSULI/pulls/9/merge', '/r')[0];
  assert.deepEqual([api.kind, api.pr, api.repoFlag], ['pr-merge', '9', 'kosazoltan/WEBSULI']);
});

test('review J1: WEBSULI-n kívüli mappából -R …/WEBSULI → DENY; más repóra nincs kimenet', () => {
  const other = mkdtempSync(join(tmpdir(), 'qg-kivul-'));
  assert.ok(denied(runHook('gh pr merge 5 -R kosazoltan/WEBSULI --squash', other)));
  assert.ok(denied(runHook('gh pr create -R kosazoltan/WEBSULI --title t', other)));
  assert.equal(runHook('gh pr create -R valaki/mas-repo --title t', other), null);
});

test('git push: bizonyíték nélkül DENY magyar teendővel; zöld pre-push bizonyítékkal enged — munkafából ÉS a fő checkoutból', () => {
  const r = makeRepo();
  const d1 = runHook('git push -u origin szelet', r.wt);
  assert.ok(denied(d1));
  assert.match(d1.hookSpecificOutput.permissionDecisionReason, /npm run gate:push/);
  writeEv(r.ev, `pre-push-${r.headWt}`, { ok: true, at: new Date().toISOString() });
  assert.equal(runHook('git push -u origin szelet', r.wt), null, 'munkafából enged');
  assert.equal(runHook(`git -C "${r.wt}" push origin szelet`, r.main), null, 'a fő checkoutból -C-vel is ugyanazt a bizonyítékot látja');
  assert.equal(runHook(`cd "${r.wt}" && git push`, r.main, 'PowerShell'), null, 'cd + push, PowerShell');
  assert.ok(denied(runHook('git push origin main', r.main)), 'a fő checkout saját feje más commit — nincs rá bizonyíték');
  assert.equal(runHook('git push origin szelet', r.main), null, 'a megnevezett ág fejére szóló bizonyíték számít');
});

test('git push: bukott bizonyíték DENY; pre-pr bizonyíték is elég; törlés / dry-run vizsgálat nélkül enged', () => {
  const r = makeRepo();
  writeEv(r.ev, `pre-push-${r.headWt}`, { ok: false, at: '2026-11-17T08:00:00Z' });
  const d = runHook('git push', r.wt);
  assert.ok(denied(d));
  assert.match(d.hookSpecificOutput.permissionDecisionReason, /BUKOTT/);
  writeEv(r.ev, `pre-pr-${r.headWt}`, { ok: true, at: new Date().toISOString() });
  assert.equal(runHook('git push', r.wt), null);
  const r2 = makeRepo();
  assert.equal(runHook('git push origin --delete szelet', r2.wt), null);
  assert.equal(runHook('git push --dry-run origin szelet', r2.wt), null);
});

test('gh pr create: zöld pre-pr nélkül DENY (a pre-push nem elég)', () => {
  const r = makeRepo();
  writeEv(r.ev, `pre-push-${r.headWt}`, { ok: true, at: new Date().toISOString() });
  const d = runHook('gh pr create --title t --body-file b.md', r.wt);
  assert.ok(denied(d));
  assert.match(d.hookSpecificOutput.permissionDecisionReason, /npm run gate:pr/);
  writeEv(r.ev, `pre-pr-${r.headWt}`, { ok: true, at: new Date().toISOString() });
  assert.equal(runHook('gh pr create --title t --body-file b.md', r.wt), null);
});

test('gh pr merge: a PR jelenlegi fejére szóló, ≤ 15 perces zöld merge-bizonyíték kell; gh-hiba DENY', () => {
  const r = makeRepo();
  const head = 'd'.repeat(40);
  const view = () => ({ number: 7, headRefOid: head });
  const a = { kind: 'pr-merge', dir: r.wt, pr: '7', target: '7' };
  const now = Date.parse('2026-11-17T10:00:00Z');
  assert.match(checkAction(a, { now, ghView: view }), /npm run gate:merge -- 7/);
  writeEv(r.ev, `merge-7-${head}`, { ok: true, at: '2026-11-17T09:50:00Z' });
  assert.equal(checkAction(a, { now, ghView: view }), null);
  assert.match(checkAction(a, { now: now + 6 * 60000, ghView: view }), /16 perces/);
  assert.match(checkAction(a, { now, ghView: () => ({ number: 7, headRefOid: 'e'.repeat(40) }) }), /jelenlegi fejére/, 'új push után a régi bizonyíték nem érvényes');
  assert.match(checkAction(a, { now, ghView: () => null }), /nem olvasható/);
});

test('más repó (kapu-szkript nélkül) és nem kibocsátó parancs: nincs kimenet', () => {
  const other = mkdtempSync(join(tmpdir(), 'qg-other-'));
  git(other, 'init', '-q');
  writeFileSync(join(other, 'a.txt'), 'a');
  git(other, 'add', '-A');
  git(other, 'commit', '-q', '-m', 'a');
  assert.equal(runHook('git push origin main', other), null);
  const r = makeRepo();
  assert.equal(runHook('git status && npm test', r.wt), null);
  assert.equal(runHook('git push', r.wt, 'Edit'), null, 'csak Bash / PowerShell');
});

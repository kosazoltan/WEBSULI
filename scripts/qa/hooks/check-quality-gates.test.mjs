// docs/specs/2026-11-17-minosegkapuk.md E10–E12 + a #489 bot-leletei: a minőségkapu-hook FAIL-CLOSED — a kapu-köteles művelet csak
// önálló, egyszerű, ismert alakú parancsként mehet át; minden más alak (láncolás, burkoló, könyvtárváltás, ismeretlen kapcsoló) DENY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAction, detectGated, planCommand, tokenizeSimple } from './check-quality-gates.mjs';

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
  git(main, 'branch', 'masik', 'main');
  return { main, wt, ev: join(main, '.git', 'websuli-qa-evidence'), headMain: git(main, 'rev-parse', 'HEAD'), headWt: git(wt, 'rev-parse', 'HEAD') };
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
const kind = (c) => planCommand(c).kind;

test('nem kapu-köteles parancs: nincs terv (útvonal / névrész / idézett szöveg egyszerű parancsban nem számít)', () => {
  for (const c of ['git status', 'git log -- scripts/qa/gates/pre-push-gate.mjs', 'npm run gate:push', 'git commit -m "push fix"',
    'node scripts/qa/gates/pre-push-gate.mjs', 'gh pr view 5', 'gh pr checks 489', 'gh api repos/o/r/pulls/5', 'echo kész', 'git -C x status']) {
    assert.equal(kind(c), 'none', c);
  }
  assert.equal(detectGated('cat .git/websuli-qa-evidence/pre-push-x.json'), false);
  // Z2: önálló, nem futtató eszközben az idézett „git push” szöveg nem számít (láncolva viszont fail-closed DENY).
  for (const c of ['echo "git push"', 'grep -rn "git push" docs', 'rg "gh pr merge" scripts']) assert.equal(kind(c), 'none', c);
  assert.equal(kind('echo "git push" && true'), 'deny');
  // Z1: útvonallal megadott gh.
  for (const c of ['/usr/bin/gh pr merge 5 --squash', '"/c/Program Files/GitHub CLI/gh.exe" pr merge 5 --squash', 'iex "git push"']) assert.equal(kind(c), 'deny', c);
});

test('a #489 öt bot-forgatókönyve: mind DENY', () => {
  const cases = {
    'Codex P1 (lánc: commit + push)': 'git add . && git commit -m x && git push origin HEAD',
    'Vercel (env -C)': 'env -C /d/repo/WEBSULI/.claude/worktrees/szelet git push origin szelet',
    'Vercel (matching refspec :)': 'git push origin :',
    'Vercel (+:)': 'git push origin +:',
    'Codex P2 (--repo origin unchecked)': 'git push --repo origin unchecked',
  };
  for (const [name, c] of Object.entries(cases)) assert.equal(kind(c), 'deny', name);
  // Codex P2 (gh --subject): az értékes kapcsoló értéke már nem cél — a valódi cél a #8, annak merge-bizonyítéka kell.
  assert.deepEqual(planCommand('gh pr merge --squash --subject 7 8'), { kind: 'pr-merge', target: '8', repoFlag: null });
});

test('megkerülési családok: láncolás, alshell, átirányítás, burkoló, könyvtárváltás, git-globális kapcsoló, PowerShell — mind DENY', () => {
  for (const c of [
    'cd /d/repo/x && git push', 'git push; echo x', 'git push | tail', 'git push 2>&1', 'git push > log', 'git push &', 'true || git push',
    'git push\necho', '(git push)', '{ git push; }', 'bash -c "git push"', 'sh -c \'git push\'', 'env git push', 'sudo git push', 'GIT_DIR=x git push',
    'git -C /d/x push', 'git -c core.x=y push', 'git --git-dir=/x/.git push', 'git --work-tree=x push', 'pushd x && git push', 'echo $(git push)',
    'echo `git push`', 'x=$(git rev-parse HEAD) && git push origin x', '& git push', "& 'C:/Program Files/Git/cmd/git.exe' push",
    'Set-Location D:\\x; git push', 'Push-Location x; git push', 'Start-Process git -ArgumentList push', 'cmd /c git push', 'powershell -c "git push"',
    'iex "git push"', 'C:/Program Files/Git/cmd/git.exe push',
    'gh pr merge 5 && echo kész', 'gh -R kosazoltan/WEBSULI pr merge 5', 'gh api -X PUT repos/o/WEBSULI/pulls/9/merge', 'gh pr merge 5 --auto',
  ]) assert.equal(kind(c), 'deny', JSON.stringify(c));
});

test('git push whitelist: engedett alakok, minden más DENY; a törlés csak --delete alakban', () => {
  assert.deepEqual(planCommand('git push'), { kind: 'push', remote: null, ref: null, upstream: false });
  assert.deepEqual(planCommand('git push origin'), { kind: 'push', remote: 'origin', ref: null, upstream: false });
  assert.deepEqual(planCommand('git push -u origin feat/x'), { kind: 'push', remote: 'origin', ref: 'feat/x', upstream: true });
  assert.deepEqual(planCommand('git push origin HEAD'), { kind: 'push', remote: 'origin', ref: null, upstream: false });
  assert.deepEqual(planCommand('git push origin HEAD:feat/x'), { kind: 'push', remote: 'origin', ref: null, sameAsCurrent: 'feat/x', upstream: false });
  assert.equal(kind('git push origin --delete feat/x'), 'push-delete');
  assert.equal(kind('git push --delete origin feat/x'), 'push-delete');
  for (const c of ['git push origin :feat/x', 'git push -d origin feat/x', 'git push --all origin', 'git push --mirror', 'git push --tags', 'git push origin a b',
    'git push --force origin x', 'git push -f', 'git push --force-with-lease origin x', 'git push origin +x', 'git push --signed origin x', 'git push -o ci.skip origin x',
    'git push origin x:y', 'git push origin --delete a b', 'git push --dry-run']) {
    assert.equal(kind(c), 'deny', c);
  }
  assert.match(planCommand('git push origin :feat/x').reason, /--delete/);
  assert.match(planCommand('git push --force origin x').reason, /force-push/);
});

test('gh pr merge / create: ismert értékes kapcsolók; a cél egyértelmű szám / URL / ág, különben DENY', () => {
  assert.deepEqual(planCommand('gh pr merge 482 --squash'), { kind: 'pr-merge', target: '482', repoFlag: null });
  assert.deepEqual(planCommand('gh pr merge --squash --subject "7" 8'), { kind: 'pr-merge', target: '8', repoFlag: null });
  assert.deepEqual(planCommand('gh pr merge --squash --body-file b.md -R kosazoltan/WEBSULI #9'), { kind: 'pr-merge', target: '9', repoFlag: 'kosazoltan/WEBSULI' });
  assert.deepEqual(planCommand('gh pr merge --squash'), { kind: 'pr-merge', target: null, repoFlag: null });
  assert.equal(planCommand('gh pr merge https://github.com/kosazoltan/WEBSULI/pull/7 --squash').target, 'https://github.com/kosazoltan/WEBSULI/pull/7');
  assert.equal(kind('gh pr merge --disable-auto 5'), 'none');
  for (const c of ['gh pr merge 5 6', 'gh pr merge --ismeretlen 5', 'gh pr merge --subject', 'gh pr merge 5 --auto']) assert.equal(kind(c), 'deny', c);
  assert.deepEqual(planCommand('gh pr create --title "a b" --body-file b.md --base main'), { kind: 'pr-create', ref: null, repoFlag: null });
  assert.equal(planCommand('gh pr create --head feat/x --title t --body-file b.md').ref, 'feat/x');
  assert.equal(kind('gh pr create --title t --body "x `y`"'), 'deny', 'backtick a leírásban → --body-file');
  assert.equal(kind('gh pr create --ismeretlen'), 'deny');
});

test('tokenizeSimple: idézett szöveg egy szó; az egyszeres idézőjelben minden szó szerinti; lezáratlan idézőjel → nem egyszerű', () => {
  assert.deepEqual(tokenizeSimple('gh pr create --title "a; b && c"').words, ['gh', 'pr', 'create', '--title', 'a; b && c']);
  assert.deepEqual(tokenizeSimple("gh pr create --title '$(x) `y`'").words, ['gh', 'pr', 'create', '--title', '$(x) `y`']);
  assert.equal(tokenizeSimple('git push "x').ok, false);
});

test('valódi repó: a kimenő commitra szóló bizonyíték kell (munkafa és fő checkout ugyanazt a közös tárat látja)', () => {
  const r = makeRepo();
  assert.ok(denied(runHook('git push -u origin szelet', r.wt)));
  assert.match(runHook('git push -u origin szelet', r.wt).hookSpecificOutput.permissionDecisionReason, /npm run gate:push/);
  writeEv(r.ev, `pre-push-${r.headWt}`, { ok: true, at: new Date().toISOString() });
  assert.equal(runHook('git push -u origin szelet', r.wt), null, 'munkafából, a munkafa ágával');
  assert.equal(runHook('git push origin szelet', r.main, 'PowerShell'), null, 'a fő checkoutból: a megnevezett ág (nem a HEAD) kimenő commitja számít');
  assert.ok(denied(runHook('git push origin masik', r.main)), 'a másik ág fejére nincs bizonyíték');
  assert.ok(denied(runHook('git push', r.main)), 'a fő checkout HEAD-je más commit');
  assert.equal(runHook('git push origin HEAD:szelet', r.wt), null);
  assert.ok(denied(runHook('git push origin HEAD:masik', r.wt)), 'HEAD más ágra');
  assert.ok(denied(runHook(`cd "${r.wt}" && git push`, r.main)), 'lánc + cd: DENY akkor is, ha a bizonyíték megvan');
  assert.ok(denied(runHook(`git -C "${r.wt}" push origin szelet`, r.main)), '-C: DENY');
  assert.equal(runHook('git push origin --delete szelet', r.wt), null, 'távoli törlés kapu nélkül');
});

test('valódi repó: bukott bizonyíték DENY; pre-pr bizonyíték a pushhoz is elég; gh pr create csak pre-pr-rel', () => {
  const r = makeRepo();
  writeEv(r.ev, `pre-push-${r.headWt}`, { ok: false, at: '2026-11-17T08:00:00Z' });
  assert.match(runHook('git push', r.wt).hookSpecificOutput.permissionDecisionReason, /BUKOTT/);
  assert.ok(denied(runHook('gh pr create --title t --body-file b.md', r.wt)));
  writeEv(r.ev, `pre-pr-${r.headWt}`, { ok: true, at: new Date().toISOString() });
  assert.equal(runHook('git push', r.wt), null);
  assert.equal(runHook('gh pr create --title t --body-file b.md', r.wt), null);
});

test('gh pr merge: a PR jelenlegi fejére szóló, ≤ 15 perces zöld merge-bizonyíték kell; gh-hiba DENY', () => {
  const r = makeRepo();
  const head = 'd'.repeat(40);
  const view = () => ({ number: 7, headRefOid: head });
  const plan = { kind: 'pr-merge', target: '7', repoFlag: null };
  const now = Date.parse('2026-11-17T10:00:00Z');
  assert.match(checkAction(plan, r.wt, { now, ghView: view }), /npm run gate:merge -- 7/);
  writeEv(r.ev, `merge-7-${head}`, { ok: true, at: '2026-11-17T09:50:00Z' });
  assert.equal(checkAction(plan, r.wt, { now, ghView: view }), null);
  assert.match(checkAction(plan, r.wt, { now: now + 6 * 60000, ghView: view }), /16 perces/);
  assert.match(checkAction(plan, r.wt, { now, ghView: () => ({ number: 7, headRefOid: 'e'.repeat(40) }) }), /jelenlegi fejére/);
  assert.match(checkAction(plan, r.wt, { now, ghView: () => null }), /nem olvasható/);
});

test('más repó: nincs kimenet (láncolva sem) — kivéve, ha a parancs a WEBSULI-ra mutat', () => {
  const other = mkdtempSync(join(tmpdir(), 'qg-other-'));
  git(other, 'init', '-q');
  writeFileSync(join(other, 'a.txt'), 'a');
  git(other, 'add', '-A');
  git(other, 'commit', '-q', '-m', 'a');
  assert.equal(runHook('git push origin main', other), null);
  assert.equal(runHook('git add . && git commit -m x && git push', other), null);
  assert.ok(denied(runHook('gh pr merge 5 -R kosazoltan/WEBSULI --squash', other)));
  assert.ok(denied(runHook('cd /d/repo/WEBSULI && git push', other)));
  assert.equal(runHook('git push', other, 'Edit'), null, 'csak Bash / PowerShell');
});

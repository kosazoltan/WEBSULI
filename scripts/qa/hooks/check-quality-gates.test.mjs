// docs/specs/2026-11-17-minosegkapuk.md E10–E12 + a #489 bot-leletei: a minőségkapu-hook FAIL-CLOSED — a kapu-köteles művelet csak
// önálló, egyszerű, ismert alakú parancsként mehet át; minden más alak (láncolás, burkoló, könyvtárváltás, ismeretlen kapcsoló) DENY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAction, detectGated, planCommand, tokenizeSimple } from './check-quality-gates.mjs';

// A8: a közvetlen checkAction-hívások is a közös bizonyíték-könyvtárat olvassák — a futtató környezetének változója ne számítson.
delete process.env.WEBSULI_QA_EVIDENCE_DIR;

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
  // Kanban #100: a valódi gites eseteknél hosszabb, a géptől független korlát (csak node --test alatt érvényes, lásd testOverride).
  Object.assign(env, { WEBSULI_HOOK_GIT_TIMEOUT_MS: '120000', WEBSULI_HOOK_GH_TIMEOUT_MS: '120000', WEBSULI_HOOK_BUDGET_MS: '600000' });
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
  // AA1: engedő lista — minden futtató / ismeretlen eszköz (.exe-vel, útvonallal is) DENY, ha kapu-köteles szöveget kap.
  for (const c of ['powershell.exe -Command "git push origin other2"', 'pwsh.exe -c "git push"', 'bash.exe -c "git push"', 'cmd.exe /c "git push"',
    '"C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" -c "git push"', 'node.exe -e "require(\'child_process\').execSync(\'git push\')"',
    'python3.12 -c "import os; os.system(\'git push\')"', 'perl -e "system(\'git push\')"', 'ruby -e "system(\'git push\')"', 'ssh localhost "git push"',
    '/usr/bin/echo "git push"']) assert.equal(kind(c), 'deny', c);
  for (const c of ['Write-Output "git push"', 'Select-String -Pattern "git push" docs/x.md', 'findstr "gh pr merge" x.md', 'echo.exe "git push"']) assert.equal(kind(c), 'none', c);
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
  // SPEC-VÁLTOZÁS (docs/specs/2026-11-17-kulso-ellenor.md 11.3, kanban #100, 4. kör): a szó eleji `#9` a héjban megjegyzés — a
  // korábbi elvárás (cél = 9) a héjjal ellentétes volt (a héj cél nélkül, az aktuális ág PR-ját vonná össze); most érthető tiltás.
  assert.equal(planCommand('gh pr merge --squash --body-file b.md -R kosazoltan/WEBSULI #9').kind, 'deny');
  assert.deepEqual(planCommand('gh pr merge --squash --body-file b.md -R kosazoltan/WEBSULI 9'), { kind: 'pr-merge', target: '9', repoFlag: 'kosazoltan/WEBSULI' });
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

// ---- Kanban #100: fail-closed időtúllépéskor (befecskendezett futtatóval, a gép sebességétől függetlenül) ------------------------
import { makeRunner, noAnswer, NoAnswerError } from './check-quality-gates.mjs';
const errOf = (props) => Object.assign(new Error('x'), props);
const cfgFast = { gitMs: 10_000, ghMs: 15_000, budgetMs: 45_000 };

test('noAnswer: időtúllépés / jelzés / indítási hiba igen; gyors, nem nulla kilépés nem', () => {
  for (const e of [errOf({ code: 'ETIMEDOUT', status: null, signal: 'SIGTERM' }), errOf({ killed: true, status: null }), errOf({ signal: 'SIGKILL', status: null }),
    errOf({ code: 'ENOENT' }), errOf({ code: 'EPERM' })]) assert.equal(noAnswer(e), true, JSON.stringify(e));
  assert.equal(noAnswer(errOf({ status: 128, signal: null })), false);
});

test('időtúllépő / indítási hibás git → DENY (NoAnswerError), nem „más repó”', () => {
  const plan = { kind: 'push', remote: 'origin', ref: null, upstream: false };
  for (const e of [errOf({ code: 'ETIMEDOUT', status: null, signal: 'SIGTERM' }), errOf({ code: 'ENOENT' })]) {
    const run = makeRunner({ exec: () => { throw e; }, cfg: cfgFast });
    assert.throws(() => checkAction(plan, '/x/mas-mappa', { run, raw: 'git push' }), NoAnswerError);
  }
});

test('valódi „nem git-repó” (gyors, nem nulla kilépés) → más repó, nincs tiltás; WEBSULI-utalású mappában → DENY', () => {
  const plan = { kind: 'push', remote: 'origin', ref: null, upstream: false };
  const run = makeRunner({ exec: () => { throw errOf({ status: 128, signal: null }); }, cfg: cfgFast });
  assert.equal(checkAction(plan, '/x/mas-mappa', { run, raw: 'git push' }), null);
  assert.throws(() => checkAction(plan, 'D:/repo/WEBSULI/.claude/worktrees/x', { run, raw: 'git push' }), NoAnswerError);
});

test('a keret kimerülése → DENY, mielőtt a Claude Code hook-időkorlátja lejárna', () => {
  let t = 0;
  const run = makeRunner({ exec: () => { t += 50_000; return '/r'; }, now: () => t, cfg: cfgFast });
  assert.equal(run('git', ['rev-parse'], '.'), '/r');
  assert.throws(() => run('git', ['rev-parse'], '.'), NoAnswerError);
});

test('a futtató a konfigurált korláttal hív (git 10 s, gh 15 s), a maradék kerettel felülről korlátozva', () => {
  const seen = [];
  const run = makeRunner({ exec: (f, a, o) => { seen.push([f, o.timeout]); return ''; }, now: () => 0, cfg: cfgFast });
  run('git', [], '.');
  run('gh', [], '.', 'gh');
  assert.deepEqual(seen, [['git', 10_000], ['gh', 15_000]]);
});

test('kanban #100: értelmező + szkriptfájl idézett „push” szöveggel nem kapu-köteles; a lánc és a kiértékelés tilt', () => {
  assert.equal(kind('node kanban.mjs note 5 "a kiadást a git push után ellenőrizd"'), 'none');
  assert.equal(kind('node D:/x/scripts/kanban.mjs note 5 "gh pr merge 9 után"'), 'none');
  assert.equal(kind('echo x && git push'), 'deny');
  assert.equal(kind('node -e "require(\'child_process\').execSync(\'git push\')"'), 'deny');
  assert.equal(kind('node kanban.mjs note 5 "x" && git push'), 'deny');
  assert.equal(kind('python3 -c "import os; os.system(\'git push\')"'), 'deny');
  assert.equal(kind('node kanban.mjs git push'), 'deny', 'nem idézett git push szavak → tilt');
});

test('a tesztes korlát-felülírás csak node --test alatt él; éles futásban a konfig (≤ 45 s keret) számít', () => {
  const hookUrl = new URL('./check-quality-gates.mjs', import.meta.url).href;
  const env = { ...process.env, WEBSULI_HOOK_BUDGET_MS: '600000' };
  delete env.NODE_TEST_CONTEXT;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(hookUrl)}).then((m) => console.log(m.hookConfig().budgetMs))`], { env, encoding: 'utf8' });
  assert.equal(Number(out.trim()), 45000);
  assert.ok(process.env.NODE_TEST_CONTEXT, 'a teszt-futtató beállítja a NODE_TEST_CONTEXT-et');
});

// ---- Kanban #100, 2. kör (docs/specs/2026-11-17-kulso-ellenor.md 11.1, H3–H5) --------------------------------------------

test('H3: git nélküli PATH (indítási hiba) → a hook FOLYAMATA tilt (a main() catch-e a NoAnswerError-t tiltássá alakítja)', () => {
  const { wt } = makeRepo();
  const empty = mkdtempSync(join(tmpdir(), 'qg-ures-path-'));
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^path$/i.test(k)) delete env[k];
  env.PATH = empty; // a node abszolút útvonalon indul, a hook a git-et a PATH-on keresné → ENOENT
  const out = execFileSync(process.execPath, [hook], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: wt }), encoding: 'utf8', env });
  const r = JSON.parse(out);
  assert.ok(denied(r), out);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /nem válaszolt|nem állapítható meg/);
});

test('H4: a tesztes felülírás felső korlátja 55 s (git, gh és a teljes keret is)', () => {
  const hookUrl = new URL('./check-quality-gates.mjs', import.meta.url).href;
  const env = { ...process.env, NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT || 'child-v8', WEBSULI_HOOK_GIT_TIMEOUT_MS: '600000', WEBSULI_HOOK_GH_TIMEOUT_MS: '600000', WEBSULI_HOOK_BUDGET_MS: '600000' };
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(hookUrl)}).then((m) => console.log(JSON.stringify(m.hookConfig())))`], { env, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out.trim()), { gitMs: 55_000, ghMs: 55_000, budgetMs: 55_000 });
});

test('a hívás korlátja a maradék kerettel felülről korlátozott (40 s után 4,5 s marad)', () => {
  let t = 0;
  const seen = [];
  const run = makeRunner({ exec: (f, a, o) => { seen.push(o.timeout); return ''; }, now: () => t, cfg: cfgFast });
  t = 40_000;
  run('git', [], '.');
  run('gh', [], '.', 'gh');
  assert.deepEqual(seen, [4_500, 4_500]);
});

test('kanban #100: a kiértékelő kapcsoló „=”-vel és az útvonalas értelmező tilt (a szkriptfájl-feltétel nélkül átmenne)', () => {
  for (const c of ['node --eval="require(\'child_process\').execSync(\'git push\')"', 'node --print="git push"', './node x.mjs "git push"',
    'C:/x/node.exe x.mjs "git push"']) assert.equal(kind(c), 'deny', c);
});

test('H5: a tokenizáló a héj szerint bont — amit a héj máshogy zárna le, az tilt; a szabályos idézés nem tilt', () => {
  const bashDeny = [
    "node x.mjs $'a\\'' ; git push #'",
    "echo $'a\\'' ; git push #'",
    "git commit -m $'a\\'' ; git push #'",
    'node x.mjs $"git push"',
    "echo a\\' ; git push #'",
    "node x.mjs a\\' ; git push #'",
    'echo a\\" ; git push #"',
    'echo "a\\\\" ; git push #"',
    "echo 'a\\' ; git push #'",
  ];
  for (const c of bashDeny) assert.equal(planCommand(c, { tool: 'Bash' }).kind, 'deny', `Bash: ${c}`);
  const psDeny = [
    'node x.mjs "a\\" ; git push #"',
    'node x.mjs "a” ; git push #"',
    'echo "a\\" ; git push #"',
    'echo "a„ ; git push #"',
    "Write-Output 'a’ ; git push #'",
    'git commit -m "x\\" ; git push #"',
    'git log --grep="a\\" ; git push #"',
    'gh pr view 5 --json title -q "a\\" ; gh pr merge 5 #"',
    'git push origin x --% y',
  ];
  for (const c of psDeny) assert.equal(planCommand(c, { tool: 'PowerShell' }).kind, 'deny', `PowerShell: ${c}`);
  // PowerShell: a `--%` után a héj a sort szó szerint adja tovább — a hook nem követi, ezért tilt (nem kapu-köteles fejjel is).
  assert.equal(planCommand('grep --% "git push" docs', { tool: 'PowerShell' }).kind, 'deny');
  assert.equal(planCommand('grep --% "git push" docs', { tool: 'Bash' }).kind, 'none');
  // PowerShell: a duplázott idézőjel szó szerinti idézőjel — a refspecben így nem egyszerű ágnév.
  assert.equal(planCommand("git push origin 'a''b'", { tool: 'PowerShell' }).kind, 'deny');
  assert.equal(planCommand('git push origin "a""b"', { tool: 'PowerShell' }).kind, 'deny');
  // A parancsnévbe szúrt idézőjel nem rejti el a kapu-köteles műveletet.
  for (const tool of ['Bash', 'PowerShell']) {
    for (const c of ['g"i"t push', "g'i't push", 'git pu""sh']) assert.equal(planCommand(c, { tool }).kind, 'push', `${tool}: ${c}`);
  }
  const intended = [
    'node kanban.mjs note 5 "a kiadást a git push után ellenőrizd"',
    'node scripts/kanban.mjs note 5 "gh pr merge 9 után"',
    'node.exe x.js "git push"',
    'python x.py "git push"',
    'py x.py "git push"',
    'deno x.ts "git push"',
    'bun x.ts "git push"',
    'perl x.pl "git push"',
    'ruby x.rb "git push"',
    "node x.mjs '$(git push)'",
    'node x.sh.mjs "git push"',
  ];
  for (const c of intended) {
    assert.equal(kind(c), 'none', c);
    assert.equal(planCommand(c, { tool: 'PowerShell' }).kind, 'none', `PowerShell: ${c}`);
  }
});

test('V2: a szabályos PR-folyamat címtől függetlenül a normál bizonyíték-ellenőrzésre fut; a commit / grep / jegyzet szövege nem kapu-köteles', () => {
  for (const tool of ['Bash', 'PowerShell']) {
    const p = (c) => planCommand(c, { tool });
    assert.equal(p('gh pr create --title "chore(qa): külső ellenőr (kanban #92)" --body-file leiras.md').kind, 'pr-create', tool);
    assert.equal(p('gh pr merge 490 --squash --subject "chore(qa): külső ellenőr (#490)"').kind, 'pr-merge', tool);
    for (const c of ['git commit -m "fix: a „más repó” döntés a push kapuban"', 'git commit -m "docs: push kapu (kanban #100)"',
      'node scripts/kanban.mjs note 5 "a git push után (#92)"']) {
      assert.equal(p(c).kind, 'none', `${tool}: ${c}`);
    }
  }
  // Bash-ben a tipográfiai idézőjel és a kettős idézőjelen belüli \" szabályos a címben → normál bizonyíték-ellenőrzés.
  assert.equal(planCommand('gh pr create --title "feat(jatekok): J5a – Brain Rot „Lény-aréna”" --body-file leiras.md', { tool: 'Bash' }).kind, 'pr-create');
  assert.deepEqual(planCommand('gh pr merge 485 --squash --subject "feat: „Lény-aréna” (#485)"', { tool: 'Bash' }), { kind: 'pr-merge', target: '485', repoFlag: null });
  assert.equal(planCommand('gh pr create --title "fix: \\"x\\" javítása" --body-file leiras.md', { tool: 'Bash' }).kind, 'pr-create');
  // PowerShellben ugyanezek a héjban több argumentumra esnek szét (mérve: PowerShell 7 és 5.1) — a parancs a héjban is hibás, a
  // hook ezt követi: tilt (a runbook kerülőútja: egyenes idézőjel, vagy a Bash-eszköz).
  for (const c of ['gh pr create --title "feat: „Lény”" --body-file f.md', 'gh pr create --title "fix: \\"x\\" javítása" --body-file leiras.md']) {
    assert.equal(planCommand(c, { tool: 'PowerShell' }).kind, 'deny', c);
  }
  assert.deepEqual(tokenizeSimple('gh pr merge 5 --subject "„x” (#5)"', { tool: 'PowerShell' }).words, ['gh', 'pr', 'merge', '5', '--subject', '', 'x (#5)']);
  // A tipográfiai idézőjel Bash-ben közönséges karakter. PowerShellben lezárja a szöveget — ott a terv a héj tényleges szavait
  // követi (a próbatábla rögzíti), és ha a „push” szó idézetlenné válik, tilt.
  for (const c of ['grep -n "„git push”" docs/minosegkapuk.md', 'node scripts/kanban.mjs note 5 "a „git push” után ellenőrizd"', 'echo "a „git push” után"']) {
    assert.equal(planCommand(c, { tool: 'Bash' }).kind, 'none', `Bash: ${c}`);
  }
  assert.equal(planCommand('grep -n "„git push”" docs/minosegkapuk.md', { tool: 'PowerShell' }).kind, 'deny');
  // Bash-ben a kettős idézőjelen belüli \" szabályos escape.
  assert.equal(planCommand('git commit -m "fix: \\"idézet\\" a push kapuban"', { tool: 'Bash' }).kind, 'none');
  // A szó elején álló # mindkét héjban megjegyzés a sor végéig (a terv is így látja); a „#9” érthető tiltás.
  for (const tool of ['Bash', 'PowerShell']) {
    assert.equal(planCommand('git log --oneline -5 # push előtt', { tool }).kind, 'none', tool);
    assert.match(planCommand('gh pr merge #9 --squash', { tool }).reason ?? '', /# nélkül/, tool);
    assert.deepEqual(planCommand('gh pr merge 9 --squash # megjegyzés', { tool }), { kind: 'pr-merge', target: '9', repoFlag: null }, tool);
  }
});

test('4. kör: megjegyzés a sor végéig, here-string, kapcsolók értelmezés után, nem ASCII szóköz, ismeretlen eszköz', () => {
  // B1: a megjegyzés után új sorban álló parancs → láncolás → tilt (mindkét héjban).
  for (const tool of ['Bash', 'PowerShell']) {
    for (const c of ['git status # megjegyzés\ngit push origin proba', 'gh pr view 5 # megjegyzés\ngh pr merge 5 --squash', 'echo x # y\ngit push',
      'node x.mjs a # b\ngit push', 'git log -1 #\ngit push origin proba', 'git log -1 #\r\ngit push origin proba']) {
      assert.equal(planCommand(c, { tool }).kind, 'deny', `${tool}: ${JSON.stringify(c)}`);
    }
    assert.deepEqual(planCommand('git push origin proba # megjegyzés', { tool }), { kind: 'push', remote: 'origin', ref: 'proba', upstream: false }, tool);
    // M1: a megjegyzésbe írt kapcsoló nem számít (a héj sem adja át).
    assert.equal(planCommand('gh pr merge 5 --squash # --disable-auto', { tool }).kind, 'pr-merge', tool);
    assert.deepEqual(planCommand('gh pr create --title x --body-file f.md # -R masik/repo', { tool }), { kind: 'pr-create', ref: null, repoFlag: null }, tool);
    // M2: az érték-kapcsoló utáni szó érték, nem kapcsoló.
    assert.equal(planCommand('gh pr merge 5 --squash --body --disable-auto', { tool }).kind, 'pr-merge', tool);
    assert.equal(planCommand('gh pr merge 5 --squash --subject --auto', { tool }).kind, 'pr-merge', tool);
    assert.equal(planCommand('gh pr merge 5 --squash --auto', { tool }).kind, 'deny', tool);
    assert.equal(planCommand('gh pr merge 5 --disable-auto', { tool }).kind, 'none', tool);
  }
  // B2: PowerShell here-string → tilt.
  for (const c of ['echo @"\na " ; git push ; echo "\n"@', "echo @'\na ' ; git push ; echo '\n'@", 'git push origin @"\nx\n"@']) {
    assert.equal(planCommand(c, { tool: 'PowerShell' }).kind, 'deny', JSON.stringify(c));
  }
  // K1: PowerShellben a nem törő szóköz idézőjelen kívül → tilt; idézőjelen belül szöveg.
  assert.equal(planCommand('gh pr merge 5 --body x --auto', { tool: 'PowerShell' }).kind, 'deny');
  assert.equal(planCommand('gh pr merge 5 --squash --body "x y"', { tool: 'PowerShell' }).kind, 'pr-merge');
  // K4: ismeretlen eszköznév → a szigorúbb: bármelyik héj tilt → tilt; egyező terv → az.
  assert.equal(planCommand('git commit -m "a\\" ; git push #"', { tool: 'Terminal' }).kind, 'deny');
  assert.equal(planCommand("echo a\\' ; git push #'", { tool: '' }).kind, 'deny');
  assert.deepEqual(planCommand('git push origin proba', { tool: 'Terminal' }), { kind: 'push', remote: 'origin', ref: 'proba', upstream: false });
  assert.equal(planCommand('git status', { tool: 'Terminal' }).kind, 'none');
  // Bash kapcsos kifejtés git / gh parancsban → tilt; más eszköznél és PowerShellben nem kapu-köteles.
  assert.equal(planCommand('git pus{h..h} origin proba', { tool: 'Bash' }).kind, 'deny');
  assert.equal(planCommand('git log --format={a,b}', { tool: 'Bash' }).kind, 'deny');
  assert.equal(planCommand('echo {a,b}', { tool: 'Bash' }).kind, 'none');
});

test('a hook folyamata átadja az eszköz nevét: ugyanaz a parancs PowerShellben tilt, Bash-ben nem kapu-köteles', () => {
  const { wt } = makeRepo();
  const c = 'git commit -m "a\\" ; git push #"';
  assert.equal(runHook(c, wt, 'Bash'), null);
  assert.ok(denied(runHook(c, wt, 'PowerShell')));
  // K4: ismeretlen héj-eszköz parancsát is vizsgálja (a szigorúbb szabály szerint), nem lép ki döntés nélkül.
  assert.ok(denied(runHook(c, wt, 'Terminal')));
});

test('az ellenőr próbatáblája (fixtures/quoting-forms.json): minden alak terve Bash- és PowerShell-eszközzel a rögzített', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/quoting-forms.json', import.meta.url), 'utf8'));
  assert.ok(fx.forms.length >= 198);
  const diff = [];
  fx.forms.forEach((f, i) => {
    for (const tool of ['Bash', 'PowerShell']) {
      const got = planCommand(f, { tool }).kind;
      if (got !== fx.expected[tool][i]) diff.push(`${i + 1} ${tool}: várt ${fx.expected[tool][i]}, kapott ${got} | ${JSON.stringify(f)}`);
    }
  });
  assert.deepEqual(diff, []);
});

/** Valódi kibocsátás-e a héj hívása (git push alparancs; gh pr create / merge, a csak --disable-auto merge kivételével; gh api merge). */
function emits(call) {
  const [prog, ...a] = call;
  if (prog === 'git') {
    for (let i = 0; i < a.length; i += 1) {
      if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(a[i])) { i += 1; continue; }
      if (a[i].startsWith('-')) continue;
      return a[i] === 'push';
    }
    return false;
  }
  if (prog === 'gh' && a[0] === 'pr' && a[1] === 'create') return true;
  if (prog === 'gh' && a[0] === 'pr' && a[1] === 'merge') return !a.includes('--disable-auto');
  return prog === 'gh' && a[0] === 'api' && a.some((x) => /\/pulls\/\d+\/merge\b/.test(x));
}

test('H11: amit a valódi héj kibocsátásként futtat (a próbatábla héjas eredménye), azt a hook soha nem látja „nem kapu-kötelesnek”', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/quoting-forms.json', import.meta.url), 'utf8'));
  assert.ok(fx.forms.length >= 340 && fx.shell, 'a 4. kör héjas eredménye hiányzik');
  const slips = [];
  fx.forms.forEach((f, i) => {
    for (const [sh, tool] of [['Bash', 'Bash'], ['PowerShell', 'PowerShell'], ['PowerShell51', 'PowerShell']]) {
      if (!(fx.shell[sh][i] ?? []).some(emits)) continue;
      const plan = planCommand(f, { tool }).kind;
      if (plan === 'none') slips.push(`${i + 1} ${sh}: a héj kibocsát, a terv „nem kapu-köteles” | ${JSON.stringify(f)}`);
    }
  });
  assert.deepEqual(slips, []);
});

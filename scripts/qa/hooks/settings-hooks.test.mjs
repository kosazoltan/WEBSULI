// docs/specs/2026-11-17-kulso-ellenor.md 11.1 (H1, H2): a VALÓDI .claude/settings.json minden hook-parancsa úgy, ahogy a Claude Code
// futtatja — héjparancsként (Windows-on Git Bash), a projektgyökérrel a CLAUDE_PROJECT_DIR-ben, a munkakönyvtár pedig az aktuális
// könyvtár (a gyökér, a source/, egy mélyebb alkönyvtár vagy egy munkafa alkönyvtára). Minden helyről le kell futnia, és a próbára a
// várt döntést kell adnia; a relatív szkriptútvonal alkönyvtárból „Cannot find module” — a hook kiesik, a parancs átmegy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=Teszt', '-c', `user.email=teszt${'@'}pelda.hu`, ...args], { cwd, encoding: 'utf8' }).trim();

/** A settings összes parancs-hookja: { event, matcher, command }. */
function hookEntries() {
  const out = [];
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    for (const g of groups) for (const h of g.hooks ?? []) if (h.type === 'command') out.push({ event, matcher: g.matcher ?? '', command: h.command, hook: h });
  }
  return out;
}

/** A Claude Code héja: Windows-on a Git Bash (a git telepítéséből, nem beégetett útvonal), máshol a bash. */
function bashPath() {
  if (process.env.CLAUDE_CODE_GIT_BASH_PATH) return process.env.CLAUDE_CODE_GIT_BASH_PATH;
  if (process.platform !== 'win32') return 'bash';
  const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(); // <git>/<mingw64|ucrt64|clangarm64>/libexec/git-core
  const bash = join(dirname(dirname(dirname(exec))), 'bin', 'bash.exe');
  assert.ok(existsSync(bash), `Git Bash nem található: ${bash}`);
  return bash;
}

/** Hookonként a próba és az elvárt kimenet. */
function probeFor({ command, matcher }) {
  const tool = matcher.split('|')[0];
  if (/check-quality-gates\.mjs/.test(command)) return { tool, input: { command: 'git push origin proba' }, expect: 'deny' };
  if (/check-audit-ok\.mjs/.test(command)) return { tool, input: { command: 'git push origin proba' }, expect: 'deny' };
  if (/check-destructive\.mjs/.test(command)) return { tool, input: { command: 'rm -rf /' }, expect: 'deny' };
  if (/enforce-repo-rules\.mjs/.test(command)) {
    return tool === 'Bash' || tool === 'PowerShell'
      ? { tool, input: { command: 'git commit --no-verify -m x' }, expect: 'deny' }
      : { tool, input: { file_path: 'a.mjs', content: 'try { f(); } catch (e) {}' }, expect: 'message' };
  }
  if (/warn-test-edit\.mjs/.test(command)) return { tool, input: { file_path: 'a.test.mjs', content: 'x' }, expect: 'message' };
  return null;
}

/** Ideiglenes projekt szóközös + ékezetes útvonalon: a scripts/qa és a settings másolata, egy munkafával. */
function makeProject() {
  const base = mkdtempSync(join(tmpdir(), 'hookgyoker-'));
  const proj = join(base, 'próba projekt ő');
  mkdirSync(proj, { recursive: true });
  git(proj, 'init', '-q', '-b', 'main');
  cpSync(join(repoRoot, 'scripts', 'qa'), join(proj, 'scripts', 'qa'), { recursive: true });
  mkdirSync(join(proj, '.claude'), { recursive: true });
  writeFileSync(join(proj, '.claude', 'settings.json'), JSON.stringify(settings, null, 2));
  mkdirSync(join(proj, 'source', 'server', 'mely'), { recursive: true });
  writeFileSync(join(proj, 'source', 'server', 'mely', 'x.txt'), 'x\n');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-q', '-m', 'init');
  git(proj, 'branch', 'proba');
  const wt = join(base, 'munkafa ű');
  git(proj, 'worktree', 'add', '-q', '-b', 'wt-ag', wt);
  return { proj, wt };
}

function runSettingsHook(bash, command, projectDir, cwd, probe, { substitute = false } = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  delete env.WEBSULI_QA_EVIDENCE_DIR;
  Object.assign(env, { WEBSULI_HOOK_GIT_TIMEOUT_MS: '120000', WEBSULI_HOOK_GH_TIMEOUT_MS: '120000', WEBSULI_HOOK_BUDGET_MS: '600000' });
  // A dokumentáció szerint a Claude Code a ${CLAUDE_PROJECT_DIR} helyőrzőt maga is behelyettesítheti; mindkét utat mérjük.
  const cmd = substitute ? command.split('${CLAUDE_PROJECT_DIR}').join(projectDir) : command;
  const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: probe.tool, tool_input: probe.input, cwd });
  return spawnSync(bash, ['-c', cmd], { cwd, env, input: payload, encoding: 'utf8', timeout: 300_000, windowsHide: true });
}

function verdict(r) {
  if (r.status !== 0) return `kilépés ${r.status}: ${String(r.stderr).trim().split('\n').slice(0, 3).join(' | ')}`;
  let j = null;
  try { j = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { return `nem JSON kimenet: ${r.stdout.slice(0, 200)}`; }
  if (j?.hookSpecificOutput?.permissionDecision === 'deny') return 'deny';
  if (j?.systemMessage) return 'message';
  return 'átengedte';
}

test('őr: minden hook-parancs a projektgyökérhez kötött (idézett ${CLAUDE_PROJECT_DIR}), relatív szkriptútvonal nincs', () => {
  const entries = hookEntries();
  assert.ok(entries.length >= 10, `a settings hook-bejegyzései hiányoznak (${entries.length})`);
  for (const { command } of entries) {
    assert.match(command, /^node "\$\{CLAUDE_PROJECT_DIR\}\/scripts\/qa\/hooks\/[\w-]+\.mjs"$/, `nem gyökérhez kötött hook-parancs: ${command}`);
  }
});

// Külön commit (tulajdonosi jóváhagyásra; egy reverttel visszavonható): a kapu-hook saját hibája / időtúllépése is tiltás.
test('a kapu-hook mindkét bejegyzésén onFailure: "block"', () => {
  const gate = hookEntries().filter((e) => /check-quality-gates\.mjs/.test(e.command));
  assert.deepEqual(gate.map((e) => e.matcher).sort(), ['Bash', 'PowerShell']);
  for (const e of gate) assert.equal(e.hook.onFailure, 'block', e.matcher);
});

test('H1: a valódi settings minden hookja lefut és a várt döntést adja — gyökérből, source/-ből, mélyebb könyvtárból, munkafából', () => {
  const bash = bashPath();
  const { proj, wt } = makeProject();
  const places = [
    { name: 'gyökér', projectDir: proj, cwd: proj },
    { name: 'source/', projectDir: proj, cwd: join(proj, 'source') },
    { name: 'mélyebb alkönyvtár', projectDir: proj, cwd: join(proj, 'source', 'server', 'mely') },
    { name: 'munkafa alkönyvtára', projectDir: wt, cwd: join(wt, 'source', 'server') },
  ];
  const failures = [];
  for (const entry of hookEntries()) {
    const probe = probeFor(entry);
    if (!probe) { failures.push(`ismeretlen hook, nincs próba: ${entry.command}`); continue; }
    for (const p of places) {
      const got = verdict(runSettingsHook(bash, entry.command, p.projectDir, p.cwd, probe));
      if (got !== probe.expect) failures.push(`${entry.matcher} ${entry.command} @ ${p.name}: várt ${probe.expect}, kapott ${got}`);
    }
    const sub = verdict(runSettingsHook(bash, entry.command, proj, join(proj, 'source'), probe, { substitute: true }));
    if (sub !== probe.expect) failures.push(`${entry.matcher} ${entry.command} @ source/ (behelyettesítve): várt ${probe.expect}, kapott ${sub}`);
  }
  assert.deepEqual(failures, []);
});

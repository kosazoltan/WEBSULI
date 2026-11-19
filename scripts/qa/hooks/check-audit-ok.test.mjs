// docs/specs/2026-11-19-audit-hook-kapuinditas.md A1–A4: az audit-hook (check-audit-ok) csak a valódi `git push`-ra vonatkozik,
// a push-kapu indítására (`npm run gate:push`) nem; a tiltó üzenet a valós lépést írja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const auditHook = fileURLToPath(new URL('./check-audit-ok.mjs', import.meta.url));

function repoWithSentinel(ageMinutes) {
  const repo = mkdtempSync(join(tmpdir(), 'audit-kapu-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  if (ageMinutes !== null) {
    const p = join(repo, '.audit-ok');
    writeFileSync(p, '');
    const t = (Date.now() - ageMinutes * 60_000) / 1000;
    utimesSync(p, t, t);
  }
  return repo;
}

function decide(command, cwd, tool = 'Bash') {
  const env = { ...process.env };
  delete env.WEBSULI_QA_EVIDENCE_DIR;
  const out = execFileSync(process.execPath, [auditHook], { input: JSON.stringify({ tool_name: tool, tool_input: { command }, cwd }), encoding: 'utf8', env });
  const r = out.trim() ? JSON.parse(out) : null;
  return r?.hookSpecificOutput?.permissionDecision === 'deny' ? r.hookSpecificOutput.permissionDecisionReason : null;
}

const KAPU = [
  'npm run gate:push',
  'npm.cmd run gate:push',
  'npm run gate:push -- --base origin/main',
  'git fetch origin\nnpm run gate:push',
  'git status --short\r\nnpm.cmd run gate:push',
  'git fetch origin; npm.cmd run gate:push',
  'node scripts/qa/gates/pre-push-gate.mjs',
  'git log -1 --format=%H .git/websuli-qa-evidence/pre-push-x.json',
];

const PUSH = [
  'git push',
  'git push origin feat/x',
  'git push --delete origin feat/x',
  'git push origin :feat/x',
  'git -C D:/repo/x push origin x',
  'git -c credential.helper= push',
];

const CHAINED_OR_DISGUISED = [
  'git status && git push',
  'echo x; git push origin x',
  'git fetch origin\ngit push origin x',
  'npm run gate:push && git push origin x',
  '"git" push origin x',
  "'git' push",
  'GIT push',
  'git.exe push',
  '"C:\\Program Files\\Git\\cmd\\git.exe" push origin x',
  "& 'C:\\Program Files\\Git\\cmd\\git.exe' push",
  '/usr/bin/git push',
  "g''it push",
  'g\\it push',
  'g`it push',
  'gi^t push',
];

test('A1: a push-kapu indítása régi .audit-ok mellett is ENGEDETT', () => {
  const repo = repoWithSentinel(60);
  for (const c of KAPU) assert.equal(decide(c, repo), null, JSON.stringify(c));
  for (const c of ['npm.cmd run gate:push', 'git fetch origin; npm.cmd run gate:push']) assert.equal(decide(c, repo, 'PowerShell'), null, `PowerShell: ${c}`);
});

test('A2: valódi git push régi / hiányzó .audit-ok mellett TILTOTT; az üzenet a valós lépést írja', () => {
  for (const repo of [repoWithSentinel(60), repoWithSentinel(null)]) {
    for (const c of PUSH) {
      const r = decide(c, repo) ?? '';
      assert.match(r, /audit nem futott le/, JSON.stringify(c));
      assert.match(r, /npm run gate:push[\s\S]*\.audit-ok[\s\S]*külön parancsban[\s\S]*git push/, 'a valós lépés');
      assert.doesNotMatch(r, /qa:audit/, 'nem létező szkriptre nem hivatkozhat');
    }
  }
});

test('A3: láncolt és álcázott git push régi .audit-ok mellett TILTOTT', () => {
  const repo = repoWithSentinel(60);
  for (const c of CHAINED_OR_DISGUISED) assert.match(decide(c, repo) ?? '', /audit nem futott le/, JSON.stringify(c));
  for (const c of ['git status; git push', "& 'C:\\Program Files\\Git\\cmd\\git.exe' push", 'g`it push']) {
    assert.match(decide(c, repo, 'PowerShell') ?? '', /audit nem futott le/, `PowerShell: ${JSON.stringify(c)}`);
  }
});

test('A1 / A3: hibás (csonka) hook-bemenet — a kapu indítása enged, a git push tilt', () => {
  const raw = (command) => {
    const env = { ...process.env };
    delete env.WEBSULI_QA_EVIDENCE_DIR;
    const out = execFileSync(process.execPath, [auditHook], { input: `{"tool_name":"Bash","tool_input":{"command":${JSON.stringify(command)}`, encoding: 'utf8', env });
    return out.trim() ? JSON.parse(out).hookSpecificOutput?.permissionDecision : null;
  };
  assert.equal(raw('git fetch origin\nnpm run gate:push'), null);
  assert.equal(raw('git push origin x'), 'deny');
  assert.equal(raw('"git" push origin x'), 'deny');
});

test('A4: friss .audit-ok mellett a valódi git push ENGEDETT', () => {
  const repo = repoWithSentinel(1);
  for (const c of ['git push', 'git push --delete origin feat/x', '"git" push origin x', 'npm run gate:push && git push origin x']) {
    assert.equal(decide(c, repo), null, JSON.stringify(c));
  }
});

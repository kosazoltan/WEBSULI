// docs/specs/2026-11-18-hook-onfailure.md F1–F4: a kapu-hook hibája / időtúllépése tiltás (onFailure: "block" + a hook saját
// fail-closed ágai, teendővel), és az audit-hook (check-audit-ok) időtúllépéskor / indítási hibánál tilt (kanban #126, A7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRunner, NoAnswerError, RETRY_HINT } from './check-quality-gates.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const gateHook = fileURLToPath(new URL('./check-quality-gates.mjs', import.meta.url));
const auditHook = fileURLToPath(new URL('./check-audit-ok.mjs', import.meta.url));
const TEENDO = /próbáld újra néhány másodperc múlva[\s\S]*A kapu-hook hibája/;

function run(hook, payload, envPatch = {}, { noGit = false } = {}) {
  const env = { ...process.env, ...envPatch };
  delete env.WEBSULI_QA_EVIDENCE_DIR;
  if (noGit) {
    for (const k of Object.keys(env)) if (/^path$/i.test(k)) delete env[k];
    env.PATH = mkdtempSync(join(tmpdir(), 'hf-ures-path-')); // a node abszolút útvonalon indul, a git nem található
  }
  const out = execFileSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: 'utf8', env });
  return out.trim() ? JSON.parse(out) : null;
}
const reason = (r) => (r?.hookSpecificOutput?.permissionDecision === 'deny' ? r.hookSpecificOutput.permissionDecisionReason : null);

test('F1: a kapu-hook mindkét bejegyzésén onFailure: "block", a többi hookon nincs', () => {
  const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
  const gate = [];
  const other = [];
  for (const g of settings.hooks.PreToolUse) {
    for (const h of g.hooks) (/check-quality-gates\.mjs/.test(h.command) ? gate : other).push({ matcher: g.matcher, h });
  }
  assert.deepEqual(gate.map((e) => e.matcher).sort(), ['Bash', 'PowerShell']);
  for (const e of gate) assert.equal(e.h.onFailure, 'block', e.matcher);
  for (const e of other) assert.equal(e.h.onFailure, undefined, `${e.matcher} ${e.h.command}`);
});

test('F2: a kapu-hook a „nem válaszolt” esetben folyamat-szinten tilt, és megmondja a teendőt', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hf-kapu-'));
  const payload = { tool_name: 'Bash', tool_input: { command: 'git push origin proba' }, cwd };
  // a) a git nem indítható (git nélküli PATH)
  assert.match(reason(run(gateHook, payload, {}, { noGit: true })) ?? '', TEENDO);
  // b) a hook kerete elfogy (tesztes felülírás: 501 ms keret − 500 ms tartalék)
  assert.match(reason(run(gateHook, payload, { WEBSULI_HOOK_BUDGET_MS: '501' })) ?? '', TEENDO);
});

test('F3: az audit-hook push-parancsnál tilt, ha a git nem indítható — teendővel', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hf-audit-'));
  const r = run(auditHook, { tool_name: 'Bash', tool_input: { command: 'git push origin proba' }, cwd }, {}, { noGit: true });
  assert.match(reason(r) ?? '', TEENDO);
  const ps = run(auditHook, { tool_name: 'PowerShell', tool_input: { command: 'git push' }, cwd }, {}, { noGit: true });
  assert.match(reason(ps) ?? '', TEENDO);
});

test('F4: az audit-hook nem push parancsnál és nem git-repóban enged; git-repóban friss audit nélkül a régi üzenettel tilt', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hf-audit-nem-repo-'));
  assert.equal(run(auditHook, { tool_name: 'Bash', tool_input: { command: 'git status' }, cwd }, {}, { noGit: true }), null);
  assert.equal(run(auditHook, { tool_name: 'Bash', tool_input: { command: 'git push' }, cwd }, { GIT_CEILING_DIRECTORIES: tmpdir() }), null);
  const repo = mkdtempSync(join(tmpdir(), 'hf-audit-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  assert.match(reason(run(auditHook, { tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: repo })) ?? '', /audit nem futott le/);
});

// ---- Javító kör (a visszaellenőrzés túlélő mutációi, hibás bemenet) ------------------------------------------------------

function runRaw(hook, input, envPatch = {}) {
  const env = { ...process.env, ...envPatch };
  delete env.WEBSULI_QA_EVIDENCE_DIR;
  const out = execFileSync(process.execPath, [hook], { input, encoding: 'utf8', env });
  return out.trim() ? JSON.parse(out) : null;
}

test('az audit-hook belső hibája (hibás típusú konfig) push-parancsnál tilt — teendővel', () => {
  const repo = mkdtempSync(join(tmpdir(), 'hf-audit-konfig-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  writeFileSync(join(repo, '.agentic-qa-kit.json'), JSON.stringify({ audit: { sentinel: { nem: 'szöveg' } } }));
  const r = reason(run(auditHook, { tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: repo })) ?? '';
  assert.match(r, /hibára futott/);
  assert.match(r, TEENDO);
});

test('az audit-hook valódi git-időtúllépésnél tilt (tesztes 1 ms-os korlát) — teendővel', () => {
  const repo = mkdtempSync(join(tmpdir(), 'hf-audit-ido-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const r = reason(run(auditHook, { tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: repo }, { WEBSULI_AUDIT_GIT_TIMEOUT_MS: '1' })) ?? '';
  assert.match(r, /nem válaszolt/);
  assert.match(r, TEENDO);
});

test('a kapu-hook KERETÉNEK kimerülése tilt, és az üzenet megmondja a teendőt', () => {
  let t = 0;
  const run2 = makeRunner({ exec: () => { t += 50_000; return '/r'; }, now: () => t, cfg: { gitMs: 10_000, ghMs: 15_000, budgetMs: 45_000 } });
  run2('git', ['rev-parse'], '.');
  assert.throws(() => run2('git', ['rev-parse'], '.'), (e) => e instanceof NoAnswerError && /ideje elfogyott/.test(e.message) && e.message.includes(RETRY_HINT));
});

test('hibás hook-bemenet: kapu-köteles szöveggel mindkét hook tilt; enélkül (és üres bemenetnél) enged', () => {
  const csonka = '{"tool_name":"Bash","tool_input":{"command":"git push origin proba"';
  assert.match(reason(runRaw(gateHook, csonka)) ?? '', TEENDO);
  assert.match(reason(runRaw(auditHook, csonka)) ?? '', TEENDO);
  for (const hook of [gateHook, auditHook]) {
    assert.equal(runRaw(hook, ''), null);
    assert.equal(runRaw(hook, '{"tool_name":"Bash","tool_input":{"command":"git status"'), null);
  }
});

test('F5 szöveg-őr: a runbook „A kapu-hook hibája” szakasza nem ad ügynöknek eltávolítási utasítást, és kimondja a helyes utat', () => {
  const md = readFileSync(join(repoRoot, 'docs', 'minosegkapuk.md'), 'utf8').replace(/\r\n/g, '\n');
  const start = md.indexOf('## A kapu-hook hibája');
  assert.ok(start >= 0, 'hiányzik a runbook „A kapu-hook hibája” szakasza');
  const end = md.indexOf('\n## ', start + 3);
  const sec = md.slice(start, end < 0 ? undefined : end);
  // Codex P1 (#506): ügynöknek szóló felszólítás a védelem eltávolítására / kikapcsolására nem lehet benne, futtatható
  // kikapcsoló parancs sem.
  for (const re of [/\btöröld\b/i, /\btávolítsd el\b/i, /\bkapcsold ki\b/i, /\bvedd ki\b/i, /claude\s+--settings/i]) {
    assert.doesNotMatch(sec, re, `tiltott minta a szakaszban: ${re}`);
  }
  assert.match(sec, /kizárólag a hookot javíthatja/);
  assert.match(sec, /nem távolíthatja el, nem gyengítheti, és kerülőútként sem\s+javasolhatja/);
  assert.match(sec, /\*\*megáll\*\*, és a tulajdonostól kér segítséget/);
  assert.match(sec, /kizárólag a tulajdonos saját kezű lépése/);
});

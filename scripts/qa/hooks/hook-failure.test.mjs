// docs/specs/2026-11-18-hook-onfailure.md F1–F4: a kapu-hook hibája / időtúllépése tiltás (onFailure: "block" + a hook saját
// fail-closed ágai, teendővel), és az audit-hook (check-audit-ok) időtúllépéskor / indítási hibánál tilt (kanban #126, A7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectGated, makeRunner, NoAnswerError, planCommand, RETRY_HINT } from './check-quality-gates.mjs';

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

// ---- L1 (vak ellenőr, 2026-11-18): a felismerés lineáris — nagy, ártalmatlan szövegen nincs hamis tiltás -------------------

test('F8: ≥ 200 KB-os, „gh pr …” említésekkel teli ártalmatlan parancs 1 s alatt ENGEDETT; a kapu-köteles alakok változatlanok', () => {
  const dense = 'gh pr view es gh pr checks; '.repeat(Math.ceil(200_000 / 28));
  const gitty = 'git log es git status; '.repeat(Math.ceil(200_000 / 23));
  for (const body of [dense, gitty]) {
    const cmd = `echo "${body}"`;
    const t0 = Date.now();
    assert.equal(detectGated(cmd), false);
    assert.equal(planCommand(cmd).kind, 'none');
    assert.ok(Date.now() - t0 < 1000, `lassú felismerés: ${Date.now() - t0} ms`);
  }
  // folyamat-szinten is (a hook a teljes bemenetet olvassa)
  const t1 = Date.now();
  assert.equal(run(gateHook, { tool_name: 'Bash', tool_input: { command: `echo "${dense}"` }, cwd: process.cwd() }), null);
  assert.ok(Date.now() - t1 < 5000, `lassú hook: ${Date.now() - t1} ms`);
  // a kapu-köteles alakok a hosszú szöveg végén is felismertek
  for (const tail of ['git push origin x', 'gh pr merge 5 --squash', 'gh pr create --title x', '/usr/bin/git push', '"C:/Program Files/GitHub CLI/gh.exe" pr merge 5']) {
    assert.equal(detectGated(`${dense} && ${tail}`), true, tail);
  }
});

// ---- L2 (vak ellenőr, 2026-11-18): a védelem eltávolítása / gyengítése Edit / Write-tal tiltott; a hook javítása engedett ---------

const rulesHook = fileURLToPath(new URL('./enforce-repo-rules.mjs', import.meta.url));
const SETTINGS = join(repoRoot, '.claude', 'settings.json');
const GATE = join(repoRoot, 'scripts', 'qa', 'hooks', 'check-quality-gates.mjs');
const OFF = `"${'disable'}${'AllHooks'}": true`; // a kikapcsoló beállítás neve szándékosan darabolva (szöveg-őr)

test('F9: a három próba (helyi settings-be hook-kikapcsolás, az onFailure törlése, a hook belépési pontjának kiürítése) TILTOTT', () => {
  const settingsText = readFileSync(SETTINGS, 'utf8');
  const probes = [
    { tool_name: 'Write', tool_input: { file_path: join(repoRoot, '.claude', 'settings.local.json'), content: `{ ${OFF} }` } },
    { tool_name: 'Edit', tool_input: { file_path: SETTINGS, old_string: '"timeout": 60,\n            "onFailure": "block",', new_string: '"timeout": 60,' } },
    { tool_name: 'Edit', tool_input: { file_path: SETTINGS, old_string: '"onFailure": "block"', new_string: '"onFailure": "continue"' } },
    { tool_name: 'Write', tool_input: { file_path: SETTINGS, content: settingsText.replace(/\s*"onFailure": "block",/g, '') } },
    { tool_name: 'Write', tool_input: { file_path: SETTINGS, content: settingsText.replace(/check-quality-gates\.mjs/g, 'enforce-repo-rules.mjs') } },
    { tool_name: 'Edit', tool_input: { file_path: GATE, old_string: 'function main() {\n  let raw', new_string: 'function main() {\n  process.exit(0);\n  let raw' } },
    { tool_name: 'Edit', tool_input: { file_path: GATE, old_string: ".endsWith('scripts/qa/hooks/check-quality-gates.mjs')) main();", new_string: ".endsWith('scripts/qa/hooks/check-quality-gates.mjs')) void 0;" } },
  ];
  for (const p of probes) assert.match(reason(run(rulesHook, p)) ?? '', /REPO-SZABÁLY/, JSON.stringify(p.tool_input).slice(0, 140));
});

test('F9: a hook tartalmi javítása és a settings más részének szerkesztése ENGEDETT', () => {
  const allowed = [
    { tool_name: 'Edit', tool_input: { file_path: GATE, old_string: "export const RETRY_HINT = 'próbáld újra", new_string: "export const RETRY_HINT = 'Próbáld újra" } },
    { tool_name: 'Edit', tool_input: { file_path: SETTINGS, old_string: '"timeout": 60,\n            "onFailure": "block",', new_string: '"timeout": 60,\n            "onFailure": "block",\n            "statusMessage": "x",' } },
    { tool_name: 'Edit', tool_input: { file_path: join(repoRoot, 'docs', 'x.md'), old_string: '"onFailure": "block"', new_string: '' } },
  ];
  for (const p of allowed) assert.equal(reason(run(rulesHook, p)), null, JSON.stringify(p.tool_input).slice(0, 140));
  // a lint-kapu diff-szkennelése (csak a hozzáadott sorok) nem ítélheti meg az eltávolítást
  assert.equal(reason(run(rulesHook, { tool_name: 'Write', tool_input: { file_path: SETTINGS, content: '"timeout": 20,', diff_scan: true } })), null);
  // ugyanez diff_scan nélkül (valódi Write a teljes fájl helyére) tiltás
  assert.match(reason(run(rulesHook, { tool_name: 'Write', tool_input: { file_path: SETTINGS, content: '"timeout": 20,' } })) ?? '', /REPO-SZABÁLY/);
});

// ---- L5 / L8 / L7 (vak ellenőr, 2026-11-18) ---------------------------------------------------------------------------------

test('F10: az audit-hook nem objektum JSON-bemenetre nem omlik össze; push-szöveggel tilt, különben enged', () => {
  for (const input of ['null', '[]', '5', '"x"']) assert.equal(runRaw(auditHook, input), null, input);
  assert.match(reason(runRaw(auditHook, '"git push origin x"')) ?? '', TEENDO);
  assert.match(reason(runRaw(auditHook, '["git push origin x"]')) ?? '', TEENDO);
});

test('F10: az audit-hook külső korlátja a belső git-korlát + 5 s fölött', () => {
  const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
  const src = readFileSync(auditHook, 'utf8');
  const inner = Number(/:\s*(\d+)_?(\d*)\s*;\s*$/m.exec(src.split('\n').find((l) => /^\s*\? Math\.min/.test(l)) ?? '')?.slice(1).join('') ?? NaN);
  assert.ok(inner > 0, 'a belső git-korlát nem olvasható ki');
  const audit = settings.hooks.PreToolUse.flatMap((g) => g.hooks).filter((h) => /check-audit-ok\.mjs/.test(h.command));
  assert.equal(audit.length, 2);
  for (const h of audit) assert.ok(h.timeout * 1000 >= inner + 5000, `audit-hook: timeout ${h.timeout} s, belső ${inner} ms`);
});

test('L8: a git-korlát tesztes felülírása NODE_TEST_CONTEXT nélkül hatástalan', () => {
  const repo = mkdtempSync(join(tmpdir(), 'hf-audit-l8-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const env = { ...process.env, WEBSULI_AUDIT_GIT_TIMEOUT_MS: '1' };
  delete env.NODE_TEST_CONTEXT;
  delete env.WEBSULI_QA_EVIDENCE_DIR;
  const out = execFileSync(process.execPath, [auditHook], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: repo }), encoding: 'utf8', env });
  const r = reason(JSON.parse(out)) ?? '';
  assert.match(r, /audit nem futott le/, 'a valódi (10 s-os) korláttal a git válaszol, a hiányzó audit miatt tilt');
  assert.doesNotMatch(r, /nem válaszolt/);
});

test('L7: a kikapcsoló mechanizmus neve és a védelem eltávolítására felszólító szinonimák sehol nem szerepelnek ügynöknek szóló szövegben', () => {
  const SKILLS = ['websuli-lint-ellenor', 'websuli-fejlesztesi-ellenor', 'websuli-push-elotti-kapu', 'websuli-pr-elotti-kapu', 'websuli-merge-elotti-kapu'];
  const files = ['docs/minosegkapuk.md', 'docs/agent-csapdak.md', 'docs/handoffs/2026-11-18-kapu-hook-retro.md',
    'docs/specs/2026-11-18-hook-onfailure.md', 'docs/specs/2026-11-18-hook-onfailure-vegrehajtas.md',
    ...SKILLS.flatMap((s) => [`.agents/skills/${s}/SKILL.md`, `.claude/skills/${s}/SKILL.md`])];
  const MECHANISM = [/disable\s*All\s*Hooks/i, /settings\.local\.json/i, /"onFailure"\s*:\s*"continue"/i, /claude\s+--settings/i];
  for (const f of files) {
    const p = join(repoRoot, ...f.split('/'));
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const re of MECHANISM) assert.doesNotMatch(text, re, `${f}: ${re}`);
  }
  // a runbook szakaszában ügynöknek szóló felszólítás (szinonimák is) a védelem eltávolítására / kikapcsolására nincs
  const md = readFileSync(join(repoRoot, 'docs', 'minosegkapuk.md'), 'utf8').replace(/\r\n/g, '\n');
  const start = md.indexOf('## A kapu-hook hibája');
  const sec = md.slice(start, md.indexOf('\n## ', start + 3));
  for (const re of [/\btöröld\b/i, /\btávolítsd el\b/i, /\bkapcsold ki\b/i, /\bvedd ki\b/i, /\bállítsd\b[^.\n]*continue/i, /\bírd át\b/i, /\bkommenteld ki\b/i, /\bhagyd ki\b/i]) {
    assert.doesNotMatch(sec, re, `tiltott felszólítás: ${re}`);
  }
});

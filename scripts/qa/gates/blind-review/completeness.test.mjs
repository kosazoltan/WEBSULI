// GPT teljesítési őr (docs/specs/2026-11-20-gpt-teljesitesi-or.md, T1–T8). A minták SZINTETIKUSAK (valós jelentés szövege nem került ide).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG, fakeOpenRouter, makeRepo, reply } from './_fixture.mjs';
import { checkCompleteness, closingLine, debugPoints, modelText } from './completeness.mjs';
import { createBudget, makeReportGate, runReview } from './blind-review.mjs';
import { makeTools } from './tools.mjs';
import { checkBlindEvidence } from './evidence.mjs';
import { runCodexComplete } from './codex-complete.mjs';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const TEMPLATE = readFileSync(join(root, 'scripts', 'qa', 'gates', 'vak-ellenor-megbizas.md'), 'utf8');
const GOAL = 'Cél: …\n8a. Egyenértékűség: …\n8b. Teljesítmény: …\n';
const POINTS = ['1', '2', '3', '4', '5', '6', '7', '8a', '8b', '9'];
const HEAD = 'c'.repeat(40);
const FINDINGS = [{ id: 'L1', severity: 'közepes', title: 'Kétszer küld', file: 'a.ts', line: 3, quote: 'queue.push(x)',
  scenario: 'A gyerek kétszer koppint a beküldésre gyenge hálózaton; két kérés megy ki, a szülő két levelet kap.', fix: 'A küldés előtt foglalás egyedi kulccsal (INSERT … ON CONFLICT DO NOTHING), teszttel a kettős koppintásra.' }];

/** Szintetikus, teljes jelentés; a `mut` a részeit cseréli. */
function report(mut = {}) {
  const points = (mut.points ?? POINTS).map((p) => `${p}. ${mut.pointText?.[p] ?? 'Próbáltam megtörni, nem sikerült: a vizsgált úton a viselkedés a terv szerinti, futtatással igazolva.'}`).join('\n');
  const parts = [
    '# Független review — próba',
    `Fej: ${HEAD}`,
    '## Ítélet: IGEN, FELTÉTELLEL',
    mut.leletek ?? '## Leletek\n### L1 — közepes: Kétszer küld\n- a.ts:3, forgatókönyv és javaslat lent.',
    mut.pontok === null ? '' : `## A hibakereső pontok (ítélet + bizonyíték)\n${points}`,
    '## Mit próbáltam megtörni, és nem sikerült\n- kettős koppintás, megszakadt hálózat',
    mut.notTested === null ? '' : '## Mit NEM vizsgáltam\n- valódi mobil Safari (nem állt rendelkezésre)',
    mut.extra ?? '',
    mut.closing ?? 'TELJESSÉG: 10 / 10 pont — HIÁNYZÓ: nincs',
  ];
  return parts.filter((x) => x !== '').join('\n');
}
const check = (text, findings = FINDINGS) => checkCompleteness(text, { points: POINTS, findings });

test('a hibakereső pontok listája a sablonból és a cél-fájlból (a 8. helyőrző helyett a 8a, 8b …)', () => {
  assert.deepEqual(debugPoints(TEMPLATE, GOAL), POINTS);
  assert.deepEqual(debugPoints(TEMPLATE, 'nincs feladat-specifikus pont'), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
});

test('T1: a teljes jelentés átmegy; a zárósor-képző a gépi számítást írja', () => {
  const r = check(report());
  assert.equal(r.ok, true, r.problems.join(' | '));
  assert.deepEqual({ covered: r.covered, total: r.total, missing: r.missing }, { covered: 10, total: 10, missing: [] });
  assert.equal(closingLine(r), 'TELJESSÉG: 10 / 10 pont — HIÁNYZÓ: nincs');
});

test('T2: terv / megállási / felajánló fordulat → elutasítva, a fordulat megnevezésével (kódblokkban idézve nem számít)', () => {
  for (const phrase of ['Következő lépésként megnézem a hívókat.', 'Ha szeretnéd, folytatom a DB-próbával.', 'Folytassam a vizsgálatot?', 'Meg fogom vizsgálni a migrációt.',
    'Next steps: run the e2e suite.', 'Let me know if you want more.', 'I will now check the callers.']) {
    const r = check(report({ extra: `## Megjegyzés\n${phrase}` }));
    assert.equal(r.ok, false, phrase);
    assert.match(r.problems.join(' | '), /megállási \/ felajánló fordulat/, phrase);
  }
  assert.equal(check(report({ extra: '## Megjegyzés\n```js\n// TODO: következő lépésként ellenőrizni\n```' })).ok, true, 'a kódblokk idézet');
  assert.equal(check(report({ extra: '## Megjegyzés\nA kód `ha szeretnéd` szövegű gombot rajzol.' })).ok, true, 'a soron belüli kód idézet');
});

test('T3: lelet forgatókönyv / javaslat nélkül, vagy „és így tovább” / „példaként néhány” → elutasítva', () => {
  assert.match(check(report(), [{ ...FINDINGS[0], fix: '' }]).problems.join(' | '), /L1: hiányzik a konkrét javítási javaslat/);
  assert.match(check(report(), [{ ...FINDINGS[0], scenario: 'rossz' }]).problems.join(' | '), /L1: hiányzik a forgatókönyv/);
  assert.equal(check(report({ leletek: '## Leletek\n### L1 — közepes\nPéldaként néhány hely: a.ts:3, b.ts:9, és így tovább.' })).ok, false);
});

test('T4: hiányzó kötelező szakasz vagy hibakereső pont, illetve ítélet nélküli pont → elutasítva, a hiánylistában a pont azonosítója', () => {
  const noSection = check(report({ notTested: null, closing: 'TELJESSÉG: 10 / 10 pont — HIÁNYZÓ: nincs' }));
  assert.match(noSection.problems.join(' | '), /hiányzó kötelező szakasz: „Mit NEM vizsgáltam”/);
  const noPoints = check(report({ pontok: null, closing: 'TELJESSÉG: 0 / 10 pont — HIÁNYZÓ: 1, 2, 3, 4, 5, 6, 7, 8a, 8b, 9' }));
  assert.match(noPoints.problems.join(' | '), /hiányzó kötelező szakasz: „A hibakereső pontok”/);
  const missing8b = check(report({ points: POINTS.filter((p) => p !== '8b'), closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 8b' }));
  assert.equal(missing8b.ok, false);
  assert.deepEqual(missing8b.missing, ['8b']);
  const noVerdict = check(report({ pointText: { 3: 'Lásd fent.' }, closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 3' }));
  assert.deepEqual(noVerdict.missing, ['3'], 'ítélet-szó / tartalom nélküli pont nem számít tárgyaltnak');
});

test('T5: hiányzó vagy hamis zárósor → elutasítva; csonka jelentés (zárósor és szakaszok nélkül) is', () => {
  assert.match(check(report({ closing: '' })).problems.join(' | '), /hiányzik a zárósor/);
  assert.match(check(report({ closing: 'TELJESSÉG: 10 / 10 pont — HIÁNYZÓ: 8b' })).problems.join(' | '), /a zárósor nem egyezik/);
  assert.match(check(report({ points: POINTS.filter((p) => p !== '9') })).problems.join(' | '), /a zárósor nem egyezik/, 'a modell nem állíthat 10 / 10-et, ha 9 pont van');
  const cut = report().slice(0, 200);
  const r = check(cut);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' | '), /hiányzik a zárósor/);
  assert.equal(modelText(`${report()}\n\n---\n## Gépi összegzés (a futtató írta, nem az ellenőr)\n| x |`), report(), 'a gépi lábléc előtti szöveg számít');
});

// ---- T6: a hurok a futtatóban -----------------------------------------------------------------------------------------------

const repo = makeRepo({ files: { 'a.ts': 'export function send(x) {\n  if (!x) return;\n  queue.push(x)\n}\n' } });
after(() => repo.cleanup());
const quote = 'queue.push(x)';
const fnd = [{ ...FINDINGS[0], quote }];

function loopSetup(steps, maxRetries = 3) {
  const or = fakeOpenRouter(steps);
  const box = { report: null, abort: null };
  let tools;
  const gate = makeReportGate({ head: repo.head, cfg: CFG, root: repo.root, points: POINTS, box, maxRetries, getTools: () => tools });
  tools = makeTools({ root: repo.root, base: repo.base, head: repo.head, cfg: CFG, env: process.env, onReport: gate.onReport });
  const budget = createBudget({ maxUsd: 2, maxRounds: 20, maxWallMs: 1e9, maxCompletionTokens: 1e9, cfg: CFG });
  const run = () => runReview({ cfg: CFG, key: 'k-0000', system: 'S', user: 'U', tools, box, budget, fetchImpl: or.fetchImpl, sleep: async () => {} });
  return { or, run, gate, box };
}
const sub = (text) => reply({ calls: [['submit_report', { report: text.replace(`Fej: ${HEAD}`, `Fej: ${repo.head}`), findings: fnd }]] });
const incomplete = report({ points: POINTS.filter((p) => p !== '8b'), closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 8b', extra: '## Megjegyzés\nKövetkező lépésként megnézem a 8b pontot.' });

test('T6: 1. leadás hiányos → ugyanabban a beszélgetésben folytatás a hiánylistával → 2. teljes → elfogadva', async () => {
  const s = loopSetup([sub(incomplete), sub(report())]);
  const r = await s.run();
  assert.equal(r.complete, true);
  const toolMsgs = s.or.bodies[1].messages.filter((m) => m.role === 'tool').map((m) => (Array.isArray(m.content) ? m.content.map((p) => p.text).join('') : m.content));
  assert.match(toolMsgs.at(-1), /ELUTASÍTVA — javítsd, és add le újra: .*TELJESSÉG.*8b/s);
  assert.match(toolMsgs.at(-1), /megállási \/ felajánló fordulat/);
  assert.equal(s.gate.state.completenessRejections, 1);
  assert.equal(s.gate.state.last.ok, true);
});

test('T6: 4 hiányos leadás (3 folytatás után is hiányos) → NEM TELJES, nem ítélet; a hiánylista a megállás okában', async () => {
  const s = loopSetup([sub(incomplete)]);
  const r = await s.run();
  assert.equal(r.complete, false);
  assert.match(r.stopReason, /teljesség: 3 folytatás után is hiányos — hiányzik: 8b/);
  assert.equal(s.or.bodies.length, 4, 'pontosan 4 leadás (1 + 3 folytatás)');
  assert.equal(s.box.report, null);
});

// ---- T7: record-review / bizonyíték ------------------------------------------------------------------------------------------

test('T7: kizárólagos módban a teljesség-bizonyíték nélküli vagy hiányos futtató-jelentés nem rögzíthető; a szöveg újraellenőrizve', () => {
  const text = report();
  const sha = createHash('sha256').update(text).digest('hex');
  const ev = { kind: 'blind-review', head: HEAD, complete: true, verdict: 'IGEN, FELTÉTELLEL', reportSha256: sha, modelRequested: CFG.model, modelReported: [CFG.model],
    toolCalls: { read_file: 5, git_diff: 2, search: 1, submit_report: 1 }, completeness: { ok: true, covered: 10, total: 10, attempts: 1, points: POINTS } };
  const args = (e, t = text) => ({ evidence: e, head: HEAD, reportSha256: createHash('sha256').update(t).digest('hex'), verdict: 'IGEN, FELTÉTELLEL', cfg: { ...CFG, requireCompleteness: true }, reportText: t });
  assert.equal(checkBlindEvidence(args(ev)).ok, true);
  const { completeness: _c, ...noComp } = ev;
  assert.match(checkBlindEvidence(args(noComp)).error, /teljesség-bizonyíték/);
  assert.match(checkBlindEvidence(args({ ...ev, completeness: { ...ev.completeness, ok: false } })).error, /teljesség-bizonyíték/);
  const bad = report({ extra: '## Megjegyzés\nHa szeretnéd, folytatom.' });
  assert.match(checkBlindEvidence(args({ ...ev, reportSha256: createHash('sha256').update(bad).digest('hex') }, bad)).error, /a jelentés a teljesség-ellenőrzésen nem megy át/i);
});

// ---- T8: Codex CLI-burok -----------------------------------------------------------------------------------------------------

test('T8: a Codex-burok hiánynál `codex exec resume <azonosító> -` hívással folytat (a hiánylista a bemeneten), teljesnél megáll', async () => {
  const dir = repo.dir;
  const out = join(dir, 'valasz.md');
  const calls = [];
  const replies = [incomplete, incomplete, report()];
  const exec = async (file, args, opts) => {
    calls.push({ file, args, input: opts.input });
    writeFileSync(out, replies[calls.length - 1]);
    return { code: 0, stdout: `${JSON.stringify({ type: 'thread.started', thread_id: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' })}\n{"type":"turn.completed"}\n`, stderr: '' };
  };
  const r = await runCodexComplete({ exec, prompt: 'megbízás', out, points: POINTS, maxResumes: 3, execArgs: ['-m', 'gpt-6.2-sol'] });
  assert.equal(r.ok, true);
  assert.equal(r.resumes, 2);
  assert.deepEqual(calls[0].args.slice(0, 2), ['exec', '--json']);
  assert.ok(calls[0].args.includes('-o') && calls[0].args.includes(out));
  assert.deepEqual(calls[1].args.slice(0, 4), ['exec', 'resume', '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', '-']);
  assert.ok(calls[1].args.includes('--json') && calls[1].args.includes('-o'));
  assert.match(calls[1].input, /HIÁNYZÓ.*8b/s);
  assert.match(calls[1].input, /megállási \/ felajánló fordulat/);

  const always = async (file, args, opts) => { calls.push({ args }); writeFileSync(out, incomplete); return { code: 0, stdout: '{"type":"thread.started","thread_id":"0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"}\n', stderr: '' }; };
  const r2 = await runCodexComplete({ exec: always, prompt: 'p', out, points: POINTS, maxResumes: 3 });
  assert.equal(r2.ok, false);
  assert.equal(r2.resumes, 3);
  assert.match(r2.reason, /3 folytatás után is hiányos/);

  const noId = async () => { writeFileSync(out, incomplete); return { code: 0, stdout: '{"type":"turn.completed"}\n', stderr: '' }; };
  const r3 = await runCodexComplete({ exec: noId, prompt: 'p', out, points: POINTS, maxResumes: 3 });
  assert.equal(r3.ok, false);
  assert.match(r3.reason, /nincs munkamenet-azonosító/);
});

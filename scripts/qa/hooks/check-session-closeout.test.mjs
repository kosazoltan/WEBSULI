// docs/specs/2026-11-20-session-zaras.md D6, D7, A9–A11, E13, E14: a Stop hook csak a zárásra készülő választ fordítja vissza,
// ha a legutóbbi zöld closeout óta feldolgozatlan tulajdonosi üzenet van. Folyamat-szintű próbák, SZINTETIKUS átirattal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isClosingMessage } from './check-session-closeout.mjs';

const HOOK = fileURLToPath(new URL('./check-session-closeout.mjs', import.meta.url));

let seq = 0;
const human = (text) => { seq += 1; return JSON.stringify({ type: 'user', uuid: `h-${seq}`, timestamp: '2026-11-20T07:00:00Z', isSidechain: false, origin: { kind: 'human' }, message: { role: 'user', content: text } }); };
const tool = (text) => JSON.stringify({ type: 'user', uuid: `t-${++seq}`, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: text }] } });

const CLOSING = 'Záró jelentés: a módosított fájlok, a futtatott ellenőrzések és a maradó kockázatok a következők.';
const SHORT = 'Melyik változatot szeretnéd, az A-t vagy a B-t?';

function setup(lines) {
  const repo = mkdtempSync(join(tmpdir(), 'zaras-hook-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const ev = join(repo, 'ev');
  const transcript = join(repo, 'sess-h.jsonl');
  writeFileSync(transcript, `${lines.join('\n')}\n`);
  return { repo, ev, transcript };
}

function run(payload, { ev, raw } = {}) {
  const env = { ...process.env };
  if (ev) env.WEBSULI_QA_EVIDENCE_DIR = ev; else delete env.WEBSULI_QA_EVIDENCE_DIR;
  const out = execFileSync(process.execPath, [HOOK], { input: raw ?? JSON.stringify(payload), encoding: 'utf8', env });
  return out.trim() ? JSON.parse(out) : null;
}

const stop = (s, extra = {}) => ({ hook_event_name: 'Stop', session_id: 'sess-h', transcript_path: s.transcript, cwd: s.repo,
  stop_hook_active: false, last_assistant_message: CLOSING, background_tasks: [], session_crons: [], ...extra });

function writeOk(s, bytes) {
  mkdirSync(s.ev, { recursive: true });
  writeFileSync(join(s.ev, 'closeout-ok-sess-h.json'), JSON.stringify({ kind: 'closeout', session: 'sess-h', transcript: s.transcript, transcriptBytes: bytes, ownerCount: 1 }));
}

test('A9: zárásra utaló válasz + feldolgozatlan tulajdonosi üzenet → decision: block, a pontos parancsokkal', () => {
  const s = setup([human('Első kérés'), tool('x'), human('Második kérés')]);
  const r = run(stop(s), { ev: s.ev });
  assert.equal(r?.decision, 'block');
  assert.match(r.reason, /2 feldolgozatlan tulajdonosi üzenet/);
  assert.match(r.reason, /session-closeout\.mjs collect --transcript "[^"]+sess-h\.jsonl"/);
  assert.match(r.reason, /session-closeout\.mjs verify/);
  assert.match(r.reason, /websuli-session-zaras/);
});

test('A10: rövid / közbenső válasz, gyenge jel rövid válaszban → nem tilt', () => {
  const s = setup([human('Kérés')]);
  assert.equal(run(stop(s, { last_assistant_message: SHORT }), { ev: s.ev }), null);
  assert.equal(run(stop(s, { last_assistant_message: 'Kész, nézd meg.' }), { ev: s.ev }), null);
  assert.equal(run(stop(s, { last_assistant_message: '' }), { ev: s.ev }), null);
  // gyenge jel hosszú (jelentés-szerű) válaszban → tilt
  const longWeak = `Elkészült a javítás. ${'A részletek: módosult a fejléc, futott a teszt. '.repeat(15)}`;
  assert.equal(run(stop(s, { last_assistant_message: longWeak }), { ev: s.ev })?.decision, 'block');
});

test('E13: stop_hook_active → nem tilt újra, a tulajdonosnak látható systemMessage-et ad', () => {
  const s = setup([human('Kérés')]);
  const r = run(stop(s, { stop_hook_active: true }), { ev: s.ev });
  assert.equal(r?.decision, undefined);
  assert.match(r?.systemMessage ?? '', /kérés-összevetés.*hiányzik/);
});

test('E14: futó háttérfeladat vagy ütemezett ébresztés → a session szünetel, nem tilt', () => {
  const s = setup([human('Kérés')]);
  assert.equal(run(stop(s, { background_tasks: [{ id: 'b', type: 'shell', status: 'running' }] }), { ev: s.ev }), null);
  assert.equal(run(stop(s, { session_crons: [{ id: 'c', schedule: '0 9 * * *', recurring: true }] }), { ev: s.ev }), null);
});

test('friss zöld closeout után nem tilt; utána érkező tulajdonosi üzenetnél újra tilt (csak az újakat számolja)', () => {
  const s = setup([human('Kérés'), tool('x')]);
  writeOk(s, readFileSync(s.transcript).length);
  assert.equal(run(stop(s), { ev: s.ev }), null);
  appendFileSync(s.transcript, `${tool('y')}\n`);
  assert.equal(run(stop(s), { ev: s.ev }), null, 'eszköz-eredmény nem tulajdonosi üzenet');
  appendFileSync(s.transcript, `${human('Új kérés')}\n`);
  const r = run(stop(s), { ev: s.ev });
  assert.equal(r?.decision, 'block');
  assert.match(r.reason, /1 feldolgozatlan tulajdonosi üzenet/);
});

test('más átiratra szóló vagy a fájlnál nagyobb bájtméretű bizonyíték nem számít zöldnek', () => {
  const s = setup([human('Kérés')]);
  mkdirSync(s.ev, { recursive: true });
  writeFileSync(join(s.ev, 'closeout-ok-sess-h.json'), JSON.stringify({ session: 'sess-h', transcript: join(s.repo, 'mas.jsonl'), transcriptBytes: 999999 }));
  assert.equal(run(stop(s), { ev: s.ev })?.decision, 'block');
  writeOk(s, 10 ** 9);
  assert.equal(run(stop(s), { ev: s.ev })?.decision, 'block');
});

test('nem Stop esemény, git-repón kívül, átirat nélkül, hibás bemenet → nem tilt', () => {
  const s = setup([human('Kérés')]);
  assert.equal(run({ ...stop(s), hook_event_name: 'PreToolUse' }, { ev: s.ev }), null);
  assert.equal(run(stop(s, { transcript_path: join(s.repo, 'nincs.jsonl') }), { ev: s.ev }), null);
  assert.equal(run(null, { ev: s.ev, raw: '{"hook_event_name":"Stop"' }), null);
  assert.equal(run(null, { ev: s.ev, raw: '' }), null);
  const outside = mkdtempSync(join(tmpdir(), 'zaras-nem-repo-'));
  const t = join(outside, 'sess-h.jsonl');
  writeFileSync(t, `${human('Kérés')}\n`);
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() };
  delete env.WEBSULI_QA_EVIDENCE_DIR;
  const out = execFileSync(process.execPath, [HOOK], { input: JSON.stringify({ ...stop(s), transcript_path: t, cwd: outside }), encoding: 'utf8', env });
  assert.equal(out.trim(), '');
});

test('belső hiba (az átirat útvonala könyvtár) zárásra utaló válasznál → tilt teendővel; közbenső válasznál enged', () => {
  const s = setup([human('Kérés')]);
  const dirAsTranscript = join(s.repo, 'konyvtar.jsonl');
  mkdirSync(dirAsTranscript);
  const r = run(stop(s, { transcript_path: dirAsTranscript }), { ev: s.ev });
  assert.equal(r?.decision, 'block');
  assert.match(r.reason, /hibára futott/);
  assert.equal(run(stop(s, { transcript_path: dirAsTranscript, last_assistant_message: SHORT }), { ev: s.ev }), null);
});

test('isClosingMessage: erős jelek bárhol, gyenge jel csak hosszú válaszban; közbenső mondatok nem', () => {
  for (const m of ['Záró jelentés', 'Összefoglaló a munkáról', 'Jöhet a higiénia', 'A session vége előtt', 'Felelős nyilatkozat:', 'Final report', 'Befejeztem a feladatot.', 'Minden kész.']) {
    assert.equal(isClosingMessage(m), true, m);
  }
  for (const m of [SHORT, 'Futtatom a teszteket.', 'Kész, nézd meg.', 'Done.', 'Mit szeretnél még?']) assert.equal(isClosingMessage(m), false, m);
});

test('A11: ≥ 100 MB-os átirat, bizonyíték nélkül (teljes keresés) < 1500 ms', () => {
  const repo = mkdtempSync(join(tmpdir(), 'zaras-nagy-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const transcript = join(repo, 'sess-big.jsonl');
  const filler = `${tool('x'.repeat(4000))}\n`;
  const chunk = Buffer.from(filler.repeat(250)); // ~1 MB
  const fd = openSync(transcript, 'w');
  for (let i = 0; i < 105; i += 1) { writeSync(fd, chunk); if (i % 20 === 0) writeSync(fd, `${human(`Kérés ${i}`)}\n`); }
  closeSync(fd);
  const t0 = Date.now();
  const r = run({ hook_event_name: 'Stop', session_id: 'sess-big', transcript_path: transcript, cwd: repo, stop_hook_active: false, last_assistant_message: CLOSING, background_tasks: [], session_crons: [] }, { ev: join(repo, 'ev') });
  const ms = Date.now() - t0;
  assert.equal(r?.decision, 'block');
  assert.match(r.reason, /6 feldolgozatlan/);
  assert.ok(ms < 1500, `lassú hook: ${ms} ms`);
});

// Kilépési nyom és zárvárási életjel (docs/specs/2026-11-20-gpt-teljesitesi-or.md, T13–T14). A „néma 1-es kilépés” hibajegy
// reprodukciója: a futtató argumentum-hibával 1-gyel lépett ki, és a sor-futtató naplójából ez nem látszott; mostantól minden
// kilépési úton „KILÉPÉS <kód> — ok: …” sor kerül a naplóba. Egyik teszt sem hív valódi API-t.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExitTrace, lockWaitReporter } from './exit-trace.mjs';
import { acquireMachineLock } from './heavy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const LINE = /\[blind-review\] KILÉPÉS (-?\d+) — ok: (.*); utolsó állapot: szakasz (.*), kör (\d+), eszköz (.*), várakozás: (.*)$/m;

/** Gyerekfolyamat a valódi kezelőkkel: a forgatókönyv a kilépés módját választja. */
function child(scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'exit-trace-'));
  try {
    const f = join(dir, 'c.mjs');
    writeFileSync(f, [
      `import { createExitTrace } from ${JSON.stringify(pathToFileURL(join(HERE, 'exit-trace.mjs')).href)};`,
      `const t = createExitTrace({ mask: (s) => s.replaceAll('sk-or-v1-TITOK', '***') }).install();`,
      `t.set({ phase: 'modellhívások', round: 2, tool: 'run_db_tests', waiting: 'gépi zár (run_db_tests), 600 mp óta' });`,
      `const s = ${JSON.stringify(scenario)};`,
      `if (s === 'throw') setTimeout(() => { throw new Error('bumm sk-or-v1-TITOK'); }, 5);`,
      `if (s === 'reject') Promise.reject(new Error('elutasítva'));`,
      `if (s === 'drain') new Promise(() => {});`,
      `if (s === 'sigterm') setTimeout(() => process.emit('SIGTERM'), 5);`,
      `if (s === 'exit1') { t.reason('HIBA: a --max-usd legfeljebb 6 USD lehet'); t.settle(); process.exit(1); }`,
      `if (s === 'first') { t.reason('ÍTÉLET: IGEN'); t.reason('valami később'); t.settle(); process.exit(0); }`,
    ].join('\n'));
    const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 30_000 });
    return { status: r.status, stderr: r.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('T14a: kezeletlen kivétel → KILÉPÉS 2, ok + utolsó állapot (kör, eszköz, várakozás), a titok maszkolva', () => {
  const r = child('throw');
  assert.equal(r.status, 2);
  const m = r.stderr.match(LINE);
  assert.ok(m, r.stderr);
  assert.equal(m[1], '2');
  assert.match(m[2], /^kezeletlen kivétel: .*bumm/);
  assert.doesNotMatch(r.stderr, /sk-or-v1-TITOK/);
  assert.equal(m[3], 'modellhívások');
  assert.equal(m[4], '2');
  assert.equal(m[5], 'run_db_tests');
  assert.match(m[6], /gépi zár \(run_db_tests\), 600 mp óta/);
});

test('T14b: kezeletlen ígéret-elutasítás → KILÉPÉS 2 okkal (nem néma)', () => {
  const r = child('reject');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /KILÉPÉS 2 — ok: kezeletlen ígéret-elutasítás: .*elutasítva/);
});

test('T14c: kiürült eseményhurok (elveszett várakozás) → nem nulla kód (2), a KILÉPÉS-sor megnevezi (vak ellenőr L12)', () => {
  const r = child('drain');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /KILÉPÉS 2 — ok: kiürült eseményhurok — a fő ígéret nem teljesült/);
});

test('T14d: külső leállítási jelzés (SIGTERM) → KILÉPÉS 2, ok: jelzés', () => {
  const r = child('sigterm');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /KILÉPÉS 2 — ok: jelzés: SIGTERM/);
});

test('T14e: saját kilépés okkal → a kód és az ok a sorban; az ELSŐ ok marad', () => {
  const a = child('exit1');
  assert.equal(a.status, 1);
  assert.match(a.stderr, /KILÉPÉS 1 — ok: HIBA: a --max-usd legfeljebb 6 USD lehet;/);
  const b = child('first');
  assert.equal(b.status, 0);
  assert.match(b.stderr, /KILÉPÉS 0 — ok: ÍTÉLET: IGEN;/);
});

test('T14f: a valódi futtató argumentum-hibánál (a néma 1-es kilépés hibajegye) 1-gyel lép ki, és a KILÉPÉS-sor megnevezi az okot', () => {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  const out = mkdtempSync(join(tmpdir(), 'br-arg-'));
  try {
    const r = spawnSync(process.execPath, [join(HERE, 'blind-review.mjs'), '--base', head, '--head', head, '--spec', 'x.md', '--goal', 'x.md',
      '--out', join(out, 'j.md'), '--max-usd', '999'], { cwd: REPO, encoding: 'utf8', timeout: 60_000, env: { ...process.env, OPENROUTER_API_KEY: '' } });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /KILÉPÉS 1 — ok: HIBA: a --max-usd legfeljebb \d+ USD lehet/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('T14g: a sor a beállított állapotot és a maszkolót használja (egységszinten)', () => {
  const lines = [];
  const t = createExitTrace({ write: (s) => lines.push(s) });
  t.setMask((s) => s.replaceAll('TITOK', '***'));
  t.set({ phase: 'modellhívások', round: 7, tool: 'read_file', waiting: null });
  t.reason('HIBA: TITOK kiszivárgott volna');
  const l = t.line(3);
  assert.match(l, /^\[blind-review\] KILÉPÉS 3 — ok: HIBA: \*\*\* kiszivárgott volna; utolsó állapot: szakasz modellhívások, kör 7, eszköz read_file, várakozás: nincs\n$/);
  const u = createExitTrace({ write: () => {} });
  assert.match(u.line(1), /ok: ismeretlen/);
});

test('T13a: zárvárási életjel percenként — 10 mp-es lekérdezések 130 mp-en át → 3 naplósor (0., 60., 120. mp), mind szívveréssel', () => {
  let t = 0;
  const said = []; const beats = [];
  const report = lockWaitReporter({ say: (s) => said.push(s), beat: (d) => beats.push(d), now: () => t });
  for (let waited = 0; waited <= 130_000; waited += 10_000) { t = waited; report({ tool: 'run_db_tests', waitedMs: waited, holder: 'advent-c (kapu-sor) — bash x.sh — PID 1' }); }
  assert.equal(said.length, 3, said.join('\n'));
  assert.match(said[0], /^zárvárás: run_db_tests — 0 perc 0 mp óta vár a gépi zárra; gazda: advent-c \(kapu-sor\)/);
  assert.match(said[1], /1 perc 0 mp/);
  assert.match(said[2], /2 perc 0 mp/);
  assert.equal(beats.length, 3);
  assert.ok(beats.every((b) => b.phase === 'lock-wait' && b.tool === 'run_db_tests'));
});

test('T13b: acquireMachineLock minden várakozó lekérdezéskor jelez (onPoll: eltelt idő + gazda); a jelző hibája nem szakítja meg a várakozást', async () => {
  const base = mkdtempSync(join(tmpdir(), 'lock-poll-'));
  try {
    const dir = join(base, 'lock');
    mkdirSync(dir);
    writeFileSync(join(dir, 'gazda.txt'), 'idegen (kapu-sor) — PID 1');
    let t = 0;
    const polls = [];
    const r = await acquireMachineLock({ dir, owner: 'blind-review x', maxWaitMs: 40_000, pollMs: 10_000, now: () => t, sleep: async (ms) => { t += ms; },
      onPoll: (p) => { polls.push(p); if (polls.length === 2) throw new Error('a jelző elromlott'); } });
    assert.equal(r.ok, false);
    assert.deepEqual(polls.map((p) => p.waitedMs), [0, 10_000, 20_000, 30_000]);
    assert.ok(polls.every((p) => p.holder === 'idegen (kapu-sor) — PID 1'));
  } finally { rmSync(base, { recursive: true, force: true }); }
});

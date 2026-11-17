// S8 — ingadozó tesztek nyilvántartása (docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md „S8”).
// A napló-minták a valódi `gh run view --job <id> --log` alakját követik (job⇥lépés⇥időbélyeg előtag, Playwright-összesítő,
// node:test „failing tests” szakasz); a 2026-11-17-i main-futás (44067781689) összesítője alapján.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggregate, checkKnown, cleanLine, collectRun, decidePr, ghRun, KNOWN_FILE, knownEntry, parseJobLog, testFileOf } from './flaky-report.mjs';

const P = (s) => `Playwright E2E\tUNKNOWN STEP\t2026-11-17T12:07:04.4291875Z ${s}`;
const U = (s) => `Unit Tests\tRun unit tests\t2026-11-17T12:07:04.4291875Z ${s}`;
const BOX = '────────────';

const E2E_LOG = [
  P('  Slow test file: [chromium] › tests/support/game-mobile-quality.ts (21.3m)'),
  P('  1 failed'),
  P(`    [chromium] › tests/joystick-response.spec.ts:629:3 › joystick-reakció: block-craft-quiz ${BOX}`),
  P('  1 flaky'),
  P(`    [chromium] › tests/joystick-response.spec.ts:629:3 › joystick-reakció: tsunami-english ${BOX}`),
  P('  745 passed (1.3h)'),
  P('##[error]Process completed with exit code 1.'),
].join('\n');

const UNIT_LOG = [
  U('ℹ tests 3682'),
  U('✖ failing tests:'),
  U(''),
  U('test at tests/word-ladder-core.test.ts:10:1'),
  U('✖ győzelem: utána a válasz nem változtat (12.5ms)'),
  U('  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:'),
  U('##[error]Process completed with exit code 1.'),
].join('\n');

const WL = 'e2e:tests/word-ladder-play.spec.ts:48 › szólétra: a kérdés-sáv';
const JB = 'e2e:tests/joystick-response.spec.ts:629 › joystick-reakció: block-craft-quiz';
const JT = 'e2e:tests/joystick-response.spec.ts:629 › joystick-reakció: tsunami-english';

test('cleanLine / parseJobLog: Playwright failed + flaky (paraméterezett teszt: a cím is az azonosító része), node:test bukás', () => {
  assert.equal(cleanLine(P('  1 failed')), '  1 failed');
  assert.deepEqual(parseJobLog(E2E_LOG), { failed: [JB], flaky: [JT] });
  assert.deepEqual(parseJobLog(UNIT_LOG), { failed: ['unit:győzelem: utána a válasz nem változtat'], flaky: [] });
  assert.deepEqual(parseJobLog(P('  745 passed (1.3h)')), { failed: [], flaky: [] });
  assert.equal(testFileOf(JB), 'source/tests/joystick-response.spec.ts');
  assert.equal(testFileOf('unit:x'), null);
});

const run = (id, attempts) => ({ id, sha: `s${id}`, createdAt: `2026-11-${10 + id}`, attempts });
const A = (attempt, conclusion, failed = [], flaky = []) => ({ attempt, conclusion, failed, flaky });

test('aggregate: Playwright-újrapróba, újraindításra zöld, nem egymást követő bukás → ingadozó; két legutóbbi egymás után → tartós', () => {
  const runs = [
    run(9, [A(1, 'failure', ['e2e:tests/uj.spec.ts:5 › új'])]),
    run(8, [A(1, 'failure', ['e2e:tests/uj.spec.ts:5 › új'])]),
    run(7, [A(1, 'failure', [WL]), A(2, 'success')]),
    run(6, [A(1, 'success', [], [JT])]),
    run(5, [A(1, 'failure', ['unit:ritka'])]),
    run(4, [A(1, 'success')]),
    run(3, [A(1, 'failure', ['unit:ritka'])]),
    run(2, [A(1, 'failure', ['unit:egyszer'])]),
  ];
  const by = Object.fromEntries(aggregate(runs).map((r) => [r.id, r]));
  assert.equal(by[WL].cls, 'ingadozó');
  assert.equal(by[WL].rerunPass, 1);
  assert.equal(by[JT].cls, 'ingadozó');
  assert.equal(by[JT].flakyRetries, 1);
  assert.equal(by['unit:ritka'].cls, 'ingadozó', 'a két bukás között zöld futás volt');
  assert.equal(by['e2e:tests/uj.spec.ts:5 › új'].cls, 'tartós bukás', 'a két legfrissebb futásban egymás után');
  assert.equal(by['unit:egyszer'].cls, 'egyszeri bukás');
  // Korábban újrapróbán átment, most a két legfrissebb futásban egymás után bukik → tartós (regresszió-gyanú), nem „ingadozó”.
  const r2 = aggregate([run(3, [A(1, 'failure', [JB])]), run(2, [A(1, 'failure', [JB])]), run(1, [A(1, 'success', [], [JB])])]);
  assert.equal(r2[0].cls, 'tartós bukás');
});

test('decidePr: csak ismert ingadozó bukás → „nem a PR hibája”; új bukás vagy a PR által módosított teszt → „a PR hibája lehet”', () => {
  const ranking = aggregate([run(2, [A(1, 'failure', [WL]), A(2, 'success')]), run(1, [A(1, 'success')])]);
  const known = [{ id: 'e2e:tests/word-ladder-play.spec.ts:48', ticket: 95, note: 'kérdés-sáv időzítés' }];
  const ok = decidePr({ failed: [WL], ranking, known, prFiles: ['source/client/src/pages/X.tsx'] });
  assert.equal(ok.verdict, 'nem a PR hibája');
  assert.match(ok.items[0].why, /jegy: #95/);
  const touched = decidePr({ failed: [WL], ranking, known, prFiles: ['source/tests/word-ladder-play.spec.ts'] });
  assert.equal(touched.verdict, 'a PR hibája lehet');
  const fresh = decidePr({ failed: [WL, 'unit:új hiba'], ranking, known, prFiles: [] });
  assert.equal(fresh.verdict, 'a PR hibája lehet');
  assert.equal(fresh.items[1].status, 'A PR HIBÁJA LEHET');
  assert.equal(decidePr({ failed: [], ranking, known, prFiles: [] }).verdict, 'nincs bukás');
});

test('checkKnown / knownEntry: jegy nélküli ingadozó és jegy nélküli listaelem hiba; cím nélküli elem a sor minden esetére illik', () => {
  const ranking = aggregate([run(1, [A(1, 'success', [], [JT, 'e2e:tests/mas.spec.ts:3 › m'])])]);
  const p = checkKnown(ranking, [{ id: 'e2e:tests/joystick-response.spec.ts:629', ticket: 96 }, { id: 'e2e:tests/x.spec.ts:1', ticket: null }]);
  assert.equal(p.length, 2, p.join('\n'));
  assert.ok(p.some((s) => s.includes('tests/mas.spec.ts:3') && s.includes('NINCS a known-flaky.json-ban')));
  assert.ok(p.some((s) => s.includes('x.spec.ts:1') && s.includes('nincs kanban-jegy')));
  assert.ok(knownEntry([{ id: 'e2e:tests/joystick-response.spec.ts:629', ticket: 96 }], JB));
  assert.equal(knownEntry([{ id: JT, ticket: 96 }], JB), null, 'címes elem csak a saját esetére');
});

test('collectRun: minden kísérlet, bukott job + a zöld E2E job naplója (flaky), gyorsítótár nélkül', () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push(args.join(' '));
    const a = args.join(' ');
    if (a.includes('--attempt 1')) return { code: 0, stdout: JSON.stringify({ conclusion: 'failure', jobs: [{ databaseId: 11, name: 'Playwright E2E', conclusion: 'failure' }, { databaseId: 12, name: 'Lint & Typecheck', conclusion: 'success' }] }) };
    if (a.includes('--attempt 2')) return { code: 0, stdout: JSON.stringify({ conclusion: 'success', jobs: [{ databaseId: 21, name: 'Playwright E2E', conclusion: 'success' }] }) };
    if (a.includes('actions/jobs/11/logs')) return { code: 0, stdout: E2E_LOG };
    if (a.includes('actions/jobs/21/logs')) return { code: 0, stdout: P('  745 passed (1.3h)') };
    return { code: 1, stdout: '', stderr: 'váratlan hívás' };
  };
  const r = collectRun({ exec, root: '.', run: { databaseId: 5, headSha: 'abc', createdAt: 'x', attempt: 2 }, cacheDir: null });
  assert.deepEqual(r.attempts.map((x) => [x.attempt, x.conclusion, x.failed, x.flaky]), [[1, 'failure', [JB], [JT]], [2, 'success', [], []]]);
  assert.ok(!calls.some((c) => c.includes('jobs/12/')), 'a zöld nem-E2E job naplóját nem tölti le');
});

test('ghRun: átmeneti hibánál legfeljebb 3 kísérlet növekvő várakozással; végleges hibánál (nem található) nincs újrapróba', () => {
  const waits = [];
  let n = 0;
  const flaky = () => { n += 1; return n < 3 ? { code: 1, stdout: '', stderr: 'net/http: TLS handshake timeout' } : { code: 0, stdout: '[]', stderr: '' }; };
  const ok = ghRun(flaky, '.', ['run', 'list'], { sleep: (ms) => waits.push(ms), delays: [2000, 5000] });
  assert.equal(ok.code, 0);
  assert.equal(ok.tries, 3);
  assert.deepEqual(waits, [2000, 5000]);
  const down = ghRun(() => ({ code: 1, stdout: '', stderr: 'HTTP 502: Bad Gateway' }), '.', ['x'], { sleep: () => {}, delays: [1, 1] });
  assert.equal(down.code, 1);
  assert.equal(down.tries, 3, 'a 3. kísérlet után feladja (a hívó 2-es kóddal áll le)');
  let calls = 0;
  const nf = ghRun(() => { calls += 1; return { code: 1, stdout: '', stderr: 'no pull requests found' }; }, '.', ['x'], { sleep: () => {}, delays: [1, 1] });
  assert.equal(nf.tries, 1);
  assert.equal(calls, 1);
});

test('known-flaky.json: érvényes, minden elemnek van jegye, és a tartós bukás (629 block-craft, #106) nincs rajta', () => {
  const known = JSON.parse(readFileSync(KNOWN_FILE, 'utf8')).tests;
  assert.ok(known.length > 0);
  assert.ok(known.every((k) => Number.isInteger(k.ticket) && typeof k.id === 'string'));
  assert.equal(knownEntry(known, JB), null);
  assert.ok(knownEntry(known, JT));
  assert.ok(knownEntry(known, WL.replace('szólétra: a kérdés-sáv', 'bármely cím')));
});

test('parseJobLog: a job-napló API-alakja (előtag nélkül, csak időbélyeg) is értelmezett', () => {
  const raw = (s) => `2026-11-17T12:07:04.4291875Z ${s}`;
  const log = [raw('  1 failed'), raw(`    [chromium] › tests/word-ladder-play.spec.ts:48:3 › Szikla-verseny: egy teljes menet ${BOX}`), raw('  763 passed (59.1m)')].join('\n');
  assert.deepEqual(parseJobLog(log), { failed: ['e2e:tests/word-ladder-play.spec.ts:48 › Szikla-verseny: egy teljes menet'], flaky: [] });
});

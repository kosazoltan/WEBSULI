// S1 — teszt-integritás kapu (docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md S1.3–S1.4).
// Minden szabályra pozitív ÉS negatív eset. A jelölő szót futásidőben, darabokból rakjuk össze, hogy a kapu a saját tesztfájlján ne
// lásson jelölést (és ne „tanuljon” belőle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { STATUS } from './lib.mjs';
import {
  analyze, analyzeFile, comparison, findMarker, formatFinding, headerMarker, joinLogical, specHasPoint, linear, parseCatFileBatch, parseDiff, readPrBody, refPoint,
  runTestIntegrityStep, similarity, stepSummary, stripGuard, subjectOf, testStem, thresholdDirection, verifyMarker,
} from './test-integrity.mjs';
import { fakeCtx, statusOf } from './_fake.mjs';

const MK = ['SPEC', 'VÁLTOZÁS'].join('-');
const GUARD = ['FORRÁS', 'ŐR'].join('-');
const T = 'source/tests/tornado-sim.test.ts';

/** Egy fájl diffje: `rows` = [jel, szöveg] párok (' ', '+', '-'), a hunk az `oldStart` / `newStart` sortól. */
function fileDiff(path, rows, { oldStart = 10, newStart = 10, status = 'M', commit } = {}) {
  const head = [`diff --git a/${path} b/${path}`];
  if (status === 'A') head.push('new file mode 100644', '--- /dev/null', `+++ b/${path}`);
  else if (status === 'D') head.push('deleted file mode 100644', `--- a/${path}`, '+++ /dev/null');
  else head.push(`--- a/${path}`, `+++ b/${path}`);
  const o = rows.filter(([t]) => t !== '+').length;
  const n = rows.filter(([t]) => t !== '-').length;
  const body = [`@@ -${oldStart},${o} +${newStart},${n} @@`, ...rows.map(([t, s]) => `${t}${s}`)];
  return [...(commit ? [`@@commit ${commit}`] : []), ...head, ...body].join('\n');
}

const OLD_K4 = '    assert.ok(withQ >= without, `${name}: kérdéssel ${withQ} < kérdés nélkül ${without}`);';
const NEW_WEAK = '    if (name === "SIM_WEAK") assert.ok(withQ >= without - 1, `${name}: kérdéssel ${withQ} ≪ kérdés nélkül ${without}`);';
const NEW_ELSE = '    else assert.ok(withQ >= without, `${name}: kérdéssel ${withQ} < kérdés nélkül ${without}`);';
const CTX = '    console.log(`[tornado-sim] ${name}: győzelem kérdéssel ${withQ}/20, kérdés nélkül ${without}/20`);';

function j7bCommit(extraAbove = []) {
  return fileDiff(T, [[' ', CTX], ...extraAbove.map((s) => ['+', s]), ['-', OLD_K4], ['+', NEW_WEAK], ['+', NEW_ELSE]], { commit: 'a'.repeat(40) });
}

/** A végső tartalom CSAK a tesztfájlra (más útra — pl. a tervre — null, hacsak külön meg nem adjuk). */
const finalOf = (lines, others = {}) => (p) => (p === T ? lines.join('\n') : others[p] ?? null);

test('parseDiff: sorszámok, commit-elválasztó, új / törölt fájl', () => {
  const text = [j7bCommit(), fileDiff('source/tests/x.test.ts', [['+', 'test("a", () => {});']], { status: 'A', oldStart: 0, newStart: 1 }),
    fileDiff('source/tests/y.test.ts', [['-', 'test("b", () => {});']], { status: 'D', oldStart: 1, newStart: 0 })].join('\n');
  const files = parseDiff(text);
  assert.deepEqual(files.map((f) => [f.path, f.status]), [[T, 'M'], ['source/tests/x.test.ts', 'A'], ['source/tests/y.test.ts', 'D']]);
  assert.equal(files[0].commit, 'a'.repeat(40));
  const ls = files[0].hunks[0].lines;
  assert.deepEqual(ls.map((l) => [l.t, l.oldLine, l.newLine]), [[' ', 10, 10], ['-', 11, null], ['+', null, 11], ['+', null, 12]]);
});

test('J7b (4da8b3b9): a „− 1” lazítás commitonként lelet — a változatlanul maradt else-ág nem', () => {
  const commits = parseDiff(j7bCommit());
  const res = analyze({ range: [], commits, finalText: finalOf([CTX, NEW_WEAK, NEW_ELSE]) });
  assert.equal(res.findings.length, 1);
  const [x] = res.findings;
  assert.equal(x.rule, 'threshold-changed');
  assert.equal(x.direction, 'looser');
  assert.equal(x.line, 2, 'a sorszám a jelenlegi fájlban');
  assert.equal(x.commitLine, 11, 'a commit-beli sorszám külön');
  assert.equal(x.verified, false);
  assert.equal(x.why, 'jelöletlen');
  assert.match(formatFinding(x), /tornado-sim\.test\.ts:2 \[commit aaaaaaaa\] — threshold-changed \(LAZÍTÁS\): JELÖLETLEN/);
});

test('J7b: ha a lazítást később visszacsinálták (a sor már nincs a fájlban), nem lelet', () => {
  const res = analyze({ range: [], commits: parseDiff(j7bCommit()), finalText: finalOf([CTX, OLD_K4]) });
  assert.deepEqual(res.findings, []);
});

test('jelölés: dátum + útvonal + a spec diffje említi a tesztet + PR-leírás → igazolt; bármelyik hiánya → nem igazolt', () => {
  const mark = `    // ${MK} 2026-11-17 (docs/specs/2026-11-16-jatek.md 21.): a gyenge modellnél ±1 menet`;
  const commits = parseDiff(j7bCommit([mark]));
  const finalLines = [CTX, mark, NEW_WEAK, NEW_ELSE];
  const spec = parseDiff(fileDiff('docs/specs/2026-11-16-jatek.md', [['+', `- 21. ${MK}: tornado-sim K4 gyenge modell ±1`]]));
  const body = `## ${MK}\n- tornado-sim.test.ts K4`;
  const ok = analyze({ range: spec, commits, finalText: finalOf(finalLines), prBody: body }).findings[0];
  assert.equal(ok.verified, true, ok.why);
  const pending = analyze({ range: spec, commits, finalText: finalOf(finalLines), prBody: null }).findings[0];
  assert.equal(pending.verified, true);
  assert.match(pending.pending, /PR-leírás/);
  const noBody = analyze({ range: spec, commits, finalText: finalOf(finalLines), prBody: 'semmi' }).findings[0];
  assert.equal(noBody.verified, false);
  assert.match(noBody.why, /PR-leírás nem sorolja fel/);
  const noSpec = analyze({ range: [], commits, finalText: finalOf(finalLines), prBody: body }).findings[0];
  assert.equal(noSpec.verified, false);
  assert.match(noSpec.why, /sem a diffben, sem a fejen/);
  // B2/3: a terv a FEJEN már megvan (korábbi PR-ban került be), és tartalmazza a hivatkozott pontot (21.) → igazolt
  const onHead = analyze({ range: [], commits, finalText: finalOf(finalLines, { 'docs/specs/2026-11-16-jatek.md': '## 21. A gyenge modell ±1 menete' }), prBody: body }).findings[0];
  assert.equal(onHead.verified, true, onHead.why);
  const noPoint = analyze({ range: [], commits, finalText: finalOf(finalLines, { 'docs/specs/2026-11-16-jatek.md': '## 20. más' }), prBody: body }).findings[0];
  assert.equal(noPoint.verified, false);
  assert.match(noPoint.why, /nem tartalmazza a hivatkozott pontot \(21\)/);
});

test('verifyMarker: dátum vagy hivatkozás nélkül nem igazolt; útvonal nélküli hivatkozásnál a spec említse a tesztet', () => {
  const spec = new Map([['docs/specs/a.md', ['a tornado-sim tesztje szigorúbb lett']]]);
  assert.equal(verifyMarker({ marker: `// ${MK} (terv 9.)`, file: T, specAdded: spec, prBody: null }).ok, false);
  assert.equal(verifyMarker({ marker: `// ${MK} 2026-11-17`, file: T, specAdded: spec, prBody: null }).ok, false);
  assert.equal(verifyMarker({ marker: `// ${MK} 2026-11-17 (terv 9.)`, file: T, specAdded: spec, prBody: null }).ok, true);
  assert.equal(verifyMarker({ marker: `// ${MK} 2026-11-17 (terv 9.)`, file: 'source/tests/mas.test.ts', specAdded: spec, prBody: null }).ok, false);
  assert.equal(verifyMarker({ marker: `// ${GUARD}: a lap bekötését nézi, viselkedési teszt nem éri el`, file: T, specAdded: new Map(), prBody: null }).ok, true);
  assert.equal(testStem('source/tests/space-asteroid-play.spec.ts'), 'space-asteroid-play');
});

test('thresholdDirection: alsó / felső korlát, eltolás, szorzó, matcher, megfordított alak', () => {
  assert.equal(thresholdDirection('assert.ok(n >= 5)', 'assert.ok(n >= 4)'), 'looser');
  assert.equal(thresholdDirection('assert.ok(n >= 5)', 'assert.ok(n >= 6)'), 'stricter');
  assert.equal(thresholdDirection('assert.ok(n > 5)', 'assert.ok(n >= 5)'), 'looser');
  assert.equal(thresholdDirection('assert.ok(n >= 5)', 'assert.ok(n > 5)'), 'stricter');
  assert.equal(thresholdDirection('assert.ok(ms <= 10)', 'assert.ok(ms <= 12)'), 'looser');
  assert.equal(thresholdDirection('assert.ok(r <= base * 1.1)', 'assert.ok(r <= base * 1.3)'), 'looser');
  assert.equal(thresholdDirection('expect(t).toBeLessThan(10)', 'expect(t).toBeLessThan(8)'), 'stricter');
  assert.equal(thresholdDirection('expect(t).toBeGreaterThan(50)', 'expect(t).toBeGreaterThan(100)'), 'stricter');
  assert.equal(thresholdDirection('assert.ok(5 <= n)', 'assert.ok(4 <= n)'), 'looser');
  assert.equal(thresholdDirection('assert.ok(n >= 5)', 'assert.ok(m >= 4)'), 'unknown', 'más bal oldal: a gép nem találgat');
  assert.equal(thresholdDirection('assert.ok(n >= 5)', 'assert.ok(n <= 5)'), 'unknown');
  assert.deepEqual(linear('without - 1'), { base: 'without', off: -1, mul: 1 });
  assert.deepEqual(comparison('expect(a).toBeGreaterThanOrEqual(3)'), { op: '>=', lhs: 'a', rhs: '3' });
  assert.ok(similarity(OLD_K4, NEW_WEAK) >= 0.5);
});

const one = (path, rows, opts) => analyzeFile(parseDiff(fileDiff(path, rows, opts))[0], 'test').findings;

test('threshold-changed: szigorítás és azonos küszöb nem lelet; ismeretlen irányú szám-változás lelet', () => {
  assert.deepEqual(one('source/tests/a.test.ts', [['-', 'assert.ok(n >= 5);'], ['+', 'assert.ok(n >= 6);']]), []);
  const unk = one('source/tests/a.test.ts', [['-', 'assert.equal(rows.length, 16);'], ['+', 'assert.equal(rows.length, 17);']]);
  assert.deepEqual(unk.map((x) => [x.rule, x.direction]), [['threshold-changed', 'unknown']]);
  const msg = one('source/tests/a.test.ts', [['-', 'assert.ok(n >= 5, "legalább 5 kell");'], ['+', 'assert.ok(n >= 5, "legalább 5 kell — 7 helyett");']]);
  assert.deepEqual(msg, [], 'az üzenetszöveg száma nem küszöb');
});

test('párosítás: különböző alanyú állítások nem párok (ellenpróba-hamis riasztás 2026-11-17: brainrot-core „worldMs” ↔ „caught”)', () => {
  assert.deepEqual(one('source/tests/a.test.ts', [['-', 'assert.equal(d.core.state().caught, 1);'], [' ', 'x();'], ['+', 'assert.equal(d.core.state().worldMs, w1);'], ['+', 'assert.equal(d.core.state().caught, 0);']]).map((x) => x.rule), ['threshold-changed'],
    'a „caught” párja a „caught”, a „worldMs” új állítás');
  // Egy állítás helyére egy MÁSIK alany állítása: nem küszöb-változás és nem nettó állítás-csökkenés (a csere a reviewer dolga).
  assert.deepEqual(one('source/tests/a.spec.ts', [['-', 'await expect(page.getByTestId("a")).toHaveCount(0);'], ['+', 'await expect(page.getByTestId("b")).toHaveCount(1);']]), []);
  assert.deepEqual(one('source/tests/a.spec.ts', [['-', 'await expect(page.getByTestId("a")).toHaveCount(0);'], ['-', 'await expect(page.getByTestId("c")).toHaveCount(0);'], ['+', 'await expect(page.getByTestId("b")).toHaveCount(1);']]).map((x) => x.rule), ['assert-removed', 'assert-removed'],
    'nettó csökkenésnél a pár nélküli törölt állítások leletek');
  assert.equal(subjectOf('assert.ok(withQ >= without - 1, `x`)'), 'withQ');
  assert.equal(subjectOf('await expect(page.getByTestId("x")).toBeVisible({ timeout: 5_000 })'), 'page.getByTestId("x")');
});

test('matcher-loosened: szigorú → laza matcher lelet; laza → szigorú nem', () => {
  assert.deepEqual(one('source/tests/a.test.ts', [['-', 'expect(list).toHaveLength(3);'], ['+', 'expect(list.length).toBeGreaterThanOrEqual(3);']]).map((x) => x.rule), ['matcher-loosened']);
  assert.deepEqual(one('source/tests/a.test.ts', [['-', 'assert.equal(score, 40);'], ['+', 'assert.ok(score >= 40);']]).map((x) => x.rule), ['matcher-loosened']);
  assert.deepEqual(one('source/tests/a.test.ts', [['-', 'assert.ok(score >= 40);'], ['+', 'assert.equal(score, 40);']]), []);
});

test('assert-removed / test-removed: pótlás nélküli törlés lelet; mozgatás és átnevezés nem', () => {
  const rm = one('source/tests/a.test.ts', [[' ', 'test("x", () => {'], ['-', '  assert.equal(a, 1);'], [' ', '  assert.equal(b, 2);']]);
  assert.deepEqual(rm.map((x) => [x.rule, x.side]), [['assert-removed', 'old']]);
  const moved = parseDiff([
    'diff --git a/source/tests/a.test.ts b/source/tests/a.test.ts', '--- a/source/tests/a.test.ts', '+++ b/source/tests/a.test.ts',
    '@@ -1,2 +1,1 @@', '-  assert.equal(a, 1);', ' x', '@@ -20,1 +19,2 @@', ' y', '+  assert.equal(a, 1);',
  ].join('\n'));
  assert.deepEqual(analyzeFile(moved[0], 'test').findings, []);
  assert.deepEqual(one('source/tests/a.test.ts', [['-', 'test("régi", () => {});'], ['-', 'test("másik", () => {});']]).map((x) => x.rule).sort(), ['test-removed', 'test-removed']);
  assert.deepEqual(one('source/tests/a.test.ts', [['-', 'test("régi név", () => {});'], ['+', 'test("új név", () => {});']]), []);
});

test('új tesztfájl: a hozzáadott állítások nem leletek; a fix várakozás és a force igen', () => {
  const f = one('source/tests/uj.spec.ts', [['+', 'test("a", async ({ page }) => {'], ['+', '  await page.click("#x", { force: true });'],
    ['+', '  await page.waitForTimeout(1200);'], ['+', '  expect(await page.title()).toBe("x");'], ['+', '});']], { status: 'A', oldStart: 0, newStart: 1 });
  assert.deepEqual(f.map((x) => [x.rule, x.line]), [['force-or-fixed-wait', 2], ['force-or-fixed-wait', 3]]);
});

test('assert-commented, skip-added, timeout-raised', () => {
  assert.deepEqual(one('source/tests/a.test.ts', [['+', '  // assert.equal(a, 1);']]).map((x) => x.rule), ['assert-commented']);
  assert.deepEqual(one('source/tests/a.test.ts', [['+', '  // ez a szakasz az assert.equal-t mutatja be']]), [], 'magyarázó komment nem lelet');
  assert.deepEqual(one('source/tests/a.test.ts', [['+', 'test.todo("később");']]).map((x) => x.rule), ['skip-added']);
  assert.deepEqual(one('source/tests/a.test.ts', [['+', 'test("x", { skip: process.env.CI }, () => {});']]).map((x) => x.rule), ['skip-added']);
  assert.deepEqual(one('source/tests/a.test.ts', [['-', '  await expect(p).toBeVisible({ timeout: 5000 });'], ['+', '  await expect(p).toBeVisible({ timeout: 15000 });']]).map((x) => x.rule), ['timeout-raised']);
  assert.deepEqual(one('source/tests/a.test.ts', [['-', 'test.setTimeout(60_000);'], ['+', 'test.setTimeout(30_000);']]), []);
  assert.deepEqual(one('source/playwright.config.ts', [[' ', 'export default {'], ['+', '  retries: 2,']]).map((x) => x.rule), ['timeout-raised']);
});

test('source-regex-test: forrásfájlt beolvasó új teszt lelet; jelöléssel igazolt; nem forrás olvasása nem lelet', () => {
  const rows = [['+', 'const src = readFileSync(new URL("../client/src/pages/X.tsx", import.meta.url), "utf8");'], ['+', 'assert.match(src, /setPhase/);']];
  const res = analyze({ range: parseDiff(fileDiff('source/tests/x-wiring.test.ts', rows, { status: 'A', oldStart: 0, newStart: 1 })) });
  assert.deepEqual(res.findings.map((x) => [x.rule, x.verified]), [['source-regex-test', false]]);
  const marked = analyze({ range: parseDiff(fileDiff('source/tests/x-wiring.test.ts', [['+', `// ${GUARD}: a lap bekötése, a mag tesztje mellett`], ...rows], { status: 'A', oldStart: 0, newStart: 1 })) });
  assert.equal(marked.findings[0].verified, true);
  assert.deepEqual(one('source/tests/y.test.ts', [['+', 'const j = readFileSync(join(dir, "fixture.json"), "utf8");']]), []);
  // Hamis riasztás 2026-11-17 (flaky-report.test.mjs): konfig-JSON olvasása, a forrásút csak egy másik teszt ADATA → nem lelet.
  assert.deepEqual(one('scripts/qa/gates/z.test.mjs', [['+', 'const known = JSON.parse(readFileSync(KNOWN_FILE, "utf8"));'], ['+', 'const files = ["source/client/src/pages/X.tsx"];']]), []);
  // Forrásutat tartalmazó konstans + beolvasás külön sorban → lelet.
  assert.deepEqual(one('source/tests/w.test.ts', [['+', 'const PAGE = "client/src/pages/W.tsx";'], ['+', 'const src = readFileSync(join(root, PAGE), "utf8");']]).map((x) => [x.rule, x.line]), [['source-regex-test', 11]]);
});

test('sim-calibration: a bot-konstans értékváltozása lelet (Aszteroida DODGE_IMPACT), új konstans nem', () => {
  const f = parseDiff(fileDiff('source/client/src/lib/spaceAsteroid/sim.ts', [['-', 'const DODGE_IMPACT = 0.65;'], ['+', 'const DODGE_IMPACT = 0.38;'], ['+', 'const NEW_ONE = 3;']]));
  const res = analyze({ range: f });
  assert.deepEqual(res.findings.map((x) => [x.rule, x.was]), [['sim-calibration', '0.65']]);
  assert.deepEqual(analyze({ range: parseDiff(fileDiff('source/client/src/lib/x/core.ts', [['-', 'const A_B = 1;'], ['+', 'const A_B = 2;']])) }).findings, [], 'a core.ts nem kalibrációs fájl');
});

test('test-file-deleted; nem tesztfájl változása nem lelet', () => {
  const res = analyze({ range: parseDiff([fileDiff('source/tests/y.test.ts', [['-', 'test("b", () => {});']], { status: 'D', oldStart: 1, newStart: 0 }),
    fileDiff('source/server/a.ts', [['-', 'assert.ok(n >= 5);'], ['+', 'assert.ok(n >= 4);']])].join('\n')) });
  assert.deepEqual(res.findings.map((x) => x.rule), ['test-file-deleted']);
});

test('findMarker: a lelet fölötti ≤ 8 sor; távolabbi jelölés nem számít', () => {
  const rows = [['+', `// ${MK} 2026-11-17 (docs/specs/a.md)`], ...Array.from({ length: 9 }, (_, i) => [' ', `const x${i} = ${i};`]), ['-', 'assert.ok(n >= 5);'], ['+', 'assert.ok(n >= 4);']];
  const f = parseDiff(fileDiff('source/tests/a.test.ts', rows, { oldStart: 1, newStart: 1 }))[0];
  const [x] = analyzeFile(f, 'test').findings;
  assert.equal(findMarker({ f, finding: x }), null);
  const near = parseDiff(fileDiff('source/tests/a.test.ts', [['+', `// ${MK} 2026-11-17 (docs/specs/a.md)`], ['-', 'assert.ok(n >= 5);'], ['+', 'assert.ok(n >= 4);']], { oldStart: 1, newStart: 1 }))[0];
  assert.match(findMarker({ f: near, finding: analyzeFile(near, 'test').findings[0] }), new RegExp(MK));
});

function ctxWith({ range = '', log = '', untracked = [] } = {}) {
  return fakeCtx({
    untracked,
    respond: (cmd, args) => {
      if (cmd !== 'git') return undefined;
      const a = args.join(' ');
      if (a.includes(' diff -U6 ')) return { code: 0, stdout: range };
      if (a.includes(' log -p ')) return { code: 0, stdout: log };
      return undefined;
    },
  });
}

test('runTestIntegrityStep: warn módban WARN, block módban FAIL a konkrét sorral; bizonyíték a fejre', async () => {
  const range = fileDiff('source/tests/a.test.ts', [['-', 'assert.ok(n >= 5);'], ['+', 'assert.ok(n >= 4);']]);
  for (const [mode, st] of [['warn', STATUS.WARN], ['block', STATUS.FAIL]]) {
    const { ctx, gate, lines } = ctxWith({ range });
    await runTestIntegrityStep({ gate, ctx, mode, prBody: null });
    assert.equal(statusOf(gate, 'teszt-integritás'), st);
    assert.ok(lines.some((l) => l.includes('source/tests/a.test.ts:10') && l.includes('LAZÍTÁS')), lines.join('\n'));
    assert.ok(existsSync(join(ctx.evDir, `test-integrity-${'f'.repeat(40)}.json`)));
  }
});

test('runTestIntegrityStep: block módban a csak higiénia-jelzés (fix várakozás) WARN, nem FAIL', async () => {
  const range = fileDiff('source/tests/a.spec.ts', [['+', '  await page.waitForTimeout(500);']]);
  const { ctx, gate } = ctxWith({ range });
  await runTestIntegrityStep({ gate, ctx, mode: 'block', prBody: null });
  assert.equal(statusOf(gate, 'teszt-integritás'), STATUS.WARN);
});

test('runTestIntegrityStep: lelet nélkül PASS; a konfig módja érvényes, ha nincs kapcsoló', async () => {
  const { ctx, gate } = ctxWith({ range: fileDiff('source/tests/a.test.ts', [['-', 'assert.ok(n >= 5);'], ['+', 'assert.ok(n >= 6);']]) });
  await runTestIntegrityStep({ gate, ctx, prBody: null });
  assert.equal(statusOf(gate, 'teszt-integritás'), STATUS.PASS);
  assert.ok(gate.results[0].name.includes(ctx.cfg.modes['test-integrity'].local));
});

// ---- a független review (B2, M4) utáni szabályok ----

test('feltétel-őr: az állítás feltétel nélkülivé válik → szigorúbb (nem lelet, B2: tsunami-play:407); feltétel mögé kerül → lazítás', () => {
  assert.deepEqual(one('source/tests/a.spec.ts', [['-', '    if (viewport.width < 400) expect(long, "keskeny").toBe(true);'], ['+', '    expect(long, "minden nézetben").toBe(true);']]), []);
  assert.deepEqual(one('source/tests/a.spec.ts', [['-', '    expect(long).toBe(true);'], ['+', '    if (process.env.CI) expect(long).toBe(true);']]).map((x) => [x.rule, x.direction]), [['assert-conditional', 'looser']]);
  assert.deepEqual(stripGuard('  if (a(b) > 1) expect(x).toBe(1);'), { rest: 'expect(x).toBe(1);', guarded: true });
  assert.deepEqual(stripGuard('  else assert.ok(x)'), { rest: 'assert.ok(x)', guarded: false });
});

test('B2: más utasítás ugyanabban a sorban (keresés átírása) nem küszöb-változás — csak az állítás-rész számít (remaining-learning:103)', () => {
  assert.deepEqual(one('source/tests/a.spec.ts', [['-', 'const text=await quiz.innerText();const entry=bank.find(q=>text.includes(q.prompt));expect(entry,`nincs`).toBeTruthy();'], ['+', 'const entry=bank.find(q=>q.prompt===prompt);expect(entry,`nincs`).toBeTruthy();']]), []);
});

test('M4/22: a többsoros állítás küszöbe (a J7b-lazítás tördelt alakja) lelet', () => {
  const f = one('source/tests/a.test.ts', [['-', '    assert.ok('], ['-', '      withQ >= without,'], ['-', '      "üzenet",'], ['-', '    );'], ['+', '    assert.ok('], ['+', '      withQ >= without - 1,'], ['+', '      "üzenet",'], ['+', '    );']]);
  assert.deepEqual(f.map((x) => [x.rule, x.direction]), [['threshold-changed', 'looser']]);
  assert.equal(joinLogical([{ t: '+', text: 'assert.ok(' }, { t: '+', text: 'x > 1);' }]).length, 1);
});

test('R2: valódi diff-alak — a nyitó sor VÁLTOZATLAN kontextus, csak a belső küszöb-sor változott → lelet; szigorítás nem', () => {
  const rows = (o, n) => [[' ', '    expect('], [' ', '      computeScore(run),'], ['-', `    ).toBeGreaterThanOrEqual(${o});`], ['+', `    ).toBeGreaterThanOrEqual(${n});`], [' ', '    done();']];
  assert.deepEqual(one('source/tests/a.test.ts', rows(10, 4)).map((x) => [x.rule, x.direction]), [['threshold-changed', 'looser']]);
  assert.deepEqual(one('source/tests/a.test.ts', rows(4, 10)), []);
  // assert.ok-alak: a belső feltétel-sor változik
  const ok = one('source/tests/a.test.ts', [[' ', '    assert.ok('], ['-', '      withQ >= without,'], ['+', '      withQ >= without - 1,'], [' ', '      "üzenet",'], [' ', '    );']]);
  assert.deepEqual(ok.map((x) => [x.rule, x.direction]), [['threshold-changed', 'looser']]);
  // lezárt előző utasítás után álló belső sor nem kap idegen nyitót
  assert.equal(joinLogical([{ t: ' ', text: 'expect(a).toBe(1);' }, { t: '+', text: '  x(5);' }])[1].text, '  x(5);');
});

test('R2 (szoletra-ág hamis riasztásai): szám → termékkonstans csere nem kalibráció; két hunk / két teszt állításai nem párok', () => {
  const sim = analyzeFile(parseDiff(fileDiff('source/client/src/lib/x/sim.ts', [['-', 'export const SIM_REVEAL_MS = 900;'], ['+', 'export const SIM_REVEAL_MS = REVEAL_MS;']]))[0], 'calibration').findings;
  assert.deepEqual(sim, []);
  const simNum = analyzeFile(parseDiff(fileDiff('source/client/src/lib/x/sim.ts', [['-', 'export const SIM_REVEAL_MS = 900;'], ['+', 'export const SIM_REVEAL_MS = 3 * 600;']]))[0], 'calibration').findings;
  assert.deepEqual(simNum.map((x) => x.rule), ['sim-calibration'], 'szám-kifejezés → szám-kifejezés továbbra is lelet');
  // a 204-es eset: a teljes bal oldal az alany — más tömb mediánja más mérés
  assert.notEqual(subjectOf('assert.ok(medianOf(young.map((r) => r.stats.perMinute)) >= 10, "x")'), subjectOf('assert.ok(medianOf(runs.map((r) => r.stats.perMinute)) >= 4, `y`)'));
  // a 205-ös eset: a reláció zárójelben — a teljes kifejezés (a számok #) az alany
  assert.equal(subjectOf('assert.ok(runs.every((r) => r.durationSec < 900))'), 'runs.every((r)=>r.durationSec<#)');
  assert.equal(subjectOf('assert.ok(runs.every((r) => r.durationSec < 600))'), subjectOf('assert.ok(runs.every((r) => r.durationSec < 900))'), 'ugyanaz a mérés más számmal: pár');
  // két hunk: a hasonló, azonos alanyú állítás sem pár
  const two = [fileDiff('source/tests/a.test.ts', [['-', 'assert.ok(n >= 10);']], { oldStart: 10, newStart: 10 }), fileDiff('source/tests/a.test.ts', [['+', 'assert.ok(n >= 4);']], { oldStart: 200, newStart: 199 }).split('\n').slice(3).join('\n')].join('\n');
  const f = analyzeFile(parseDiff(two)[0], 'test').findings;
  assert.ok(!f.some((x) => x.rule === 'threshold-changed'), JSON.stringify(f));
});

test('R2: a terv-pont csak címsorban / listaelemben / táblázatsorban igazol, részszövegként nem; fejkomment-jelölés csak ha új', () => {
  assert.equal(specHasPoint('## 9. Rollout\n', '9'), true);
  assert.equal(specHasPoint('- **10.4** küszöb\n', '10.4'), true);
  assert.equal(specHasPoint('| D-J1a-8 | x |\n', 'D-J1a-8'), true);
  assert.equal(specHasPoint('Dátum: 2026-11-09, lásd 9-es busz.\n', '9'), false);
  assert.equal(specHasPoint('## 9.1 Al-pont\n', '9'), false);
  const mk = `// ${MK} 2026-11-17 (docs/specs/t.md 3)`;
  const lines = ['/**', ` * ${mk.slice(3)}`, ' */', 'import x from "y";', 'test("a", () => {});'];
  const fNew = parseDiff(fileDiff('source/tests/a.test.ts', [['+', ` * ${mk.slice(3)}`], [' ', ' */']], { oldStart: 1, newStart: 2 }))[0];
  const fOld = parseDiff(fileDiff('source/tests/a.test.ts', [[' ', ` * ${mk.slice(3)}`], ['+', 'x();']], { oldStart: 2, newStart: 2 }))[0];
  assert.match(headerMarker(lines, fNew), new RegExp(MK));
  assert.equal(headerMarker(lines, fOld), null, 'régi fejjelölés nem ment fel');
  assert.equal(headerMarker(['const a = 1;', ` * ${mk.slice(3)}`], fNew), null, 'kódsor utáni jelölés nem fejkomment');
  assert.match(headerMarker(['import { test } from "x";', '', '/**', ` * ${mk.slice(3)}`, ' */'], fNew), new RegExp(MK), 'import-sor után álló fejkomment');
});

test('M4/16–17: tűrés-konstans a tesztfájlban (0,1 → 0,4) lelet; új konstans nem', () => {
  assert.deepEqual(one('source/tests/a.test.ts', [['-', 'const TOLERANCE = 0.1;'], ['+', 'const TOLERANCE = 0.4;'], ['+', 'const NEW_ONE = 2;']]).map((x) => [x.rule, x.was]), [['tolerance-changed', '0.1']]);
});

test('M4/10–15: .skip( / .only( / fixme a CI-ban is lelet; új időkorlát módosított fájlban és test.slow higiénia-jelzés; retries kifejezésben', () => {
  // a minta futásidőben, darabokból (a lint-kapu tiltott mintája a saját tesztfájlunkon ne jelezzen)
  assert.deepEqual(one('source/tests/a.test.ts', [['+', `  test.${'skip'}(process.env.CI === "true", "lassú");`]]).map((x) => x.rule), ['skip-added']);
  assert.deepEqual(one('source/tests/a.spec.ts', [[' ', 'test("x", async () => {'], ['+', '  test.slow();']]).map((x) => x.rule), ['timeout-added']);
  assert.deepEqual(one('source/tests/a.spec.ts', [['-', '  await expect(p).toBeVisible();'], ['+', '  await expect(p).toBeVisible({ timeout: 30_000 });']]).map((x) => x.rule), ['timeout-added']);
  assert.deepEqual(one('source/playwright.config.ts', [['-', '  retries: process.env.CI ? 1 : 0,'], ['+', '  retries: process.env.CI ? 5 : 0,']]).map((x) => x.rule), ['timeout-raised']);
  assert.deepEqual(one('source/tests/uj.spec.ts', [['+', 'test("x", async () => { await expect(p).toBeVisible({ timeout: 30_000 }); });']], { status: 'A', oldStart: 0, newStart: 1 }), [], 'új fájlban nem');
});

test('M4/1: az integrációs és a support-mintájú fájlok is tesztfájlok', () => {
  const res = analyze({ range: parseDiff([fileDiff('source/tests/x.integration.ts', [['-', 'assert.ok(n >= 5);'], ['+', 'assert.ok(n >= 4);']]), fileDiff('source/tests/support/meter.ts', [['-', '  expect(px).toBeGreaterThanOrEqual(48);'], ['+', '  expect(px).toBeGreaterThanOrEqual(40);']])].join('\n')) });
  assert.deepEqual(res.findings.map((x) => [x.file, x.rule]), [['source/tests/x.integration.ts', 'threshold-changed'], ['source/tests/support/meter.ts', 'threshold-changed']]);
});

test('commit-nézet: a lazítás VISSZAÁLLÍTÁSA nem lelet (M4/3); kozmetikai commit után a lazítás megmarad (M4/2); a commit-lelet nem tilt', async () => {
  const fixCommit = fileDiff(T, [[' ', CTX], ['-', NEW_WEAK], ['-', NEW_ELSE], ['+', OLD_K4]], { commit: 'c'.repeat(40) });
  const restored = analyze({ range: [], commits: parseDiff([j7bCommit(), fixCommit].join('\n')), finalText: finalOf([CTX, OLD_K4]) });
  assert.deepEqual(restored.findings, [], 'aki javít, nem bukik');
  const cosmetic = NEW_WEAK.replace('≪ kérdés nélkül', 'kevesebb, mint kérdés nélkül');
  const res = analyze({ range: [], commits: parseDiff(j7bCommit()), finalText: finalOf([CTX, cosmetic, NEW_ELSE]) });
  assert.deepEqual(res.findings.map((x) => [x.rule, x.via]), [['threshold-changed', 'commit']]);
  // a munkafában ott a lazított végső fájl (különben a commit-lelet „a fájl már nem létezik” okkal kiesne, és a teszt üres lenne)
  const { ctx, gate } = fakeCtx({
    changed: [T], contents: { [T]: [CTX, NEW_WEAK, NEW_ELSE].join('\n') },
    respond: (cmd, args) => (cmd === 'git' && args.join(' ').includes(' log -p ') ? { code: 0, stdout: j7bCommit() } : undefined),
  });
  const { record } = await runTestIntegrityStep({ gate, ctx, mode: 'block', prBody: null });
  assert.deepEqual(record.findings.map((x) => [x.rule, x.via]), [['threshold-changed', 'commit']], 'a lelet megvan');
  assert.equal(statusOf(gate, 'teszt-integritás'), STATUS.WARN, 'a csak commit-nézetbeli lelet block módban sem tilt');
});

test('K2: a kapu saját fájljainak változása hangos (higiénia) jelzés', () => {
  const cfg = { testIntegrity: { gateFiles: ['^scripts/qa/gates/test-integrity\\.mjs$'] } };
  const res = analyze({ range: parseDiff(fileDiff('scripts/qa/gates/test-integrity.mjs', [['+', '// x']])), cfg });
  assert.deepEqual(res.findings.map((x) => x.rule), ['gate-changed']);
});

test('K3 / K4 / K10: nem létező --body-file kivétel; refPoint; cat-file kötegelt kimenet; job-összefoglaló', () => {
  assert.throws(() => readPrBody({ bodyFile: join('nincs', 'ilyen.md') }), /nem létezik/);
  assert.equal(refPoint('docs/specs/a.md 10.4 „Tiltás”', 'docs/specs/a.md'), '10.4');
  assert.equal(refPoint('docs/specs/a.md D-J1a-8', 'docs/specs/a.md'), 'D-J1a-8');
  assert.equal(refPoint('docs/specs/a.md', 'docs/specs/a.md'), null);
  const batch = `${'1'.repeat(40)} blob 3\nabc\nx/y missing\n${'2'.repeat(40)} blob 3\nhé\n`;
  assert.deepEqual([...parseCatFileBatch(batch, ['a', 'x/y', 'b']).entries()], [['a', 'abc'], ['x/y', null], ['b', 'hé']]);
  assert.match(stepSummary({ mode: 'warn', view: 'merged', findings: [{ file: 'a.test.ts', line: 3, rule: 'threshold-changed', via: 'range', verified: false }] }, 'WARN'), /\| `a.test.ts:3` \| threshold-changed \| döntő \| jelöletlen \|/);
});

// ---- ISMERT KORLÁTOK (a független review hamis negatív táblája; dokumentálva, nem elrejtve — docs/minosegkapuk.md „Mit NEM fog meg”) ----
// Ezek a tesztek azt rögzítik, hogy a kapu ezeket NEM látja; ha egy jövőbeli szabály megfogja, a tesztet a szabály PR-ja frissíti.

test('ismert korlát: tautológia, könnyített bemenet, korai visszatérés, try/catch, saját kampó, feltétel-blokk (külön sorokon) — nem lelet', () => {
  const cases = [
    [['-', '  assert.equal(score(input), 42);'], ['+', '  assert.equal(42, 42);']],
    [['-', '  const seeds = simSeeds(GAME, 20);'], ['+', '  const seeds = simSeeds(GAME, 3);']],
    [['+', '  return;'], [' ', '  assert.equal(score(input), 42);']],
    [['+', '  try {'], [' ', '  assert.equal(score(input), 42);'], ['+', '  } catch {}']],
    [['-', '  assert.equal(measured(), 42);'], ['+', '  assert.equal(hook.value, 42);']],
    [['+', '  if (process.env.CI) {'], [' ', '  assert.equal(score(input), 42);'], ['+', '  }']],
  ];
  for (const rows of cases) assert.deepEqual(one('source/tests/a.test.ts', rows), [], JSON.stringify(rows));
});

test('ismert korlát: tesztfájl átnevezése nem-teszt névre, és a lazítás egyetlen commitba vonva egy új fájlban', () => {
  const renamed = parseDiff(['diff --git a/source/tests/a.test.ts b/source/tests/a.helper.ts', 'similarity index 100%', 'rename from source/tests/a.test.ts', 'rename to source/tests/a.helper.ts'].join('\n'));
  assert.deepEqual(analyze({ range: renamed }).findings, []);
  const born = parseDiff(fileDiff(T, [['+', NEW_WEAK]], { status: 'A', oldStart: 0, newStart: 1, commit: 'd'.repeat(40) }));
  assert.deepEqual(analyze({ range: [], commits: born, finalText: finalOf([NEW_WEAK]) }).findings, [], 'eleve lazított mércével érkező új teszt');
});

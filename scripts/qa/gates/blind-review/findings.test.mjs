// docs/specs/2026-11-18-vak-ellenor-deepseek.md — M3 (géppel ellenőrzött leletek), B20–B23; E4 (részben igazolt próba), B33.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './_fixture.mjs';
import { summaryMarkdown, verifyFindings } from './findings.mjs';

const repo = makeRepo({ files: { 'source/server/mail.ts': 'export function send(to: string) {\n  if (!to) return;\n  queue.push({ to, sentAt: Date.now() });\n}\n' } });
after(() => repo.cleanup());

const runLog = [
  { argv: ['npx', 'tsx', '--test', 'source/tests/mail.test.ts'], kind: 'unit', sources: "test('kétszer küld', () => { send('a@example.com'); send('a@example.com'); })", output: '$ tsx --test\nkilépési kód: 1\nnot ok 3 - kétszer küld\n  expected 1, actual 2' },
  { argv: ['run_browser_scenario', '.blind-review-tmp/s.json'], kind: 'scenario', sources: '{"cases":[{"name":"502","steps":[{"mockApi":"/api/advent/open","status":502}]}]}', output: 'esetek: {"step":3,"action":"measure","result":{"text":"<html> 502 Bad Gateway"}}' },
  { argv: ['node', '.blind-review-tmp/p.test.ts'], kind: 'sandbox', sources: "import { adventErrorText } from '../source/client/src/advent/busy.ts'; adventErrorText(new TypeError('Failed to fetch'))", output: 'offline → "Failed to fetch"' },
];
const UNIT = { argv: runLog[0].argv, output_excerpt: 'not ok 3 - kétszer küld', input: "send('a@example.com'); send('a@example.com');", scope: 'teljes_ut' };
const good = { id: 'L1', severity: 'közepes', title: 'Kétszer küld', file: 'source/server/mail.ts', line: 3, quote: 'queue.push({ to, sentAt: Date.now() });' };
const check = (findings, { verdict = 'IGEN, FELTÉTELLEL', reportText = 'L1 L2 L3' } = {}) => verifyFindings({ findings, root: repo.root, runLog, reportText, verdict });

test('B20: igazolt hivatkozás — a fájl, a sor és a szó szerinti idézet a helyén van (±3 sor, szóköz-normalizálva)', () => {
  const r = check([good]);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.items[0].refOk, true);
  assert.equal(check([{ ...good, line: 1, quote: 'queue.push({   to,  sentAt: Date.now() });' }]).ok, true, '2 sor eltérés és szóköz-különbség belefér');
});

test('B20: nem létező fájl / sor, kitalált idézet, túl rövid idézet, munkafán kívüli útvonal → blokkoló és közepes leletnél elutasítás', () => {
  for (const bad of [
    { ...good, file: 'source/server/nincs.ts' },
    { ...good, line: 99 },
    { ...good, line: 0 },
    { ...good, quote: 'await transporter.sendMail(message);' },
    { ...good, quote: 'to' },
    { ...good, file: '../../etc/passwd' },
    { ...good, severity: 'blokkoló' , quote: 'ez nincs a fájlban sehol' },
  ]) {
    const r = check([bad], { verdict: bad.severity === 'blokkoló' ? 'NEM' : 'IGEN, FELTÉTELLEL' });
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.errors.join('; '), /hivatkozás nem ellenőrizhető/);
  }
});

test('B20: „kicsi” lelet rossz hivatkozással nem állítja meg a leadást, de ÉRVÉNYTELENKÉNT jelölődik', () => {
  const r = check([{ ...good, id: 'L2', severity: 'kicsi', line: 99 }], { verdict: 'IGEN' });
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.items[0].refOk, false);
  assert.equal(r.counts.kicsi.invalid, 1);
});

test('B21: futtatási bizonyíték — csak ténylegesen végrehajtott parancsra, annak szó szerinti kimenetére és bemenetére lehet hivatkozni', () => {
  const ok = check([{ ...good, run: UNIT }]);
  assert.equal(ok.ok, true, ok.errors.join('; '));
  assert.equal(ok.items[0].runOk, true);
  const neverRan = check([{ ...good, run: { ...UNIT, argv: ['npx', 'tsx', '--test', 'source/tests/masik.test.ts'] } }]);
  assert.match(neverRan.errors.join('; '), /ilyen parancsot nem futtattál/);
  const invented = check([{ ...good, run: { ...UNIT, output_excerpt: 'not ok 7 - kitalált kimenet' } }]);
  assert.match(invented.errors.join('; '), /nem szerepel a parancs naplózott kimenetében/);
  const noInput = check([{ ...good, run: { ...UNIT, input: 'teljesen más bemenet, amit nem futtatott' } }]);
  assert.match(noInput.errors.join('; '), /run\.input nem szerepel/);
  assert.match(check([{ ...good, run: { ...UNIT, input: 'x' } }]).errors.join('; '), /run\.input \(a próba bemenete\) legalább/);
  assert.match(check([{ ...good, run: { ...UNIT, scope: 'valahogy' } }]).errors.join('; '), /run\.scope/);
  const kicsi = check([{ ...good, severity: 'kicsi', run: { argv: ['node', 'x'], output_excerpt: 'akármi hosszú szöveg', input: 'akármi hosszú', scope: 'elszigetelt' } }], { verdict: 'IGEN' });
  assert.equal(kicsi.ok, false, 'el nem végzett futásra „kicsi” lelet sem hivatkozhat');
});

test('B33: elszigetelt próba (egységteszt, homokozó, scope: elszigetelt) legfeljebb RÉSZBEN igazolt; teljes út csak böngészős / DB futás', () => {
  const unitClaimsFull = check([{ ...good, run: UNIT }]);
  assert.equal(unitClaimsFull.items[0].runFull, false, 'egységteszt nem lehet „teljes úton igazolt”, akkor sem, ha a modell azt állítja');
  assert.equal(unitClaimsFull.items[0].runPartial, true);
  const sandbox = check([{ ...good, run: { argv: runLog[2].argv, output_excerpt: 'offline → "Failed to fetch"', input: "adventErrorText(new TypeError('Failed to fetch'))", scope: 'teljes_ut' } }]);
  assert.equal(sandbox.items[0].runPartial, true, 'a homokozós függvényhívás elszigetelt');
  const scenario = { argv: runLog[1].argv, output_excerpt: '<html> 502 Bad Gateway', input: '"mockApi":"/api/advent/open","status":502', scope: 'teljes_ut' };
  const full = check([{ ...good, run: scenario }]);
  assert.equal(full.items[0].runFull, true, 'böngészős forgatókönyv a teljes úton');
  assert.equal(full.counts['közepes'].runFull, 1);
  const declaredIsolated = check([{ ...good, run: { ...scenario, scope: 'elszigetelt' } }]);
  assert.equal(declaredIsolated.items[0].runPartial, true, 'a modell által elszigeteltnek jelölt próba elszigetelt marad');
});

test('B22: az ítélet összhangban van a leletekkel', () => {
  const blocker = { ...good, severity: 'blokkoló' };
  assert.match(check([blocker], { verdict: 'IGEN' }).errors.join('; '), /blokkoló lelet mellett az ítélet csak NEM/);
  assert.match(check([blocker], { verdict: 'IGEN, FELTÉTELLEL' }).errors.join('; '), /blokkoló lelet mellett/);
  assert.equal(check([blocker], { verdict: 'NEM' }).ok, true);
  assert.match(check([good], { verdict: 'NEM' }).errors.join('; '), /NEM ítélethez legalább egy blokkoló/);
  assert.match(check([good], { verdict: 'IGEN' }).errors.join('; '), /közepes lelet mellett/);
  assert.equal(check([], { verdict: 'IGEN' }).ok, true);
});

test('formai hibák: hiányzó tömb, rossz súlyosság, ismétlődő azonosító, a jelentés nem említi a leletet', () => {
  assert.equal(check(undefined).ok, false);
  assert.match(check([{ ...good, severity: 'magas' }]).errors.join('; '), /severity csak/);
  assert.match(check([good, good]).errors.join('; '), /ismétlődő azonosító/);
  assert.match(check([good], { reportText: 'A jelentés nem nevezi meg a leletet. L10 más.' }).errors.join('; '), /nem tartalmazza ezt a lelet-azonosítót/);
});

test('B23: a gépi összegzés számai és jelölései; nincs benne ítélet- vagy fej-sor', () => {
  const scenario = { argv: runLog[1].argv, output_excerpt: '<html> 502 Bad Gateway', input: '"mockApi":"/api/advent/open","status":502', scope: 'teljes_ut' };
  const r = check([{ ...good, run: scenario }, { ...good, id: 'L2', severity: 'kicsi', line: 99 }, { ...good, id: 'L3', severity: 'kicsi', run: UNIT }]);
  assert.equal(r.ok, true, r.errors.join('; '));
  const md = summaryMarkdown({ items: r.items, counts: r.counts, model: 'teszt/modell', cache: { hitRatioFromSecondCall: 0.9, savedUsdEstimate: 0.5 },
    state: { calls: 3, retries: 0, promptTokens: 10, cachedTokens: 9, cacheWriteTokens: 1, completionTokens: 2, spentUsd: 0.1 } });
  assert.match(md, /\| közepes \| 1 \| 1 \| 1 \| 0 \| 0 \|/);
  assert.match(md, /\| kicsi \| 2 \| 1 \| 0 \| 1 \| 1 \|/);
  assert.match(md, /\*\*L1\*\* \(közepes\).*futtatással igazolt \(teljes út\)/);
  assert.match(md, /\*\*L2\*\* \(kicsi\).*NEM visszaellenőrizhető/);
  assert.match(md, /Részben igazolt \(elszigetelt próba\)/);
  assert.match(md, /gyorsítótár-találati arány a 2\. hívástól: 90\.0%/);
  assert.doesNotMatch(md, /Ítélet\s*:|Fej\s*:/);
  assert.doesNotMatch(md, /^#{1,6}\s*(Mit próbáltam|Mit NEM)/m);
});

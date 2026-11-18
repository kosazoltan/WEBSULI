// docs/specs/2026-11-18-vak-ellenor-deepseek.md — M3 (géppel ellenőrzött leletek), B20–B23.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './_fixture.mjs';
import { summaryMarkdown, verifyFindings } from './findings.mjs';

const repo = makeRepo({ files: { 'source/server/mail.ts': 'export function send(to: string) {\n  if (!to) return;\n  queue.push({ to, sentAt: Date.now() });\n}\n' } });
after(() => repo.cleanup());

const runLog = [{ argv: ['npx', 'tsx', '--test', 'source/tests/mail.test.ts'], output: '$ tsx --test\nkilépési kód: 1\nnot ok 3 - kétszer küld\n  expected 1, actual 2' }];
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

test('B21: futtatási bizonyíték — csak ténylegesen végrehajtott parancsra és annak szó szerinti kimenetére lehet hivatkozni', () => {
  const ok = check([{ ...good, run: { argv: runLog[0].argv, output_excerpt: 'not ok 3 - kétszer küld' } }]);
  assert.equal(ok.ok, true, ok.errors.join('; '));
  assert.equal(ok.items[0].runOk, true);
  assert.equal(ok.counts['közepes'].runVerified, 1);
  const neverRan = check([{ ...good, run: { argv: ['npx', 'tsx', '--test', 'source/tests/masik.test.ts'], output_excerpt: 'not ok 3 - kétszer küld' } }]);
  assert.match(neverRan.errors.join('; '), /ilyen parancsot nem futtattál/);
  const invented = check([{ ...good, run: { argv: runLog[0].argv, output_excerpt: 'not ok 7 - kitalált kimenet' } }]);
  assert.match(invented.errors.join('; '), /nem szerepel a parancs naplózott kimenetében/);
  const kicsi = check([{ ...good, severity: 'kicsi', run: { argv: ['node', 'x'], output_excerpt: 'akármi hosszú szöveg' } }], { verdict: 'IGEN' });
  assert.equal(kicsi.ok, false, 'el nem végzett futásra „kicsi” lelet sem hivatkozhat');
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
  const r = check([good, { ...good, id: 'L2', severity: 'kicsi', line: 99 }, { ...good, id: 'L3', severity: 'kicsi', run: { argv: runLog[0].argv, output_excerpt: 'expected 1, actual 2' } }]);
  assert.equal(r.ok, true, r.errors.join('; '));
  const md = summaryMarkdown({ items: r.items, counts: r.counts, model: 'teszt/modell', cache: { hitRatioFromSecondCall: 0.9, savedUsdEstimate: 0.5 },
    state: { calls: 3, retries: 0, promptTokens: 10, cachedTokens: 9, cacheWriteTokens: 1, completionTokens: 2, spentUsd: 0.1 } });
  assert.match(md, /\| közepes \| 1 \| 1 \| 0 \| 0 \|/);
  assert.match(md, /\| kicsi \| 2 \| 1 \| 1 \| 1 \|/);
  assert.match(md, /\*\*L2\*\* \(kicsi\).*NEM visszaellenőrizhető/);
  assert.match(md, /gyorsítótár-találati arány a 2\. hívástól: 90\.0%/);
  assert.doesNotMatch(md, /Ítélet\s*:|Fej\s*:/);
  assert.doesNotMatch(md, /^#{1,6}\s*(Mit próbáltam|Mit NEM)/m);
});

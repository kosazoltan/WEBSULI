// Kapu-gyorsítás B (docs/specs/2026-11-19-kapu-gyorsitas.md): bizonyíték-átvitel főág-beolvasztás után — valódi, ideiglenes git-tárban.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS, realExec, readEvidence, writeEvidence } from './lib.mjs';
import { carryRecords, checkCarry, freshMain, runCarry } from './carry-over.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'carry-'));
  // a „távoli” tároló: helyi csupasz tár — a friss origin/main lekérése (vak review L1) valódi fetch-csel fut
  const bare = mkdtempSync(join(tmpdir(), 'carry-origin-'));
  const run = (args, o = {}) => realExec('git', ['-c', 'user.name=t', '-c', 'user.email=t@pelda.hu', '-c', 'commit.gpgsign=false', ...args], { cwd: o.cwd ?? dir, input: o.input, timeoutMs: 60_000 });
  const ok = (args, o) => { const r = run(args, o); assert.equal(r.code, 0, `${args.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
  const write = (f, t) => writeFileSync(join(dir, f), t);
  ok(['init', '-q', '--bare', '-b', 'main'], { cwd: bare });
  ok(['init', '-q', '-b', 'main']);
  ok(['remote', 'add', 'origin', bare]);
  write('a.txt', 'egy\nketto\nharom\nnegy\not\nhat\nhet\nnyolc\n');
  write('b.txt', 'b\n');
  ok(['add', '.']); ok(['commit', '-q', '-m', 'alap']);
  ok(['switch', '-q', '-c', 'pr']);
  write('a.txt', 'egy\nketto MODOSITVA\nharom\nnegy\not\nhat\nhet\nnyolc\n');
  ok(['commit', '-qam', 'pr-valtozas']);
  const from = ok(['rev-parse', 'HEAD']);
  ok(['switch', '-q', 'main']);
  write('b.txt', 'b main-valtozas\n');
  ok(['commit', '-qam', 'main elmozdul']);
  ok(['push', '-q', 'origin', 'main']);
  ok(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  const mainSha = ok(['rev-parse', 'HEAD']);
  ok(['switch', '-q', 'pr']);
  ok(['merge', '-q', '--no-edit', 'main']);
  const to = ok(['rev-parse', 'HEAD']);
  return { dir, bare, run, ok, write, from, to, mainSha };
}

test('checkCarry: ütközésmentes main-beolvasztás, azonos PR-változás → átvihető (patch-id, fa, a main-szülő)', () => {
  const r = repo();
  const c = checkCarry({ git: { run: r.run }, from: r.from, to: r.to, base: 'origin/main' });
  assert.equal(c.ok, true, c.why);
  assert.match(c.patchId, /^[0-9a-f]{40}$/);
  assert.deepEqual([c.from, c.to, c.mainParent], [r.from, r.to, r.mainSha]);
});

test('checkCarry: nem merge / idegen szülő / a main-szülő nem az origin/main őse / a merge-ben más változás / eltérő PR-változás → nincs átvitel', () => {
  const r = repo();
  const g = { run: r.run };
  assert.match(checkCarry({ git: g, from: r.from, to: r.from, base: 'origin/main' }).why, /nem kétszülős/);
  const other = r.ok(['rev-parse', 'main~1']);
  assert.match(checkCarry({ git: g, from: other, to: r.to, base: 'origin/main' }).why, /egyik szülője sem a régi/);
  r.ok(['update-ref', 'refs/remotes/origin/main', `${r.from}~1`]);
  assert.match(checkCarry({ git: g, from: r.from, to: r.to, base: 'origin/main' }).why, /nem a origin\/main őse/);
  r.ok(['update-ref', 'refs/remotes/origin/main', 'main']);
  assert.match(checkCarry({ git: g, from: 'nincs-ilyen-ref', to: r.to, base: 'origin/main' }).why, /nem feloldható/);
  // a merge commitba csempészett többletváltozás
  r.write('a.txt', 'egy\nketto MODOSITVA\nharom\nnegy\not\nhat\nhet\nnyolc\nCSEMPESZETT\n');
  r.ok(['commit', '-q', '--amend', '-a', '--no-edit']);
  const amended = r.ok(['rev-parse', 'HEAD']);
  assert.match(checkCarry({ git: g, from: r.from, to: amended, base: 'origin/main' }).why, /fája eltér/);
});

test('checkCarry: ha a main a PR-hunk kontextusába nyúlt (ütközés nélkül), a PR-diff megváltozik → nincs átvitel (fail-closed)', () => {
  const r = repo();
  r.ok(['switch', '-q', 'main']);
  r.write('a.txt', 'egy\nketto\nharom\nnegy MAIN\not\nhat\nhet\nnyolc\n');
  r.ok(['commit', '-qam', 'main ugyanabba a fajlba']);
  r.ok(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  r.ok(['switch', '-q', 'pr']);
  r.ok(['merge', '-q', '--no-edit', 'main']);
  const to2 = r.ok(['rev-parse', 'HEAD']);
  const c = checkCarry({ git: { run: r.run }, from: r.to, to: to2, base: 'origin/main' });
  assert.equal(c.ok, false);
  assert.match(c.why, /patch-id eltér|nem bájtra azonos/);
});

test('checkCarry: a régi fejnek nincs saját változása (üres PR-diff) → nincs átvitel', () => {
  const r = repo();
  r.ok(['switch', '-q', '-c', 'ures', 'main~1']);
  r.ok(['commit', '-q', '--allow-empty', '-m', 'ures']);
  const empty = r.ok(['rev-parse', 'HEAD']);
  r.ok(['merge', '-q', '--no-edit', 'main']);
  const to = r.ok(['rev-parse', 'HEAD']);
  assert.match(checkCarry({ git: { run: r.run }, from: empty, to, base: 'origin/main' }).why, /nem számolható/);
});

test('carryRecords: csak ok: true, a régi fejre szóló rekord; a vak ítélet kötelező és csak IGEN / IGEN, FELTÉTELLEL (L8)', () => {
  const H = 'a'.repeat(40);
  const store = new Map();
  const read = (n) => store.get(n) ?? null;
  store.set(`pre-push-${H}`, { head: H, ok: true });
  assert.match(carryRecords({ from: H, read }).why, /nincs átvihető .* vak ítélet/);
  for (const verdict of ['NEM', undefined, 'igen', 'TALAN']) {
    store.set(`review-${H}`, { head: H, ok: true, verdict });
    assert.equal(carryRecords({ from: H, read }).ok, false, `a(z) ${verdict} ítélet nem vihető át`);
  }
  store.set(`review-${H}`, { head: 'b'.repeat(40), ok: true, verdict: 'IGEN' });
  assert.equal(carryRecords({ from: H, read }).ok, false, 'más fejre szóló rekord nem vihető át (rec.head === from)');
  store.set(`review-${H}`, { head: H, ok: true, verdict: 'IGEN, FELTÉTELLEL' });
  store.set(`pre-pr-${H}`, { head: H, ok: false });
  assert.deepEqual(carryRecords({ from: H, read }).records.map((x) => x.kind), ['review', 'pre-push'], 'a bukott pre-pr nem megy át');
  store.set(`pre-pr-${H}`, { head: 'c'.repeat(40), ok: true });
  assert.deepEqual(carryRecords({ from: H, read }).records.map((x) => x.kind), ['review', 'pre-push'], 'más fejre szóló pre-pr nem megy át');
});

test('freshMain: lekérési hiba / olvashatatlan vagy eltérő GitHub-csúcs → nincs átvitel; egyezés → a main hash-e (L1)', () => {
  const r = repo();
  const g = { run: r.run };
  assert.deepEqual(freshMain({ git: g, ghMainSha: () => r.mainSha }), { ok: true, sha: r.mainSha });
  assert.match(freshMain({ git: g, ghMainSha: () => 'f'.repeat(40) }).why, /nem a GitHub szerinti csúcs/);
  assert.match(freshMain({ git: g, ghMainSha: () => '' }).why, /hash-e nem olvasható/);
  assert.match(freshMain({ git: g, ghMainSha: () => { throw new Error('nincs hálózat'); } }).why, /GitHub szerinti main nem olvasható \(nincs hálózat\)/);
  // a helyi origin/main elavult, de a lekérés frissíti → egyezik
  r.ok(['update-ref', 'refs/remotes/origin/main', 'main~1']);
  assert.equal(freshMain({ git: g, ghMainSha: () => r.mainSha }).ok, true, 'a lekérés felülírja az elavult helyi origin/main-t');
  r.ok(['remote', 'set-url', 'origin', join(r.bare, 'nincs-ilyen')]);
  assert.match(freshMain({ git: g, ghMainSha: () => r.mainSha }).why, /nem kérhető le/);
});

test('runCarry: a friss main hibája megállít; a próba az új fejen fut; bukott próba → nincs átvitel; átvitt rekordok lánccal és main-hash-sel', async () => {
  const r = repo();
  const evDir = mkdtempSync(join(tmpdir(), 'carry-ev-'));
  writeEvidence(evDir, `review-${r.from}`, { head: r.from, ok: true, verdict: 'IGEN' });
  writeEvidence(evDir, `pre-push-${r.from}`, { head: r.from, ok: true });
  const ctx = { exec: realExec, root: r.dir, evDir };
  const calls = [];
  const greenProbe = async (_c, a) => { calls.push(a); return { status: STATUS.PASS, note: 'zöld', tree: 't', counts: { pass: 9 }, ms: 1 }; };

  const stale = await runCarry({ ctx, from: r.from, to: r.to, probe: greenProbe, ghMainSha: () => 'f'.repeat(40) });
  assert.deepEqual([stale.ok, /GitHub szerinti csúcs/.test(stale.why), calls.length], [false, true, 0], 'eltérő GitHub-csúcs: a próba sem fut');
  assert.equal(readEvidence(evDir, `review-${r.to}`), null);

  const red = await runCarry({ ctx, from: r.from, to: r.to, probe: async () => ({ status: STATUS.FAIL, note: 'bukik egy őr' }), ghMainSha: () => r.mainSha });
  assert.deepEqual([red.ok, /próba nem zöld: bukik egy őr/.test(red.why)], [false, true]);
  assert.equal(readEvidence(evDir, `review-${r.to}`), null, 'bukott próba után nincs átvitt rekord');
  assert.equal(readEvidence(evDir, `carry-${r.to}`), null);

  const green = await runCarry({ ctx, from: r.from, to: 'HEAD', probe: greenProbe, ghMainSha: () => r.mainSha, now: () => new Date('2026-11-19T10:00:00Z') });
  assert.equal(green.ok, true, green.why);
  // 3. vak kör L3 + L4 (spec-változás): rögzített main SHA, a hatókör történeti alapja a régi, ellenőrzött fej
  assert.deepEqual(calls, [{ head: r.to, base: r.mainSha, scopeHead: r.from, label: 'carry-over' }], 'a próba a feloldott új fejen, a rögzített main SHA-val');
  assert.deepEqual(green.written, [`carry-${r.to}`, `review-${r.to}`, `pre-push-${r.to}`]);
  const carried = readEvidence(evDir, `review-${r.to}`);
  assert.deepEqual(
    [carried.head, carried.carriedFrom, carried.reviewedHead, carried.carryChain, carried.carry, carried.verdict, carried.carriedAt],
    [r.to, r.from, r.from, [r.from], `carry-${r.to}`, 'IGEN', '2026-11-19T10:00:00.000Z'],
  );
  assert.equal(readEvidence(evDir, `pre-push-${r.to}`).ok, true);
  const rec = readEvidence(evDir, `carry-${r.to}`);
  assert.deepEqual([rec.kind, rec.ok, rec.from, rec.to, rec.head, rec.mainSha, rec.mainParent, rec.probe.counts.pass, rec.carried],
    ['carry-over', true, r.from, r.to, r.to, r.mainSha, r.mainSha, 9, ['review', 'pre-push']]);
  assert.match(rec.patchId, /^[0-9a-f]{40}$/);
});

test('runCarry: többszörös átvitelnél a lánc az eredetileg ellenőrzött fejet őrzi (L8)', async () => {
  const r = repo();
  const evDir = mkdtempSync(join(tmpdir(), 'carry-ev-'));
  const ORIG = 'e'.repeat(40);
  writeEvidence(evDir, `review-${r.from}`, { head: r.from, ok: true, verdict: 'IGEN', reviewedHead: ORIG, carryChain: [ORIG] });
  const ctx = { exec: realExec, root: r.dir, evDir };
  const ok = await runCarry({ ctx, from: r.from, to: r.to, probe: async () => ({ status: STATUS.PASS, note: 'zöld' }), ghMainSha: () => r.mainSha });
  assert.equal(ok.ok, true, ok.why);
  const c = readEvidence(evDir, `review-${r.to}`);
  assert.deepEqual([c.reviewedHead, c.carryChain], [ORIG, [ORIG, r.from]]);
});

test('runCarry: NEM ítélet nem vihető át, a próba sem fut (L8)', async () => {
  const r = repo();
  const evDir = mkdtempSync(join(tmpdir(), 'carry-ev-'));
  writeEvidence(evDir, `review-${r.from}`, { head: r.from, ok: true, verdict: 'NEM' });
  let ran = false;
  const res = await runCarry({ ctx: { exec: realExec, root: r.dir, evDir }, from: r.from, to: r.to, probe: async () => { ran = true; return { status: STATUS.PASS }; }, ghMainSha: () => r.mainSha });
  assert.deepEqual([res.ok, ran], [false, false]);
  assert.match(res.why, /vak ítélet/);
});

test('CLI: a --base kapcsoló megszűnt → 2-es kilépés, magyarázattal (L1)', () => {
  const p = realExec(process.execPath, [join(HERE, 'carry-over.mjs'), '--from', 'a'.repeat(40), '--base', 'valami/ag'], { cwd: HERE, timeoutMs: 60_000 });
  assert.equal(p.code, 2);
  assert.match(p.stderr, /--base kapcsoló megszűnt/);
});

test('3. vak kör L2: a célfejre már rögzített ítéletet (NEM) az átvitel nem írja felül — a próba előtt és közben rögzítve sem', async () => {
  const r = repo();
  const evDir = mkdtempSync(join(tmpdir(), 'carry-ev-'));
  writeEvidence(evDir, `review-${r.from}`, { head: r.from, ok: true, verdict: 'IGEN' });
  const ctx = { exec: realExec, root: r.dir, evDir };
  writeEvidence(evDir, `review-${r.to}`, { head: r.to, ok: true, verdict: 'NEM' });
  let ran = false;
  const before = await runCarry({ ctx, from: r.from, to: r.to, probe: async () => { ran = true; return { status: STATUS.PASS, note: 'zöld' }; }, ghMainSha: () => r.mainSha });
  assert.deepEqual([before.ok, /már van rögzített ítélet/.test(before.why), ran], [false, true, false], before.why);
  assert.equal(readEvidence(evDir, `review-${r.to}`).verdict, 'NEM');
  // a próba KÖZBEN rögzített NEM is megmarad
  const ev2 = mkdtempSync(join(tmpdir(), 'carry-ev-'));
  writeEvidence(ev2, `review-${r.from}`, { head: r.from, ok: true, verdict: 'IGEN' });
  const during = await runCarry({ ctx: { ...ctx, evDir: ev2 }, from: r.from, to: r.to, ghMainSha: () => r.mainSha,
    probe: async () => { writeEvidence(ev2, `review-${r.to}`, { head: r.to, ok: true, verdict: 'NEM' }); return { status: STATUS.PASS, note: 'zöld' }; } });
  assert.equal(during.ok, false, during.why);
  assert.equal(readEvidence(ev2, `review-${r.to}`).verdict, 'NEM');
  assert.equal(readEvidence(ev2, `carry-${r.to}`), null, 'nincs carry-rekord sem');
});

test('3. vak kör L2: a célfejen meglévő pre-push bizonyítékot az átvitel nem írja felül', async () => {
  const r = repo();
  const evDir = mkdtempSync(join(tmpdir(), 'carry-ev-'));
  writeEvidence(evDir, `review-${r.from}`, { head: r.from, ok: true, verdict: 'IGEN' });
  writeEvidence(evDir, `pre-push-${r.from}`, { head: r.from, ok: true, src: 'regi' });
  writeEvidence(evDir, `pre-push-${r.to}`, { head: r.to, ok: false, src: 'sajat' });
  const res = await runCarry({ ctx: { exec: realExec, root: r.dir, evDir }, from: r.from, to: r.to, probe: async () => ({ status: STATUS.PASS, note: 'zöld' }), ghMainSha: () => r.mainSha });
  assert.equal(res.ok, true, res.why);
  assert.equal(readEvidence(evDir, `pre-push-${r.to}`).src, 'sajat');
  assert.ok(!res.written.includes(`pre-push-${r.to}`));
});

test('3. vak kör L11: a --base=… alak is 2-es kilépés', () => {
  const p = realExec(process.execPath, [join(HERE, 'carry-over.mjs'), '--from', 'a'.repeat(40), '--base=valami/ag'], { cwd: HERE, timeoutMs: 60_000 });
  assert.equal(p.code, 2);
  assert.match(p.stderr, /--base kapcsoló megszűnt/);
});

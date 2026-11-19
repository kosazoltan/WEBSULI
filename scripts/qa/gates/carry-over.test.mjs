// Kapu-gyorsítás B (docs/specs/2026-11-19-kapu-gyorsitas.md): bizonyíték-átvitel főág-beolvasztás után — valódi, ideiglenes git-tárban.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STATUS, realExec, readEvidence, writeEvidence } from './lib.mjs';
import { carryRecords, checkCarry, runCarry } from './carry-over.mjs';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'carry-'));
  const run = (args, o = {}) => realExec('git', ['-c', 'user.name=t', '-c', 'user.email=t@pelda.hu', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, input: o.input, timeoutMs: 60_000 });
  const ok = (args) => { const r = run(args); assert.equal(r.code, 0, `${args.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
  const write = (f, t) => writeFileSync(join(dir, f), t);
  ok(['init', '-q', '-b', 'main']);
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
  ok(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  ok(['switch', '-q', 'pr']);
  ok(['merge', '-q', '--no-edit', 'main']);
  const to = ok(['rev-parse', 'HEAD']);
  return { dir, run, ok, write, from, to };
}

test('checkCarry: ütközésmentes main-beolvasztás, azonos PR-változás → átvihető (patch-id, fa, a main-szülő)', () => {
  const r = repo();
  const c = checkCarry({ git: { run: r.run }, from: r.from, to: r.to, base: 'origin/main' });
  assert.equal(c.ok, true, c.why);
  assert.match(c.patchId, /^[0-9a-f]{40}$/);
  assert.equal(c.from, r.from);
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

test('carryRecords + runCarry: csak ok: true rekord; vak ítélet nélkül nincs átvitel; a próba bukása megállít; átvitt rekordok a carry-jelöléssel', async () => {
  const H = 'a'.repeat(40);
  const store = new Map();
  const read = (n) => store.get(n) ?? null;
  store.set(`pre-push-${H}`, { head: H, ok: true });
  assert.match(carryRecords({ from: H, read }).why, /nincs átvihető .* vak ítélet/);
  store.set(`review-${H}`, { head: H, ok: true, verdict: 'IGEN' });
  store.set(`pre-pr-${H}`, { head: H, ok: false });
  assert.deepEqual(carryRecords({ from: H, read }).records.map((x) => x.kind), ['review', 'pre-push'], 'a bukott pre-pr nem megy át');

  const r = repo();
  const evDir = mkdtempSync(join(tmpdir(), 'carry-ev-'));
  writeEvidence(evDir, `review-${r.from}`, { head: r.from, ok: true, verdict: 'IGEN' });
  writeEvidence(evDir, `pre-push-${r.from}`, { head: r.from, ok: true });
  const ctx = { exec: realExec, root: r.dir, evDir };
  const red = await runCarry({ ctx, from: r.from, to: r.to, probe: async () => ({ status: STATUS.FAIL, note: 'bukik egy őr' }) });
  assert.deepEqual([red.ok, /próba nem zöld/.test(red.why)], [false, true]);
  assert.equal(readEvidence(evDir, `review-${r.to}`), null, 'bukott próba után nincs átvitt rekord');
  const green = await runCarry({ ctx, from: r.from, to: r.to, probe: async () => ({ status: STATUS.PASS, note: 'zöld', tree: 't', counts: { pass: 9 }, ms: 1 }) });
  assert.equal(green.ok, true, green.why);
  const carried = readEvidence(evDir, `review-${r.to}`);
  assert.deepEqual([carried.head, carried.carriedFrom, carried.carry, carried.verdict], [r.to, r.from, `carry-${r.to}`, 'IGEN']);
  assert.equal(readEvidence(evDir, `pre-push-${r.to}`).ok, true);
  const rec = readEvidence(evDir, `carry-${r.to}`);
  assert.deepEqual([rec.kind, rec.from, rec.to, rec.probe.counts.pass], ['carry-over', r.from, r.to, 9]);
  assert.match(rec.patchId, /^[0-9a-f]{40}$/);
});

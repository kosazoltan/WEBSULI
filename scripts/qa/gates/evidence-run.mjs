#!/usr/bin/env node
// Tetszőleges parancs futtatása ÉS rögzítése láncolt bizonyítékként (S2; terv 6.1). A „PASS” állítás ezzel lesz gép által igazolható:
// a jelentésben a `run-<id>` azonosító szerepel, a `verify-report.mjs` a rekord fejét, kilépési kódját és számait nézi.
//
// Használat: node scripts/qa/gates/evidence-run.mjs -- <parancs> [arg…]
//   pl.: node scripts/qa/gates/evidence-run.mjs -- node --test scripts/qa/gates/verify-report.test.mjs
// Kilépési kód: a futtatott parancsé (a rögzítés hibája: 2).

import { createHash } from 'node:crypto';
import { STATUS, isMain, makeContext, realExec, redact, tail } from './lib.mjs';
import { appendRecord } from './evidence-chain.mjs';

/** node:test (spec és TAP) összesítőjéből a darabszámok; ha nincs, null. */
export function testCounts(out) {
  const s = String(out);
  const num = (re) => { const m = re.exec(s); return m ? Number(m[1]) : null; };
  const pass = num(/^(?:ℹ|#) pass (\d+)/m);
  const fail = num(/^(?:ℹ|#) fail (\d+)/m);
  const tests = num(/^(?:ℹ|#) tests (\d+)/m);
  return pass == null && fail == null ? null : { tests, pass, fail };
}

/**
 * A rekord (titok nélkül): fej, parancs (szűrve), kilépési kód, a szűrt kimenet hash-e, darabszámok.
 * @returns {{ id: string, record: object }}
 */
export function buildRunRecord({ head, dirty, cmd, args, result, now = () => new Date() }) {
  const at = now().toISOString();
  const cmdline = redact([cmd, ...args].join(' '));
  const out = redact(`${result.stdout}\n${result.stderr}`);
  const id = createHash('sha256').update(`${head}\n${cmdline}\n${at}`).digest('hex').slice(0, 12);
  return {
    id: `run-${id}`,
    record: {
      kind: 'run', head, dirty, cmd: cmdline, code: result.code, ok: result.code === 0, ms: result.ms,
      outSha256: createHash('sha256').update(out).digest('hex'), counts: testCounts(out), at,
    },
  };
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--');
  const rest = i >= 0 ? argv.slice(i + 1) : argv;
  if (!rest.length) { process.stderr.write('Használat: node scripts/qa/gates/evidence-run.mjs -- <parancs> [arg…]\n'); process.exit(2); }
  let ctx;
  try { ctx = makeContext({}); } catch (e) { process.stderr.write(`[evidence-run] nem git-munkafa: ${e.message}\n`); process.exit(2); }
  const head = ctx.git.head();
  const dirty = ctx.git.trackedDirty().length > 0;
  const [cmd, ...args] = rest;
  const result = realExec(cmd, args, { cwd: process.cwd() });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  try {
    const { id, record } = buildRunRecord({ head, dirty, cmd, args, result });
    appendRecord(ctx.evDir, id, record);
    process.stdout.write(`\n[evidence-run] ${result.code === 0 ? STATUS.PASS : STATUS.FAIL} (kód ${result.code}) — bizonyíték: ${id} (fej ${head.slice(0, 12)}${dirty ? ', COMMITOLATLAN változással' : ''})${record.counts ? `; ${record.counts.pass ?? '?'} pass / ${record.counts.fail ?? '?'} fail` : ''}\n`);
  } catch (e) {
    process.stderr.write(`[evidence-run] a bizonyíték nem írható: ${tail(String(e?.message ?? e), 2)}\n`);
    process.exit(2);
  }
  process.exit(result.code);
}

if (isMain(import.meta.url)) main();

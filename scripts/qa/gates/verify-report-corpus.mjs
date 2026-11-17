#!/usr/bin/env node
// A hivatkozás-ellenőrző REGRESSZIÓS KORPUSZA (független review B1/1; terv 6.3a). Helyi, útvonal-paraméteres: a valódi ellenőri
// jelentések a scratchpadban élnek (a nyilvános repóba NEM kerülnek); a CI a `verify-report.test.mjs` anonimizált mintáit futtatja.
// Cél: a korpuszon 0 hamis HAMIS. A „block” módra váltás feltétele (terv 6.3a): ez zöld + 10 egymást követő új valódi jelentés
// hamis riasztás nélkül.
//
// Használat: node scripts/qa/gates/verify-report-corpus.mjs [--root <mappa>]… [--doc <md>]… [--json]
//   --root  a mappa `review-*/jelentes.md` fájljai; a jelentés feje az utolsó `# … fej <hash>` címsor (a korábbi körök a saját
//           címsoruk fején ellenőrzöttek, a szakasz-fej szabály szerint)
//   --doc   egy md a jelenlegi fejen (pl. a saját terv, végrehajtási fájl, runbook)
// Kilépési kód: 0 = egyetlen HAMIS sincs; 1 = van HAMIS (a lista a kimenetben); 2 = nem futott.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, makeContext, redact } from './lib.mjs';
import { FALSE, TRUE, UNKNOWN, checkReferences, makeEnv } from './verify-report.mjs';

const SECTION_HEAD = /^#{1,6}\s.*\bfej\b.*?`?\b([0-9a-f]{7,40})\b/i;

/** A jelentés feje: az utolsó, feloldható `# … fej <hash>` címsor; ha nincs, null. */
export function reportHead(md, resolve) {
  let head = null;
  for (const l of String(md).split(/\r?\n/)) {
    const m = SECTION_HEAD.exec(l);
    if (m && resolve(m[1])) head = resolve(m[1]);
  }
  return head;
}

export function collectReports(roots) {
  const out = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root).sort()) {
      if (!d.startsWith('review-')) continue;
      const p = join(root, d, 'jelentes.md');
      if (existsSync(p)) out.push({ name: d, path: p });
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const vals = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
  const json = args.includes('--json');
  let ctx;
  try { ctx = makeContext({}); } catch (e) { process.stderr.write(`[corpus] NEM FUTOTT: ${e.message}\n`); process.exit(2); }
  const resolve = (ref) => { const r = ctx.git.run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return r.code === 0 ? r.stdout.trim() : null; };
  const jobs = [];
  for (const r of collectReports(vals('--root'))) {
    const md = readFileSync(r.path, 'utf8');
    jobs.push({ name: r.name, md, head: reportHead(md, resolve) });
  }
  for (const p of vals('--doc')) {
    if (!existsSync(p)) { process.stderr.write(`[corpus] NEM FUTOTT: nem létezik: ${p}\n`); process.exit(2); }
    jobs.push({ name: p.replace(/\\/g, '/').split('/').pop(), md: readFileSync(p, 'utf8'), head: ctx.git.head() });
  }
  const rows = [];
  let tot = { [TRUE]: 0, [FALSE]: 0, [UNKNOWN]: 0 };
  for (const j of jobs) {
    if (!j.head) { rows.push({ name: j.name, skipped: 'a fej nem azonosítható' }); continue; }
    const items = checkReferences(j.md, makeEnv({ ctx, head: j.head, gh: false }));
    const c = { [TRUE]: 0, [FALSE]: 0, [UNKNOWN]: 0 };
    for (const x of items) c[x.status] += 1;
    tot = { [TRUE]: tot[TRUE] + c[TRUE], [FALSE]: tot[FALSE] + c[FALSE], [UNKNOWN]: tot[UNKNOWN] + c[UNKNOWN] };
    rows.push({ name: j.name, head: j.head.slice(0, 10), counts: c, false: items.filter((x) => x.status === FALSE).map((x) => ({ line: x.line, ref: x.ref, detail: redact(x.detail) })) });
  }
  const code = tot[FALSE] ? 1 : 0;
  if (json) {
    process.stdout.write(`${JSON.stringify({ schema: 'websuli-check/1', tool: 'verify-report-corpus', head: null, ok: code === 0, exitCode: code, counts: tot, items: rows.flatMap((r) => (r.false ?? []).map((f) => ({ id: `${r.name}:${f.line}`, status: FALSE, ref: f.ref, detail: f.detail }))) }, null, 2)}\n`);
  } else {
    for (const r of rows) {
      if (r.skipped) { process.stdout.write(`## ${r.name}: kihagyva (${r.skipped})\n`); continue; }
      process.stdout.write(`## ${r.name} (fej ${r.head}): IGAZ ${r.counts[TRUE]} · HAMIS ${r.counts[FALSE]} · NEM ELLENŐRIZHETŐ ${r.counts[UNKNOWN]}\n`);
      for (const f of r.false) process.stdout.write(`    | ${f.line}. sor ${f.ref} — ${f.detail}\n`);
    }
    process.stdout.write(`# összesen: ${jobs.length} dokumentum · IGAZ ${tot[TRUE]} · HAMIS ${tot[FALSE]} · NEM ELLENŐRIZHETŐ ${tot[UNKNOWN]} → ${code ? 'BUKOTT' : 'ZÖLD (0 hamis HAMIS)'}\n`);
  }
  process.exit(code);
}

if (isMain(import.meta.url)) main();

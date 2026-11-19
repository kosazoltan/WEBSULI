#!/usr/bin/env node
// Bizonyíték-átvitel főág-beolvasztás után (docs/specs/2026-11-19-kapu-gyorsitas.md B). Ha az új fej egy ütközésmentes
// main-beolvasztás, amelynek egyik szülője a bizonyítékkal rendelkező régi fej, a másik az `origin/main` őse, és a PR saját változása
// bájtra azonos, a vak ítélet (`review-`) és a `pre-push-` / `pre-pr-` bizonyíték átvihető az új fejre — egy gépi `carry-<fej>`
// rekorddal, az új fejen lefutott összefésült próba után. Bármi eltér → nincs átvitel (fail-closed).
//
// Használat: node scripts/qa/gates/carry-over.mjs --from <régi fej> [--to HEAD] [--base origin/main]   (npm run gate:carry -- …)
// Kilépési kód: 0 = átvitve; 1 = nem vihető át (az ok kiírva); 2 = nem futott.

import { STATUS, argValue, isMain, makeContext, readEvidence, writeEvidence } from './lib.mjs';
import { mergedProbe } from './merged-probe.mjs';

const full = (git, ref) => { const r = git.run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return r.code === 0 ? r.stdout.trim() : null; };

/**
 * Az átvitel gépi feltételei. @returns {{ ok: boolean, why: string, from?, to?, mainParent?, patchId?, tree? }}
 * @param {{ git: { run(args: string[], opts?): { code, stdout, stderr } }, from: string, to: string, base: string }} p
 */
export function checkCarry({ git, from, to, base }) {
  const f = full(git, from);
  const t = full(git, to);
  const b = full(git, base);
  if (!f || !t || !b) return { ok: false, why: `nem feloldható hivatkozás (${!f ? from : !t ? to : base})` };
  const parents = git.run(['rev-list', '--parents', '-n', '1', t]).stdout.trim().split(/\s+/).slice(1);
  if (parents.length !== 2) return { ok: false, why: `az új fej nem kétszülős merge commit (${parents.length} szülő)` };
  if (!parents.includes(f)) return { ok: false, why: 'az új fej egyik szülője sem a régi (bizonyítékkal rendelkező) fej' };
  const mainParent = parents.find((p) => p !== f);
  if (git.run(['merge-base', '--is-ancestor', mainParent, b]).code !== 0) return { ok: false, why: `a másik szülő (${mainParent.slice(0, 12)}) nem a ${base} őse` };
  const mt = git.run(['merge-tree', '--write-tree', f, mainParent]);
  if (mt.code !== 0) return { ok: false, why: 'a régi fej és a main összefésülése ütközik — kézi feloldás után nincs átvitel' };
  const tree = mt.stdout.split('\n')[0].trim();
  const newTree = git.run(['rev-parse', `${t}^{tree}`]).stdout.trim();
  if (tree !== newTree) return { ok: false, why: 'az új fej fája eltér a gépi összefésülés fájától (a merge-ben más változás is van)' };
  const oldBase = git.run(['merge-base', f, mainParent]).stdout.trim();
  const pid = (a, z) => {
    const d = git.run(['diff', '--binary', '--full-index', a, z]);
    if (d.code !== 0) return null;
    if (!d.stdout.trim()) return '';
    const p = git.run(['patch-id', '--verbatim'], { input: d.stdout });
    return p.code === 0 ? (p.stdout.trim().split(/\s+/)[0] ?? null) : null;
  };
  const oldId = pid(oldBase, f);
  const newId = pid(mainParent, t);
  if (!oldId || !newId) return { ok: false, why: 'a PR saját változásának patch-azonosítója nem számolható (üres vagy hibás diff)' };
  if (oldId !== newId) return { ok: false, why: 'a PR saját változása nem bájtra azonos a beolvasztás előtti és utáni fejen (patch-id eltér)' };
  return { ok: true, why: 'ütközésmentes main-beolvasztás, a PR saját változása bájtra azonos', from: f, to: t, mainParent, patchId: newId, tree };
}

export const CARRIED = Object.freeze(['review', 'pre-push', 'pre-pr']);

/** Az átvihető régi rekordok: csak `ok: true`, a régi fejre szóló; a vak ítélet (`review-`) kötelező. */
export function carryRecords({ from, read }) {
  const out = [];
  for (const kind of CARRIED) {
    const rec = read(`${kind}-${from}`);
    if (rec && rec.head === from && rec.ok === true) out.push({ kind, rec });
  }
  if (!out.some((x) => x.kind === 'review')) return { ok: false, why: `nincs átvihető (ok: true) vak ítélet a régi fejre (review-${from.slice(0, 12)})`, records: [] };
  return { ok: true, records: out };
}

/** Az átvitel teljes menete (a próba injektálható). @returns {Promise<{ ok: boolean, why: string, written?: string[] }>} */
export async function runCarry({ ctx, from, to = 'HEAD', base = 'origin/main', probe = mergedProbe, now = () => new Date() }) {
  // a `patch-id` a diffet a szabványos bemenetén kapja — ezért a futtató `input`-ot is átad
  const gitIO = { run: (args, o = {}) => ctx.exec('git', args, { cwd: ctx.root, input: o.input, timeoutMs: 120_000 }) };
  const c = checkCarry({ git: gitIO, from, to, base });
  if (!c.ok) return { ok: false, why: c.why };
  const recs = carryRecords({ from: c.from, read: (n) => readEvidence(ctx.evDir, n) });
  if (!recs.ok) return { ok: false, why: recs.why };
  const pr = await probe(ctx, { head: c.to, base, files: [], label: 'carry-over' });
  if (pr.status !== STATUS.PASS) return { ok: false, why: `az új fejen az összefésült próba nem zöld: ${pr.note}` };
  const carry = `carry-${c.to}`;
  const at = now().toISOString();
  writeEvidence(ctx.evDir, carry, {
    kind: 'carry-over', ok: true, from: c.from, to: c.to, head: c.to, mainParent: c.mainParent, patchId: c.patchId, tree: c.tree,
    probe: { tree: pr.tree ?? null, counts: pr.counts ?? null, ms: pr.ms ?? null }, carried: recs.records.map((x) => x.kind), at,
  });
  const written = [carry];
  for (const { kind, rec } of recs.records) {
    writeEvidence(ctx.evDir, `${kind}-${c.to}`, { ...rec, head: c.to, carriedFrom: c.from, carry, carriedAt: at });
    written.push(`${kind}-${c.to}`);
  }
  return { ok: true, why: c.why, written };
}

async function main() {
  const args = process.argv.slice(2);
  const from = argValue(args, '--from');
  if (!from) { process.stderr.write('Használat: node scripts/qa/gates/carry-over.mjs --from <régi fej> [--to HEAD] [--base origin/main]\n'); process.exit(2); }
  let ctx;
  try { ctx = makeContext({}); } catch (e) { process.stderr.write(`[carry-over] NEM FUTOTT: ${e.message}\n`); process.exit(2); }
  const r = await runCarry({ ctx, from, to: argValue(args, '--to', 'HEAD'), base: argValue(args, '--base', 'origin/main') });
  if (!r.ok) { process.stdout.write(`[carry-over] NINCS ÁTVITEL: ${r.why}\n`); process.exit(1); }
  process.stdout.write(`[carry-over] ÁTVITVE (${r.why}): ${r.written.join(', ')}\n`);
  process.exit(0);
}

if (isMain(import.meta.url)) main();

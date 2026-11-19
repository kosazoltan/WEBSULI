#!/usr/bin/env node
// Bizonyíték-átvitel főág-beolvasztás után (docs/specs/2026-11-19-kapu-gyorsitas.md B). Ha az új fej egy ütközésmentes
// main-beolvasztás, amelynek egyik szülője a bizonyítékkal rendelkező régi fej, a másik az `origin/main` őse, és a PR saját változása
// bájtra azonos, a vak ítélet (`review-`) és a `pre-push-` / `pre-pr-` bizonyíték átvihető az új fejre — egy gépi `carry-<fej>`
// rekorddal, az új fejen lefutott összefésült próba után. Bármi eltér → nincs átvitel (fail-closed).
//
// Használat: node scripts/qa/gates/carry-over.mjs --from <régi fej> [--to HEAD]   (npm run gate:carry -- …)
// Az alap MINDIG a friss `origin/main` (vak review L1): a szkript maga kéri le, és a csúcsát a GitHub szerinti `main`-nel egyezteti;
// kapcsolóval nem választható. Halmozott PR-láncra (a másik szülő egy másik PR ága) nincs átvitel.
// Kilépési kód: 0 = átvitve; 1 = nem vihető át (az ok kiírva); 2 = nem futott.

import { STATUS, VERDICTS, argValue, isMain, makeContext, readEvidence, redact, writeEvidence } from './lib.mjs';
import { mergedProbe } from './merged-probe.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Kizárólagos létrehozás (`wx`): ha a rekord már létezik, nem írja felül → false (3. vak kör L2). */
function createEvidenceExclusive(dir, name, obj) {
  mkdirSync(dir, { recursive: true });
  try { writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(obj, null, 2)}\n`, { flag: 'wx' }); return true; } catch (e) { if (e?.code === 'EEXIST') return false; throw e; }
}

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

/**
 * Az átvihető régi rekordok: csak `ok: true`, a régi fejre szóló; a vak ítélet (`review-`) kötelező, és csak IGEN / IGEN, FELTÉTELLEL
 * ítélet vihető át (vak review L8: a `NEM` és az ítélet nélküli rekord nem).
 */
export function carryRecords({ from, read }) {
  const out = [];
  for (const kind of CARRIED) {
    const rec = read(`${kind}-${from}`);
    if (!(rec && rec.head === from && rec.ok === true)) continue;
    if (kind === 'review' && !(VERDICTS.includes(rec.verdict) && rec.verdict !== 'NEM')) continue;
    out.push({ kind, rec });
  }
  if (!out.some((x) => x.kind === 'review')) return { ok: false, why: `nincs átvihető (ok: true) vak ítélet a régi fejre (review-${from.slice(0, 12)})`, records: [] };
  return { ok: true, records: out };
}

/**
 * A friss `origin/main`: lekérés + egyeztetés a GitHub szerinti csúccsal (`gh api repos/{owner}/{repo}/branches/main`). Hiba vagy
 * eltérés → `{ ok: false }`. @returns {{ ok: boolean, why?: string, sha?: string }}
 */
export function freshMain({ git, ghMainSha }) {
  const f = git.run(['fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  if (f.code !== 0) return { ok: false, why: `a main nem kérhető le (${String(f.stderr).split('\n')[0]})` };
  const local = git.run(['rev-parse', 'refs/remotes/origin/main']).stdout.trim();
  let remote = null;
  try { remote = ghMainSha(); } catch (e) { return { ok: false, why: `a GitHub szerinti main nem olvasható (${String(e?.message ?? e).split('\n')[0]})` }; }
  if (!/^[0-9a-f]{40}$/.test(String(remote))) return { ok: false, why: 'a GitHub szerinti main hash-e nem olvasható' };
  if (local !== remote) return { ok: false, why: `a lekért origin/main (${local.slice(0, 12)}) nem a GitHub szerinti csúcs (${remote.slice(0, 12)})` };
  return { ok: true, sha: local };
}

/** Az átvitel teljes menete (a próba és a GitHub-lekérdezés injektálható). @returns {Promise<{ ok: boolean, why: string, written?: string[] }>} */
export async function runCarry({ ctx, from, to = 'HEAD', probe = mergedProbe, ghMainSha, now = () => new Date() }) {
  // a `patch-id` a diffet a szabványos bemenetén kapja — ezért a futtató `input`-ot is átad
  const gitIO = { run: (args, o = {}) => ctx.exec('git', args, { cwd: ctx.root, input: o.input, timeoutMs: 120_000 }) };
  const fm = freshMain({ git: gitIO, ghMainSha });
  if (!fm.ok) return { ok: false, why: fm.why };
  // 3. vak kör L4: a feltételek is a rögzített (GitHubbal egyeztetett) main SHA-hoz mérve, nem a mozgó refhez
  const c = checkCarry({ git: gitIO, from, to, base: fm.sha });
  if (!c.ok) return { ok: false, why: c.why };
  const recs = carryRecords({ from: c.from, read: (n) => readEvidence(ctx.evDir, n) });
  if (!recs.ok) return { ok: false, why: recs.why };
  // 3. vak kör L2: a célfejre már rögzített ítéletet az átvitel soha nem írja felül (a próba előtt és az írás előtt is vizsgálva)
  const targetVerdict = () => readEvidence(ctx.evDir, `review-${c.to}`);
  if (targetVerdict()) return { ok: false, why: `a célfejre (${c.to.slice(0, 12)}) már van rögzített ítélet (${targetVerdict().verdict ?? '?'}) — az átvitel nem írja felül` };
  // az új fejen a teljes hatókörű összefésült próba; 3. vak kör L3 + L4: a rögzített main SHA, a hatókör alapja a régi, ellenőrzött fej
  const pr = await probe(ctx, { head: c.to, base: fm.sha, scopeHead: c.from, label: 'carry-over' });
  if (pr.status !== STATUS.PASS) return { ok: false, why: `az új fejen az összefésült próba nem zöld: ${pr.note}` };
  if (targetVerdict()) return { ok: false, why: `a próba közben ítélet került a célfejre (${c.to.slice(0, 12)}: ${targetVerdict().verdict ?? '?'}) — az átvitel nem írja felül` };
  const carry = `carry-${c.to}`;
  const at = now().toISOString();
  // a vak ítélet (review) íródik először, kizárólagosan; a carry-rekord csak a sikeres átvitel UTÁN (3. vak kör L2)
  const written = [];
  for (const { kind, rec } of recs.records) {
    // a lánc megőrzi az eredetileg ellenőrzött fejet (vak review L8)
    const body = { ...rec, head: c.to, carriedFrom: c.from, reviewedHead: rec.reviewedHead ?? c.from, carryChain: [...(rec.carryChain ?? []), c.from], carry, carriedAt: at };
    // 3. vak kör L2: kizárólagos létrehozás — a célfejen meglévő (közben rögzített) rekordot nem írja felül
    if (!createEvidenceExclusive(ctx.evDir, `${kind}-${c.to}`, body)) {
      if (kind === 'review') return { ok: false, why: `a célfejre (${c.to.slice(0, 12)}) közben ítélet került — az átvitel nem írja felül` };
      continue;
    }
    written.push(`${kind}-${c.to}`);
  }
  writeEvidence(ctx.evDir, carry, {
    kind: 'carry-over', ok: true, from: c.from, to: c.to, head: c.to, mainSha: fm.sha, mainParent: c.mainParent, patchId: c.patchId, tree: c.tree,
    probe: { tree: pr.tree ?? null, counts: pr.counts ?? null, ms: pr.ms ?? null }, carried: written.map((w) => w.slice(0, w.length - c.to.length - 1)), at,
  });
  written.unshift(carry);
  return { ok: true, why: c.why, written };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((a) => a === '--base' || a.startsWith('--base='))) { process.stderr.write('[carry-over] NEM FUTOTT: a --base kapcsoló megszűnt — az alap mindig a friss origin/main\n'); process.exit(2); }
  const from = argValue(args, '--from');
  if (!from) { process.stderr.write('Használat: node scripts/qa/gates/carry-over.mjs --from <régi fej> [--to HEAD]\n'); process.exit(2); }
  let ctx;
  try { ctx = makeContext({}); } catch (e) { process.stderr.write(`[carry-over] NEM FUTOTT: ${e.message}\n`); process.exit(2); }
  let r;
  try {
    r = await runCarry({
      ctx, from, to: argValue(args, '--to', 'HEAD'),
      ghMainSha: () => {
        const g = ctx.exec('gh', ['api', 'repos/{owner}/{repo}/branches/main', '--jq', '.commit.sha'], { cwd: ctx.root, timeoutMs: 60_000 });
        if (g.code !== 0) throw new Error(redact(g.stderr).split('\n')[0]);
        return g.stdout.trim();
      },
    });
  } catch (e) {
    r = { ok: false, why: `kivétel: ${String(e?.message ?? e).split('\n')[0]}` };
  }
  if (!r.ok) { process.stdout.write(`[carry-over] NINCS ÁTVITEL: ${r.why}\n`); process.exit(1); }
  process.stdout.write(`[carry-over] ÁTVITVE (${r.why}): ${r.written.join(', ')}\n`);
  process.exit(0);
}

if (isMain(import.meta.url)) main();

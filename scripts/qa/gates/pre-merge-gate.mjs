#!/usr/bin/env node
// Merge előtti kapu (docs/minosegkapuk.md; terv E9, D8). Az orkesztrátor futtatja KÖZVETLENÜL a `gh pr merge` előtt.
// Csak ellenőriz — a `gh pr merge`-et NEM hívja. Zöld esetben `merge-<PR>-<fej>.json` bizonyíték (15 percig érvényes a hookban).
//
// Használat: node scripts/qa/gates/pre-merge-gate.mjs <PR-szám>

import { join } from 'node:path';
import {
  STATUS, createGate, isMain, makeContext, readEvidence, redact, resolveVerdict, verdictResult, writeEvidence,
} from './lib.mjs';
import { evidenceRecord } from './pre-push-gate.mjs';

/** A kötelező ellenőrzések állapota a fej check-runjai / státuszai alapján (azonos névnél a legutóbbi számít). */
export function requiredChecks(required, checkRuns = [], statuses = []) {
  const problems = [];
  for (const ctxName of required) {
    const runs = checkRuns.filter((c) => c.name === ctxName).sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    const st = statuses.filter((s) => s.context === ctxName);
    if (runs.length) {
      const c = runs[0];
      if (c.status !== 'completed') problems.push(`${ctxName}: még fut (${c.status})`);
      else if (c.conclusion !== 'success') problems.push(`${ctxName}: ${c.conclusion}`);
    } else if (st.length) {
      if (st[0].state !== 'success') problems.push(`${ctxName}: ${st[0].state}`);
    } else {
      problems.push(`${ctxName}: nem futott a jelenlegi fejre`);
    }
  }
  return problems;
}

/**
 * Tiszta döntés a begyűjtött adatokból (a tesztek közvetlenül ezt hívják).
 * @returns {{ name: string, status: string, note: string }[]}
 */
export function decideMerge({ pr, required, checkRuns, statuses, threads, mainSha, ciBaseSha, files, verdict, guard, rt, repoWidePatterns }) {
  const out = [];
  const add = (name, status, note = '') => out.push({ name, status, note });

  if (pr.state !== 'OPEN') add('PR állapota', STATUS.FAIL, `a PR nem nyitott (${pr.state})`);
  else if (pr.isDraft) add('PR állapota', STATUS.FAIL, 'piszkozat (draft)');
  else if (pr.mergeStateStatus !== 'CLEAN') add('PR állapota', STATUS.FAIL, `mergeStateStatus=${pr.mergeStateStatus} (CLEAN kell; UNKNOWN esetén várd meg az újraszámolást, ne erőltesd)`);
  else add('PR állapota', STATUS.PASS, 'OPEN, CLEAN');

  const probs = requiredChecks(required, checkRuns, statuses);
  if (!required.length) add('kötelező ellenőrzések a jelenlegi fejen', STATUS.FAIL, 'a főág-védelemből nem olvasható a kötelező lista');
  else if (probs.length) add('kötelező ellenőrzések a jelenlegi fejen', STATUS.FAIL, probs.join('; '));
  else add('kötelező ellenőrzések a jelenlegi fejen', STATUS.PASS, `${required.join(', ')} — sikeres a ${pr.headRefOid.slice(0, 12)} fejen`);

  const open = threads.filter((t) => !t.isResolved).length;
  add('lezáratlan review-szálak', open ? STATUS.FAIL : STATUS.PASS,
    open ? `${open} nyitott szál — a jogos leletet javítsd teszttel, válaszolj, és CSAK a megválaszolt szálat zárd le` : `0 / ${threads.length}`);

  const base = ciBaseSha ?? pr.baseRefOid;
  if (!mainSha || !base) add('main elmozdulása a PR CI-ja óta (C-61)', STATUS.FAIL, 'a main csúcsa vagy a CI alapja nem olvasható');
  else if (mainSha === base) add('main elmozdulása a PR CI-ja óta (C-61)', STATUS.PASS, 'a CI a jelenlegi mainnel futott');
  else {
    const res = (repoWidePatterns ?? []).map((p) => new RegExp(p));
    const wide = files.filter((f) => res.some((re) => re.test(f)));
    if (wide.length) add('main elmozdulása a PR CI-ja óta (C-61)', STATUS.FAIL, `a main elmozdult, és a PR repó-szintű őrt / ellenőrzést érint (${wide.join(', ')}) — előbb olvaszd be a maint, és várd meg az új CI-t`);
    else add('main elmozdulása a PR CI-ja óta (C-61)', STATUS.WARN, `a main elmozdult (${base.slice(0, 8)} → ${mainSha.slice(0, 8)}); repó-szintű őrt nem érint`);
  }

  out.push({ name: 'független ellenőr ítélete a fejre', ...verdictResult(verdict, pr.headRefOid) });

  if (guard.code === 0) add('futásőr (active-runs-guard.sh)', STATUS.PASS, guard.summary || 'nincs aktív futás');
  else if (guard.code === 1) add('futásőr (active-runs-guard.sh)', STATUS.FAIL, `van aktív gyártás / javítás — NE vonj össze; ${guard.summary}`);
  else add('futásőr (active-runs-guard.sh)', STATUS.FAIL, `az őr hibát adott (kilépési kód ${guard.code}) — vakon összevonni tilos; ${guard.summary}`);

  add('telepítés', STATUS.PASS, files.some((f) => f.startsWith('source/'))
    ? 'TELEPÍTÉST INDÍT (source/ változott) — a zöld PR-okat egy összevonási ablakban, mindegyik előtt futásőrrel'
    : 'nem indít telepítést (nincs source/ változás)');

  if (rt.error) add('valós idejű meccsek (/api/rt/status)', STATUS.FAIL, `a végpont nem olvasható (${rt.error}) — hálózati hiba = bukás`);
  else if (String(rt.json?.mode ?? '').toLowerCase() === 'off') add('valós idejű meccsek (/api/rt/status)', STATUS.PASS, 'MP_MODE=off');
  else if (Number(rt.json?.activeMatches) === 0) add('valós idejű meccsek (/api/rt/status)', STATUS.PASS, `mode=${rt.json?.mode}, activeMatches=0`);
  else add('valós idejű meccsek (/api/rt/status)', STATUS.FAIL, `mode=${rt.json?.mode}, activeMatches=${rt.json?.activeMatches} — várd meg a meccsek végét`);

  return out;
}

function ghJson(exec, root, args) {
  const r = exec('gh', args, { cwd: root, timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(`gh ${args.slice(0, 3).join(' ')}: ${redact(r.stderr).split('\n')[0]}`);
  return JSON.parse(r.stdout || 'null');
}

async function fetchRt(url) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20_000);
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { json: await res.json() };
  } catch (e) {
    return { error: String(e?.message ?? e).split('\n')[0] };
  }
}

async function main() {
  const n = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  if (!n) { process.stderr.write('Használat: node scripts/qa/gates/pre-merge-gate.mjs <PR-szám>\n'); process.exit(2); }
  const ctx = makeContext({});
  const { exec, root, cfg } = ctx;
  const gate = createGate('pre-merge-gate');
  let pr;
  try {
    const repo = ghJson(exec, root, ['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
    const [owner, name] = repo.split('/');
    pr = ghJson(exec, root, ['pr', 'view', n, '--json', 'number,state,isDraft,mergeStateStatus,headRefOid,baseRefOid,files,body,comments']);
    const head = pr.headRefOid;
    const protection = ghJson(exec, root, ['api', `repos/${repo}/branches/main/protection`]);
    const required = protection?.required_status_checks?.contexts ?? [];
    const checkRuns = ghJson(exec, root, ['api', `repos/${repo}/commits/${head}/check-runs?per_page=100`]).check_runs ?? [];
    const statuses = ghJson(exec, root, ['api', `repos/${repo}/commits/${head}/status`]).statuses ?? [];
    const q = 'query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}';
    const threads = ghJson(exec, root, ['api', 'graphql', '-f', `query=${q}`, '-f', `o=${owner}`, '-f', `r=${name}`, '-F', `n=${n}`])
      .data.repository.pullRequest.reviewThreads.nodes;
    const mainSha = ghJson(exec, root, ['api', `repos/${repo}/branches/main`]).commit?.sha;
    const runs = ghJson(exec, root, ['api', `repos/${repo}/actions/runs?head_sha=${head}&event=pull_request&per_page=20`]).workflow_runs ?? [];
    const ci = runs.filter((r) => r.name === 'CI').sort((a, b) => b.id - a.id)[0];
    const ciBaseSha = ci?.pull_requests?.[0]?.base?.sha ?? null;
    const verdict = resolveVerdict({
      head, evidence: readEvidence(ctx.evDir, `review-${head}`), texts: [pr.body, ...(pr.comments ?? []).map((c) => c.body)],
    });
    const g = exec('bash', [join(root, 'scripts', 'qa', 'active-runs-guard.sh')], { cwd: root, timeoutMs: 90_000 });
    const summary = redact(`${g.stdout}\n${g.stderr}`).split('\n').filter((l) => /^(GUARD|AKTIV)/.test(l)).join(' ').trim();
    const rt = await fetchRt(process.env.WEBSULI_RT_STATUS_URL || cfg.rtStatusUrl);
    for (const r of decideMerge({
      pr, required, checkRuns, statuses, threads, mainSha, ciBaseSha, files: (pr.files ?? []).map((f) => f.path), verdict,
      guard: { code: g.code, summary }, rt, repoWidePatterns: cfg.repoWidePatterns,
    })) gate.add(r.name, r.status, r.note);
  } catch (e) {
    gate.add('adatgyűjtés (gh / hálózat)', STATUS.FAIL, String(e?.message ?? e).split('\n')[0]);
  }
  const code = gate.finish();
  if (pr?.headRefOid) {
    writeEvidence(ctx.evDir, `merge-${n}-${pr.headRefOid}`, evidenceRecord('merge', pr.headRefOid, gate, { pr: Number(n) }));
    gate.log(`[pre-merge-gate] bizonyíték: merge-${n}-${pr.headRefOid.slice(0, 12)} (ok=${code === 0}; ${cfg.mergeEvidenceMaxMinutes} percig érvényes). A gh pr merge-et ez a kapu NEM hívja.`);
  }
  process.exit(code);
}

if (isMain(import.meta.url)) main();

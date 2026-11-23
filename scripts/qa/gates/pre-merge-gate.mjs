#!/usr/bin/env node
// Merge előtti kapu (docs/minosegkapuk.md; terv E9, D8). Az orkesztrátor futtatja KÖZVETLENÜL a `gh pr merge` előtt.
// Csak ellenőriz — a `gh pr merge`-et NEM hívja. Zöld esetben `merge-<PR>-<fej>.json` bizonyíték (15 percig érvényes a hookban).
//
// Használat: node scripts/qa/gates/pre-merge-gate.mjs <PR-szám>

import { join } from 'node:path';
import {
  STATUS, createGate, externalResult, isMain, makeContext, readEvidence, redact, resolveVerdict, verdictResult, writeEvidence, prodLineStats, carryVerdict, carryInputs,
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
export const COMPARE_FILE_LIMIT = 300; // a GitHub compare végpont legfeljebb ennyi fájlt ad vissza

/**
 * C-61: a compare-válasz fájllistája. Átnevezésnél a régi név is számít (K4: pl. a main egy tervet archivál — a régi útvonal a
 * hatókörben van). Hiányzó / nem tömb `files` → null (fail-closed); a csonkolás a válasz fájlszámából.
 */
export function compareFiles(cmp) {
  if (!Array.isArray(cmp?.files)) return { mainFiles: null, mainFilesTruncated: false };
  return {
    mainFiles: cmp.files.flatMap((f) => [f?.filename, f?.previous_filename].filter((x) => typeof x === 'string' && x)),
    mainFilesTruncated: cmp.files.length >= COMPARE_FILE_LIMIT,
  };
}

/** Egy hatókör-bejegyzés mintáinak fordítása; hibás / hiányzó hatókör → `.*` (fail-closed). */
function scopeRegexes(entry) {
  const list = Array.isArray(entry?.mainScope) && entry.mainScope.length ? entry.mainScope : ['.*'];
  return list.map((p) => { try { return new RegExp(p); } catch { return /.*/; } });
}

/**
 * C-61 (kanban #92): a main elmozdult a PR CI-ja óta. FAIL csak akkor, ha a PR egy repó-szintű ellenőrzést érint, és a main
 * elmozdulása az adott ellenőrzés által olvasott fájlkört érinti. Fail-closed: olvashatatlan / csonka (≥ 300) / üres main-fájllista
 * eltérő SHA mellett → FAIL; hibás vagy hiányzó hatókör → `.*`.
 * @returns {{ status: string, note: string }}
 */
export function decideMainMoved({ base, mainSha, files = [], mainFiles, mainFilesTruncated = false, repoWideScopes = [] }) {
  if (!mainSha || !base) return { status: STATUS.FAIL, note: 'a main csúcsa vagy a CI alapja nem olvasható' };
  if (mainSha === base) return { status: STATUS.PASS, note: 'a CI a jelenlegi mainnel futott' };
  const moved = `a main elmozdult (${base.slice(0, 8)} → ${mainSha.slice(0, 8)})`;
  if (!Array.isArray(repoWideScopes) || !repoWideScopes.length) return { status: STATUS.FAIL, note: `${moved}; a repoWideScopes hatókör-táblázat hiányzik a gates.config.json-ból (fail-closed)` };
  const touched = [];
  for (const f of files) {
    const hits = repoWideScopes.filter((s) => { try { return new RegExp(s.pattern).test(f); } catch { return true; } });
    if (hits.length) touched.push({ file: f, scopes: hits.flatMap(scopeRegexes) });
  }
  if (!touched.length) return { status: STATUS.WARN, note: `${moved}; repó-szintű őrt / ellenőrzést nem érint` };
  const wide = touched.map((t) => t.file).join(', ');
  const failMsg = (why) => ({ status: STATUS.FAIL, note: `${moved}, és a PR repó-szintű őrt / ellenőrzést érint (${wide}); ${why} — előbb olvaszd be a maint, és várd meg az új CI-t` });
  if (!Array.isArray(mainFiles)) return failMsg('a main elmozdulásának fájllistája nem olvasható');
  if (mainFilesTruncated || mainFiles.length >= COMPARE_FILE_LIMIT) return failMsg(`a main elmozdulásának fájllistája csonka (≥ ${COMPARE_FILE_LIMIT})`);
  if (!mainFiles.length) return failMsg('a main elmozdulásának fájllistája üres, pedig a SHA eltér');
  const overlap = [...new Set(mainFiles.filter((m) => touched.some((t) => t.scopes.some((re) => re.test(m)))))];
  if (overlap.length) return failMsg(`a main az ellenőrzés által olvasott fájlt változtatott (${overlap.slice(0, 10).join(', ')}${overlap.length > 10 ? ', …' : ''})`);
  return { status: STATUS.WARN, note: `${moved}; a PR repó-szintű ellenőrzést érint (${wide}), de a main ${mainFiles.length} változott fájlja közül egyik sem esik a hatókörébe (pl. ${mainFiles.slice(0, 5).join(', ')})` };
}

export function decideMerge({ pr, required, checkRuns, statuses, threads, mainSha, ciBaseSha, files, verdict, external = null, guard, rt, repoWideScopes, mainFiles = null, mainFilesTruncated = false, small = null }) {
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
  const c61 = decideMainMoved({ base, mainSha, files, mainFiles, mainFilesTruncated, repoWideScopes });
  add('main elmozdulása a PR CI-ja óta (C-61)', c61.status, c61.note);

  out.push({ name: 'független ellenőr ítélete a fejre', ...verdictResult(verdict, pr.headRefOid, small) });
  out.push({ name: 'külső (Gemini) ellenőr — második vélemény', ...externalResult(external, pr.headRefOid) });

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
    // C-61 (kanban #92): a main elmozdulásának fájllistája a compare végpontból; hiba esetén null → a döntés fail-closed.
    const cmpBase = ciBaseSha ?? pr.baseRefOid;
    let mainFiles = null;
    let mainFilesTruncated = false;
    if (cmpBase && mainSha && cmpBase !== mainSha) {
      try {
        ({ mainFiles, mainFilesTruncated } = compareFiles(ghJson(exec, root, ['api', `repos/${repo}/compare/${cmpBase}...${mainSha}`])));
      } catch { mainFiles = null; }
    }
    const verdict = resolveVerdict({
      head, evidence: readEvidence(ctx.evDir, `review-${head}`), texts: [pr.body, ...(pr.comments ?? []).map((c) => c.body)],
    }) ?? carryVerdict({ ...carryInputs(ctx, head), smallFix: cfg.smallFix }); // A7: kis utólagos javítás
    const g = exec('bash', [join(root, 'scripts', 'qa', 'active-runs-guard.sh')], { cwd: root, timeoutMs: 90_000 });
    const summary = redact(`${g.stdout}\n${g.stderr}`).split('\n').filter((l) => /^(GUARD|AKTIV)/.test(l)).join(' ').trim();
    const rt = await fetchRt(process.env.WEBSULI_RT_STATUS_URL || cfg.rtStatusUrl);
    for (const r of decideMerge({
      pr, required, checkRuns, statuses, threads, mainSha, ciBaseSha, files: (pr.files ?? []).map((f) => f.path), verdict,
      external: readEvidence(ctx.evDir, `external-${head}`), guard: { code: g.code, summary }, rt, repoWideScopes: cfg.repoWideScopes ?? [],
      mainFiles, mainFilesTruncated,
      // Terv docs/specs/2026-11-23-aranyos-kapuk.md (A3): a kis javítást a GitHub fájllistájából számoljuk, a helyi bizonyítéktól függetlenül.
      small: prodLineStats((pr.files ?? []).map((f) => ({ path: f.path, add: f.additions, del: f.deletions })), cfg.smallFix),
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

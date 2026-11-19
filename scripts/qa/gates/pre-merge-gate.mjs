#!/usr/bin/env node
// Merge előtti kapu (docs/minosegkapuk.md; terv E9, D8). Az orkesztrátor futtatja KÖZVETLENÜL a `gh pr merge` előtt.
// Csak ellenőriz — a `gh pr merge`-et NEM hívja. Zöld esetben `merge-<PR>-<fej>.json` bizonyíték (15 percig érvényes a hookban).
//
// Használat: node scripts/qa/gates/pre-merge-gate.mjs <PR-szám>

import { join } from 'node:path';
import {
  STATUS, createGate, externalResult, isMain, makeContext, readEvidence, redact, resolveVerdict, verdictResult, writeEvidence,
} from './lib.mjs';
import { evidenceRecord } from './pre-push-gate.mjs';
import { mergedProbe } from './merged-probe.mjs';

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
 * C-61 (kanban #92; kapu-gyorsítás A, docs/specs/2026-11-19-kapu-gyorsitas.md): a main elmozdult a PR CI-ja óta. Ha a PR egy
 * repó-szintű ellenőrzést érint, és a main elmozdulása az ellenőrzés által olvasott fájlkört érinti (vagy a main-fájllista
 * olvashatatlan / csonka / üres), NEM kér új CI-t: `probeNeeded: true`, és a döntést a gépi összefésült próba (`probe`) eredménye
 * hozza — zöld → PASS, minden más (piros, ütközés, nem futott) → FAIL. Hibás vagy hiányzó hatókör → `.*`; hiányzó hatókör-tábla →
 * FAIL (konfighiba, próba nélkül).
 * @returns {{ status: string, note: string, probeNeeded?: boolean }}
 */
export function decideMainMoved({ base, mainSha, files = [], mainFiles, mainFilesTruncated = false, repoWideScopes = [], probe = null }) {
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
  const failMsg = (why) => {
    const ctxNote = `${moved}, és a PR repó-szintű őrt / ellenőrzést érint (${wide}); ${why}`;
    if (!probe) return { status: STATUS.FAIL, probeNeeded: true, note: `${ctxNote} — a gépi összefésült próba nem futott (fail-closed)` };
    const meta = `${probe.counts?.pass ?? '?'} teszt, fa ${String(probe.tree ?? '?').slice(0, 12)}, ${Math.round((probe.ms ?? 0) / 1000)} s`;
    return probe.status === STATUS.PASS
      ? { status: STATUS.PASS, probeNeeded: true, note: `${ctxNote} — a gépi összefésült próba zöld (${meta}); új CI nem kell` }
      : { status: STATUS.FAIL, probeNeeded: true, note: `${ctxNote} — a gépi összefésült próba NEM zöld: ${probe.note}` };
  };
  if (!Array.isArray(mainFiles)) return failMsg('a main elmozdulásának fájllistája nem olvasható');
  if (mainFilesTruncated || mainFiles.length >= COMPARE_FILE_LIMIT) return failMsg(`a main elmozdulásának fájllistája csonka (≥ ${COMPARE_FILE_LIMIT})`);
  if (!mainFiles.length) return failMsg('a main elmozdulásának fájllistája üres, pedig a SHA eltér');
  const overlap = [...new Set(mainFiles.filter((m) => touched.some((t) => t.scopes.some((re) => re.test(m)))))];
  if (overlap.length) return failMsg(`a main az ellenőrzés által olvasott fájlt változtatott (${overlap.slice(0, 10).join(', ')}${overlap.length > 10 ? ', …' : ''})`);
  return { status: STATUS.WARN, note: `${moved}; a PR repó-szintű ellenőrzést érint (${wide}), de a main ${mainFiles.length} változott fájlja közül egyik sem esik a hatókörébe (pl. ${mainFiles.slice(0, 5).join(', ')})` };
}

export function decideMerge({ pr, required, checkRuns, statuses, threads, mainSha, ciBaseSha, files, verdict, external = null, guard, rt, repoWideScopes, mainFiles = null, mainFilesTruncated = false, probe = null }) {
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
  const c61 = decideMainMoved({ base, mainSha, files, mainFiles, mainFilesTruncated, repoWideScopes, probe });
  add('main elmozdulása a PR CI-ja óta (C-61)', c61.status, c61.note);

  out.push({ name: 'független ellenőr ítélete a fejre', ...verdictResult(verdict, pr.headRefOid) });
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

/**
 * A merge-kapu összefésült próbája: a PR feje (`refs/pull/<n>/head`) és a friss `origin/main` lekérése — mindkettő hash-egyezéssel a
 * GitHub-adatokhoz —, majd a közös `mergedProbe`. Bármely eltérés / hiba → FAIL-eredmény (fail-closed).
 */
/**
 * Tulajdonosi döntés (2026-11-19, „≤ 7 perc + 1 újrafuttatás”; kanban #205 megoldásáig): bukáskor a próba PONTOSAN egyszer újrafut.
 * Az újrafuttatás jelölve: `attempts`, `retried`, `firstNote`, a megjegyzésben „ÚJRAFUTTATVA (#205)”, és a naplóban. A második bukás FAIL.
 * A `run(attempt)` kivétele bukásnak számít. @returns {Promise<object>}
 */
export async function probeWithRetry(run, log = () => {}) {
  const once = async (attempt) => {
    try { return await run(attempt); } catch (e) { return { status: STATUS.FAIL, note: `a próba kivételt dobott (${String(e?.message ?? e).split('\n')[0]})` }; }
  };
  const first = await once(1);
  if (first?.status === STATUS.PASS) return { ...first, attempts: 1, retried: false, attemptMs: [first.ms ?? null] };
  log(`[pre-merge-gate] az összefésült próba bukott (${first?.note ?? 'nincs eredmény'}) — egyszeri újrafuttatás (#205) — tulajdonosi döntés 2026-11-19`);
  const second = await once(2);
  const mark = `ÚJRAFUTTATVA (#205) — az 1. futás bukott: ${first?.note ?? 'nincs eredmény'}`;
  // 3. vak kör L9: az összidő a két futás összege, a futásonkénti idő külön
  const attemptMs = [first?.ms ?? null, second?.ms ?? null];
  const ms = attemptMs.every(Number.isFinite) ? attemptMs[0] + attemptMs[1] : null;
  return { ...second, status: second?.status === STATUS.PASS ? STATUS.PASS : STATUS.FAIL, attempts: 2, retried: true, firstNote: first?.note ?? null, note: `${second?.note ?? 'nincs eredmény'} — ${mark}`, ms, attemptMs };
}

/** A `merge-probe-<PR>-<fej>` rekord (3. vak kör L9: összidő, futásonkénti idő, hatókör; L4: a rögzített main SHA). */
export function probeRecord({ head, mainSha, probe, at = new Date().toISOString() }) {
  return {
    kind: 'merge-probe', head, mainSha, status: probe.status, tree: probe.tree ?? null, counts: probe.counts ?? null, scope: probe.scope ?? null,
    ms: probe.ms ?? null, attemptMs: probe.attemptMs ?? [probe.ms ?? null], note: probe.note, attempts: probe.attempts ?? 1, retried: probe.retried === true,
    firstNote: probe.firstNote ?? null, at,
  };
}

export async function runMergeProbe({ ctx, n, head, mainSha, log = () => {}, probe = mergedProbe, mainNow }) {
  const { git } = ctx;
  const t0 = Date.now();
  const fail = (note) => ({ status: STATUS.FAIL, note, ms: Date.now() - t0 });
  // 3. vak kör L8: futásonként egyedi segéd-refek; a takarítás a lekéréstől kezdve minden úton
  const tag = `${n}-${process.pid}-${Date.now()}`;
  const prRef = `refs/remotes/origin/gate-pr-${tag}`;
  const mainRef = `refs/remotes/origin/gate-main-${tag}`;
  try {
    const f1 = git.run(['fetch', '--quiet', 'origin', `+refs/pull/${n}/head:${prRef}`, `+refs/heads/main:${mainRef}`]);
    if (f1.code !== 0) return fail(`a PR feje / a main nem kérhető le (${String(f1.stderr).split('\n')[0]})`);
    const prHead = git.run(['rev-parse', prRef]).stdout.trim();
    if (prHead !== head) return fail(`a lekért PR-fej (${prHead.slice(0, 12)}) nem a GitHub szerinti fej (${String(head).slice(0, 12)})`);
    const localMain = git.run(['rev-parse', mainRef]).stdout.trim();
    if (localMain !== mainSha) return fail(`a lekért main (${localMain.slice(0, 12)}) nem a GitHub szerinti csúcs (${String(mainSha).slice(0, 12)})`);
    log(`[pre-merge-gate] C-61: gépi összefésült próba — ${head.slice(0, 12)} + main ${mainSha.slice(0, 12)} (rögzített SHA)`);
    // 3. vak kör L4: a próba a RÖGZÍTETT main SHA-t kapja (nem a mozgó origin/main refet)
    const r = await probeWithRetry(async () => {
      try {
        return await probe(ctx, { head, base: mainSha, label: 'pre-merge-gate' });
      } catch (e) {
        return fail(`az összefésült próba nem futott (${String(e?.message ?? e).split('\n')[0]})`);
      }
    }, log);
    // 3. vak kör L4: a próba után újra a GitHub szerinti main — ha elmozdult, a zöld nem a tényleges mainre szól
    let now;
    try { now = mainNow(); } catch (e) { return { ...r, status: STATUS.FAIL, note: `a main a próba után nem ellenőrizhető (${String(e?.message ?? e).split('\n')[0]}) — ${r.note}` }; }
    if (now !== mainSha) return { ...r, status: STATUS.FAIL, note: `a main a próba alatt elmozdult (${mainSha.slice(0, 12)} → ${String(now).slice(0, 12)}) — futtasd újra a merge-kaput; ${r.note}` };
    return r;
  } finally {
    git.run(['update-ref', '-d', prRef]);
    git.run(['update-ref', '-d', mainRef]);
  }
}

/**
 * Vak review L3: a próba PR-kódot futtat, ezért CSAK akkor fut, ha (1) a PR ugyanebből a tárolóból jön (fork-PR → FAIL, új CI kell),
 * és (2) a független ítélet és a kötelező ellenőrzések lépése már nem bukik. Ha nem kell próba: null.
 * @returns {Promise<object|null>}
 */
export async function probeStep({ pre, isFork, verdict, head, required, checkRuns, statuses, run }) {
  if (!pre?.probeNeeded) return null;
  if (isFork !== false) return { status: STATUS.FAIL, note: 'fork-PR (vagy nem megállapítható eredet): a gép idegen PR-kódot nem futtat — új CI kell' };
  const v = verdictResult(verdict, head);
  if (v.status === STATUS.FAIL || !required?.length || requiredChecks(required, checkRuns, statuses).length) {
    return { status: STATUS.FAIL, note: 'a próba nem futott: előbb a független ítélet és a kötelező ellenőrzések legyenek zöldek (a próba PR-kódot futtat)' };
  }
  // 3. vak kör L1: a helyi kódfuttatás előfeltétele a MEGBÍZHATÓ, pontos fejhez kötött helyi ítélet (record-review); PR-szöveg nem elég
  if (verdict?.trusted !== true || verdict?.head !== head) {
    return { status: STATUS.FAIL, note: 'a próba nem futott: a helyi kódfuttatáshoz megbízható, erre a fejre rögzített helyi ítélet kell (record-review) — a PR-szöveg ítélet-sora nem indíthat próbát' };
  }
  return run();
}

/** A merge-kapu döntése a próbával együtt (a `main()` ezt hívja; tesztelt bekötés — vak review L6). */
export async function mergeDecision({ inputs, isFork, runProbe }) {
  const pre = decideMainMoved({
    base: inputs.ciBaseSha ?? inputs.pr.baseRefOid, mainSha: inputs.mainSha, files: inputs.files, mainFiles: inputs.mainFiles,
    mainFilesTruncated: inputs.mainFilesTruncated, repoWideScopes: inputs.repoWideScopes,
  });
  const probe = await probeStep({ pre, isFork, verdict: inputs.verdict, head: inputs.pr.headRefOid, required: inputs.required, checkRuns: inputs.checkRuns, statuses: inputs.statuses, run: runProbe });
  // 3. vak kör L4: a futásőr és az RT-állapot a (hosszú) próba UTÁN készül
  const late = inputs.late ? await inputs.late() : {};
  const { late: _l, ...rest } = inputs;
  return { probe, results: decideMerge({ ...rest, ...late, probe }) };
}

/** A PR fájllistája hiánytalanul: a `gh pr view --json files` 100-nál vág, ezért ilyenkor a lapozott REST-lista (csonka → kivétel). */
export function completeFiles({ viewFiles, changedFiles, restPages }) {
  // 3. vak kör L10: mindig a lapozott REST-lista — a `gh pr view` átnevezésnél a régi nevet nem adja
  void viewFiles;
  if (!Number.isInteger(changedFiles)) throw new Error('a PR changed_files száma nem olvasható — a fájllista teljessége nem ellenőrizhető');
  const pages = restPages();
  if (!Array.isArray(pages) || pages.some((p) => !Array.isArray(p))) throw new Error('a PR lapozott fájllistája nem lista');
  const all = [...new Set(pages.flat().flatMap((f) => [f?.filename, f?.previous_filename]).filter((x) => typeof x === 'string' && x))];
  if (pages.flat().length < changedFiles) throw new Error(`a PR fájllistája csonka (${pages.flat().length} / ${changedFiles})`);
  return all;
}

async function main() {
  const n = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  if (!n) { process.stderr.write('Használat: node scripts/qa/gates/pre-merge-gate.mjs <PR-szám>\n'); process.exit(2); }
  const ctx = makeContext({});
  const { exec, root, cfg } = ctx;
  const gate = createGate('pre-merge-gate');
  let pr;
  let mergeMainSha = null;
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
    });
    // A PR eredete (fork?) és a hiánytalan fájllista a REST-ből (vak review L3, L9).
    const pull = ghJson(exec, root, ['api', `repos/${repo}/pulls/${n}`]);
    const isFork = typeof pull?.head?.repo?.full_name === 'string' ? pull.head.repo.full_name !== repo : null;
    const files = completeFiles({
      viewFiles: pr.files, changedFiles: pull?.changed_files,
      restPages: () => ghJson(exec, root, ['api', '--paginate', '--slurp', `repos/${repo}/pulls/${n}/files?per_page=100`]),
    });
    // 3. vak kör L4: a futásőr és az RT-állapot a próba UTÁN (late), hogy a próba közben indult gyártás / meccs is látszódjon
    const late = async () => {
      const g = exec('bash', [join(root, 'scripts', 'qa', 'active-runs-guard.sh')], { cwd: root, timeoutMs: 90_000 });
      const summary = redact(`${g.stdout}\n${g.stderr}`).split('\n').filter((l) => /^(GUARD|AKTIV)/.test(l)).join(' ').trim();
      return { guard: { code: g.code, summary }, rt: await fetchRt(process.env.WEBSULI_RT_STATUS_URL || cfg.rtStatusUrl) };
    };
    // Kapu-gyorsítás A: a C-61 esetben gépi összefésült próba a PR feje + a friss main állapotán (új CI helyett).
    const { probe, results } = await mergeDecision({
      inputs: {
        pr, required, checkRuns, statuses, threads, mainSha, ciBaseSha, files, verdict,
        external: readEvidence(ctx.evDir, `external-${head}`), late, repoWideScopes: cfg.repoWideScopes ?? [],
        mainFiles, mainFilesTruncated,
      },
      isFork,
      runProbe: () => runMergeProbe({ ctx, n, head, mainSha, log: (m) => gate.log(m), mainNow: () => ghJson(exec, root, ['api', `repos/${repo}/branches/main`]).commit?.sha }),
    });
    for (const r of results) gate.add(r.name, r.status, r.note);
    if (probe) writeEvidence(ctx.evDir, `merge-probe-${n}-${head}`, probeRecord({ head, mainSha, probe }));
    mergeMainSha = mainSha;
  } catch (e) {
    gate.add('adatgyűjtés (gh / hálózat)', STATUS.FAIL, String(e?.message ?? e).split('\n')[0]);
  }
  const code = gate.finish();
  if (pr?.headRefOid) {
    // 3. vak kör L4: az engedély a PR + fej + main hármashoz kötött; a hook a merge előtt a GitHub szerinti main csúccsal egyezteti
    writeEvidence(ctx.evDir, `merge-${n}-${pr.headRefOid}`, evidenceRecord('merge', pr.headRefOid, gate, { pr: Number(n), mainSha: mergeMainSha }));
    gate.log(`[pre-merge-gate] bizonyíték: merge-${n}-${pr.headRefOid.slice(0, 12)} (ok=${code === 0}; ${cfg.mergeEvidenceMaxMinutes} percig érvényes). A gh pr merge-et ez a kapu NEM hívja.`);
  }
  process.exit(code);
}

if (isMain(import.meta.url)) main();

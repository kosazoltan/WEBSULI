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

export function decideMerge({ pr, required, checkRuns, statuses, threads, mainSha, ciBaseSha, files, verdict, external = null, guard, rt, repoWideScopes, mainFiles = null, mainFilesTruncated = false }) {
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

/** A REST-es szerző (`user.login`, `user.type`, `author_association`) — az ítélet-forrás szűréséhez (vak review #513 K2). */
const authorOf = (x) => ({ login: x?.user?.login ?? null, type: x?.user?.type ?? null, association: x?.author_association ?? null });

/** Megbízható ítélet-szerző: a repó tulajdonosa / tagja / írásjogú közreműködője, és nem bot (vak review #513 K2). */
export const TRUSTED_ASSOCIATIONS = Object.freeze(['OWNER', 'MEMBER', 'COLLABORATOR']);
export function trustedAuthor(a) {
  if (!a || typeof a.login !== 'string' || !a.login) return false;
  if (a.type === 'Bot' || /\[bot\]$/i.test(a.login)) return false;
  return TRUSTED_ASSOCIATIONS.includes(String(a.association ?? '').toUpperCase());
}

/**
 * Az ítélet-lépés szövegei: a PR-leírás és a kommentek, de a nem megbízható szerzőé üres szövegként (a sorrend — 0. = leírás —
 * megmarad, a `resolveVerdict` forrás-címkéje ebből dolgozik). Nyilvános repóban így idegen komment nem írhat felül egy ítéletet.
 */
export function verdictTexts(pr) {
  return [trustedAuthor(pr?.bodyAuthor) ? pr?.body ?? '' : '', ...(pr?.comments ?? []).map((c) => (trustedAuthor(c?.author) ? c?.body ?? '' : ''))];
}

/** Az ítélet a fejre: a helyi bizonyíték, különben a megbízható szerzőtől származó PR-szöveg (K2; a szigorú mód a futtatóé). */
export function mergeVerdict(pr, evidence) {
  return resolveVerdict({ head: pr?.headRefOid ?? '', evidence, texts: verdictTexts(pr) });
}

/**
 * A REST-es PR-válasz a `decideMerge` által várt (a korábbi `gh pr view --json` szerinti) alakra
 * (docs/specs/2026-11-18-merge-kapu-rest.md): a felhős munkamenetben a GraphQL tiltott, a REST nem. Átnevezésnél a régi útvonal is
 * számít (K6: a telepítés-jelzés és a C-61 hatókör a régi helyet is lássa).
 */
export function prFromRest(pull, files = [], comments = []) {
  const paths = [...new Set((files ?? []).flatMap((f) => [f?.filename, f?.previous_filename]).filter((x) => typeof x === 'string' && x))];
  return {
    number: pull?.number,
    state: String(pull?.state ?? '').toUpperCase(),
    isDraft: Boolean(pull?.draft),
    mergeStateStatus: String(pull?.mergeable_state ?? 'unknown').toUpperCase(),
    headRefOid: pull?.head?.sha,
    baseRefOid: pull?.base?.sha,
    files: paths.map((path) => ({ path })),
    body: pull?.body ?? '',
    bodyAuthor: authorOf(pull),
    comments: (comments ?? []).map((c) => ({ body: c?.body, author: authorOf(c) })),
  };
}

/**
 * A felhős REST-út (`pulls/<n>/ccr/review_threads`) szálai (vak review #513 K1, fail-closed): nem lista, ÜRES lista (amíg nincs mért
 * CCR-minta, az üres válasz nem igazolja, hogy nincs szál) vagy ismeretlen alakú elem (nem logikai `resolved`) → kivétel → FAIL.
 */
export function threadsFromCcr(list) {
  if (!Array.isArray(list)) throw new Error('a ccr/review_threads válasza nem lista — a szálak állapota nem állapítható meg');
  if (!list.length) throw new Error('a ccr/review_threads válasza üres — üres lista a felhős úton nem igazolja, hogy nincs nyitott szál');
  if (list.some((t) => typeof t?.resolved !== 'boolean')) throw new Error('a ccr/review_threads egy eleméből hiányzik a logikai „resolved” mező (ismeretlen alak)');
  return list.map((t) => ({ isResolved: t.resolved === true }));
}

/** A review-kommentekből (`pulls/<n>/comments`) számolt szálak: a válasz nélküli gyökérkommentek (`in_reply_to_id` nincs). */
export function rootReviewComments(comments) {
  return (comments ?? []).filter((c) => c && c.in_reply_to_id == null).length;
}

/** `check-runs` lapozott (`--paginate --slurp`) válasza egy listává; csonka (a `total_count`-nál kevesebb) → kivétel (K6). */
export function checkRunsFromPages(pages) {
  if (!Array.isArray(pages) || !pages.length || pages.some((p) => !Array.isArray(p?.check_runs))) throw new Error('a check-run lista lapozott válasza ismeretlen alakú');
  const all = pages.flatMap((p) => p.check_runs);
  const total = pages[0].total_count;
  if (typeof total === 'number' && all.length < total) throw new Error(`a check-run lista csonka (${all.length} / ${total})`);
  return all;
}

/**
 * `gh api --paginate --slurp` kimenete (oldalak tömbje) egy listává; a régi `gh pr view --json files,comments` is minden oldalt
 * hozott. Ha a PR szerint több fájl változott, mint amennyi megjött, kivétel (fail-closed): a telepítés-jelzés és a C-61 a teljes
 * fájllistán dolgozik.
 */
export function flattenPages(pages, expected = null, what = 'lista') {
  if (!Array.isArray(pages) || pages.some((p) => !Array.isArray(p))) throw new Error(`a(z) ${what} lapozott válasza nem lista`);
  const all = pages.flat();
  if (expected != null && all.length < expected) throw new Error(`a(z) ${what} csonka (${all.length} / ${expected})`);
  return all;
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

const sleepSync = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const THREADS_Q = 'query($o:String!,$r:String!,$n:Int!,$after:String){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100,after:$after){nodes{isResolved} pageInfo{hasNextPage endCursor}}}}}';
export const GRAPHQL_MAX_PAGES = 50;
export const MERGEABLE_RETRY_DELAYS_MS = Object.freeze([2_000, 4_000]);
const mergeableKnown = (pull) => typeof pull?.mergeable_state === 'string' && pull.mergeable_state !== 'unknown';

/**
 * A merge-kapu adatgyűjtése REST-en (docs/specs/2026-11-18-merge-kapu-rest.md; vak review #513 K1, K3, K4, K6), injektált `exec`-kel
 * (a tesztek hamis `gh`-val hívják). Minden alak- vagy teljességi hiba kivétel → a hívó „adatgyűjtés” FAIL-ja.
 * Sorrend: tároló → PR (`mergeable_state` `unknown`-ra korlátos újrakérés) → fájl- és kommentlista (lapozva; hiányzó
 * `changed_files` = hiba) → kötelező lista (védelmi végpont → `branches/main`) → check-runok (lapozva) → szálak (GraphQL lapozva →
 * felhőben a CCR-út REST-keresztellenőrzéssel) → CI-futás → compare.
 */
export function collectMergeData({ exec, root, n, log = () => {}, sleep = sleepSync, delays = MERGEABLE_RETRY_DELAYS_MS }) {
  const gj = (args) => ghJson(exec, root, args);
  // A `{owner}/{repo}` helyőrzőt a gh a helyi git-remote-ból oldja fel.
  const repo = gj(['api', 'repos/{owner}/{repo}'])?.full_name;
  if (typeof repo !== 'string' || !repo.includes('/')) throw new Error('a tároló neve (full_name) nem olvasható');
  const [owner, name] = repo.split('/');
  let pull = gj(['api', `repos/${repo}/pulls/${n}`]);
  for (const ms of delays) {
    if (mergeableKnown(pull)) break;
    log(`[pre-merge-gate] mergeable_state=${pull?.mergeable_state ?? '—'} — újrakérés ${ms} ms múlva`);
    sleep(ms);
    pull = gj(['api', `repos/${repo}/pulls/${n}`]);
  }
  if (!Number.isInteger(pull?.changed_files)) throw new Error('a PR-válaszból hiányzik a changed_files — a fájllista teljessége nem ellenőrizhető');
  const pr = prFromRest(
    pull,
    flattenPages(gj(['api', '--paginate', '--slurp', `repos/${repo}/pulls/${n}/files?per_page=100`]), pull.changed_files, 'fájllista'),
    flattenPages(gj(['api', '--paginate', '--slurp', `repos/${repo}/issues/${n}/comments?per_page=100`]), null, 'kommentlista'),
  );
  const head = pr.headRefOid;
  if (typeof head !== 'string' || !/^[0-9a-f]{40}$/.test(head)) throw new Error('a PR fej-hash-e nem olvasható');
  const mainBranch = gj(['api', `repos/${repo}/branches/main`]);
  let required;
  try {
    required = gj(['api', `repos/${repo}/branches/main/protection`])?.required_status_checks?.contexts ?? [];
  } catch (e) {
    log(`[pre-merge-gate] a védelmi végpont nem olvasható (${String(e?.message ?? e).split('\n')[0]}) — a branches/main protection mezőjéből`);
    // A védelmi végpont admin-jogot kér (felhős munkamenetben 403); ugyanez a lista az ág olvasható `protection` mezőjében.
    required = mainBranch?.protection?.required_status_checks?.contexts ?? [];
  }
  const checkRuns = checkRunsFromPages(gj(['api', '--paginate', '--slurp', `repos/${repo}/commits/${head}/check-runs?per_page=100`]));
  const statuses = gj(['api', `repos/${repo}/commits/${head}/status`])?.statuses ?? [];
  let threads;
  let threadSource;
  try {
    threads = [];
    let after = null;
    for (let page = 0; ; page += 1) {
      if (page >= GRAPHQL_MAX_PAGES) throw new Error(`a review-szálak lapozása ${GRAPHQL_MAX_PAGES} oldal után sem ért véget`);
      const rt = gj(['api', 'graphql', '-f', `query=${THREADS_Q}`, '-f', `o=${owner}`, '-f', `r=${name}`, '-F', `n=${n}`, ...(after ? ['-f', `after=${after}`] : [])])
        ?.data?.repository?.pullRequest?.reviewThreads;
      if (!Array.isArray(rt?.nodes) || rt.nodes.some((t) => typeof t?.isResolved !== 'boolean')) throw new Error('a GraphQL review-szál válasz ismeretlen alakú');
      threads.push(...rt.nodes.map((t) => ({ isResolved: t.isResolved })));
      if (!rt.pageInfo?.hasNextPage) break;
      after = rt.pageInfo.endCursor;
      if (typeof after !== 'string' || !after) throw new Error('a GraphQL review-szál lapozásából hiányzik az endCursor');
    }
    threadSource = 'graphql';
  } catch (e) {
    log(`[pre-merge-gate] a GraphQL-szál-lekérdezés nem sikerült (${String(e?.message ?? e).split('\n')[0]}) — a ccr/review_threads útról`);
    // Felhős munkamenet: a GraphQL tiltott, a szálak a CCR REST-útról jönnek (lapozva), REST-keresztellenőrzéssel; ha bármelyik
    // bukik, a kivétel → „adatgyűjtés” FAIL.
    threads = threadsFromCcr(flattenPages(gj(['api', '--paginate', '--slurp', `repos/${repo}/pulls/${n}/ccr/review_threads`]), null, 'ccr-szállista'));
    const roots = rootReviewComments(flattenPages(gj(['api', '--paginate', '--slurp', `repos/${repo}/pulls/${n}/comments?per_page=100`]), null, 'review-kommentlista'));
    if (roots > threads.length) throw new Error(`a ccr/review_threads csonka: ${threads.length} szál, de a review-kommentekből ${roots} gyökér-szál számolható`);
    threadSource = 'ccr';
  }
  const mainSha = mainBranch?.commit?.sha;
  const runs = gj(['api', `repos/${repo}/actions/runs?head_sha=${head}&event=pull_request&per_page=20`])?.workflow_runs ?? [];
  const ci = runs.filter((r) => r.name === 'CI').sort((a, b) => b.id - a.id)[0];
  const ciBaseSha = ci?.pull_requests?.[0]?.base?.sha ?? null;
  // C-61 (kanban #92): a main elmozdulásának fájllistája a compare végpontból; hiba esetén null → a döntés fail-closed.
  const cmpBase = ciBaseSha ?? pr.baseRefOid;
  let mainFiles = null;
  let mainFilesTruncated = false;
  if (cmpBase && mainSha && cmpBase !== mainSha) {
    try {
      ({ mainFiles, mainFilesTruncated } = compareFiles(gj(['api', `repos/${repo}/compare/${cmpBase}...${mainSha}`])));
    } catch { mainFiles = null; } // a null a decideMainMoved-ben fail-closed (ártalmatlan elnyelés)
  }
  return { repo, pr, required, checkRuns, statuses, threads, threadSource, mainSha, ciBaseSha, mainFiles, mainFilesTruncated };
}

async function main() {
  const n = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  if (!n) { process.stderr.write('Használat: node scripts/qa/gates/pre-merge-gate.mjs <PR-szám>\n'); process.exit(2); }
  const ctx = makeContext({});
  const { exec, root, cfg } = ctx;
  const gate = createGate('pre-merge-gate');
  let pr;
  try {
    const d = collectMergeData({ exec, root, n, log: (m) => gate.log(m) });
    pr = d.pr;
    const head = pr.headRefOid;
    // Vak review #513 K2: PR-szöveges ítélet csak megbízható szerzőtől (verdictTexts); a szigorú mód a vak ellenőr futtatójáé.
    const verdict = mergeVerdict(pr, readEvidence(ctx.evDir, `review-${head}`));
    const g = exec('bash', [join(root, 'scripts', 'qa', 'active-runs-guard.sh')], { cwd: root, timeoutMs: 90_000 });
    const summary = redact(`${g.stdout}\n${g.stderr}`).split('\n').filter((l) => /^(GUARD|AKTIV)/.test(l)).join(' ').trim();
    const rt = await fetchRt(process.env.WEBSULI_RT_STATUS_URL || cfg.rtStatusUrl);
    for (const r of decideMerge({
      pr, required: d.required, checkRuns: d.checkRuns, statuses: d.statuses, threads: d.threads, mainSha: d.mainSha, ciBaseSha: d.ciBaseSha,
      files: (pr.files ?? []).map((f) => f.path), verdict, external: readEvidence(ctx.evDir, `external-${head}`),
      guard: { code: g.code, summary }, rt, repoWideScopes: cfg.repoWideScopes ?? [], mainFiles: d.mainFiles, mainFilesTruncated: d.mainFilesTruncated,
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

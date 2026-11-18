#!/usr/bin/env node
// A vak hibakereső ellenőr FUTTATÓJA (docs/specs/2026-11-18-vak-ellenor-deepseek.md; skill: websuli-vak-ellenor).
// Az OpenRouter chat-completions végpontját hívja eszközhívással, ciklusban, a gates.config.json `blindReview.model` modelljével
// (egyetlen forrás — modell-kapcsoló NINCS). Az ellenőr egy eldobható munkafában olvas, keres és futtat; a végén jelentést ad le.
// A futtató gép által előállított bizonyítékot ír (`blind-review-<fej>.json`), amelyet a record-review.mjs és a kapuk ellenőriznek.
//
// Használat (bármely ügynök-környezetből ugyanaz):
//   npm run gate:blind-review -- --base <ref> --head <teljes hash> --spec <terv.md>[,<több>] --goal <cél.md> --out <jelentés.md>
//     [--max-usd 0.5] [--max-rounds N] [--max-minutes N] [--node-modules <mappa>] [--dry-run]
// A fejlesztő jelentésének átadására NINCS kapcsoló (ismeretlen kapcsoló = hiba): ez a „vakság” gépi garanciája.
// Kilépési kód: 0 = teljes jelentés; 3 = NEM TELJES (plafon / megszakítás); 2 = a vak ellenőr nem futott (kulcs / OpenRouter); 1 = hibás hívás.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { BLIND_NOT_RUN, GATES_DIR, evidenceDir, isMain, loadConfig, writeEvidence } from '../lib.mjs';
import { missingSections, reportHead, reportVerdict } from '../record-review.mjs';
import { EVIDENCE_KIND, evidenceName, sha256 } from './evidence.mjs';
import { summaryMarkdown, verifyFindings } from './findings.mjs';
import { LOCAL_CONFIG_NAME, OpenRouterError, callOpenRouter, loadApiKey, maskSecrets, usageCost } from './openrouter.mjs';
import { TMP_DIR, TOOL_SCHEMAS, cleanEnv, makeTools } from './tools.mjs';

const HERE = join(GATES_DIR, 'blind-review');
const RUNNER_ROOT = resolve(GATES_DIR, '..', '..', '..');
const TEMPLATE_PATH = join(GATES_DIR, 'vak-ellenor-megbizas.md');
export const NOT_RUN = BLIND_NOT_RUN;

// ---- Argumentumok (szigorú: ismeretlen kapcsoló = hiba) ----------------------------------------------------------------

export const VALUE_FLAGS = ['--base', '--head', '--spec', '--goal', '--out', '--max-usd', '--max-rounds', '--max-minutes', '--node-modules'];
export const BOOL_FLAGS = ['--dry-run'];

export function parseArgs(argv, cfg) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    let a = argv[i];
    let v;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { v = a.slice(eq + 1); a = a.slice(0, eq); }
    if (BOOL_FLAGS.includes(a)) { o[a.slice(2)] = true; continue; }
    if (!VALUE_FLAGS.includes(a)) {
      throw new Error(`ismeretlen kapcsoló: ${a} — a futtató csak ezeket ismeri: ${[...VALUE_FLAGS, ...BOOL_FLAGS].join(' ')}. `
        + 'A fejlesztő jelentése / összefoglalója NEM adható át (vak ellenőr).');
    }
    if (v === undefined) { i += 1; v = argv[i]; }
    if (v === undefined || v === '') throw new Error(`hiányzó érték: ${a}`);
    o[a.slice(2)] = v;
  }
  for (const need of ['base', 'head', 'spec', 'goal', 'out']) if (!o[need]) throw new Error(`a --${need} kötelező`);
  if (!/^[0-9a-f]{40}$/i.test(o.head)) throw new Error('a --head TELJES (40 jegyű) commit-hash legyen');
  const num = (name, def, hard, unit) => {
    const n = o[name] === undefined ? def : Number(o[name]);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`a --${name} pozitív szám legyen`);
    if (n > hard) throw new Error(`a --${name} legfeljebb ${hard} ${unit} lehet (kemény felső határ)`);
    return n;
  };
  return {
    base: o.base,
    head: o.head.toLowerCase(),
    specs: o.spec.split(',').map((s) => s.trim()).filter(Boolean),
    goal: o.goal,
    out: o.out,
    nodeModules: o['node-modules'] ?? null,
    dryRun: Boolean(o['dry-run']),
    maxUsd: num('max-usd', cfg.maxUsdDefault, cfg.maxUsdHardCap, 'USD'),
    maxRounds: Math.floor(num('max-rounds', cfg.maxRounds, cfg.maxRoundsHardCap, 'kör')),
    maxMinutes: num('max-minutes', cfg.maxWallMinutes, cfg.maxWallMinutesHardCap, 'perc'),
  };
}

// ---- A rendszerüzenet egy forrásból: scripts/qa/gates/vak-ellenor-megbizas.md ------------------------------------------------

/** A megbízás-sablon ellenőrzése (az EGYETLEN forrásfájl szövege): megvan-e a hibakereső keret és a kötelező jelentés-forma. */
export function checkTemplate(text) {
  const tpl = String(text).replace(/\r\n/g, '\n').trim();
  for (const must of ['A FELADATOD HIBÁT TALÁLNI, NEM MEGERŐSÍTENI', 'Amit kapsz (más nem jár)', '## Mit próbáltam megtörni, és nem sikerült', '## Mit NEM vizsgáltam']) {
    if (!tpl.includes(must)) throw new Error(`a megbízás-sablonból (scripts/qa/gates/vak-ellenor-megbizas.md) hiányzik: „${must}”`);
  }
  return tpl;
}

export function buildSystemPrompt(templateText, addendum) {
  return `${checkTemplate(templateText)}\n\n${String(addendum).replace(/\r\n/g, '\n').trim()}\n`;
}

export function buildUserMessage({ head, base, specs, goal, stat, warnings = [] }) {
  const parts = [
    '# Megbízás — vak hibakereső ellenőrzés',
    `Ág / fej: ${head}`,
    `Base: ${base} (a vizsgált változás: git diff base...head — a git_diff eszköz ezt adja)`,
    '',
    '## Tulajdonosi cél és feladat-specifikus hibakereső pontok',
    goal.trim(),
  ];
  for (const s of specs) parts.push('', `## Követelmény (terv): ${s.path}`, s.text.trim());
  parts.push('', '## A változott fájlok (git diff --stat base...head)', stat.trim() || '(üres)');
  for (const w of warnings) parts.push('', `FIGYELMEZTETÉS a futtatótól: ${w}`);
  parts.push('', `Kezdd a munkát az eszközökkel. A jelentésben a „Fej:” sor értéke: ${head}`);
  return parts.join('\n');
}

/**
 * A leadott jelentés ellenőrzése: forma (ugyanazokkal a függvényekkel, mint a record-review.mjs) + a leletek GÉPI visszaellenőrzése
 * (findings.mjs). Csak akkor fogadható el, ha minden blokkoló / közepes lelet hivatkozása visszaellenőrizhető.
 */
export function validateReport(text, head, cfg, { findings, root, runLog = [] } = {}) {
  if (text.length > (cfg.reportMaxChars ?? 40_000)) return { ok: false, error: `a jelentés túl hosszú (legfeljebb ${cfg.reportMaxChars ?? 40_000} karakter)` };
  const problems = [];
  const verdict = reportVerdict(text);
  if (!verdict) problems.push('nincs „## Ítélet: IGEN | IGEN, FELTÉTELLEL | NEM” sor');
  const rh = reportHead(text);
  if (!rh) problems.push(`nincs „Fej: ${head}” sor`);
  else if (!head.startsWith(rh)) problems.push(`a „Fej:” sor (${rh}) nem a vizsgált fejre (${head}) szól`);
  const miss = missingSections(text);
  if (miss.length) problems.push(`hiányzó kötelező fejléc: ${miss.map((m) => `„## ${m}”`).join(', ')}`);
  const check = verifyFindings({ findings, root, runLog, reportText: text, verdict });
  problems.push(...check.errors);
  return problems.length ? { ok: false, error: problems.join('; ') } : { ok: true, check };
}

// ---- Prompt-gyorsítótár (docs/specs/2026-11-18-vak-ellenor-deepseek.md, C1–C5) ---------------------------------------------------

/**
 * A kérés üzenetei a gyorsítótár-töréspontokkal. A TÁROLT üzenetlista csak bővül (soha nem íródik át); a jelölő a kérés
 * összeállításakor, MÁSOLATON kerül rá: (1) a rögzített blokk végére (az első user-üzenet: terv, cél, diff-összesítő) és (2) a
 * beszélgetés növekvő végére (mozgó töréspont). `mode !== 'explicit'` (automatikus gyorsítótárú szolgáltató): jelölő nélkül.
 */
export function withCacheMarkers(messages, mode) {
  if (mode !== 'explicit') return messages;
  const marked = new Set([1, messages.length - 1]);
  return messages.map((m, i) => (marked.has(i) && typeof m.content === 'string' && m.content && m.role !== 'assistant'
    ? { ...m, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
    : m));
}

/** A futás gyorsítótár-mutatói: találati arány a 2. hívástól, és a becsült megtakarítás (a konfig áraival). */
export function cacheStats(state, cfg) {
  const later = state.callsDetail.slice(1);
  const prompt = later.reduce((n, c) => n + c.prompt, 0);
  const cached = later.reduce((n, c) => n + c.cached, 0);
  const p = cfg.fallbackPriceUsdPerMTok ?? {};
  const input = Number(p.input ?? 0);
  const saved = (state.cachedTokens * (input - Number(p.cacheRead ?? input)) - state.cacheWriteTokens * (Number(p.cacheWrite ?? input) - input)) / 1e6;
  return { hitRatioFromSecondCall: prompt > 0 ? cached / prompt : null, cachedTokens: state.cachedTokens, cacheWriteTokens: state.cacheWriteTokens, savedUsdEstimate: Number(saved.toFixed(6)) };
}

// ---- Futáskorlátok -----------------------------------------------------------------------------------------------------

/**
 * A következő hívás költségének FELSŐ becslése a hívás ELŐTTI plafon-ellenőrzéshez (a tényleges költség mindig a válasz `usage`
 * mezőjéből jön). 2 karakter / token (mérve: a Qwen-tokenizálón magyar szöveg + kód ~2,0). Explicit gyorsítótárnál a már elküldött
 * előtag kedvezményes (cacheRead) áron, az új rész írási (cacheWrite) áron számol — ha a gyorsítótár élettartama (TTL) lejárhatott,
 * az egész bemenet írási áron.
 */
export function estimateNextUsd({ pendingChars, lastPromptTokens, cacheWarm, cfg }) {
  const p = cfg.fallbackPriceUsdPerMTok ?? {};
  const input = Number(p.input ?? 0);
  const explicit = cfg.promptCache?.mode === 'explicit';
  const write = explicit ? Number(p.cacheWrite ?? input) : input;
  const read = cacheWarm ? Number(p.cacheRead ?? input) : write;
  const fresh = Math.ceil(pendingChars / 2);
  return (lastPromptTokens * read + fresh * write + Number(cfg.maxTokensPerCall ?? 16_000) * Number(p.output ?? 0)) / 1e6;
}

/**
 * A futás kerete. A `precheck` minden modellhívás ELŐTT fut (az újrapróba előtt is): megszakítás, falióra, körszám,
 * kimenet-plafon, és USD-plafon az eddigi tényleges költség + a következő hívás becsült felső határa alapján.
 */
export function createBudget({ maxUsd, maxRounds, maxWallMs, maxCompletionTokens, cfg = {}, now = () => Date.now(), stopRequested = () => null }) {
  const s = { spentUsd: 0, calls: 0, retries: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
    costSources: new Set(), startedAt: now(), lastPromptTokens: 0, lastCallUsd: 0, lastCallAt: null, callsDetail: [] };
  const ttlMs = (cfg.promptCache?.ttlSec ?? 300) * 1000;
  const soft = () => {
    const stop = stopRequested();
    if (stop) return `megszakítva (${stop})`;
    if (now() - s.startedAt >= maxWallMs) return `falióra-időkorlát (${Math.round(maxWallMs / 60_000)} perc)`;
    return null;
  };
  return {
    state: s,
    midcheck: soft,
    estimate(pendingChars) {
      const cacheWarm = s.lastCallAt !== null && now() - s.lastCallAt < ttlMs * 0.9;
      // Második védvonal: a becslés soha nem kisebb az előző hívás TÉNYLEGES költségének 1,25-szörösénél (ha a tokenbecslés alulbecsülne).
      return Math.max(estimateNextUsd({ pendingChars, lastPromptTokens: s.lastPromptTokens, cacheWarm, cfg }), s.lastCallUsd * 1.25);
    },
    precheck(estimateUsd) {
      const w = soft();
      if (w) return w;
      if (s.calls >= maxRounds) return `körszám-plafon (${maxRounds} modellhívás)`;
      if (s.completionTokens >= maxCompletionTokens) return `kimenet-plafon (${maxCompletionTokens} token)`;
      if (s.spentUsd + estimateUsd > maxUsd) return `USD-plafon (${maxUsd} USD; eddig ${s.spentUsd.toFixed(4)} USD, a következő hívás becslése ${estimateUsd.toFixed(4)} USD)`;
      return null;
    },
    begin() { s.calls += 1; },
    /** Sikeres válasz: a tényleges `usage` alapján (a gyorsítótár kedvezményével együtt); `usage` nélkül a becsléssel terhel. */
    charge(usage, estimateUsd) {
      const c = usageCost(usage, cfg.fallbackPriceUsdPerMTok);
      const usd = c ? c.usd : estimateUsd;
      const d = usage?.prompt_tokens_details ?? {};
      const detail = { prompt: Number(usage?.prompt_tokens) || 0, cached: Number(d.cached_tokens) || 0, cacheWrite: Number(d.cache_write_tokens) || 0, completion: Number(usage?.completion_tokens) || 0, usd: Number(usd.toFixed(6)) };
      s.costSources.add(c ? c.source : 'becslés (nincs usage)');
      s.spentUsd += usd;
      s.lastCallUsd = usd;
      s.promptTokens += detail.prompt;
      s.completionTokens += detail.completion;
      s.cachedTokens += detail.cached;
      s.cacheWriteTokens += detail.cacheWrite;
      s.reasoningTokens += Number(usage?.completion_tokens_details?.reasoning_tokens) || 0;
      s.lastPromptTokens = detail.prompt || s.lastPromptTokens;
      s.lastCallAt = now();
      s.callsDetail.push(detail);
    },
    /** Ismeretlen kimenetelű hívás (hálózati hiba / időtúllépés — lehet, hogy a szolgáltató feldolgozta): a becsléssel terhel. */
    chargeUnknown(estimateUsd) {
      s.spentUsd += estimateUsd;
      s.costSources.add('becslés (ismeretlen kimenetelű hívás)');
    },
    retry() { s.retries += 1; },
  };
}

// ---- Az ügynök-ciklus --------------------------------------------------------------------------------------------------

const chars = (m) => JSON.stringify(m).length;

/** Az újrapróba előtti várakozás: 2 s · 2^próba, legfeljebb 30 s. */
export const backoffMs = (attempt) => Math.min(30_000, 2000 * 2 ** attempt);

/**
 * Az ügynök-ciklus. Az üzenetlista CSAK BŐVÜL: rögzített rendszerüzenet → rögzített feladatblokk → eszközhívások és eredmények.
 * Korábbi üzenet soha nem íródik át, nem rendeződik újra és nem csonkolódik utólag (az előtag körről körre bájtra azonos — ez a
 * prompt-gyorsítótár feltétele); az előtagban nincs időbélyeg, véletlen azonosító vagy munkafa-útvonal.
 * @param {{ cfg: object, key: string, system: string, user: string, tools: { call: Function, counts: object }, box: { report: string|null },
 *           budget: ReturnType<typeof createBudget>, sessionId?: string, fetchImpl?: Function, log?: (e: object) => void, sleep?: (ms: number) => Promise<void> }} o
 * @returns {Promise<{ complete: boolean, stopReason: string|null, fatal: boolean, reportedModels: string[], generationIds: string[], notes: string[] }>}
 */
export async function runReview({ cfg, key, system, user, tools, box, budget, sessionId, fetchImpl = globalThis.fetch, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  const reportedModels = new Set();
  const generationIds = [];
  const notes = [];
  let pending = chars(messages) + JSON.stringify(TOOL_SCHEMAS).length;
  let nudges = 0;
  const done = (complete, stopReason, fatal = false) => ({ complete, stopReason, fatal, reportedModels: [...reportedModels], generationIds, notes });

  for (;;) {
    let json = null;
    for (let attempt = 0; ; attempt += 1) {
      const est = budget.estimate(pending);
      const stop = budget.precheck(est);
      if (stop) return done(false, stop);
      budget.begin();
      try {
        json = await callOpenRouter({
          fetchImpl, endpoint: cfg.endpoint, key, timeoutMs: (cfg.httpTimeoutSec ?? 180) * 1000,
          body: {
            ...(cfg.requestExtras ?? {}), model: cfg.model, messages: withCacheMarkers(messages, cfg.promptCache?.mode), tools: TOOL_SCHEMAS, tool_choice: 'auto',
            max_tokens: cfg.maxTokensPerCall, usage: { include: true }, ...(sessionId ? { session_id: sessionId } : {}),
          },
        });
        budget.charge(json.usage, est);
        break;
      } catch (e) {
        const msg = maskSecrets(String(e?.message ?? e), key);
        const retryable = e instanceof OpenRouterError && e.retryable;
        if (!(e instanceof OpenRouterError) || e.status === 0) budget.chargeUnknown(est);
        log({ type: 'error', attempt, message: msg });
        if (!retryable || attempt >= (cfg.maxRetries ?? 2)) return done(false, `OpenRouter-hiba: ${msg}`, true);
        budget.retry();
        // Átmeneti hálózati hiba (ENOTFOUND, időtúllépés, 429 / 5xx): korlátos, exponenciális várakozás (2, 4, 8 … s, legfeljebb 30 s);
        // minden újrapróba a körszám- és a USD-plafon ELŐTTI ellenőrzésen megy át. Ha nem jön helyre: NEM TELJES, ítélet nélkül.
        await sleep(backoffMs(attempt));
      }
    }
    pending = 0;
    if (json.model) reportedModels.add(String(json.model));
    if (json.id) generationIds.push(String(json.id));
    const msg = json.choices?.[0]?.message;
    if (!msg) return done(false, 'OpenRouter-hiba: a válaszban nincs üzenet', true);
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    const assistant = { role: 'assistant', content: msg.content ?? '' };
    if (calls.length) assistant.tool_calls = calls;
    if (msg.reasoning_details) assistant.reasoning_details = msg.reasoning_details;
    messages.push(assistant);
    pending += chars(assistant);
    if (typeof msg.content === 'string' && msg.content.trim()) notes.push(msg.content.trim());
    log({ type: 'assistant', content: msg.content ?? '', tools: calls.map((c) => c.function?.name), usage: json.usage, spentUsd: budget.state.spentUsd });

    if (!calls.length) {
      nudges += 1;
      if (nudges > 2) return done(false, 'a modell nem adott le jelentést (eszközhívás nélkül válaszolt)');
      // Mért eset (2026-11-18): a modell a teljes kimeneti keretet gondolkodásra költötte, és üres válasszal állt meg (finish_reason: length).
      const truncated = json.choices?.[0]?.finish_reason === 'length';
      const nudge = { role: 'user', content: truncated
        ? 'A válaszod elérte a kimeneti korlátot, mielőtt eszközt hívtál volna. Gondolkodj RÖVIDEBBEN, és azonnal hívj eszközt; a jelentést tömören, a submit_report eszközzel add le (a leleteket a findings tömbben).'
        : 'Nem hívtál eszközt. Folytasd a vizsgálatot az eszközökkel, és a KÉSZ jelentést a submit_report eszközzel add le (szöveges válasz nem számít jelentésnek).' };
      messages.push(nudge);
      pending += chars(nudge);
      continue;
    }
    for (const c of calls) {
      const name = c.function?.name;
      let result;
      const stop = budget.midcheck();
      if (stop) result = `MEGSZAKÍTVA: ${stop}`;
      else {
        let args;
        try { args = JSON.parse(c.function?.arguments || '{}'); } catch { args = null; }
        result = args === null ? 'HIBA: az eszköz argumentuma nem érvényes JSON' : await tools.call(name, args);
      }
      const toolMsg = { role: 'tool', tool_call_id: c.id, content: String(result) || '(üres)' };
      messages.push(toolMsg);
      pending += chars(toolMsg);
      log({ type: 'tool', name, args: c.function?.arguments, result: String(result).slice(0, 4000) });
    }
    if (box.report !== null) return done(true, null);
  }
}

// ---- Eldobható munkafa ---------------------------------------------------------------------------------------------------

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: cleanEnv(process.env), maxBuffer: 64 * 1024 * 1024 });

/** A csatolás (junction / symlink) bontása ÚGY, hogy a cél tartalma megmarad. `false`, ha a link nem tűnt el. */
export function unlinkJunction(link) {
  let st;
  try { st = lstatSync(link); } catch { return true; } // nincs ilyen: nincs mit bontani
  if (!st.isSymbolicLink()) return false; // valódi mappa: NEM töröljük
  try { unlinkSync(link); } catch { try { rmdirSync(link); } catch { /* lent ellenőrizzük */ } }
  try { lstatSync(link); return false; } catch { return true; }
}

/**
 * Eldobható munkafa a fejről + a `.blind-review-tmp/` mappa + (ha van honnan) a `source/node_modules` csatolása.
 * @returns {{ dir: string, root: string, nodeModulesReal: string|null, link: string|null }}
 */
export function prepareWorktree({ repo, head, nodeModulesSrc = null, parent = tmpdir() }) {
  const dir = mkdtempSync(join(parent, 'websuli-blind-'));
  const wt = join(dir, 'wt');
  const add = git(repo, ['worktree', 'add', '--detach', wt, head]);
  if (add.status !== 0) { rmSync(dir, { recursive: true, force: true }); throw new Error(`a munkafa nem készíthető el: ${String(add.stderr).trim().split('\n').pop()}`); }
  const root = realpathSync.native(wt);
  mkdirSync(join(root, TMP_DIR), { recursive: true });
  let nodeModulesReal = null;
  let link = null;
  if (nodeModulesSrc && existsSync(nodeModulesSrc) && existsSync(join(root, 'source'))) {
    nodeModulesReal = realpathSync.native(nodeModulesSrc);
    link = join(root, 'source', 'node_modules');
    symlinkSync(nodeModulesReal, link, 'junction');
  }
  return { dir, root, nodeModulesReal, link };
}

/** Takarítás: ELŐSZÖR a csatolás bontása; ha az nem sikerül, a munkafát NEM töröljük (különben a cél tartalma veszne el). */
export function cleanupWorktree({ repo, wt }) {
  if (wt.link && !unlinkJunction(wt.link)) {
    return { ok: false, error: `a node_modules csatolás nem bontható (${wt.link}) — a munkafa megmaradt; kézzel bontsd a csatolást, aztán: git worktree remove --force` };
  }
  git(repo, ['worktree', 'remove', '--force', join(wt.dir, 'wt')]);
  try { rmSync(wt.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { /* zárolt fájl: a prune és a következő futás jelzi */ }
  git(repo, ['worktree', 'prune']);
  return { ok: !existsSync(wt.dir), error: existsSync(wt.dir) ? `az ideiglenes mappa nem törölhető: ${wt.dir}` : null };
}

// ---- Jelentés és bizonyíték ------------------------------------------------------------------------------------------------

export function incompleteReport({ head, stopReason, notes }) {
  const safe = notes.slice(-3).map((n) => n.replace(/(Ítélet|Fej)\s*:/gi, '$1 –').slice(0, 4000));
  return [
    '# Független review — NEM TELJES',
    '',
    `NEM TELJES — ${stopReason}.`,
    '',
    `Ez NEM érvényes ítélet (vizsgált fej – ${head}). A vak ellenőr futása megállt, mielőtt jelentést adott volna le; a kapu nem enged át.`,
    'Teendő: a websuli-vak-ellenor skill „Ha a futtató megáll” szakasza (nagyobb keret új futással, vagy tulajdonosi döntés).',
    '',
    '## Az ellenőr utolsó szöveges jegyzetei (részleges, nem ítélet)',
    safe.length ? safe.join('\n\n---\n\n') : '(nincs)',
    '',
  ].join('\n');
}

/** A NEM TELJES jelentés gépi lábléce (teljes jelentésnél a findings.mjs összegzése kerül a végére). */
export function runFooter({ model, state, cache }) {
  return `\n---\n_Gépi lábléc (blind-review futtató): modell ${model}; ${state.calls} modellhívás (${state.retries} újrapróba); `
    + `tokenek: ${state.promptTokens} be (gyorsítótárból ${state.cachedTokens}) / ${state.completionTokens} ki; `
    + `gyorsítótár-találat a 2. hívástól: ${cache.hitRatioFromSecondCall == null ? '—' : `${(cache.hitRatioFromSecondCall * 100).toFixed(1)}%`}; költség: ${state.spentUsd.toFixed(4)} USD._\n`;
}

export function buildEvidence({ args, cfg, baseSha, result, state, counts, reportText, verdict, startedAt, endedAt, reportPath, cache, findings = null }) {
  return {
    kind: EVIDENCE_KIND,
    head: args.head,
    base: baseSha,
    modelRequested: cfg.model,
    modelReported: result.reportedModels,
    generationIds: result.generationIds,
    complete: result.complete,
    stopReason: result.stopReason,
    verdict: result.complete ? verdict : null,
    report: reportPath,
    reportSha256: sha256(reportText),
    findings: findings ? { counts: findings.counts, items: findings.items.map((i) => ({ id: i.id, severity: i.severity, file: i.file, line: i.line, refOk: i.refOk, runOk: i.runOk })) } : null,
    calls: state.calls,
    retries: state.retries,
    tokens: { prompt: state.promptTokens, completion: state.completionTokens, cached: state.cachedTokens, cacheWrite: state.cacheWriteTokens, reasoning: state.reasoningTokens },
    cache,
    callsDetail: state.callsDetail,
    costUsd: Number(state.spentUsd.toFixed(6)),
    costSource: [...state.costSources],
    toolCalls: { ...counts },
    limits: { maxUsd: args.maxUsd, maxRounds: args.maxRounds, maxMinutes: args.maxMinutes },
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
  };
}

// ---- Belépő ----------------------------------------------------------------------------------------------------------------

const say = (s) => process.stdout.write(`[blind-review] ${s}\n`);

async function main() {
  const cfg = loadConfig().blindReview;
  if (!cfg?.model) { process.stderr.write('[blind-review] HIBA: a gates.config.json-ban nincs blindReview.model\n'); return 1; }
  let args;
  try { args = parseArgs(process.argv.slice(2), cfg); } catch (e) { process.stderr.write(`[blind-review] HIBA: ${e.message}\n`); return 1; }

  const repo = RUNNER_ROOT;
  const rev = (r) => { const x = git(repo, ['rev-parse', '--verify', '--quiet', `${r}^{commit}`]); return x.status === 0 ? x.stdout.trim() : null; };
  const head = rev(args.head);
  if (!head || head !== args.head) { process.stderr.write(`[blind-review] HIBA: a --head nem létező commit ebben a tárban: ${args.head}\n`); return 1; }
  const baseSha = rev(args.base);
  if (!baseSha) { process.stderr.write(`[blind-review] HIBA: a --base nem oldható fel: ${args.base}\n`); return 1; }
  const out = resolve(args.out);
  const relOut = relative(repo, out);
  if (!relOut.startsWith('..') && !isAbsolute(relOut)) { process.stderr.write('[blind-review] HIBA: a --out a repón KÍVÜL legyen (scratchpad) — a jelentés nem kerülhet a nyilvános repóba\n'); return 1; }
  if (!existsSync(args.goal)) { process.stderr.write(`[blind-review] HIBA: a --goal fájl nem olvasható: ${args.goal}\n`); return 1; }
  const goal = readFileSync(args.goal, 'utf8');
  const specs = [];
  for (const p of args.specs) {
    const shown = git(repo, ['show', `${head}:${p.replace(/\\/g, '/')}`]);
    if (shown.status === 0) specs.push({ path: p, text: shown.stdout });
    else if (existsSync(p)) specs.push({ path: p, text: readFileSync(p, 'utf8') });
    else { process.stderr.write(`[blind-review] HIBA: a terv nincs meg sem a fejen, sem helyi fájlként: ${p}\n`); return 1; }
  }
  const system = buildSystemPrompt(readFileSync(TEMPLATE_PATH, 'utf8'), readFileSync(join(HERE, 'futtato-kiegeszites.md'), 'utf8'));

  const common = git(repo, ['rev-parse', '--git-common-dir']).stdout.trim();
  const commonDir = isAbsolute(common) ? common : resolve(repo, common);
  const evDir = evidenceDir(commonDir);
  const loaded = loadApiKey({ localConfigPath: join(commonDir, LOCAL_CONFIG_NAME) });
  if (!loaded.key && !args.dryRun) { process.stderr.write(`[blind-review] MEGÁLLT: ${loaded.error}\n[blind-review] ${NOT_RUN}.\n`); return 2; }
  const key = loaded.key ?? '';

  const stale = git(repo, ['worktree', 'list', '--porcelain']).stdout.split('\n').filter((l) => l.startsWith('worktree ') && l.includes('websuli-blind-'));
  if (stale.length) say(`figyelem: ${stale.length} korábbi (megszakadt?) vak-ellenőr munkafa maradt — nézd meg: git worktree list`);

  const nmSrc = args.nodeModules ?? join(repo, 'source', 'node_modules');
  const warnings = [];
  say(`modell: ${cfg.model}; fej: ${head.slice(0, 12)}; base: ${baseSha.slice(0, 12)}; keret: ${args.maxUsd} USD, ${args.maxRounds} kör, ${args.maxMinutes} perc; kulcs: ${loaded.key ? loaded.source : '— (dry-run)'}`);
  const wt = prepareWorktree({ repo, head, nodeModulesSrc: existsSync(nmSrc) ? nmSrc : null });
  let stopSignal = null;
  const onSig = () => { stopSignal = 'SIGINT'; };
  process.on('SIGINT', onSig);
  const startedAt = Date.now();
  let code = 1;
  try {
    if (!wt.link) warnings.push('a munkafában nincs telepített node_modules — a tsx / tsc parancsok nem futnak; ezt a „Mit NEM vizsgáltam” szakaszban jelezd.');
    else {
      const lockHead = git(repo, ['rev-parse', '--verify', '--quiet', `${head}:source/package-lock.json`]).stdout.trim();
      const lockSrc = join(dirname(nmSrc), 'package-lock.json');
      const lockLocal = existsSync(lockSrc) ? git(repo, ['hash-object', lockSrc]).stdout.trim() : '';
      if (lockHead && lockLocal && lockHead !== lockLocal) warnings.push('a csatolt node_modules más package-lock.json-ból települt, mint a vizsgált fejé — függőség-eltérés miatti tesztbukást ne jelents kódhibaként ellenőrzés nélkül.');
    }
    const stat = git(wt.root, ['diff', '--stat', `${baseSha}...${head}`]).stdout;
    const user = buildUserMessage({ head, base: baseSha, specs, goal, stat, warnings });
    if (args.dryRun) {
      say(`dry-run: rendszerüzenet ${system.length} karakter, megbízás ${user.length} karakter, ${TOOL_SCHEMAS.length} eszköz; modellhívás nem történt.`);
      return 0;
    }
    mkdirSync(dirname(out), { recursive: true });
    const transcript = `${out}.atirat.jsonl`;
    writeFileSync(transcript, '');
    const box = { report: null, check: null };
    const tools = makeTools({
      root: wt.root, base: baseSha, head, cfg, key, nodeModulesReal: wt.nodeModulesReal,
      onReport: (t, findings, runLog) => { const v = validateReport(t, head, cfg, { findings, root: wt.root, runLog }); if (v.ok) { box.report = t; box.check = v.check; } return v; },
    });
    const stopFile = join(evDir, 'blind-review.stop');
    const budget = createBudget({
      maxUsd: args.maxUsd, maxRounds: args.maxRounds, maxWallMs: args.maxMinutes * 60_000, maxCompletionTokens: cfg.maxCompletionTokensTotal, cfg,
      stopRequested: () => stopSignal ?? (existsSync(stopFile) ? 'megszakító fájl: blind-review.stop' : null),
    });
    const log = (e) => {
      appendFileSync(transcript, `${maskSecrets(JSON.stringify({ t: new Date().toISOString(), ...e }), key)}\n`);
      if (e.type === 'assistant') say(`kör ${budget.state.calls}: ${e.tools.length ? e.tools.join(', ') : '(szöveg)'} — eddig ${budget.state.spentUsd.toFixed(4)} USD`);
      if (e.type === 'error') say(`hiba (próba ${e.attempt + 1}): ${e.message}`);
    };
    const result = await runReview({ cfg, key, system, user, tools, box, budget, log, sessionId: `blind-review-${head}` });
    const endedAt = Date.now();
    const body = result.complete ? box.report.replace(/\r\n/g, '\n').trimEnd() : incompleteReport({ head, stopReason: result.stopReason, notes: result.notes });
    const cache = cacheStats(budget.state, cfg);
    const model = result.reportedModels.join(', ') || cfg.model;
    const tail = result.complete
      ? summaryMarkdown({ items: box.check.items, counts: box.check.counts, cache, state: budget.state, model })
      : runFooter({ model, state: budget.state, cache });
    const text = maskSecrets(`${body}\n${tail}`, key);
    writeFileSync(out, text);
    const verdict = result.complete ? reportVerdict(text) : null;
    const ev = buildEvidence({ args, cfg, baseSha, result, state: budget.state, counts: tools.counts, reportText: text, verdict, startedAt, endedAt, reportPath: out, cache, findings: box.check });
    const evPath = writeEvidence(evDir, result.complete ? evidenceName(head) : `blind-review-incomplete-${head}`, ev);
    say(`jelentés: ${out}`);
    say(`bizonyíték: ${evPath}`);
    say(`modell (a válasz szerint): ${result.reportedModels.join(', ') || '—'}; ${budget.state.calls} hívás; költség ${budget.state.spentUsd.toFixed(4)} USD; gyorsítótár-találat a 2. hívástól: ${cache.hitRatioFromSecondCall == null ? '—' : `${(cache.hitRatioFromSecondCall * 100).toFixed(1)}%`}; idő ${((endedAt - startedAt) / 60_000).toFixed(1)} perc`);
    if (result.complete) say(`leletek: ${Object.entries(box.check.counts).map(([k, v]) => `${k} ${v.total} (igazolt hivatkozás ${v.refVerified}, futtatással ${v.runVerified}, érvénytelen ${v.invalid})`).join('; ')}`);
    if (result.complete) {
      say(`ÍTÉLET: ${verdict}`);
      say(`rögzítés: node scripts/qa/gates/record-review.mjs --head ${head} --verdict "${verdict}" --report "${out}"`);
      code = 0;
    } else {
      process.stderr.write(`[blind-review] MEGÁLLT — NEM TELJES: ${result.stopReason}\n[blind-review] ${NOT_RUN}.\n`);
      code = result.fatal ? 2 : 3;
    }
  } finally {
    process.off('SIGINT', onSig);
    const c = cleanupWorktree({ repo, wt });
    if (!c.ok) process.stderr.write(`[blind-review] FIGYELEM: ${c.error}\n`);
  }
  return code;
}

if (isMain(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { process.stderr.write(`[blind-review] HIBA: ${maskSecrets(String(e?.message ?? e))}\n[blind-review] ${NOT_RUN}.\n`); process.exit(2); });
}

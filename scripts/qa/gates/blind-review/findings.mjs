// A vak ellenőr leleteinek GÉPI visszaellenőrzése (docs/specs/2026-11-18-vak-ellenor-deepseek.md, M3).
// Cél: az orkesztrátornak ne kelljen a jelentést sorról sorra ellenőriznie. Minden lelet fájl:sor hivatkozását a futtató a
// munkafában ellenőrzi (létezik-e a fájl, a sor, és az idézett kódrészlet valóban ott van-e); a futtatással igazolt lelet parancsát
// és kimenet-részletét a futtató a SAJÁT eszközhívás-naplójából ellenőrzi (az ellenőr nem hivatkozhat el nem végzett futásra).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { FULL_PATH_KINDS, resolveInside } from './tools.mjs';
import { SUMMARY_FINDINGS_HEADING } from './completeness.mjs';

export const SEVERITIES = ['blokkoló', 'közepes', 'kicsi'];
const MUST_VERIFY = new Set(['blokkoló', 'közepes']);
const MIN_QUOTE = 8;
const WINDOW = 3;
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function normalizeSeverity(s) {
  const v = norm(s).toLowerCase();
  if (v === 'blokkoló' || v === 'blokkolo') return 'blokkoló';
  if (v === 'közepes' || v === 'kozepes') return 'közepes';
  if (v === 'kicsi') return 'kicsi';
  return null;
}

function checkRef(root, f) {
  if (typeof f.file !== 'string' || !f.file) return 'hiányzó fájl';
  const r = resolveInside(root, f.file);
  if (!r.ok) return r.error;
  if (!existsSync(r.abs) || !statSync(r.abs).isFile()) return `nincs ilyen fájl a munkafában: ${f.file}`;
  const lines = readFileSync(r.abs, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const line = Number(f.line);
  if (!Number.isInteger(line) || line < 1 || line > lines.length) return `nincs ilyen sor: ${f.file}:${f.line} (a fájl ${lines.length} soros)`;
  const quote = norm(f.quote);
  if (quote.length < MIN_QUOTE) return `az idézet (quote) legalább ${MIN_QUOTE} karakter legyen, szó szerint a hivatkozott sorból`;
  const span = String(f.quote).split('\n').length;
  const near = norm(lines.slice(Math.max(0, line - 1 - WINDOW), line + WINDOW + span).join(' '));
  if (!near.includes(quote)) return `az idézet nincs a ${f.file}:${line} sor ±${WINDOW} soros környezetében (olvasd újra a fájlt, és pontos sort / szó szerinti idézetet adj)`;
  return null;
}

/**
 * A futtatási bizonyíték ellenőrzése a futtató SAJÁT parancsnaplójából (E4): a parancs lefutott, a kimenet-részlet és a bemenet
 * szó szerint ott van; a próba fajtája dönti el, lehet-e „teljes úton igazolt” (csak böngészős / adatbázisos futás), egyébként
 * legfeljebb „részben igazolt” (elszigetelt próba).
 * @returns {{ error: string } | { full: boolean, kind: string }}
 */
function checkRun(runLog, run) {
  if (!run || !Array.isArray(run.argv)) return { error: 'a run.argv a ténylegesen futtatott parancs argv tömbje legyen' };
  const key = JSON.stringify(run.argv);
  const hits = runLog.filter((e) => JSON.stringify(e.argv) === key);
  if (!hits.length) return { error: `ilyen parancsot nem futtattál ebben a munkamenetben: ${key.slice(0, 160)}` };
  const ex = norm(run.output_excerpt);
  if (ex.length < MIN_QUOTE) return { error: `a run.output_excerpt legalább ${MIN_QUOTE} karakter legyen, szó szerint a parancs kimenetéből` };
  const withOut = hits.filter((e) => norm(e.output).includes(ex));
  if (!withOut.length) return { error: 'a run.output_excerpt nem szerepel a parancs naplózott kimenetében (szó szerint idézz)' };
  const input = norm(run.input);
  if (input.length < MIN_QUOTE) return { error: `a run.input (a próba bemenete) legalább ${MIN_QUOTE} karakter legyen, szó szerint a futtatott fájlból / forgatókönyvből vagy a kimenetből` };
  const withIn = withOut.filter((e) => norm(e.sources).includes(input) || norm(e.output).includes(input));
  if (!withIn.length) return { error: 'a run.input nem szerepel a futtatott fájlban / forgatókönyvben (a futás pillanatában) és a kimenetben sem' };
  if (run.scope !== 'teljes_ut' && run.scope !== 'elszigetelt') return { error: 'a run.scope: teljes_ut | elszigetelt' };
  const kind = withIn[withIn.length - 1].kind ?? 'unknown';
  return { full: run.scope === 'teljes_ut' && FULL_PATH_KINDS.has(kind), kind };
}

/**
 * @param {{ findings: unknown, root: string, runLog: { argv: string[], output: string }[], reportText: string, verdict: string|null }} o
 * @returns {{ ok: boolean, errors: string[], items: object[], counts: object }}
 */
export function verifyFindings({ findings, root, runLog, reportText, verdict }) {
  const errors = [];
  const items = [];
  if (!Array.isArray(findings)) return { ok: false, errors: ['a findings tömb kötelező (ha nincs lelet: üres tömb)'], items, counts: countFindings(items) };
  if (findings.length > 60) errors.push('legfeljebb 60 lelet adható le');
  const seen = new Set();
  for (const [i, f] of findings.slice(0, 60).entries()) {
    const id = norm(f?.id);
    const severity = normalizeSeverity(f?.severity);
    const where = id || `#${i + 1}`;
    if (!/^[A-Za-z][A-Za-z0-9-]{0,11}$/.test(id)) { errors.push(`${where}: az id rövid azonosító legyen (pl. L1)`); continue; }
    if (seen.has(id)) { errors.push(`${id}: ismétlődő azonosító`); continue; }
    seen.add(id);
    if (!severity) { errors.push(`${id}: a severity csak ${SEVERITIES.join(' | ')} lehet`); continue; }
    if (!norm(f.title)) errors.push(`${id}: hiányzó title`);
    const refWhy = checkRef(root, f);
    const runGiven = f.run != null;
    const rc = runGiven ? checkRun(runLog, f.run) : null;
    const runWhy = rc?.error ?? null;
    const runOk = runGiven && !runWhy;
    items.push({ id, severity, title: norm(f.title).slice(0, 200), file: String(f.file ?? ''), line: Number(f.line) || null, refOk: !refWhy, refWhy, runGiven, runOk,
      scenario: norm(f.scenario).slice(0, 1200), fix: norm(f.fix).slice(0, 1200),
      runFull: runOk && rc.full, runPartial: runOk && !rc.full, runKind: runOk ? rc.kind : null, runWhy });
    if (refWhy && MUST_VERIFY.has(severity)) errors.push(`${id} (${severity}): a hivatkozás nem ellenőrizhető — ${refWhy}`);
    if (runWhy) errors.push(`${id}: a futtatási bizonyíték nem ellenőrizhető — ${runWhy}`);
    if (!new RegExp(`(^|[^A-Za-z0-9-])${id}([^A-Za-z0-9-]|$)`).test(reportText)) errors.push(`${id}: a jelentés szövege nem tartalmazza ezt a lelet-azonosítót (a „Leletek” szakaszban minden leletet az azonosítójával írj le)`);
  }
  const counts = countFindings(items);
  if (verdict) {
    if (counts['blokkoló'].total > 0 && verdict !== 'NEM') errors.push(`blokkoló lelet mellett az ítélet csak NEM lehet (most: ${verdict})`);
    if (verdict === 'NEM' && counts['blokkoló'].total === 0) errors.push('NEM ítélethez legalább egy blokkoló lelet kell (vagy módosítsd az ítéletet)');
    if (verdict === 'IGEN' && counts['közepes'].total > 0) errors.push('közepes lelet mellett az ítélet „IGEN, FELTÉTELLEL” (vagy NEM), nem sima IGEN');
  }
  return { ok: errors.length === 0, errors, items, counts };
}

export function countFindings(items) {
  const c = {};
  for (const s of SEVERITIES) {
    const of = items.filter((i) => i.severity === s);
    c[s] = { total: of.length, refVerified: of.filter((i) => i.refOk).length, runVerified: of.filter((i) => i.runOk).length, runFull: of.filter((i) => i.runFull).length,
      runPartial: of.filter((i) => i.runPartial).length, invalid: of.filter((i) => !i.refOk).length };
  }
  return c;
}

/** A jelentés végére fűzött gépi összegzés (a futtató írja, nem az ellenőr). Nem tartalmaz ítélet- / fej-sort. */
export function summaryMarkdown({ items, counts, cache, state, model }) {
  const rows = SEVERITIES.map((s) => `| ${s} | ${counts[s].total} | ${counts[s].refVerified} | ${counts[s].runFull} | ${counts[s].runPartial} | ${counts[s].invalid} |`);
  const how = (i) => (i.runFull ? '; futtatással igazolt (teljes út)' : i.runPartial ? `; RÉSZBEN igazolt (elszigetelt próba: ${i.runKind})` : '');
  const list = items.filter((i) => i.severity !== 'kicsi').map((i) => `- **${i.id}** (${i.severity}) ${i.title} — \`${i.file}:${i.line}\` — hivatkozás igazolt${how(i)}`);
  // a forgatókönyv és a javítás a rögzített jelentésben is olvasható (vak ellenőr L2) — a rögzítő ehhez veti a „Leletek” szakaszt
  const detail = items.map((i) => `- **${i.id}** (${i.severity}) ${i.title} — forgatókönyv: ${i.scenario || '—'} — javítás: ${i.fix || '—'}`);
  const invalid = items.filter((i) => !i.refOk).map((i) => `- **${i.id}** (${i.severity}) ${i.title} — NEM visszaellenőrizhető: ${i.refWhy}`);
  return [
    '',
    '---',
    '## Gépi összegzés (a futtató írta, nem az ellenőr)',
    '',
    'A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a',
    'futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy',
    'adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi',
    'kódra mutat és a futás megtörtént — a következtetés helyességét nem.',
    '',
    '| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '### Blokkoló és közepes leletek (mind igazolt hivatkozással)',
    list.length ? list.join('\n') : '(nincs)',
    '',
    SUMMARY_FINDINGS_HEADING,
    detail.length ? detail.join('\n') : '(nincs)',
    '',
    '### Érvénytelen leletek',
    invalid.length ? invalid.join('\n') : '(nincs)',
    '',
    '### Futás',
    `- modell (a válasz szerint): ${model}; szolgáltató (a válasz szerint): ${[...(state.providers ?? [])].join(', ') || '—'}; modellhívás: ${state.calls} (újrapróba: ${state.retries})`,
    `- gondolkodó (reasoning) tokenek összesen: ${state.reasoningTokens ?? 0}`,
    `- tokenek: ${state.promptTokens} bemeneti (ebből gyorsítótárból: ${state.cachedTokens}, gyorsítótárba írva: ${state.cacheWriteTokens}), ${state.completionTokens} kimeneti`,
    `- gyorsítótár-találati arány a 2. hívástól: ${cache.hitRatioFromSecondCall == null ? '—' : `${(cache.hitRatioFromSecondCall * 100).toFixed(1)}%`}; becsült megtakarítás: ${cache.savedUsdEstimate.toFixed(4)} USD`,
    `- költség (a tényleges usage alapján): ${state.spentUsd.toFixed(4)} USD`,
    `- gépi zár-várakozás összesen: ${((state.lockWaitMs ?? 0) / 60_000).toFixed(1)} perc (a falióra-keretbe nem számít)`,
    '',
  ].join('\n');
}

// A vak ellenőr leleteinek GÉPI visszaellenőrzése (docs/specs/2026-11-18-vak-ellenor-deepseek.md, M3).
// Cél: az orkesztrátornak ne kelljen a jelentést sorról sorra ellenőriznie. Minden lelet fájl:sor hivatkozását a futtató a
// munkafában ellenőrzi (létezik-e a fájl, a sor, és az idézett kódrészlet valóban ott van-e); a futtatással igazolt lelet parancsát
// és kimenet-részletét a futtató a SAJÁT eszközhívás-naplójából ellenőrzi (az ellenőr nem hivatkozhat el nem végzett futásra).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolveInside } from './tools.mjs';

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

function checkRun(runLog, run) {
  if (!run || !Array.isArray(run.argv)) return 'a run.argv a ténylegesen futtatott parancs argv tömbje legyen';
  const key = JSON.stringify(run.argv);
  const hits = runLog.filter((e) => JSON.stringify(e.argv) === key);
  if (!hits.length) return `ilyen parancsot nem futtattál ebben a munkamenetben: ${key.slice(0, 160)}`;
  const ex = norm(run.output_excerpt);
  if (ex.length < MIN_QUOTE) return `a run.output_excerpt legalább ${MIN_QUOTE} karakter legyen, szó szerint a parancs kimenetéből`;
  if (!hits.some((e) => norm(e.output).includes(ex))) return 'a run.output_excerpt nem szerepel a parancs naplózott kimenetében (szó szerint idézz)';
  return null;
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
    const runWhy = runGiven ? checkRun(runLog, f.run) : null;
    items.push({ id, severity, title: norm(f.title).slice(0, 200), file: String(f.file ?? ''), line: Number(f.line) || null, refOk: !refWhy, refWhy, runGiven, runOk: runGiven && !runWhy, runWhy });
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
    c[s] = { total: of.length, refVerified: of.filter((i) => i.refOk).length, runVerified: of.filter((i) => i.runOk).length, invalid: of.filter((i) => !i.refOk).length };
  }
  return c;
}

/** A jelentés végére fűzött gépi összegzés (a futtató írja, nem az ellenőr). Nem tartalmaz ítélet- / fej-sort. */
export function summaryMarkdown({ items, counts, cache, state, model }) {
  const rows = SEVERITIES.map((s) => `| ${s} | ${counts[s].total} | ${counts[s].refVerified} | ${counts[s].runVerified} | ${counts[s].invalid} |`);
  const list = items.filter((i) => i.severity !== 'kicsi').map((i) => `- **${i.id}** (${i.severity}) ${i.title} — \`${i.file}:${i.line}\` — hivatkozás igazolt${i.runOk ? '; futtatással igazolt' : ''}`);
  const invalid = items.filter((i) => !i.refOk).map((i) => `- **${i.id}** (${i.severity}) ${i.title} — NEM visszaellenőrizhető: ${i.refWhy}`);
  return [
    '',
    '---',
    '## Gépi összegzés (a futtató írta, nem az ellenőr)',
    '',
    'A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a',
    'futtató saját parancsnaplójával egyezik. Ez azt igazolja, hogy a lelet valódi kódra mutat és a futás megtörtént — a következtetés',
    'helyességét nem.',
    '',
    '| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt | Érvénytelen (nem visszaellenőrizhető) |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '### Blokkoló és közepes leletek (mind igazolt hivatkozással)',
    list.length ? list.join('\n') : '(nincs)',
    '',
    '### Érvénytelen leletek',
    invalid.length ? invalid.join('\n') : '(nincs)',
    '',
    '### Futás',
    `- modell (a válasz szerint): ${model}; modellhívás: ${state.calls} (újrapróba: ${state.retries})`,
    `- tokenek: ${state.promptTokens} bemeneti (ebből gyorsítótárból: ${state.cachedTokens}, gyorsítótárba írva: ${state.cacheWriteTokens}), ${state.completionTokens} kimeneti`,
    `- gyorsítótár-találati arány a 2. hívástól: ${cache.hitRatioFromSecondCall == null ? '—' : `${(cache.hitRatioFromSecondCall * 100).toFixed(1)}%`}; becsült megtakarítás: ${cache.savedUsdEstimate.toFixed(4)} USD`,
    `- költség (a tényleges usage alapján): ${state.spentUsd.toFixed(4)} USD`,
    '',
  ].join('\n');
}

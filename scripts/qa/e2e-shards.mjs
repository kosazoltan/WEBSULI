#!/usr/bin/env node
// A CI „Playwright E2E” körének szeletelése (docs/specs/2026-11-18-ci-e2e-szeleteles.md).
//
//   plan  : a teljes tesztlistát (`playwright test --list --reporter=json`) súlyozva N szeletre osztja, és a kért szelet
//           tesztjeit a Playwright `--test-list` formátumában írja ki. Tiszta függvény: ugyanarra a listára, súlyfájlra és N-re
//           minden gépen ugyanazt adja — a szelet-jobok egymástól függetlenül számolják ki.
//   check : számláló-ellenőr. A szeletek JSON-jelentéseiből (`--reporter=json`) igazolja, hogy a lista MINDEN tesztje pontosan egy
//           szeletben, ténylegesen lefutott (van eredménye), és a szeletek összege = a lista teljes száma. Eltérésnél kilépési kód 1.
//
// Függőség nélküli Node ESM. Használat:
//   node scripts/qa/e2e-shards.mjs plan  --list <lista.json> --weights <sulyok.json> --total <N> --part <k> --out <szelet.txt>
//   node scripts/qa/e2e-shards.mjs check --list <lista.json> --reports <mappa> --total <N> [--weights-out <mert-sulyok.json>]

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A Playwright `--test-list` sorának elválasztója (`loadTestList`: a sort a `›` mentén bontja, a darabokat levágja). */
export const SEP = ' › ';
export const reportName = (part) => `e2e-report-${part}.json`;

/**
 * A JSON-riporter kimenete → lapos tesztlista, a lista sorrendjében. A gyökér-szvit a fájl (a címe nem része a címútnak), a
 * beágyazott szvitek a `describe`-ok; a névtelen `describe` nem része a címútnak (a Playwright `titlePath()` szabálya).
 */
export function flattenTests(json) {
  const out = [];
  const walk = (suite, titles, root) => {
    const path = root || !suite.title ? titles : [...titles, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const project = t.projectName ?? '';
        const full = [...path, spec.title];
        out.push({
          id: `${spec.id}::${project}`,
          project,
          file: spec.file,
          titles: full,
          key: [`[${project}]`, spec.file, ...full].join(SEP),
          status: t.status,
          results: (t.results ?? []).length,
          durationMs: (t.results ?? []).reduce((n, r) => n + (r.duration ?? 0), 0),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, path, false);
  };
  for (const suite of json.suites ?? []) walk(suite, [], true);
  return out;
}

/** A `--test-list` nem tud kifejezni `›`-t tartalmazó, üres vagy szóközzel kezdődő / végződő címet: ezeket előre megnevezzük. */
export function inexpressible(tests) {
  return tests.filter((t) => t.titles.some((p) => p === '' || p !== p.trim() || p.includes('›')) || t.file.includes('›')).map((t) => t.key);
}

export function validateWeights(w) {
  const bad = (msg) => { throw new Error(`Hibás súlyfájl: ${msg}`); };
  if (!w || typeof w !== 'object') bad('nem objektum');
  if (!(Number.isFinite(w.defaultSecPerTest) && w.defaultSecPerTest > 0)) bad('defaultSecPerTest > 0 kell');
  for (const [f, v] of Object.entries(w.files ?? {})) if (!(Number.isFinite(v) && v > 0)) bad(`files["${f}"] > 0 kell`);
  if (w.splittable !== undefined && !(Array.isArray(w.splittable) && w.splittable.every((f) => typeof f === 'string'))) bad('splittable: fájlnevek tömbje');
  return w;
}

const weightOf = (test, w) => w.files?.[test.file] ?? w.defaultSecPerTest;

/**
 * Súlyozott felosztás. Egység = egy fájl összes tesztje (a fájlon belüli sorrend és a `serial` csoportok együtt maradnak);
 * CSAK a súlyfájl `splittable` listáján szereplő fájl bontható egymást követő tesztek darabjaira, ha nehezebb a szelet-cél
 * felénél. Kiosztás: a legnehezebb egység a pillanatnyilag legkönnyebb szeletbe (holtversenyben név, illetve sorszám szerint).
 * @returns {{ tests: object[], weight: number }[]} `total` szelet; a szeleten belül a lista eredeti sorrendje.
 */
export function partition(tests, weights, total) {
  if (!(Number.isInteger(total) && total >= 1)) throw new Error(`A szeletek száma pozitív egész legyen (kaptam: ${total}).`);
  const order = new Map(tests.map((t, i) => [t, i]));
  const byFile = new Map();
  for (const t of tests) byFile.set(t.file, [...(byFile.get(t.file) ?? []), t]);
  const sum = tests.reduce((n, t) => n + weightOf(t, weights), 0);
  const cap = sum / total / 2;
  const units = [];
  for (const [file, list] of byFile) {
    const w = list.reduce((n, t) => n + weightOf(t, weights), 0);
    const chunks = (weights.splittable ?? []).includes(file) && w > cap ? Math.ceil(w / cap) : 1;
    const size = Math.ceil(list.length / chunks);
    for (let c = 0; c * size < list.length; c++) {
      const part = list.slice(c * size, (c + 1) * size);
      units.push({ name: `${file}#${String(c).padStart(3, '0')}`, tests: part, weight: part.reduce((n, t) => n + weightOf(t, weights), 0) });
    }
  }
  units.sort((a, b) => b.weight - a.weight || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const buckets = Array.from({ length: total }, () => ({ tests: [], weight: 0 }));
  for (const u of units) {
    let best = 0;
    for (let i = 1; i < total; i++) if (buckets[i].weight < buckets[best].weight) best = i;
    buckets[best].tests.push(...u.tests);
    buckets[best].weight += u.weight;
  }
  for (const b of buckets) b.tests.sort((x, y) => order.get(x) - order.get(y));
  return buckets;
}

export const testListText = (tests) => `${tests.map((t) => t.key).join('\n')}\n`;

/**
 * Számláló-ellenőr (tiszta): `listed` a teljes lista, `shards` a szeletenkénti jelentés tesztjei (`null` = hiányzó jelentés).
 * @returns {{ ok: boolean, problems: string[], rows: { part: string, count: number, ran: number, minutes: number }[], sum: number, expected: number }}
 */
export function checkCoverage(listed, shards) {
  const problems = [];
  const want = new Map(listed.map((t) => [t.id, t]));
  if (want.size !== listed.length) problems.push(`A lista ${listed.length - want.size} ismétlődő azonosítót tartalmaz.`);
  const seen = new Map();
  const rows = [];
  for (const [part, tests] of shards) {
    if (!tests) { problems.push(`A(z) ${part}. szelet jelentése hiányzik.`); continue; }
    let ran = 0;
    for (const t of tests) {
      if (!want.has(t.id)) problems.push(`A(z) ${part}. szeletben a listán nem szereplő teszt futott: ${t.key}`);
      if (seen.has(t.id)) problems.push(`Kétszer futott (a ${seen.get(t.id)}. és a ${part}. szeletben): ${t.key}`);
      else seen.set(t.id, part);
      if (t.results > 0) ran += 1;
      else problems.push(`A(z) ${part}. szeletben nem futott le (nincs eredménye): ${t.key}`);
    }
    rows.push({ part: String(part), count: tests.length, ran, minutes: tests.reduce((n, t) => n + t.durationMs, 0) / 60_000 });
  }
  for (const t of listed) if (!seen.has(t.id)) problems.push(`Egyik szeletben sem futott: ${t.key}`);
  const sum = rows.reduce((n, r) => n + r.ran, 0);
  if (sum !== listed.length) problems.push(`A szeletekben lefutott tesztek összege ${sum}, a lista teljes száma ${listed.length}.`);
  return { ok: problems.length === 0, problems, rows, sum, expected: listed.length };
}

/** A jelentésekből mért súlyok (mp / teszt, fájlonként) — a súlyfájl frissítéséhez; a `splittable` lista megmarad. */
export function measuredWeights(tests, previous = {}) {
  const by = new Map();
  for (const t of tests) {
    const cur = by.get(t.file) ?? { ms: 0, n: 0 };
    by.set(t.file, { ms: cur.ms + t.durationMs, n: cur.n + 1 });
  }
  const files = {};
  for (const [file, v] of [...by].sort(([a], [b]) => (a < b ? -1 : 1))) files[file] = Math.max(0.1, Math.round((v.ms / v.n / 1000) * 10) / 10);
  const all = Object.values(files).sort((a, b) => a - b);
  return { ...previous, defaultSecPerTest: all.length ? all[Math.floor(all.length / 2)] : previous.defaultSecPerTest ?? 5, files };
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || argv[i + 1] === undefined) throw new Error(`Hibás kapcsoló: ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

function need(opts, names) {
  for (const n of names) if (!opts[n]) throw new Error(`Hiányzó kapcsoló: --${n}`);
}

const table = (head, rows) => [head, ...rows].map((r) => r.map((c, i) => String(c).padStart(i === 0 ? 8 : 12)).join(' ')).join('\n');

function plan(opts, log) {
  need(opts, ['list', 'weights', 'total', 'part', 'out']);
  const total = Number(opts.total);
  const part = Number(opts.part);
  if (!(Number.isInteger(part) && part >= 1 && part <= total)) throw new Error(`--part 1 és ${opts.total} közötti egész legyen (kaptam: ${opts.part}).`);
  const tests = flattenTests(readJson(opts.list));
  if (!tests.length) throw new Error('A tesztlista üres.');
  const bad = inexpressible(tests);
  if (bad.length) throw new Error(`A --test-list nem tudja kifejezni ezeket a címeket (ne legyen bennük „›”, se szélső szóköz):\n${bad.join('\n')}`);
  const keys = new Set(tests.map((t) => t.key));
  if (keys.size !== tests.length) throw new Error(`A listában ${tests.length - keys.size} azonos című teszt van ugyanabban a fájlban — a --test-list nem tudja megkülönböztetni őket.`);
  const weights = validateWeights(readJson(opts.weights));
  const buckets = partition(tests, weights, total);
  const empty = buckets.findIndex((b) => b.tests.length === 0);
  if (empty >= 0) throw new Error(`A(z) ${empty + 1}. szelet üres lenne (${tests.length} teszt, ${total} szelet).`);
  writeFileSync(opts.out, testListText(buckets[part - 1].tests));
  log(table(['szelet', 'teszt', 'becsült perc'], buckets.map((b, i) => [`${i + 1}${i + 1 === part ? '*' : ''}`, b.tests.length, (b.weight / 60).toFixed(1)])));
  log(`[e2e-shards] ${part}/${total}. szelet: ${buckets[part - 1].tests.length} teszt a ${tests.length}-ból → ${opts.out}`);
  return 0;
}

function check(opts, log) {
  need(opts, ['list', 'reports', 'total']);
  const total = Number(opts.total);
  if (!(Number.isInteger(total) && total >= 1)) throw new Error(`--total pozitív egész legyen (kaptam: ${opts.total}).`);
  const listed = flattenTests(readJson(opts.list));
  const shards = new Map();
  for (let part = 1; part <= total; part++) {
    const path = join(opts.reports, reportName(part));
    shards.set(part, existsSync(path) ? flattenTests(readJson(path)) : null);
  }
  const res = checkCoverage(listed, shards);
  const text = [
    table(['szelet', 'teszt', 'lefutott', 'tesztperc'], res.rows.map((r) => [r.part, r.count, r.ran, r.minutes.toFixed(1)])),
    `[e2e-shards] a szeletekben lefutott tesztek összege: ${res.sum}; a lista teljes száma: ${res.expected} → ${res.ok ? 'EGYEZIK' : 'ELTÉR'}`,
  ].join('\n');
  log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### E2E számláló-ellenőr\n\n\`\`\`text\n${text}\n\`\`\`\n`);
  if (opts['weights-out']) {
    const prev = opts.weights && existsSync(opts.weights) ? readJson(opts.weights) : {};
    writeFileSync(opts['weights-out'], `${JSON.stringify(measuredWeights([...shards.values()].flatMap((t) => t ?? []), prev), null, 2)}\n`);
  }
  if (!res.ok) {
    log(`[e2e-shards] HIBA (${res.problems.length}):\n${res.problems.slice(0, 40).join('\n')}${res.problems.length > 40 ? `\n… és még ${res.problems.length - 40}` : ''}`);
    return 1;
  }
  return 0;
}

export function main(argv, log = console.log) {
  const [cmd, ...rest] = argv;
  try {
    const opts = argsOf(rest);
    if (cmd === 'plan') return plan(opts, log);
    if (cmd === 'check') return check(opts, log);
    throw new Error('Használat: e2e-shards.mjs plan|check … (lásd a fájl fejlécét)');
  } catch (err) {
    log(`[e2e-shards] HIBA: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));

// Láncolt bizonyíték-napló (S2; terv: docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md 6.1).
// A bizonyíték-tár (`<git-common-dir>/websuli-qa-evidence/`) rekordjai mellé egy `chain.jsonl`: soronként `{ name, head, sha256, prev, at }`,
// ahol `sha256` a rekordfájl tartalmának hash-e, `prev` az előző lánc-SOR hash-e. Egy utólag kézzel átírt rekord vagy lánc-sor a
// `verifyChain`-en bukik. NEM biztonsági határ (a tár helyben írható) — a figyelmetlen / kitalált állítást szűri; a határ a CI.

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CHAIN_FILE = 'chain.jsonl';
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function chainLines(dir) {
  const p = join(dir, CHAIN_FILE);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter((l) => l.trim());
}

/** Egy már kiírt rekordfájl (`<name>.json`) láncba kötése. @returns a lánc-sor objektuma */
export function linkRecord(dir, name, { now = () => new Date() } = {}) {
  const p = join(dir, `${name}.json`);
  const text = readFileSync(p, 'utf8');
  let head = null;
  try { head = JSON.parse(text).head ?? null; } catch { /* nem JSON: a hash így is köt */ }
  const lines = chainLines(dir);
  const prev = lines.length ? sha256(lines[lines.length - 1]) : null;
  const entry = { name, head, sha256: sha256(text), prev, at: now().toISOString() };
  appendFileSync(join(dir, CHAIN_FILE), `${JSON.stringify(entry)}\n`);
  return entry;
}

/** Rekord kiírása ÉS láncba kötése. */
export function appendRecord(dir, name, rec, opts) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(rec, null, 2)}\n`);
  return linkRecord(dir, name, opts);
}

export function readRecord(dir, name) {
  const p = join(dir, `${name}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * A lánc ellenőrzése: (1) minden sor `prev`-je az előző sor hash-e; (2) minden NÉV UTOLSÓ lánc-sorának `sha256`-ja egyezik a
 * rekordfájl jelenlegi tartalmával (egy újrafuttatott kapu felülírja a fájlt és új sort ír — a korábbi sorok így elavultak, nem hibák).
 * @param {string[]} [names] csak ezekre a rekordokra (alapérték: mind)
 * @returns {{ ok: boolean, problems: string[], last: Map<string, object> }}
 */
export function verifyChain(dir, names = null) {
  const lines = chainLines(dir);
  const problems = [];
  const last = new Map();
  let prevHash = null;
  lines.forEach((l, i) => {
    let e;
    try { e = JSON.parse(l); } catch { problems.push(`${CHAIN_FILE}:${i + 1}: nem JSON`); prevHash = sha256(l); return; }
    if ((e.prev ?? null) !== prevHash) problems.push(`${CHAIN_FILE}:${i + 1}: megszakadt lánc (prev ≠ az előző sor hash-e)`);
    prevHash = sha256(l);
    last.set(e.name, e);
  });
  for (const [name, e] of last) {
    if (names && !names.includes(name)) continue;
    const p = join(dir, `${name}.json`);
    if (!existsSync(p)) { problems.push(`${name}: a rekordfájl hiányzik`); continue; }
    if (sha256(readFileSync(p, 'utf8')) !== e.sha256) problems.push(`${name}: a rekord tartalma eltér a láncba írt hash-től (utólag módosították?)`);
  }
  return { ok: problems.length === 0, problems, last };
}

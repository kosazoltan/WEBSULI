#!/usr/bin/env node
// A független fejlesztési ellenőr ítéletének rögzítése (docs/minosegkapuk.md; terv D9; skill: websuli-fejlesztesi-ellenor).
// A `pre-pr-gate` és a `pre-merge-gate` ezt olvassa (`<git-common-dir>/websuli-qa-evidence/review-<fej>.json`).
//
// Használat: node scripts/qa/gates/record-review.mjs --head <hash> --verdict IGEN|"IGEN, FELTÉTELLEL"|NEM --report <jelentés.md>
// Kiírja a PR-leírásba / kommentbe illeszthető sort is (a nyilvános repóra CSAK ez a sor kerül: ítélet + fej-hash).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VERDICTS, argValue, isMain, makeContext, verdictLine, writeEvidence } from './lib.mjs';

/** Az ítélet normalizálása (ASCII-alak is elfogadott: IGEN-FELTETELLEL). */
export function normalizeVerdict(v) {
  const s = String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (s === 'IGEN') return 'IGEN';
  if (s === 'NEM') return 'NEM';
  if (/^IGEN[ ,_-]+FELT[EÉ]TELLEL$/.test(s)) return 'IGEN, FELTÉTELLEL';
  return null;
}

/** A jelentés utolsó `Ítélet:` sorának első ítélet-szava (`ÖSSZEVONHATÓ — NEM (… IGEN …)` → NEM). */
export function reportVerdict(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => /Ítélet\s*:/i.test(l));
  if (!lines.length) return null;
  const m = /Ítélet\s*:(.*)$/i.exec(lines[lines.length - 1]);
  const w = /(IGEN,\s*FELTÉTELLEL|IGEN|NEM)(?![A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű])/i.exec(m[1].replace(/\*/g, ''));
  return w ? normalizeVerdict(w[1]) : null;
}

/**
 * A jelentés ZÁRÓ (utolsó) önálló `Fej: <40 jegyű hash>` sora (markdown-díszítés megengedett: `**Fej:** \`<hash>\``) és a sor indexe.
 * Szabad szövegbeli hash-említés NEM számít (docs/specs/2026-11-20-itelet-fej-egyeztetes.md).
 * @returns {{ head: string, line: number } | null}
 */
export function reportHeadLine(text) {
  const lines = String(text).split(/\r?\n/);
  let found = null;
  lines.forEach((l, i) => {
    const m = /^[\s>#*_-]*Fej\s*:[\s*_]*`?([0-9a-f]{40})`?[\s*_]*$/i.exec(l);
    if (m) found = { head: m[1].toLowerCase(), line: i };
  });
  return found;
}

/** Az utolsó `Ítélet:` sor indexe (−1, ha nincs). */
function lastVerdictLine(text) {
  const lines = String(text).split(/\r?\n/);
  let idx = -1;
  lines.forEach((l, i) => { if (/Ítélet\s*:/i.test(l)) idx = i; });
  return idx;
}

/**
 * @returns {{ ok: true, record: object, line: string } | { ok: false, error: string }}
 */
export function buildRecord({ head, verdict, report, resolveHead, readReport, now = () => new Date() }) {
  const v = normalizeVerdict(verdict);
  if (!v) return { ok: false, error: `ismeretlen ítélet: „${verdict}” — elfogadott: ${VERDICTS.join(' | ')}` };
  if (!head || !/^[0-9a-f]{7,40}$/i.test(head)) return { ok: false, error: 'a --head 7–40 jegyű commit-hash legyen' };
  const full = resolveHead(head);
  if (!full) return { ok: false, error: `a ${head} nem létező commit ebben a repóban` };
  if (!report) return { ok: false, error: 'a --report <jelentés.md> kötelező (a független ellenőr jelentése, a scratchpadban — NEM a repóban)' };
  const text = readReport(report);
  if (text == null) return { ok: false, error: `a jelentés nem olvasható: ${report}` };
  if (!text.trim()) return { ok: false, error: 'a jelentés üres' };
  // Review J6: a --verdict a jelentés UTOLSÓ „Ítélet:” sorával (visszaellenőrzésnél az a friss) egyezzen.
  const inReport = reportVerdict(text);
  if (!inReport) return { ok: false, error: 'a jelentésben nincs „Ítélet: IGEN | IGEN, FELTÉTELLEL | NEM” sor (a megbízás-sablon kötelező része)' };
  if (inReport !== v) return { ok: false, error: `a --verdict (${v}) eltér a jelentés utolsó ítéletétől (${inReport})` };
  // A jelentés ZÁRÓ `Fej:` sora a vizsgált fej (régi jelentés új fejre nem rögzíthető), és a záró szakasznak van ítélete.
  const rh = reportHeadLine(text);
  if (!rh) return { ok: false, error: 'a jelentésben nincs önálló „Fej: <teljes, 40 jegyű hash>” sor — nem igazolható, melyik fejet vizsgálta (skill-sablon)' };
  if (rh.head !== full.toLowerCase()) return { ok: false, error: `a jelentés záró „Fej:” sora (${rh.head.slice(0, 12)}) egy másik fejre szól, nem a ${full.slice(0, 12)}-re — új (vagy visszanézési) jelentés kell` };
  if (lastVerdictLine(text) < rh.line) return { ok: false, error: 'a jelentés záró „Fej:” szakaszában nincs „Ítélet:” sor — az utolsó ítélet egy korábbi fejé' };
  return {
    ok: true,
    record: { kind: 'review', head: full, reportHead: rh.head, verdict: v, ok: v !== 'NEM', report: resolve(report), reportSha256: createHash('sha256').update(text).digest('hex'), at: now().toISOString() },
    line: verdictLine(v, full),
  };
}

function main() {
  const args = process.argv.slice(2);
  const ctx = makeContext({});
  const res = buildRecord({
    head: argValue(args, '--head'),
    verdict: argValue(args, '--verdict'),
    report: argValue(args, '--report'),
    resolveHead: (h) => {
      const r = ctx.git.run(['rev-parse', '--verify', '--quiet', `${h}^{commit}`]);
      return r.code === 0 ? r.stdout.trim() : null;
    },
    readReport: (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null),
  });
  if (!res.ok) { process.stderr.write(`[record-review] HIBA: ${res.error}\n`); process.exit(1); }
  writeEvidence(ctx.evDir, `review-${res.record.head}`, res.record);
  process.stdout.write(`[record-review] rögzítve: review-${res.record.head.slice(0, 12)} — ${res.record.verdict}\n`);
  process.stdout.write(`[record-review] a PR-leírásba / kommentbe ezt a sort tedd (más részletet a nyilvános repóra ne):\n${res.line}\n`);
  process.exit(0);
}

if (isMain(import.meta.url)) main();

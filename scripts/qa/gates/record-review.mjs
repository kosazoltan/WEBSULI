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
 * A jelentés UTOLSÓ fej-hivatkozása (`Fej: <hash>`, „fej `<hash>`”, „új fej <hash>”) — a visszanézési szakasz a végén áll, ezért az
 * utolsó számít (4. vak kör L1). @returns {string|null} a hash (7–40 jegy) vagy null
 */
export function reportHead(text) {
  const all = [...String(text).matchAll(/\bfej\b\s*[:`]?\s*`?([0-9a-f]{7,40})\b/gi)];
  return all.length ? all[all.length - 1][1].toLowerCase() : null;
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
  // 4. vak kör L1: a jelentés a feloldott fejről szóljon (az utolsó fej-hivatkozás) — régi jelentés új fejre nem rögzíthető
  const rh = reportHead(text);
  if (!rh) return { ok: false, error: 'a jelentésben nincs fej-hivatkozás (`Fej: <hash>` / „fej `<hash>`” / „új fej <hash>”) — nem igazolható, melyik fejet vizsgálta' };
  if (!full.toLowerCase().startsWith(rh)) return { ok: false, error: `a jelentés utolsó fej-hivatkozása (${rh.slice(0, 12)}) egy másik fejre szól, nem a ${full.slice(0, 12)}-re — új (vagy visszanézési) jelentés kell` };
  return {
    ok: true,
    record: { kind: 'review', head: full, reportHead: full, verdict: v, ok: v !== 'NEM', report: resolve(report), reportSha256: createHash('sha256').update(text).digest('hex'), at: now().toISOString() },
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

#!/usr/bin/env node
// Helyi (GPU-n futó) fejlesztési ellenőr — a felhős „vak kör” alügynök-ellenőrzés helyett (docs/specs/2026-11-23-vak-kor-kivezetes.md).
// A diffet fájlonként a helyi Ollama-modellnek adja (ANGOL megbízással — a helyi modell magyarul nem ért megbízhatóan), a leleteket
// összesíti, a jelentést a scratchpadba írja, és ugyanabba a `review-<fej>.json` bizonyítékba rögzíti az ítéletet, amit a
// pre-pr-gate / pre-merge-gate olvas. Felhős tokent nem éget.
//
// Használat:
//   node scripts/qa/gates/local-review.mjs [--base origin/main] [--head HEAD] [--ki <jelentés.md>]
//        [--model <ollama-modell>] [--url http://localhost:11434] [--refuted <lelet-id,...> --refuted-reason "<miért hamis>"]
// Ítélet: nincs high lelet → IGEN; csak medium/low → IGEN, FELTÉTELLEL; high → NEM. A high leletet az orkesztrátor a KÓDBÓL
// ellenőrzi: valódi → javítás + újrafuttatás; hamis → `--refuted <id> --refuted-reason "..."` (a cáfolat a bizonyítékba kerül).
// Kilépés: 0 rögzítve (IGEN / FELTÉTELLEL), 1 NEM vagy hiba, 3 a helyi modell nem érhető el.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { argValue, isMain, makeContext, verdictLine, writeEvidence } from './lib.mjs';

export const DEFAULT_MODEL = process.env.WEBSULI_LOCAL_REVIEW_MODEL || 'hf.co/ornith-ai/Ornith-1.5-9B-GGUF:Q8_0';
export const DEFAULT_URL = process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://localhost:11434';
const CHUNK_CHARS = 24_000;

/** Ezeket a fájlokat nem érdemes modellel nézni (generált / adat / zár). */
export const SKIP = [/(^|\/)package-lock\.json$/, /\.lock$/, /\.(png|jpe?g|gif|webp|mp4|woff2?|ico|pdf)$/i, /(^|\/)(word|grade|game)-?banks?\//i, /\.min\.js$/];

/** Kockázatos utak: itt egyszeri felhős (Claude / Gemini) második vélemény AJÁNLOTT — nem kapu. */
export const RISK = [/migrations?\//i, /schema\.ts$/, /auth|session|csrf|password|token|secret/i, /payment|stripe|billing/i, /email|mailer/i, /\.github\/workflows\//];

/** Egységes diff → fájlonkénti darabok ({ file, text }); a túl nagy fájl-diff több darabra bomlik. */
export function splitDiff(diff, max = CHUNK_CHARS) {
  const parts = String(diff).split(/^(?=diff --git )/m).filter((p) => p.startsWith('diff --git '));
  const out = [];
  for (const p of parts) {
    const file = (/^diff --git a\/(.+?) b\//.exec(p) || [])[1] || '?';
    if (SKIP.some((re) => re.test(file))) continue;
    for (let i = 0; i < p.length; i += max) out.push({ file, text: p.slice(i, i + max) });
  }
  return out;
}

export function riskyFiles(chunks) {
  return [...new Set(chunks.map((c) => c.file).filter((f) => !/\.(md|txt)$/i.test(f) && RISK.some((re) => re.test(f))))];
}

export function buildPrompt(chunk) {
  return [
    'You are a strict, independent code reviewer. Review ONLY the unified diff below (one file of a larger change).',
    'Find real defects: logic errors, removed guards/validation, wrong conditions, off-by-one, null/undefined crashes, race conditions,',
    'security issues (secrets, injection, auth bypass, personal data in logs/URLs), broken data contracts, timezone/date bugs,',
    'tests that were weakened or became tautological. Ignore style, naming, formatting, comments and Hungarian text content.',
    'Do NOT invent code that is not shown. If unsure, use severity "low". Use "high" only for a concrete, likely bug.',
    'Reply with JSON only: {"verdict":"PASS|CONCERNS|BLOCK","findings":[{"line":<new-file line or 0>,"severity":"high|medium|low","issue":"<one sentence: scenario and effect>"}]}',
    '',
    `FILE: ${chunk.file}`,
    chunk.text,
  ].join('\n');
}

/** A modell JSON-válasza → leletek (hibatűrő). */
export function parseFindings(content, file) {
  let j;
  try { j = JSON.parse(content); } catch { const m = /\{[\s\S]*\}/.exec(String(content)); try { j = m ? JSON.parse(m[0]) : null; } catch { j = null; } }
  if (!j || !Array.isArray(j.findings)) return [];
  return j.findings
    .filter((f) => f && typeof f.issue === 'string' && f.issue.trim())
    .map((f) => ({ file, line: Number(f.line) || 0, severity: ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'low', issue: f.issue.trim() }));
}

export function findingId(f) {
  return createHash('sha1').update(`${f.file}|${f.line}|${f.issue}`).digest('hex').slice(0, 8);
}

export function decideVerdict(findings, refuted = new Set()) {
  const live = findings.filter((f) => !refuted.has(f.id));
  if (live.some((f) => f.severity === 'high')) return 'NEM';
  if (live.length) return 'IGEN, FELTÉTELLEL';
  return 'IGEN';
}

export function renderReport({ head, base, model, findings, verdict, risky, refuted, refutedReason, ms }) {
  const sev = (s) => findings.filter((f) => f.severity === s);
  const line = (f) => `- [${f.id}] \`${f.file}:${f.line}\` (${f.severity}${refuted.has(f.id) ? ', CÁFOLVA' : ''}) — ${f.issue}`;
  return [
    `# Helyi ellenőr — fej \`${head.slice(0, 12)}\` (alap: ${base})`,
    `Modell: ${model} · idő: ${Math.round(ms / 1000)} s · leletek: ${findings.length}`,
    '',
    `## Ítélet: ${verdict}`,
    '',
    '## High', ...(sev('high').map(line).length ? sev('high').map(line) : ['- nincs']),
    '## Medium', ...(sev('medium').map(line).length ? sev('medium').map(line) : ['- nincs']),
    '## Low', ...(sev('low').map(line).length ? sev('low').map(line) : ['- nincs']),
    ...(refuted.size ? ['', `## Cáfolt leletek: ${[...refuted].join(', ')}`, `Indok: ${refutedReason || '(nincs megadva)'}`] : []),
    ...(risky.length ? ['', '## Kockázatos fájlok — egyszeri felhős második vélemény ajánlott (nem kapu)', ...risky.map((f) => `- ${f}`)] : []),
    '',
  ].join('\n');
}

async function callModel(url, model, prompt) {
  const r = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, think: false, format: 'json', options: { num_ctx: 32768, temperature: 0 }, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`ollama HTTP ${r.status}`);
  return (await r.json()).message?.content ?? '';
}

async function main() {
  const args = process.argv.slice(2);
  const ctx = makeContext({});
  const base = argValue(args, '--base', 'origin/main');
  const headArg = argValue(args, '--head', 'HEAD');
  const model = argValue(args, '--model', DEFAULT_MODEL);
  const url = argValue(args, '--url', DEFAULT_URL);
  const refuted = new Set(String(argValue(args, '--refuted', '')).split(',').map((s) => s.trim()).filter(Boolean));
  const refutedReason = argValue(args, '--refuted-reason', '');
  const hr = ctx.git.run(['rev-parse', '--verify', `${headArg}^{commit}`]);
  if (hr.code !== 0) { process.stderr.write(`[local-review] HIBA: ismeretlen fej: ${headArg}\n`); process.exit(1); }
  const head = hr.stdout.trim();
  const d = ctx.git.run(['diff', '--no-color', '-U5', `${base}...${head}`]);
  if (d.code !== 0) { process.stderr.write(`[local-review] HIBA: git diff ${base}...${head}\n`); process.exit(1); }
  const chunks = splitDiff(d.stdout);
  try { await fetch(`${url}/api/tags`); } catch { process.stderr.write(`[local-review] a helyi modell nem érhető el (${url}) — indítsd az Ollamát.\n`); process.exit(3); }
  const t0 = Date.now();
  const findings = [];
  for (const [i, c] of chunks.entries()) {
    process.stdout.write(`[local-review] ${i + 1}/${chunks.length} ${c.file}\n`);
    for (const f of parseFindings(await callModel(url, model, buildPrompt(c)), c.file)) findings.push({ ...f, id: findingId(f) });
  }
  const verdict = decideVerdict(findings, refuted);
  const risky = riskyFiles(chunks);
  const out = resolve(argValue(args, '--ki', resolve(ctx.evDir, `local-review-${head.slice(0, 12)}.md`)));
  const text = renderReport({ head, base, model, findings, verdict, risky, refuted, refutedReason, ms: Date.now() - t0 });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  writeEvidence(ctx.evDir, `review-${head}`, {
    kind: 'review', reviewer: 'local-llm', model, head, verdict, ok: verdict !== 'NEM', report: out,
    reportSha256: createHash('sha256').update(text).digest('hex'), findings: findings.length, refuted: [...refuted], refutedReason, risky, at: new Date().toISOString(),
  });
  process.stdout.write(`${text}\n[local-review] jelentés: ${out}\n${verdictLine(verdict, head)}\n`);
  process.exit(verdict === 'NEM' ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { process.stderr.write(`[local-review] HIBA: ${e.message}\n`); process.exit(1); });

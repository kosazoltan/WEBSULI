#!/usr/bin/env node
// AGENTS.md méret- és sorrend-őr (docs/minosegkapuk.md „Futtatókörnyezetek”; terv: docs/specs/2026-11-17-kapuk-beepites.md).
// Ok: a Hermes a projekt AGENTS.md-jét karakterkorláttal tölti be (`context_file_max_chars` nélkül a dinamikus alsó határ
// 20 000 karakter; túllépésnél a fájl KÖZEPE vágódik: fej 70% / vég 20%). Ezért az AGENTS.md legfeljebb 19 000 karakter, és a
// „Minőségkapuk” szakasz az első 6 000 karakteren belül kezdődik — így a kötelező kapu-szabály egyik ügynöknél sem vész el.
//
// Használat: node scripts/qa/gates/agents-md-guard.mjs [<út>]   (alap: a repó gyökerének AGENTS.md-je)
// Kilépési kód: 0 = rendben, 1 = sérül valamelyik határ (az üzenet megnevezi az okot).

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GATES_DIR, isMain } from './lib.mjs';

export const MAX_CHARS = 19_000;
export const SECTION_WITHIN = 6_000;
export const SECTION_RE = /^## Minőségkapuk\b/m;

/**
 * @param {string} text  az AGENTS.md tartalma
 * @returns {{ ok: boolean, chars: number, sectionAt: number, problems: string[] }}
 */
export function checkAgentsMd(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n');
  const chars = [...t].length;
  const m = SECTION_RE.exec(t);
  const sectionAt = m ? [...t.slice(0, m.index)].length : -1;
  const problems = [];
  if (chars > MAX_CHARS) {
    problems.push(`az AGENTS.md ${chars} karakter (legfeljebb ${MAX_CHARS}) — a Hermes 20 000 karakter fölött a fájl közepét levágja; tömöríts, a részletet vidd hivatkozott doksiba`);
  }
  if (sectionAt < 0) problems.push('nincs „## Minőségkapuk” szakasz az AGENTS.md-ben');
  else if (sectionAt > SECTION_WITHIN) {
    problems.push(`a „## Minőségkapuk” szakasz a(z) ${sectionAt}. karakternél kezdődik (legfeljebb ${SECTION_WITHIN}) — tedd az Alapelvek után, hogy vágásnál se vesszen el`);
  }
  return { ok: problems.length === 0, chars, sectionAt, problems };
}

function main() {
  const p = process.argv[2] ? resolve(process.argv[2]) : join(GATES_DIR, '..', '..', '..', 'AGENTS.md');
  const r = checkAgentsMd(readFileSync(p, 'utf8'));
  if (r.ok) {
    process.stdout.write(`[agents-md-guard] PASS — ${r.chars} karakter, „Minőségkapuk” a(z) ${r.sectionAt}. karakternél\n`);
  } else {
    for (const pr of r.problems) process.stdout.write(`[agents-md-guard] FAIL — ${pr}\n`);
  }
  process.exitCode = r.ok ? 0 : 1;
}

if (isMain(import.meta.url)) main();

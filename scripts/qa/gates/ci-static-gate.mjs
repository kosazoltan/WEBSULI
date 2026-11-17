#!/usr/bin/env node
// CI statikus kapu (docs/minosegkapuk.md „Futtatókörnyezetek”; terv: docs/specs/2026-11-17-kapuk-beepites.md).
// A lint kapu függőség nélküli, olcsó része a CI-ban is: repó-szabályok és tiltott minták a diff HOZZÁADOTT soraiban.
// Csak Node kell (nincs npm ci) — a CI `three-phase` jobja futtatja; helyben a `gate:lint` ugyanezt (és többet) adja.
//
// Használat: node scripts/qa/gates/ci-static-gate.mjs [--base origin/main]
// Kilépési kód: 0 = zöld, 1 = bármely lépés FAIL. Leletben érték SOHA nincs, csak fájl:sor és a szabály neve.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATUS, argValue, createGate, isMain, makeContext } from './lib.mjs';
import { applyRepoRules, classifyHookOutput, scanAddedLines } from './lint-gate.mjs';

const SKIP_FILE = /(?:^|\/)package-lock\.json$|\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|mp3|mp4|wasm)$/i;

/**
 * A két statikus lépés egy kapuhoz adva. A lépések a `lint-gate.mjs` exportjait hívják (logika-másolat nincs).
 * @param {{ gate: ReturnType<typeof createGate>, ctx: ReturnType<typeof makeContext> }} p
 */
export async function runStaticSteps({ gate, ctx }) {
  const { exec, git, root, base, node } = ctx;
  const added = git.addedLines(base, root);
  const byFile = new Map();
  for (const l of added) {
    if (!byFile.has(l.file)) byFile.set(l.file, []);
    byFile.get(l.file).push(l);
  }

  await gate.step('repó-szabályok a diffre', () => {
    const rulesPath = join(root, 'scripts', 'qa', 'repo-rules.json');
    const rules = existsSync(rulesPath) ? (JSON.parse(readFileSync(rulesPath, 'utf8')).rules ?? []) : [];
    const hook = join(root, 'scripts', 'qa', 'hooks', 'enforce-repo-rules.mjs');
    const hits = [];
    for (const [file, ls] of byFile) {
      if (SKIP_FILE.test(file)) continue;
      const text = ls.map((l) => l.text).join('\n');
      for (const h of applyRepoRules(rules, text)) hits.push({ ...h, file });
      if (existsSync(hook)) {
        const r = exec(node, [hook], { cwd: root, input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file, content: text } }), timeoutMs: 20_000 });
        const c = classifyHookOutput(r.stdout);
        if (c) hits.push({ ...c, file });
      }
    }
    if (!hits.length) return { status: STATUS.PASS, note: `${byFile.size} fájl` };
    const fail = hits.some((h) => h.level === STATUS.FAIL);
    return {
      status: fail ? STATUS.FAIL : STATUS.WARN,
      note: `${hits.length} jelzés${fail ? '' : ' (heurisztikus — nézd át)'}`,
      detail: hits.map((h) => `${h.level} ${h.file}: ${h.msg}`).join('\n'),
    };
  });

  await gate.step('tiltott minták a diffben', () => {
    const f = scanAddedLines(added);
    return f.length
      ? { status: STATUS.FAIL, note: `${f.length} lelet`, detail: f.map((x) => `${x.file}:${x.line} — ${x.rule}`).join('\n') }
      : { status: STATUS.PASS, note: `${added.length} hozzáadott sor` };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const ctx = makeContext({ base: argValue(args, '--base') });
  const gate = createGate('ci-static-gate');
  gate.log(`[ci-static-gate] alap: ${ctx.base}`);
  await runStaticSteps({ gate, ctx });
  process.exitCode = gate.finish();
}

if (isMain(import.meta.url)) await main();

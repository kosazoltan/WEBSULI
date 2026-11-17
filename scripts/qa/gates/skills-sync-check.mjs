#!/usr/bin/env node
// Skill-tükör ellenőrzése (docs/minosegkapuk.md; terv D13, E13): a forrás `.agents/skills/<név>/SKILL.md`, a tükör
// `.claude/skills/<név>/SKILL.md` — bájtazonos (sorvég-normalizálva). Eltérésnél bukik; `--fix` a forrásból másol.
//
// Használat: node scripts/qa/gates/skills-sync-check.mjs [--fix]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { GATES_DIR, isMain, loadConfig } from './lib.mjs';

const norm = (s) => s.replace(/\r\n/g, '\n');

/**
 * @returns {{ name: string, problem: string | null }[]}
 */
export function checkSkills({ root, names, fix = false, fs = { existsSync, readFileSync, writeFileSync, mkdirSync } }) {
  const out = [];
  for (const name of names) {
    const src = join(root, '.agents', 'skills', name, 'SKILL.md');
    const dst = join(root, '.claude', 'skills', name, 'SKILL.md');
    if (!fs.existsSync(src)) { out.push({ name, problem: `hiányzik a forrás: .agents/skills/${name}/SKILL.md` }); continue; }
    const a = norm(fs.readFileSync(src, 'utf8'));
    if (!/^---\nname: [^\n]+\ndescription: [^\n]+\n(?:[^\n]*\n)*?---\n/.test(a)) { out.push({ name, problem: 'a forrás frontmatterje hiányos (name + description kell)' }); continue; }
    const b = fs.existsSync(dst) ? norm(fs.readFileSync(dst, 'utf8')) : null;
    if (a === b) { out.push({ name, problem: null }); continue; }
    if (fix) {
      fs.mkdirSync(dirname(dst), { recursive: true });
      fs.writeFileSync(dst, a);
      out.push({ name, problem: null, fixed: true });
    } else {
      out.push({ name, problem: b == null ? `hiányzik a tükör: .claude/skills/${name}/SKILL.md` : `eltér a tükör: .claude/skills/${name}/SKILL.md` });
    }
  }
  return out;
}

function main() {
  const fix = process.argv.includes('--fix');
  const root = resolve(GATES_DIR, '..', '..', '..');
  const res = checkSkills({ root, names: loadConfig().mirroredSkills ?? [], fix });
  let bad = 0;
  for (const r of res) {
    if (r.problem) { bad += 1; process.stdout.write(`[skills-sync] HIBA ${r.name}: ${r.problem}\n`); }
    else process.stdout.write(`[skills-sync] OK   ${r.name}${r.fixed ? ' (tükör frissítve)' : ''}\n`);
  }
  if (bad) process.stdout.write('[skills-sync] Javítás: a forrást (.agents/skills) szerkeszd, majd: node scripts/qa/gates/skills-sync-check.mjs --fix\n');
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) main();

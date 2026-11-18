// docs/specs/2026-11-17-minosegkapuk.md D13, E13: a .agents ↔ .claude skill-tükör nem csúszhat szét.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkSkills } from './skills-sync-check.mjs';
import { GATES_DIR, loadConfig } from './lib.mjs';

const SKILL = '---\nname: proba\ndescription: Mikor: teszt.\n---\n\n# Próba\n';

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'skills-'));
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), c); }
  return root;
}

test('checkSkills: azonos (CRLF-fel is) → OK; eltérő / hiányzó tükör → hiba; --fix másol', () => {
  const root = repo({ '.agents/skills/proba/SKILL.md': SKILL, '.claude/skills/proba/SKILL.md': SKILL.replace(/\n/g, '\r\n') });
  assert.deepEqual(checkSkills({ root, names: ['proba'] }), [{ name: 'proba', problem: null }]);
  writeFileSync(join(root, '.claude/skills/proba/SKILL.md'), `${SKILL}eltérés\n`);
  assert.match(checkSkills({ root, names: ['proba'] })[0].problem, /eltér a tükör/);
  assert.match(checkSkills({ root, names: ['masik'] })[0].problem, /hiányzik a forrás/);
  checkSkills({ root, names: ['proba'], fix: true });
  assert.equal(readFileSync(join(root, '.claude/skills/proba/SKILL.md'), 'utf8'), SKILL);
});

test('checkSkills: frontmatter nélküli forrás → hiba', () => {
  const root = repo({ '.agents/skills/x/SKILL.md': '# nincs frontmatter\n' });
  assert.match(checkSkills({ root, names: ['x'] })[0].problem, /frontmatter/);
});

test('a repó hat minőségkapu-skillje mindkét helyen azonos (a valódi fájlokon)', () => {
  const root = resolve(GATES_DIR, '..', '..', '..');
  const names = loadConfig().mirroredSkills;
  // K3 (docs/specs/2026-11-18-vak-ellenor-deepseek.md): a hatodik a websuli-vak-ellenor.
  assert.equal(names.length, 6);
  assert.ok(names.includes('websuli-vak-ellenor'));
  assert.deepEqual(checkSkills({ root, names }).filter((r) => r.problem), []);
});

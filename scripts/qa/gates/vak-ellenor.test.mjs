// docs/specs/2026-11-18-vak-hibakereso-ellenor.md V1–V3: a külső (Gemini) ellenőr nincs a kapukban és az előírásokban; a független
// ellenőr megbízás-sablonja VAK és HIBAKERESŐ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lib from './lib.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (...p) => readFileSync(join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
const SKILLS = ['websuli-lint-ellenor', 'websuli-fejlesztesi-ellenor', 'websuli-push-elotti-kapu', 'websuli-pr-elotti-kapu', 'websuli-merge-elotti-kapu'];
const EXTERNAL = /Gemini|external-review|második vélemény|external-\$\{|externalResult/i;

/** Egy `## Cím` szakasz szövege a következő `## ` fejlécig. */
// A sablon kódblokkja is tartalmaz `## ` sort, ezért a végét a következő szakasz címével is meg lehet adni.
function section(md, title, next = null) {
  const a = md.indexOf(`## ${title}`);
  assert.ok(a >= 0, `hiányzó szakasz: ${title}`);
  const b = next ? md.indexOf(`\n## ${next}`, a + 3) : md.indexOf('\n## ', a + 3);
  return md.slice(a, b < 0 ? undefined : b);
}

test('V1: a PR- és a merge-kapu nem olvassa a külső bizonyítékot, és nincs ilyen lépése; a figyelmeztető függvény megszűnt', () => {
  for (const f of ['pre-pr-gate.mjs', 'pre-merge-gate.mjs']) assert.doesNotMatch(read('scripts', 'qa', 'gates', f), EXTERNAL, f);
  assert.equal(typeof lib.externalResult, 'undefined');
});

test('V2: a runbook, az AGENTS.md „Minőségkapuk” szakasza és az öt kapu-skill nem írja elő / nem ajánlja a külső ellenőrt', () => {
  assert.doesNotMatch(read('docs', 'minosegkapuk.md'), EXTERNAL, 'docs/minosegkapuk.md');
  assert.doesNotMatch(section(read('AGENTS.md'), 'Minőségkapuk'), EXTERNAL, 'AGENTS.md — Minőségkapuk');
  for (const s of SKILLS) {
    for (const dir of ['.agents', '.claude']) assert.doesNotMatch(read(dir, 'skills', s, 'SKILL.md'), EXTERNAL, `${dir}/skills/${s}`);
  }
});

test('V3: a független ellenőr megbízás-sablonja vak és hibakereső (a)–(f), és nem adja át a fejlesztő állításait', () => {
  const skill = read('.agents', 'skills', 'websuli-fejlesztesi-ellenor', 'SKILL.md');
  const tpl = section(skill, '3. A megbízás', '4. Kötelező');
  for (const must of [
    'A FELADATOD HIBÁT TALÁLNI, NEM MEGERŐSÍTENI', // (a)
    'Bármi más, amit a fenti lista nem fed', // (b)
    'Versenyhelyzet', 'Tesztminőség', 'Adatszerződés', 'Biztonság és adatvédelem', 'Regresszió', 'dátumhatár', 'Migráció',
    'SAJÁT ideiglenes munkafában', // (c)
    '## Mit próbáltam megtörni, és nem sikerült', '## Mit NEM vizsgáltam', 'Fej: <teljes fej-hash>', // (d)
    'képernyőképeket', // (f)
    'Amit kapsz (más nem jár)', // vak
  ]) assert.ok(tpl.includes(must), `a sablonból hiányzik: ${must}`);
  // vak: a régi sablon fejlesztői állításokat átadó sorai nincsenek benne
  assert.doesNotMatch(tpl, /A helyi kapuk eredménye|fejlesztő által ismert kockázatok/);
  // (e) visszanézés is vak és hibakereső
  const re = section(skill, '5. Visszaellenőrzés');
  assert.match(re, /továbbra is VAKON/);
  assert.match(re, /HIBAKERESÉS/);
  // a tükör bájtra azonos
  assert.equal(read('.claude', 'skills', 'websuli-fejlesztesi-ellenor', 'SKILL.md'), skill);
});

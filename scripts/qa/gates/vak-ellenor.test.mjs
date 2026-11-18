// docs/specs/2026-11-18-vak-hibakereso-ellenor.md V1–V3: a külső (Gemini) ellenőr nincs a kapukban és az előírásokban; a független
// ellenőr megbízás-sablonja VAK és HIBAKERESŐ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lib from './lib.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (...p) => readFileSync(join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
const SKILLS = ['websuli-lint-ellenor', 'websuli-fejlesztesi-ellenor', 'websuli-push-elotti-kapu', 'websuli-pr-elotti-kapu', 'websuli-merge-elotti-kapu'];
// A külső ellenőr hivatkozásai (a „Gemini” mint ügynök-környezet neve — pl. „Codex / Cursor / Gemini futások” — megengedett).
const EXTERNAL = /külső \(Gemini\)|Gemini[- ]ellenőr|GEMINI_API_KEY|external-review|második vélemény|external-\$\{|externalResult/i;

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
  // A megbízás szövege EGY, gépileg olvasható fájlban van; a skill, az AGENTS.md és a runbook erre hivatkozik (nem másolja).
  const TPL = 'scripts/qa/gates/vak-ellenor-megbizas.md';
  const tpl = read(...TPL.split('/'));
  for (const doc of [skill, read('AGENTS.md'), read('docs', 'minosegkapuk.md')]) assert.ok(doc.includes(TPL), 'hiányzó hivatkozás a sablonfájlra');
  assert.ok(!skill.includes('A FELADATOD HIBÁT TALÁLNI, NEM MEGERŐSÍTENI'), 'a skill ne másolja a sablont (egyetlen forrás)');
  // „Ki az ellenőr” egy helyen, jól elkülönítve (a skillben és az AGENTS.md szakaszában)
  assert.match(skill, /^### Ki az ellenőr$/m);
  assert.match(section(read('AGENTS.md'), 'Vak hibakereső ellenőr — kötelező'), /^### Ki az ellenőr$/m);
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

// ---- Kiegészítés (V7–V9): repó-szintű, környezet-semleges szabály ------------------------------------------------------

const RULE = 'Vak hibakereső ellenőr — kötelező';
// A repó minden ügynök-vezérlő fájlja (a terv „Felmérés” táblája), és a jövőben esetleg létrejövők: ha léteznek, hivatkozniuk kell.
const CONTROL_FILES = ['.cursor/rules/vak-ellenor.mdc', '.cursor/rules/minosegkapuk.mdc', '.cursorrules', '.github/copilot-instructions.md',
  'docs/agent-haromfazisu-munka.md', 'docs/codex-felhokornyezet.md', 'docs/minosegkapuk.md'];
const OPTIONAL_CONTROL_FILES = ['CLAUDE.md', 'CODEX.md', 'GEMINI.md', '.windsurfrules', '.clinerules', 'Codex-iranyitasi-terv.md', 'Codex-vegrehajtasi-terv.md'];

test('V7: az AGENTS.md önálló szakasza a kezelt blokkon kívül, idézettel, dátummal, kulcsmondatokkal; a Minőségkapuk 3. pontja hivatkozik rá', () => {
  const md = read('AGENTS.md');
  const sec = section(md, RULE);
  const kitEnd = md.indexOf('<!-- agentic-qa-kit:end -->');
  const kitBegin = md.indexOf('<!-- agentic-qa-kit:begin');
  const at = md.indexOf(`## ${RULE}`);
  assert.ok(kitBegin >= 0 && kitEnd > kitBegin && (at < kitBegin || at > kitEnd), 'a szakasz a kezelt blokkon kívül legyen');
  for (const must of [
    'tulajdonosi utasítás 2026-11-18', 'mindig egy vak alügynök ellenőrizze az elvégzett munkádat',
    'bármilyen mesterséges intelligencia-ügynök', 'A fejlesztő saját magát soha nem ellenőrizheti',
    'a feladatod hibát találni, nem megerősíteni', 'új, tiszta munkamenet', 'CSAK a tervet és a diffet kapja',
    'Mit próbáltam megtörni, és nem sikerült', 'Mit NEM vizsgáltam', 'Visszanézésnél is hibakeresés', 'bármi más',
  ]) assert.ok(sec.includes(must), `az AGENTS.md szakaszából hiányzik: ${must}`);
  assert.match(section(md, 'Minőségkapuk'), new RegExp(`„${RULE}” szakasz szerint`));
});

test('V8: minden létező ügynök-vezérlő fájl hivatkozik az AGENTS.md szakaszára; a Cursor-szabály mindig érvényes', () => {
  for (const f of CONTROL_FILES) assert.ok(read(...f.split('/')).includes(RULE), `nincs hivatkozás: ${f}`);
  for (const f of OPTIONAL_CONTROL_FILES) {
    if (existsSync(join(root, f))) assert.ok(read(f).includes(RULE), `létező vezérlőfájl hivatkozás nélkül: ${f}`);
  }
  assert.match(read('.cursor', 'rules', 'vak-ellenor.mdc'), /^---\n[\s\S]*alwaysApply: true[\s\S]*?\n---\n/);
});

test('V9: a skill leírása minden elkészült fejlesztésnél betöltést ír elő; van alügynök-eszköz nélküli indítás', () => {
  const skill = read('.agents', 'skills', 'websuli-fejlesztesi-ellenor', 'SKILL.md');
  const desc = /^description: (.*)$/m.exec(skill)?.[1] ?? '';
  assert.match(desc, /MINDEN elkészült fejlesztésnél/);
  assert.match(desc, /VAK/);
  assert.match(desc, /HIBÁT TALÁLNI/);
  assert.ok(desc.includes(RULE), 'a leírás hivatkozzon az AGENTS.md szakaszra');
  assert.match(skill, /### 3\/b\. Ha nincs alügynök-eszköz/);
});

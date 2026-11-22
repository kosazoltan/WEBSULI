// docs/specs/2026-11-22-zaro-hurok-websuli.md (E1–E17): a WEBSULI záró hurok kapuja ideiglenes git-tárakon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyHygiene, claudeProjectName, collectRounds, defaultKanbanFile, decideConvergence, findMarkers, hasFreshMarker, parseArgs, planHygiene, roundFromReport, runCheck, tempTrapIds, validateYamlSubset, writeNoNewMarkers,
} from './zaro-hurok.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'zaro-hurok.mjs');
const SINCE = '2026-11-22T00:00:00+01:00';
const BEFORE = '2026-11-21T12:00:00+01:00';
const AFTER = '2026-11-22T12:00:00+01:00';
const NO_VECTOR = async () => false;
// Üres Claude-környezet: a valódi ~/.claude tapasztalat-kanbanja ne befolyásolja a teszteket.
const HOME0 = mkdtempSync(join(tmpdir(), 'zaro-hurok-home-'));

const BASE_FILES = {
  'docs/agent-csapdak.md': '# Katalógus\n\n## C-01 — régi bejegyzés\n- szabály: régi\n',
  'memory/manifest.yaml': 'project:\n  name: PROBA\n  domain: "teszt"\nquality_gates:\n  - stage: "npm run gate:stage"\n',
  'memory/index.qmd': '---\ntitle: "Próba"\n---\n\n# Cél\n\nBelépő.\n',
  'memory/.cogni/project.cogni.yaml': 'cogni:\n  kind: project_snapshot\n  identity:\n    purpose: "próba"\n',
  'memory/.cogni/modules.cogni.yaml': 'cogni:\n  kind: module_index\n  modules: []\n',
  'memory/.cogni/decisions.cogni.yaml': 'cogni:\n  kind: decision_log\n  decisions: []\n',
  'memory/.cogni/schema.cogni.yaml': 'cogni:\n  kind: db_schema_snapshot\n  models: []\n',
  'docs/specs/2026-11-21-terv.md': '# Terv\n\n## 1. Cél\n\nValami.\n\n## 10. Állapotnapló\n\n- 2026-11-21: kezdés.\n',
  'scripts/qa/gates/gates.config.json': '{ "mirroredSkills": [] }\n',
};

function git(cwd, args, env = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(root, files) {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
}

function commitAt(root, date, msg) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '--allow-empty', '-m', msg], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
}

function makeRepo(files = BASE_FILES) {
  const root = mkdtempSync(join(tmpdir(), 'zaro-hurok-'));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'Teszt']);
  git(root, ['config', 'user.email', 'teszt@example.invalid']);
  git(root, ['config', 'core.autocrlf', 'false']);
  write(root, files);
  commitAt(root, BEFORE, 'alap');
  return root;
}

/** Minden réteg friss: csapda-bővülés skill-hivatkozással, memória-módosítás, retró, kanban-fájl. */
function freshUpdate(root) {
  appendFileSync(join(root, 'docs/agent-csapdak.md'), '\n## C-02 — új tanulság\n- nincs-skill: egyszeri eset\n');
  appendFileSync(join(root, 'memory/manifest.yaml'), 'repository:\n  default_branch: main\n');
  appendFileSync(join(root, 'memory/index.qmd'), '\nÚj sor.\n');
  for (const k of ['project', 'modules', 'decisions', 'schema']) appendFileSync(join(root, `memory/.cogni/${k}.cogni.yaml`), '  generated: 2026-11-22\n');
  appendFileSync(join(root, 'docs/specs/2026-11-21-terv.md'), '- 2026-11-22: lezárás.\n');
  commitAt(root, AFTER, 'záró hurok');
  const kf = join(root, '..', `${root.split(/[\\/]/).pop()}-kanban.md`);
  writeFileSync(kf, '# kanban\n');
  return kf;
}

const step = (res, id) => res.steps.find((s) => s.id === id);

// ---- egységek -----------------------------------------------------------------------------------------------------------

test('parseArgs: hiányzó / érvénytelen --since → hiba; helyes alak → Date', () => {
  assert.throws(() => parseArgs(['check']), /--since/);
  assert.throws(() => parseArgs(['check', '--since', 'tegnap']), /--since/);
  const a = parseArgs(['check', '--since', SINCE, '--json', '--kanban-file', 'a.md', '--kanban-file', 'b.md', '--no-vector']);
  assert.equal(a.cmd, 'check');
  assert.equal(a.since.toISOString(), '2026-11-21T23:00:00.000Z');
  assert.equal(a.json, true);
  assert.deepEqual(a.kanbanFiles, ['a.md', 'b.md']);
  assert.equal(a.noVector, true);
  assert.deepEqual(parseArgs(['nincs-uj', '--kind', 'trap,kanban']).kinds, ['trap', 'kanban']);
  assert.throws(() => parseArgs(['nincs-uj', '--kind', 'trap,valami']), /--kind/);
  assert.throws(() => parseArgs(['ismeretlen']), /alparancs/);
});

test('validateYamlSubset: érvényes memória-alakok elfogadva', () => {
  const ok = [
    'a:\n  b: 1\n  c: "x: y" # megjegyzés\n  d: [a, "b", c]\n  e: {}\nlista:\n  - egy\n  - kulcs: ertek\n    masik: 2\nfelso:\n- x\n- y\n',
    'blokk: |\n  első: sor # nem megjegyzés\n    behúzott\n  "idézet\nkovetkezo: >-\n  hajtott\nvege: 1\n',
    "# csak megjegyzés\n---\nnev: 'O''Brien'\nures:\n",
  ];
  for (const y of ok) assert.deepEqual(validateYamlSubset(y), [], y);
  assert.deepEqual(validateYamlSubset(ok[0].replace(/\n/g, '\r\n')), [], 'CRLF is');
});

test('validateYamlSubset: hibák fájl-sorral', () => {
  const cases = [
    ['a:\n\tb: 1\n', /tabulátor/],
    ['a: 1\na: 2\n', /duplikált kulcs: a/],
    ['a: "nyitott\n', /idézőjel/],
    ['a: [1, 2\n', /zárójel/],
    ['a: 1\n   b: 2\n', /behúzás/],
    ['a:\n    b: 1\n  c: 2\n', /behúzás/],
    ['ez nem yaml sor\n', /nem értelmezhető/],
    ['a: b: c\n', /idézőjel nélküli/],
    ['lista:\n  - a\n  kulcs: 1\n', /keveredik/],
  ];
  for (const [y, re] of cases) {
    const errs = validateYamlSubset(y);
    assert.ok(errs.length > 0, `hibát vár: ${JSON.stringify(y)}`);
    assert.match(errs.map((e) => `${e.line}: ${e.msg}`).join('\n'), re, JSON.stringify(y));
    assert.ok(errs.every((e) => Number.isInteger(e.line) && e.line >= 1));
  }
});

test('findMarkers / hasFreshMarker: YAML és Markdown jelölő, fajtával; régi jelölő nem számít', () => {
  const t = `x: 1\n# zaro-hurok: 2026-11-22T10:00:00+01:00 nincs-uj\n<!-- zaro-hurok: 2026-11-20T10:00:00+01:00 nincs-uj -->\n# zaro-hurok: 2026-11-22T11:00:00+01:00 nincs-uj kanban\n`;
  const m = findMarkers(t);
  assert.equal(m.length, 3);
  assert.deepEqual(m[2].kinds, ['kanban']);
  const since = new Date(SINCE);
  assert.equal(hasFreshMarker(t, since), true);
  assert.equal(hasFreshMarker(t, since, 'kanban'), true);
  assert.equal(hasFreshMarker('<!-- zaro-hurok: 2026-11-20T10:00:00+01:00 nincs-uj -->', since), false);
  assert.equal(hasFreshMarker('# zaro-hurok: 2026-11-22T10:00:00+01:00 nincs-uj', since, 'kanban'), false, 'a sima jelölő nem kanban-jelölő');
  assert.equal(hasFreshMarker('# zaro-hurok: 2026-11-22T10:00:00+01:00 nincs-uj kanban', since), false, 'a kanban-jelölő nem a réteg jelölője');
});

test('tempTrapIds: az ideiglenes sorszám mintája, hamis találat nélkül', () => {
  assert.deepEqual(tempTrapIds('## C-ZH-1 — x\n- **C-ZH-2** és C-ADV2-10\n## C-75 — végleges\nCC BY-NC-SA 4.0\n'), ['C-ZH-1', 'C-ZH-2', 'C-ADV2-10']);
  assert.deepEqual(tempTrapIds('## C-01 — x\nBY-NC-SA 4.0, C-61, C-NN\n'), []);
});

// ---- check --------------------------------------------------------------------------------------------------------------

test('check: minden réteg friss, tiszta fa → ok (E2, E14 tartalom)', async () => {
  const root = makeRepo();
  const kf = freshUpdate(root);
  const res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), kanbanFiles: [kf], probeVector: NO_VECTOR });
  const fails = res.steps.filter((s) => s.status === 'FAIL');
  assert.deepEqual(fails, [], JSON.stringify(fails, null, 1));
  assert.equal(res.ok, true);
  assert.equal(res.branch, 'main');
  assert.equal(step(res, 'vektor').status, 'N/A');
  for (const id of ['csapda', 'csapda-sorszam', 'yaml', 'qmd', 'cogni', 'retro', 'kanban', 'skill', 'higienia', 'tiszta-fa']) assert.ok(step(res, id), id);
});

test('check: változatlan csapda és rétegek → FAIL; friss jelölő → PASS; régi jelölő → FAIL (E1, E2, E4)', async () => {
  const root = makeRepo();
  let res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), probeVector: NO_VECTOR });
  assert.equal(res.ok, false);
  for (const id of ['csapda', 'yaml', 'qmd', 'cogni', 'retro', 'kanban']) assert.equal(step(res, id).status, 'FAIL', id);
  assert.match(step(res, 'cogni').details.join('\n'), /decisions\.cogni\.yaml/);

  appendFileSync(join(root, 'docs/agent-csapdak.md'), '<!-- zaro-hurok: 2026-11-20T09:00:00+01:00 nincs-uj -->\n');
  commitAt(root, AFTER, 'régi jelölő');
  res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), probeVector: NO_VECTOR });
  assert.equal(step(res, 'csapda').status, 'PASS', 'a hozzáfűzött sor bővülés');

  const root2 = makeRepo();
  writeNoNewMarkers({ repo: root2, kinds: ['trap', 'yaml', 'qmd', 'cogni', 'kanban'], now: new Date(AFTER) });
  appendFileSync(join(root2, 'docs/specs/2026-11-21-terv.md'), '- 2026-11-22: nincs új.\n');
  commitAt(root2, AFTER, 'jelölők');
  res = await runCheck({ claudeHome: HOME0, repo: root2, since: new Date(SINCE), probeVector: NO_VECTOR });
  assert.deepEqual(res.steps.filter((s) => s.status === 'FAIL'), []);
});

test('check: a jelölő csak friss ISO-val számít, ha a fájl nem változott (E2)', async () => {
  const root = makeRepo({ ...BASE_FILES, 'docs/agent-csapdak.md': `${BASE_FILES['docs/agent-csapdak.md']}<!-- zaro-hurok: 2026-11-20T09:00:00+01:00 nincs-uj -->\n` });
  const res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), probeVector: NO_VECTOR });
  assert.equal(step(res, 'csapda').status, 'FAIL');
});

test('check: ideiglenes csapdaszám a főágon FAIL, ágon INFO (E3)', async () => {
  const root = makeRepo();
  const kf = freshUpdate(root);
  appendFileSync(join(root, 'docs/agent-csapdak.md'), '\n## C-ZH-1 — ideiglenes\n- skill: `.agents/skills/websuli-zaro-hurok/SKILL.md`\n');
  commitAt(root, AFTER, 'ideiglenes szám');
  let res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), kanbanFiles: [kf], probeVector: NO_VECTOR });
  assert.equal(step(res, 'csapda-sorszam').status, 'FAIL');
  assert.match(step(res, 'csapda-sorszam').details.join(' '), /C-ZH-1/);
  assert.equal(res.ok, false);
  git(root, ['switch', '-q', '-c', 'feat/proba']);
  res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), kanbanFiles: [kf], probeVector: NO_VECTOR });
  assert.equal(step(res, 'csapda-sorszam').status, 'INFO');
  assert.equal(res.ok, true);
});

test('check: érvénytelen YAML és maradék TODO → FAIL fájl-sorral (E5, E6)', async () => {
  const root = makeRepo();
  const kf = freshUpdate(root);
  appendFileSync(join(root, 'memory/.cogni/modules.cogni.yaml'), '  modules: []\n');
  appendFileSync(join(root, 'memory/manifest.yaml'), 'runtime: ""   # TODO a megjegyzésben megengedett\nlanguage: TODO\n');
  appendFileSync(join(root, 'memory/index.qmd'), '| TODO | | |\n');
  commitAt(root, AFTER, 'hibás');
  const res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), kanbanFiles: [kf], probeVector: NO_VECTOR });
  assert.equal(step(res, 'cogni').status, 'FAIL');
  assert.match(step(res, 'cogni').details.join('\n'), /modules\.cogni\.yaml:\d+: duplikált kulcs: modules/);
  assert.equal(step(res, 'yaml').status, 'FAIL');
  const yd = step(res, 'yaml').details.join('\n');
  assert.match(yd, /manifest\.yaml:\d+: TODO/);
  assert.equal((yd.match(/TODO/g) || []).length, 1, 'a megjegyzésben álló TODO nem számít');
  assert.equal(step(res, 'qmd').status, 'FAIL');
});

test('check: retró — handoff-retró vagy állapotnapló-bővülés kell; a napló előtti sor nem számít (E7)', async () => {
  const root = makeRepo();
  const p = join(root, 'docs/specs/2026-11-21-terv.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('Valami.\n', 'Valami.\nÚj cél-sor.\n'));
  commitAt(root, AFTER, 'cél bővül');
  let res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), probeVector: NO_VECTOR });
  assert.equal(step(res, 'retro').status, 'FAIL');
  write(root, { 'docs/handoffs/2026-11-22-proba-retro.md': '# Retró\n- mért tény\n' });
  commitAt(root, AFTER, 'retró');
  res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), probeVector: NO_VECTOR });
  assert.equal(step(res, 'retro').status, 'PASS');
});

test('check: kanban — alapból a Claude Code tapasztalat-kanbanja; --kanban-file felülírja; nincs-uj kanban jelölő (E8)', async () => {
  const root = makeRepo();
  const home = mkdtempSync(join(tmpdir(), 'zaro-hurok-home-'));
  const old = new Date('2026-11-20T10:00:00+01:00');
  const fresh = new Date(AFTER);
  // A Hermes-tábla friss mtime-ja NEM teljesíti a lépést (tulajdonosi döntés 2026-11-22: a kanban a Claude Code környezetében van).
  const db = join(root, '.hermes', 'kanban.db');
  mkdirSync(dirname(db), { recursive: true });
  writeFileSync(db, 'x');
  utimesSync(db, fresh, fresh);
  let res = await runCheck({ claudeHome: home, repo: root, since: new Date(SINCE), probeVector: NO_VECTOR });
  assert.equal(step(res, 'kanban').status, 'FAIL');
  assert.match(step(res, 'kanban').details.join(' '), /tapasztalat-kanban\.md: nincs/);
  const kf = defaultKanbanFile(root, home);
  assert.ok(kf.startsWith(join(home, 'projects')), kf);
  mkdirSync(dirname(kf), { recursive: true });
  writeFileSync(kf, '# tapasztalat-kanban\n');
  utimesSync(kf, old, old);
  res = await runCheck({ claudeHome: home, repo: root, since: new Date(SINCE), probeVector: NO_VECTOR });
  assert.equal(step(res, 'kanban').status, 'FAIL', 'régi alap-kanban');
  utimesSync(kf, fresh, fresh);
  res = await runCheck({ claudeHome: home, repo: root, since: new Date(SINCE), probeVector: NO_VECTOR });
  assert.equal(step(res, 'kanban').status, 'PASS', 'friss alap-kanban');
  const other = join(root, '..', 'regi-kanban.md');
  writeFileSync(other, 'x');
  utimesSync(other, old, old);
  res = await runCheck({ claudeHome: home, repo: root, since: new Date(SINCE), kanbanFiles: [other], probeVector: NO_VECTOR });
  assert.equal(step(res, 'kanban').status, 'FAIL', 'a --kanban-file felülírja az alapot');
  appendFileSync(join(root, 'memory/manifest.yaml'), '# zaro-hurok: 2026-11-22T12:00:00+01:00 nincs-uj kanban\n');
  res = await runCheck({ claudeHome: home, repo: root, since: new Date(SINCE), kanbanFiles: [other], probeVector: NO_VECTOR });
  assert.equal(step(res, 'kanban').status, 'PASS');
});

test('claudeProjectName: a Claude Code projektmappa-neve a repó útvonalából', () => {
  if (process.platform === 'win32') {
    assert.equal(claudeProjectName('D:\\repo\\WEBSULI'), 'D--repo-WEBSULI');
    assert.equal(claudeProjectName('D:/repo/WEBSULI/'), 'D--repo-WEBSULI');
  } else {
    assert.equal(claudeProjectName('/home/u/repo/WEBSULI'), '-home-u-repo-WEBSULI');
  }
});

test('check: skill — sérült tükör, illetve skill-hivatkozás nélküli új csapda → FAIL (E9)', async () => {
  const skill = '---\nname: proba\ndescription: Mikor: teszt.\n---\n\n# Próba\n';
  const root = makeRepo({
    ...BASE_FILES,
    'scripts/qa/gates/gates.config.json': '{ "mirroredSkills": ["proba"] }\n',
    '.agents/skills/proba/SKILL.md': skill,
    '.claude/skills/proba/SKILL.md': skill,
  });
  const kf = freshUpdate(root);
  let res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), kanbanFiles: [kf], probeVector: NO_VECTOR });
  assert.equal(step(res, 'skill').status, 'PASS', JSON.stringify(step(res, 'skill')));
  appendFileSync(join(root, '.claude/skills/proba/SKILL.md'), 'eltérés\n');
  appendFileSync(join(root, 'docs/agent-csapdak.md'), '\n## C-03 — hivatkozás nélkül\n- szabály: valami\n');
  commitAt(root, AFTER, 'rossz');
  res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), kanbanFiles: [kf], probeVector: NO_VECTOR });
  assert.equal(step(res, 'skill').status, 'FAIL');
  const d = step(res, 'skill').details.join('\n');
  assert.match(d, /eltér a tükör/);
  assert.match(d, /C-03/);
  assert.doesNotMatch(d, /C-02/, 'a nincs-skill sorral bíró bejegyzés rendben');
});

test('check: piszkos fa → FAIL; vektor-próba elérhető → INFO, nem buktat (E12, E13)', async () => {
  const root = makeRepo();
  const kf = freshUpdate(root);
  writeFileSync(join(root, 'szemet.txt'), 'x');
  const res = await runCheck({ claudeHome: HOME0, repo: root, since: new Date(SINCE), kanbanFiles: [kf], probeVector: async () => true });
  assert.equal(step(res, 'tiszta-fa').status, 'FAIL');
  assert.match(step(res, 'tiszta-fa').details.join(' '), /szemet\.txt/);
  assert.equal(step(res, 'vektor').status, 'INFO');
});

// ---- nincs-uj -----------------------------------------------------------------------------------------------------------

test('nincs-uj: fajtánként egy jelölő, a régi cserélődik (E15)', () => {
  const root = makeRepo();
  writeNoNewMarkers({ repo: root, kinds: ['yaml', 'kanban', 'trap'], now: new Date('2026-11-22T08:00:00+01:00') });
  writeNoNewMarkers({ repo: root, kinds: ['yaml', 'kanban', 'trap'], now: new Date('2026-11-22T09:00:00+01:00') });
  const man = readFileSync(join(root, 'memory/manifest.yaml'), 'utf8');
  assert.equal(findMarkers(man).length, 2);
  assert.match(man, /# zaro-hurok: 2026-11-22T09:00:00\+01:00 nincs-uj\n/);
  assert.match(man, /# zaro-hurok: 2026-11-22T09:00:00\+01:00 nincs-uj kanban\n/);
  assert.doesNotMatch(man, /08:00:00/);
  assert.deepEqual(validateYamlSubset(man), []);
  const trap = readFileSync(join(root, 'docs/agent-csapdak.md'), 'utf8');
  assert.match(trap, /<!-- zaro-hurok: 2026-11-22T09:00:00\+01:00 nincs-uj -->\n$/);
  assert.equal(findMarkers(trap).length, 1);
});

// ---- hygiene ------------------------------------------------------------------------------------------------------------

function hygieneRepo() {
  const root = makeRepo();
  const mk = (name, merge) => {
    git(root, ['switch', '-q', '-c', name]);
    write(root, { [`${name.replace(/\//g, '-')}.txt`]: name });
    commitAt(root, AFTER, name);
    git(root, ['switch', '-q', 'main']);
    if (merge) git(root, ['merge', '-q', '--no-ff', '-m', `merge ${name}`, name], { GIT_AUTHOR_DATE: AFTER, GIT_COMMITTER_DATE: AFTER });
  };
  mk('kesz', true);
  mk('nyitott', false);
  mk('kesz-wt', true);
  mk('nyitott-wt', false);
  mk('piszkos-wt', true);
  const wts = resolve(root, '..', `${root.split(/[\\/]/).pop()}-wt`);
  mkdirSync(wts, { recursive: true });
  for (const b of ['kesz-wt', 'nyitott-wt', 'piszkos-wt']) git(root, ['worktree', 'add', '-q', join(wts, b), b]);
  writeFileSync(join(wts, 'piszkos-wt', 'commitolatlan.txt'), 'munka');
  return { root, wts };
}

const branches = (root) => git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').sort();

test('hygiene: --apply nélkül semmi nem változik, csak riport (E10)', () => {
  const { root, wts } = hygieneRepo();
  const before = { b: branches(root), w: git(root, ['worktree', 'list', '--porcelain']) };
  const plan = planHygiene({ repo: root });
  assert.deepEqual(plan.branches.remove.sort(), ['kesz']);
  assert.deepEqual(plan.worktrees.remove.map((w) => w.branch), ['kesz-wt']);
  const keep = Object.fromEntries(plan.worktrees.keep.map((w) => [w.branch, w.reason]));
  assert.match(keep['nyitott-wt'], /nem beolvasztott/);
  assert.match(keep['piszkos-wt'], /commitolatlan/);
  assert.ok(plan.branches.keep.some((b) => b.name === 'nyitott' && /nem beolvasztott/.test(b.reason)));
  assert.ok(!plan.branches.remove.includes('main'));
  assert.deepEqual({ b: branches(root), w: git(root, ['worktree', 'list', '--porcelain']) }, before);
  assert.ok(existsSync(join(wts, 'kesz-wt')));
});

test('hygiene --apply: csak a beolvasztott ág és a lezárt munkafa megy; a nem beolvasztott és a piszkos marad (E11)', () => {
  const { root, wts } = hygieneRepo();
  const res = applyHygiene({ repo: root, plan: planHygiene({ repo: root }) });
  assert.deepEqual(res.errors, []);
  const b = branches(root);
  assert.ok(!b.includes('kesz'));
  assert.ok(!b.includes('kesz-wt'));
  for (const keep of ['main', 'nyitott', 'nyitott-wt', 'piszkos-wt']) assert.ok(b.includes(keep), keep);
  assert.ok(!existsSync(join(wts, 'kesz-wt')));
  assert.ok(existsSync(join(wts, 'nyitott-wt')));
  assert.ok(existsSync(join(wts, 'piszkos-wt', 'commitolatlan.txt')));
});

test('hygiene: munkafából futtatva a fő munkakönyvtár és az aktuális munkafa érintetlen', () => {
  const { root, wts } = hygieneRepo();
  git(join(wts, 'kesz-wt'), ['status']);
  const plan = planHygiene({ repo: join(wts, 'kesz-wt') });
  assert.ok(!plan.worktrees.remove.some((w) => w.branch === 'kesz-wt'), 'az aktuális munkafa nem távolítható');
  assert.ok(!plan.worktrees.remove.some((w) => resolve(w.path).toLowerCase() === resolve(root).toLowerCase()));
  assert.ok(!plan.branches.remove.includes('kesz-wt'));
});

// ---- CLI ----------------------------------------------------------------------------------------------------------------

test('CLI: --json egy JSON-objektum, exit 0 / 1; hibás argumentum exit 2 (E14)', () => {
  const root = makeRepo();
  const kf = freshUpdate(root);
  const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: HOME0 } });
  let r = run(['check', '--since', SINCE, '--json', '--no-vector', '--kanban-file', kf]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  let out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.since, new Date(SINCE).toISOString());
  writeFileSync(join(root, 'szemet.txt'), 'x');
  r = run(['check', '--since', SINCE, '--json', '--no-vector', '--kanban-file', kf]);
  assert.equal(r.status, 1);
  out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  r = run(['check', '--since', 'nem-datum']);
  assert.equal(r.status, 2);
  r = run(['hygiene', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Array.isArray(JSON.parse(r.stdout).branches.remove));
});

// ---- a valódi repó rétegei -----------------------------------------------------------------------------------------------

test('a WEBSULI valódi memória-rétegei: érvényes YAML, nincs TODO (E16)', () => {
  const repo = resolve(HERE, '..', '..');
  const files = ['memory/manifest.yaml', ...['project', 'modules', 'decisions', 'schema'].map((k) => `memory/.cogni/${k}.cogni.yaml`)];
  for (const f of files) {
    const text = readFileSync(join(repo, f), 'utf8');
    assert.deepEqual(validateYamlSubset(text), [], f);
    const body = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
    assert.doesNotMatch(body, /\bTODO\b/, f);
  }
  assert.doesNotMatch(readFileSync(join(repo, 'memory/index.qmd'), 'utf8'), /\bTODO\b/);
});

// ---- konvergencia (vak körök gépi megállási szabálya) ---------------------------------------------------------------------

const ev = (head, verdict, blok, koz = 0, extra = {}) => ({
  kind: 'blind-review', head, verdict, complete: true,
  findings: { counts: { 'blokkoló': { total: blok }, 'közepes': { total: koz } } }, ...extra,
});

test('decideConvergence: <2 kör, IGEN, szigorú csökkenés → indulhat; nem csökken / 3 NEM → tilos', () => {
  const R = (verdict, blokkolo) => ({ head: 'x', verdict, blokkolo, kozepes: 0 });
  assert.equal(decideConvergence([]).code, 0);
  assert.equal(decideConvergence([R('NEM', 5)]).code, 0);
  assert.equal(decideConvergence([R('NEM', 5), R('IGEN', 0)]).code, 0);
  assert.equal(decideConvergence([R('NEM', 5), R('NEM', 3)]).code, 0);
  let d = decideConvergence([R('NEM', 3), R('NEM', 3)]);
  assert.equal(d.code, 1);
  assert.match(d.message, /nem csökkent szigorúan \(3 → 3\)/);
  d = decideConvergence([R('NEM', 5), R('NEM', 4), R('NEM', 2)]);
  assert.equal(d.code, 1);
  assert.match(d.message, /3 egymást követő NEM/);
  assert.equal(decideConvergence([R('NEM', 5), R('IGEN, FELTÉTELLEL', 0), R('NEM', 2), R('NEM', 1)]).code, 0, 'a NEM-sorozat az IGEN-nél megszakad');
  assert.equal(decideConvergence([R('NEM', 4), null, R('NEM', 4)]).code, 1, 'a hiányzó kör kimarad');
});

test('roundFromReport: az ítélet és a leletszámok a jelentésből', () => {
  const r = roundFromReport('# Jelentés\n\n## Ítélet: NEM\n\nleletek: blokkoló 2, közepes 7\n', 'j1.md');
  assert.deepEqual(r, { head: 'j1.md', verdict: 'NEM', blokkolo: 2, kozepes: 7 });
  const t = roundFromReport('## Ítélet: IGEN\n\n| fokozat | db |\n|---|---|\n| blokkoló | 0 |\n| közepes | 1 |\n', 'j2.md');
  assert.equal(t.blokkolo, 0);
  assert.equal(t.kozepes, 1);
});

test('collectRounds: egy ág fejeinek sorrendjében a bizonyítékokból; a befejezetlen kimarad', () => {
  const root = makeRepo();
  git(root, ['switch', '-q', '-c', 'feat/kor']);
  const heads = [];
  for (let i = 0; i < 3; i += 1) { write(root, { [`k${i}.txt`]: String(i) }); commitAt(root, AFTER, `kör ${i}`); heads.push(git(root, ['rev-parse', 'HEAD'])); }
  const evDir = mkdtempSync(join(tmpdir(), 'zh-ev-'));
  writeFileSync(join(evDir, `blind-review-${heads[0]}.json`), JSON.stringify(ev(heads[0], 'NEM', 4)));
  writeFileSync(join(evDir, `blind-review-${heads[1]}.json`), JSON.stringify(ev(heads[1], 'NEM', 9, 0, { complete: false })));
  writeFileSync(join(evDir, `blind-review-${heads[2]}.json`), JSON.stringify(ev(heads[2], 'NEM', 4)));
  const rounds = collectRounds({ repo: root, branch: 'feat/kor', evidenceDir: evDir });
  assert.deepEqual(rounds.map((r) => [r.head, r.blokkolo]), [[heads[0].slice(0, 8), 4], [heads[2].slice(0, 8), 4]]);
  assert.equal(decideConvergence(rounds).code, 1);
  const explicit = collectRounds({ repo: root, heads: [heads[2], heads[0]], evidenceDir: evDir });
  assert.deepEqual(explicit.map((r) => r.head), [heads[2].slice(0, 8), heads[0].slice(0, 8)]);

  const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: HOME0 } });
  let r = run(['konvergencia', '--evidence', evDir, '--json']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).code, 1);
  writeFileSync(join(evDir, `blind-review-${heads[2]}.json`), JSON.stringify(ev(heads[2], 'NEM', 1)));
  r = run(['konvergencia', '--evidence', evDir]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /INDULHAT/);
  r = run(['konvergencia', '--heads', '', '--evidence', evDir]);
  assert.equal(r.status, 2);
});

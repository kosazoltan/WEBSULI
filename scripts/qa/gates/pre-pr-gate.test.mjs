// docs/specs/2026-11-17-minosegkapuk.md E7, E8, D11: a PR előtti kapu felismerése és ellenőrzései.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS, createGate, loadConfig } from './lib.mjs';
import { cheapSteps } from './pre-push-gate.mjs';
import { CHEAP_PR_STEPS, checkPrBody, cheapPhase, classifyChanges, e2eArgs, pickE2eSpecs, wrapperConfigSource, WRAPPER_CONFIG } from './pre-pr-gate.mjs';

const cfg = loadConfig();
const SPECS = ['coupon-expired-all-games.spec.ts', 'game-meta-quality.spec.ts', 'game-mobile-quality.spec.ts', 'tornado-j7a.spec.ts',
  'tornado-hunter-render.spec.ts', 'speed-math-play.spec.ts', 'speed-math-boss.spec.ts', 'studio-ui.spec.ts', 'websuli.spec.ts'];
const SPEC_TEXT = { 'studio-ui.spec.ts': 'await page.getByTestId("StudioPanel")' };
const pick = (changed) => pickE2eSpecs({ classification: classifyChanges(changed, cfg), specFiles: SPECS, readSpec: (s) => SPEC_TEXT[s] ?? '', cfg, changed });

test('classifyChanges: játék, közös játékmotor, UI, DB', () => {
  assert.deepEqual(classifyChanges(['source/client/src/pages/TornadoHunter200.tsx'], cfg), { games: ['tornado-hunter-200'], allGames: false, ui: true, db: false });
  assert.equal(classifyChanges(['source/client/src/game-engine/play/questionUi.ts'], cfg).allGames, true);
  assert.equal(classifyChanges(['source/shared/schema.ts'], cfg).db, true);
  assert.equal(classifyChanges(['source/migrations/0099_x.sql'], cfg).db, true);
  assert.deepEqual(classifyChanges(['docs/a.md', 'scripts/qa/x.mjs'], cfg), { games: [], allGames: false, ui: false, db: false });
});

// Tulajdonosi döntés 2026-11-19 („Csak az érintett játék tesztjei”, docs/specs/2026-11-19-gate-pr-celzott-e2e.md): a meta-mérő és a
// lejárt kupon egy játék javításánál a CI-ra marad — dokumentált spec-változás, ezért módosul az elvárás.
test('pickE2eSpecs: egy játék → CSAK a mobil mérő a játékra szűrve + a játék saját spec-jei; a meta-mérő és a lejárt kupon a CI-ra', () => {
  const { runs, leftToCi } = pick(['source/client/src/lib/tornado/upgrades.ts']);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0], { label: 'mobil mérő (tornado-hunter-200)', specs: ['game-mobile-quality.spec.ts'], grep: 'tornado-hunter-200' });
  assert.deepEqual(runs[1].specs, ['tornado-hunter-render.spec.ts', 'tornado-j7a.spec.ts']);
  assert.deepEqual(leftToCi, ['coupon-expired-all-games.spec.ts', 'game-meta-quality.spec.ts', 'speed-math-boss.spec.ts', 'speed-math-play.spec.ts', 'studio-ui.spec.ts', 'websuli.spec.ts']);
});

test('pickE2eSpecs: a spec-lista és a mérő-szűrő a gameE2e TÁBLÁBÓL jön (nem a fájlnév-mintából)', () => {
  const cfg2 = { ...cfg, gameE2e: { ...cfg.gameE2e, 'tornado-hunter-200': { specs: ['tornado-j7a.spec.ts'], meterGrep: 'Tornado Hunter' } } };
  const changed = ['source/client/src/lib/tornado/upgrades.ts'];
  const { runs } = pickE2eSpecs({ classification: classifyChanges(changed, cfg2), specFiles: SPECS, readSpec: () => '', cfg: cfg2, changed });
  assert.deepEqual([runs[0].grep, runs[1].specs], ['Tornado Hunter', ['tornado-j7a.spec.ts']]);
});

test('pickE2eSpecs: két játék → mindkettő saját köre, a mérő-szűrő |-vel; saját spec nélküli játék → csak a mérő', () => {
  const two = pick(['source/client/src/lib/tornado/upgrades.ts', 'source/client/src/lib/speedMath/boss.ts']);
  assert.equal(two.runs[0].grep, 'speed-quiz-math|tornado-hunter-200');
  assert.deepEqual(two.runs[1].specs, ['speed-math-boss.spec.ts', 'speed-math-play.spec.ts', 'tornado-hunter-render.spec.ts', 'tornado-j7a.spec.ts']);
  const space = pick(['source/client/src/lib/spaceAsteroid/rocks.ts']);
  assert.deepEqual(space.runs, [{ label: 'mobil mérő (space-asteroid-quiz)', specs: ['game-mobile-quality.spec.ts'], grep: 'space-asteroid-quiz' }]);
});

test('pickE2eSpecs: közös / ismeretlen játékfájl → teljes helyi játék-kör (fail-safe)', () => {
  const full = (changed) => { const { runs } = pick(changed); return runs.length === 2 && runs[0].grep === undefined && runs[1].specs.includes('game-meta-quality.spec.ts') && runs[1].specs.includes('speed-math-play.spec.ts') && runs[1].specs.includes('tornado-j7a.spec.ts'); };
  assert.ok(full(['source/client/src/lib/audioEngine.ts']), 'hangmotor');
  assert.ok(full(['source/tests/game-mobile-quality.spec.ts']), 'mérő spec');
  assert.ok(full(['source/tests/helpers/gameDriver.ts']), 'tesztsegéd');
  assert.ok(full(['source/client/src/lib/tornado-word-ladder-bridge.ts']), 'több játékra illő fájl');
  assert.ok(full(['source/tests/tornado-uj-meres.spec.ts']), 'a táblában nem szereplő játék-spec (ismeretlen)');
  assert.ok(full(['source/client/src/lib/tornado/upgrades.ts', 'source/client/src/game-engine/play/clock.ts']), 'játék + közös');
  assert.equal(classifyChanges(['source/client/src/lib/audioEngine.ts'], cfg).allGames, true);
});

test('gameE2e őr: minden, a games mintára illő valódi spec pontosan egy játéknál; minden felsorolt spec létezik; minden játéknak van sora', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'source', 'tests');
  const real = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));
  const listed = Object.entries(cfg.gameE2e).flatMap(([id, g]) => g.specs.map((s) => [id, s]));
  assert.deepEqual(Object.keys(cfg.gameE2e).sort(), Object.keys(cfg.games).sort());
  for (const [id, s] of listed) assert.ok(real.includes(s), `${id}: a ${s} nem létezik`);
  const shared = new Set((cfg.sharedGameFiles ?? []).map((p) => p.replace(/^source\/tests\//, '')));
  for (const s of real) {
    const owners = Object.entries(cfg.games).filter(([, re]) => new RegExp(re, 'i').test(s)).map(([id]) => id);
    if (!owners.length || shared.has(s)) continue;
    const inTable = listed.filter(([, x]) => x === s).map(([id]) => id);
    assert.equal(inTable.length, 1, `${s}: pontosan egy játék gameE2e-sorában kell szerepelnie (most: ${inTable.join(', ') || 'egyikben sem'})`);
    assert.ok(owners.includes(inTable[0]), `${s}: a ${inTable[0]} sorában van, de a neve más játék mintájára illik (${owners.join(', ')})`);
  }
});

test('pickE2eSpecs: közös játékmotor → minden játék, szűrés nélkül', () => {
  const { runs } = pick(['source/client/src/game-engine/play/questionDirector.ts']);
  assert.equal(runs[0].grep, undefined);
  assert.ok(runs[1].specs.includes('speed-math-play.spec.ts') && runs[1].specs.includes('tornado-j7a.spec.ts'));
});

test('pickE2eSpecs: nem játék UI → a komponenst említő spec; ha egy sem, figyelmeztetés', () => {
  assert.deepEqual(pick(['source/client/src/components/StudioPanel.tsx']).runs[0].specs, ['studio-ui.spec.ts']);
  const none = pick(['source/client/src/components/SemmiNemEmliti.tsx']);
  assert.equal(none.runs.length, 0);
  assert.match(none.warning, /egyetlen spec sem említi/);
  assert.deepEqual(pick(['docs/a.md']).runs, []);
});

test('checkPrBody: elfogadási lista, futtatott ellenőrzések, nem futtatott + ok', () => {
  const good = '## Elfogadás\n- [x] E1\n## Futtatott ellenőrzések\n`npm test` PASS\n## Nem futtatott\n- nincs';
  assert.deepEqual(checkPrBody(good), []);
  assert.equal(checkPrBody('## Mi ez\nszöveg').length, 3);
  assert.equal(checkPrBody('Elfogadás nélküli lista\n- [x] a\nEllenőrzések: ok').length, 1);
});

test('a csomagoló konfig szoftveres WebGL-lel, egy workerrel, .only-tiltással; a parancs saját konfiggal és workers=1-gyel fut', () => {
  const src = wrapperConfigSource();
  assert.match(src, /--use-angle=swiftshader/);
  assert.match(src, /--enable-unsafe-swiftshader/);
  assert.match(src, /workers: 1/);
  assert.match(src, /forbidOnly: true/);
  assert.match(src, /from '\.\/playwright\.config\.ts'/);
  assert.match(WRAPPER_CONFIG, /\.local\.mts$/, 'a .gitignore *.local.mts mintája fedi');
  assert.deepEqual(e2eArgs({ specs: ['a.spec.ts'], grep: 'x|y' }), ['--import', 'tsx', 'scripts/run-e2e-tests.ts', '--config', WRAPPER_CONFIG, '--workers=1', '--grep', 'x|y', 'tests/a.spec.ts']);
});

test('fail-fast: az olcsó lépések sorrendje rögzített, és az első bukás után a drága fázis nem indul', async () => {
  assert.deepEqual(CHEAP_PR_STEPS, ['PR-leírás sablon', 'független ellenőr ítélete a fejre', 'külső (Gemini) ellenőr — második vélemény', 'tiszta munkafa', 'git fetch', 'háromfázisú rend', 'PR-méret']);
  // a push-kapu olcsó lépései pontosan ebben a sorrendben (a PR-kapu ezeket fűzi az ítélet után)
  const names = cheapSteps({ exec: () => ({}), git: {}, root: '.', base: 'origin/main', node: 'node' }).map(([n]) => n);
  assert.equal(names.length, CHEAP_PR_STEPS.length - 3);
  names.forEach((n, i) => assert.ok(n.startsWith(CHEAP_PR_STEPS[i + 3]), `${i}: ${n}`));
  const ran = [];
  const mk = (name, status) => [name, () => { ran.push(name); return { status }; }];
  const gate = createGate('t', { log: () => {} });
  const stopped = await cheapPhase(gate, [mk('a', STATUS.PASS), mk('b', STATUS.WARN), mk('c', STATUS.FAIL), mk('d', STATUS.PASS)]);
  assert.deepEqual([stopped, ran], [true, ['a', 'b', 'c']]);
  const gate2 = createGate('t', { log: () => {} });
  ran.length = 0;
  assert.equal(await cheapPhase(gate2, [mk('a', STATUS.PASS), mk('b', STATUS.SKIP)]), false);
  assert.deepEqual(ran, ['a', 'b']);
});

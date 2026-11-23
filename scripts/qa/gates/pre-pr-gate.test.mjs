// docs/specs/2026-11-17-minosegkapuk.md E7, E8, D11: a PR előtti kapu felismerése és ellenőrzései.
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './lib.mjs';
import { checkPrBody, classifyChanges, e2eArgs, mentionsStem, pickE2eSpecs, prePushOrReuse, wrapperConfigSource, WRAPPER_CONFIG } from './pre-pr-gate.mjs';

const cfg = loadConfig();
const SPECS = ['coupon-expired-all-games.spec.ts', 'game-meta-quality.spec.ts', 'game-mobile-quality.spec.ts', 'tornado-j7a.spec.ts',
  'tornado-hunter-render.spec.ts', 'speed-math-play.spec.ts', 'studio-ui.spec.ts', 'websuli.spec.ts'];
const SPEC_TEXT = { 'studio-ui.spec.ts': 'await page.getByTestId("StudioPanel")' };
const pick = (changed) => pickE2eSpecs({ classification: classifyChanges(changed, cfg), specFiles: SPECS, readSpec: (s) => SPEC_TEXT[s] ?? '', cfg, changed });

test('classifyChanges: játék, közös játékmotor, UI, DB', () => {
  assert.deepEqual(classifyChanges(['source/client/src/pages/TornadoHunter200.tsx'], cfg), { games: ['tornado-hunter-200'], allGames: false, ui: true, db: false });
  assert.equal(classifyChanges(['source/client/src/game-engine/play/questionUi.ts'], cfg).allGames, true);
  assert.equal(classifyChanges(['source/shared/schema.ts'], cfg).db, true);
  assert.equal(classifyChanges(['source/migrations/0099_x.sql'], cfg).db, true);
  assert.deepEqual(classifyChanges(['docs/a.md', 'scripts/qa/x.mjs'], cfg), { games: [], allGames: false, ui: false, db: false });
});

test('pickE2eSpecs: játékszelet → mobil mérő a játékra szűrve + a játék spec-jei + meta-mérő + lejárt kupon', () => {
  const { runs } = pick(['source/client/src/lib/tornado/upgrades.ts']);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0], { label: 'mobil mérő (tornado-hunter-200)', specs: ['game-mobile-quality.spec.ts'], grep: 'tornado-hunter-200' });
  assert.deepEqual(runs[1].specs, ['coupon-expired-all-games.spec.ts', 'game-meta-quality.spec.ts', 'tornado-hunter-render.spec.ts', 'tornado-j7a.spec.ts']);
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

// Terv docs/specs/2026-11-23-aranyos-kapuk.md (A5): a PR-kapu nem ismétli a push-kaput ugyanarra a fejre.
test('prePushOrReuse: zöld push-bizonyíték ugyanerre a fejre → csak fetch + C-61; más fejre / bukott bizonyítéknál a teljes push-kapu', async () => {
  const { fakeCtx, statusOf } = await import('./_fake.mjs');
  const { writeEvidence } = await import('./lib.mjs');
  const head = 'f'.repeat(40);
  const reuse = fakeCtx({ changed: ['docs/a.md'] });
  writeEvidence(reuse.ctx.evDir, `pre-push-${head}`, { kind: 'pre-push', head, ok: true, at: '2026-11-23T10:00:00Z', steps: [] });
  await prePushOrReuse({ gate: reuse.gate, ctx: reuse.ctx, head });
  assert.equal(statusOf(reuse.gate, 'push-kapu lépései'), 'SKIP');
  assert.equal(statusOf(reuse.gate, 'git fetch'), 'PASS');
  assert.ok(reuse.gate.results.some((r) => r.name.includes('(C-61)')), 'a C-61 akkor is lefut');
  assert.equal(reuse.gate.results.some((r) => r.name.startsWith('tiszta munkafa')), false, 'a push-lépések nem ismétlődnek');

  const failed = fakeCtx({ changed: ['docs/a.md'] });
  writeEvidence(failed.ctx.evDir, `pre-push-${head}`, { kind: 'pre-push', head, ok: false, steps: [] });
  await prePushOrReuse({ gate: failed.gate, ctx: failed.ctx, head });
  assert.ok(failed.gate.results.some((r) => r.name.startsWith('tiszta munkafa')), 'bukott bizonyítéknál a teljes push-kapu fut');

  const other = fakeCtx({ changed: ['docs/a.md'] });
  writeEvidence(other.ctx.evDir, `pre-push-${'e'.repeat(40)}`, { kind: 'pre-push', head: 'e'.repeat(40), ok: true, steps: [] });
  await prePushOrReuse({ gate: other.gate, ctx: other.ctx, head });
  assert.ok(other.gate.results.some((r) => r.name.startsWith('tiszta munkafa')), 'más fejre szóló bizonyíték nem számít');
});

// Terv docs/specs/2026-11-23-kapu-spec-valasztas-szohatar.md (K1–K3)
test('mentionsStem: a tő csak önálló azonosítóként egyezik — az „async” nem említi a „sync” fájlt', () => {
  assert.equal(mentionsStem('test("x", async ({ page }) => { await page.goto("/"); });', 'sync'), false, 'részszó nem egyezik');
  assert.equal(mentionsStem('import { mergeState } from "../client/src/advent/sync";', 'sync'), true, 'útvonal vége');
  assert.equal(mentionsStem('// lásd sync.ts', 'sync'), true);
  assert.equal(mentionsStem('resync(); syncing; asyncFn', 'sync'), false, 'betű nem határ');
  assert.equal(mentionsStem('const sync_state = 1;', 'sync'), true, 'az aláhúzás elválasztó');
  assert.equal(mentionsStem('await page.getByTestId("StudioPanel")', 'StudioPanel'), true);
  assert.equal(mentionsStem('StudioPanelHeader', 'StudioPanel'), false);
  assert.equal(mentionsStem('a+b és a.b', 'a.b'), true, 'a különleges karakter szó szerint értendő');
  assert.equal(mentionsStem('axb', 'a.b'), false);
  assert.equal(mentionsStem('Sync', 'sync'), false, 'kis- és nagybetű megkülönböztetve');
  assert.equal(mentionsStem('<div aria-busy="true">', 'busy'), true, 'a kötőjel elválasztó: inkább több teszt fusson, mint hogy valós kimaradjon');
  assert.equal(mentionsStem('import "../client/src/advent/tap-guard";', 'tap-guard'), true);
  assert.equal(mentionsStem('double-tap-guard', 'tap-guard'), true);
  // 1. vak kör L2: a határ Unicode szerint betű / számjegy — az ékezetes betű és a nem ASCII számjegy sem elválasztó.
  assert.equal(mentionsStem('ésync', 'sync'), false);
  assert.equal(mentionsStem('sync７', 'sync'), false);
  assert.equal(mentionsStem('szinkron: sync.', 'sync'), true);
});

test('pickE2eSpecs: rövid tövű fájl (sync.ts) nem választ ki minden async-ot tartalmazó tesztet; a változott spec mindig fut', () => {
  const specs = ['a.spec.ts', 'b.spec.ts', 'advent-calendar.spec.ts', 'changed.spec.ts'];
  const text = { 'a.spec.ts': 'test("a", async () => {});', 'b.spec.ts': 'test("b", async () => {});',
    'advent-calendar.spec.ts': 'test("n", async () => {}); // a kliens advent/sync egyesítése', 'changed.spec.ts': 'test("c", async () => {});' };
  const changed = ['source/client/src/advent/sync.ts', 'source/tests/changed.spec.ts'];
  const { runs } = pickE2eSpecs({ classification: classifyChanges(changed, cfg), specFiles: specs, readSpec: (s) => text[s] ?? '', cfg, changed });
  assert.deepEqual(runs[0].specs, ['advent-calendar.spec.ts', 'changed.spec.ts']);
});

// 1. vak kör L1: a VALÓDI spec-szövegekkel — a csak képfájlnévben / próbaútvonalban említett modul tesztje nem maradhat ki.
test('pickE2eSpecs a valódi spec-eken: admin-tabs, home-views, curriculum-order módosítása beválogatja a saját próbáját; a sync.ts nem választ ki mindent', () => {
  const dir = new URL('../../../source/tests/', import.meta.url);
  const specFiles = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));
  const readSpec = (s) => readFileSync(new URL(s, dir), 'utf8');
  const pickReal = (changed) => (pickE2eSpecs({ classification: classifyChanges(changed, cfg), specFiles, readSpec, cfg, changed }).runs[0]?.specs ?? []);
  assert.ok(pickReal(['source/client/src/lib/admin-tabs.ts']).includes('admin-korszerusites.spec.ts'));
  assert.ok(pickReal(['source/client/src/lib/home-views.ts']).includes('home-views.spec.ts'));
  assert.ok(pickReal(['source/client/src/lib/curriculum-order.ts']).includes('curriculum-order.spec.ts'));
  const forSync = pickReal(['source/client/src/advent/sync.ts']);
  assert.ok(forSync.length < specFiles.length / 2, `a sync.ts ${forSync.length} / ${specFiles.length} tesztet választ`);
});

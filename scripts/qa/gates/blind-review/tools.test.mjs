// docs/specs/2026-11-18-vak-ellenor-deepseek.md — D3 (az eszközök védelme), B3–B6. Valódi, eldobható git-tárban, valódi futtatással.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CFG, makeRepo } from './_fixture.mjs';
import { TMP_DIR, cleanEnv, makeTools, planCommand, resolveInside, truncate } from './tools.mjs';

const repo = makeRepo({
  files: {
    'scripts/ok.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('env', () => { console.log('KULCS=' + (process.env.OPENROUTER_API_KEY ?? 'nincs') + ';DB=' + (process.env.DATABASE_URL ?? 'nincs') + ';NODE_ENV=' + process.env.NODE_ENV); assert.ok(true); });\n",
    'scripts/tool.mjs': 'console.log(1);\n',
    'source/shared/calc.ts': 'export function add(a: number, b: number): number { return a + b; }\nexport const LIMIT: number = 23;\n',
    'source/shared/user.ts': "import { add } from './calc';\nimport { LIMIT } from '@shared/calc';\nexport const total = (n: number): number => add(n, LIMIT);\n",
    'source/tests/calc.test.ts': 'export {};\n',
    'source/tests/db.integration.ts': 'export {};\n',
    'docs/a.md': 'első sor\nmásodik sor alma\nharmadik\n',
  },
});
const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'blind-outside-')));
writeFileSync(join(outside, 'titok.txt'), 'KULSO-TITOK');
symlinkSync(outside, join(repo.root, 'kifele'), 'junction');
mkdirSync(join(repo.root, TMP_DIR), { recursive: true });
after(() => { rmSync(join(repo.root, 'kifele'), { recursive: false, force: true }); repo.cleanup(); rmSync(outside, { recursive: true, force: true }); });

const SECRET_ENV = { ...process.env, OPENROUTER_API_KEY: 'NE-SZIVAROGJON-123456', DATABASE_URL: 'postgres://u:p@elesgep/db', GITHUB_TOKEN: 'x', NODE_OPTIONS: '--inspect' };
const tools = (extra = {}) => makeTools({ root: repo.root, base: repo.base, head: repo.head, cfg: CFG, env: SECRET_ENV, key: 'NE-SZIVAROGJON-123456', onReport: () => ({ ok: true }), ...extra });
const planCtx = { root: repo.root, node: process.execPath, cfg: CFG, nodeModulesReal: null, isTracked: (rel) => !rel.startsWith(TMP_DIR) && existsSync(join(repo.root, rel)) };

test('B3: útvonal-őr — a munkafán kívülre mutató útvonal minden alakja elutasítva', () => {
  for (const p of ['../x', 'docs/../../x', '/etc/passwd', 'C:\\Windows\\win.ini', 'C:/Windows/win.ini', 'c:titok', '\\\\gep\\megosztas\\x', '//gep/megosztas/x',
    '.git/config', 'docs/.git/x', '.env', 'source/.env.local', 'kifele/titok.txt', 'kifele', 'a\0b', '', '   ']) {
    assert.equal(resolveInside(repo.root, p).ok, false, `át kellett volna utasítani: ${JSON.stringify(p)}`);
  }
  // A lexikai őr (.. kijutás) a realpath-őrtől FÜGGETLENÜL is fog: saját hibaüzenete van.
  for (const p of ['../x', 'docs/../../x', 'a/b/../../../x']) assert.match(resolveInside(repo.root, p).error, /^az útvonal a munkafán kívülre mutat: /, p);
  assert.equal(resolveInside(repo.root, 'docs/a.md').ok, true);
  assert.equal(resolveInside(repo.root, 'docs\\a.md').rel, 'docs/a.md');
  assert.equal(resolveInside(repo.root, `${TMP_DIR}/uj.mjs`).ok, true, 'még nem létező fájl a munkafán belül megengedett');
  assert.equal(resolveInside(repo.root, '.env.example').ok, true);
});

test('B3: az olvasó eszközök a junctionön át sem olvasnak ki a munkafából; a .git és a kulcs nem jelenik meg', async () => {
  const t = tools();
  assert.match(await t.call('read_file', { path: 'kifele/titok.txt' }), /^HIBA: .*munkafán kívülre/);
  assert.match(await t.call('read_file', { path: '../../x' }), /^HIBA/);
  assert.match(await t.call('git_show', { ref: 'head', path: '../x' }), /^HIBA/);
  assert.match(await t.call('git_diff', { paths: ['/etc'] }), /^HIBA/);
  assert.match(await t.call('git_show', { ref: 'HEAD~1; rm -rf /' }), /^HIBA/);
  const ls = await t.call('list_dir', { path: '.' });
  assert.match(ls, /kifele\/ \(csatolás/);
  assert.doesNotMatch(ls, /^\.git\/?$/m);
  assert.match(await t.call('read_file', { path: 'docs/a.md', start_line: 2, end_line: 2 }), /2 {2}második sor alma/);
  assert.doesNotMatch(await t.call('read_file', { path: 'docs/a.md', start_line: 2, end_line: 2 }), /harmadik/);
  assert.match(await t.call('ismeretlen_eszkoz', {}), /^HIBA: ismeretlen eszköz/);
});

test('B4: engedélylista — tiltott parancsok futtatás nélkül elutasítva', async () => {
  const ran = [];
  const t = tools({ run: async (...a) => { ran.push(a); return { code: 0, stdout: '', stderr: '', ms: 1 }; } });
  for (const argv of [
    ['git', 'push'], ['git', 'status'], ['gh', 'pr', 'list'], ['curl', 'https://example.com'], ['rm', '-rf', '/'], ['cmd', '/c', 'dir'], ['powershell', '-c', 'x'], ['bash', '-c', 'x'],
    ['npm', 'install'], ['npm', 'run', 'build'], ['npm', 'run', 'check', '--', '--x'], ['npx', 'vite'], ['npx', 'tsx', 'scripts/tool.mjs'], ['npx', 'playwright', 'test', 'source/tests/a.spec.ts', '--workers=1'],
    ['node', 'scripts/tool.mjs'], ['node', 'scripts/ok.test.mjs'], ['node', '-e', 'process.exit(0)'], ['node', '--test', '--import', 'x', 'scripts/ok.test.mjs'], ['node', '--test', 'scripts/tool.mjs'],
    ['npx', 'tsx', '--test', 'source/tests/db.integration.ts'], ['npx', 'tsx', '--test', '../kint.test.ts'], ['npx', 'tsc'], ['npx', 'tsc', '--noEmit', '--outDir', 'x'],
    ['node', '--test', 'kifele/titok.txt'], 'node --test scripts/ok.test.mjs', [], ['node', '--test', 'scripts/ok.test.mjs', `${TMP_DIR}/x.mjs`],
  ]) {
    assert.match(await t.call('run_command', { argv }), /^ELUTASÍTVA/, JSON.stringify(argv));
  }
  assert.equal(ran.length, 0, 'elutasított parancs nem futhat');
  // Az elutasítás OKA is számít (ne a „nincs telepítve” ág fogja meg véletlenül): integrációs teszt és követett fájl teszt-kapcsoló nélkül.
  assert.match(planCommand(['npx', 'tsx', '--test', 'source/tests/db.integration.ts'], planCtx).error, /integrációs teszt és saját fájl nem/);
  assert.match(planCommand(['node', 'scripts/ok.test.mjs'], planCtx).error, /követett fájl csak tesztként futtatható/);
});

test('B4: megengedett parancsok terve — követett teszt a szokásos futtatóval, saját fájl CSAK homokozóban', () => {
  const tracked = planCommand(['node', '--test', 'scripts/ok.test.mjs'], planCtx);
  assert.equal(tracked.ok, true);
  assert.equal(tracked.sandboxed, false);
  assert.deepEqual(tracked.args.slice(0, 1), ['--test']);
  writeFileSync(join(repo.root, TMP_DIR, 'sajat.test.ts'), 'export {};\n');
  for (const argv of [['node', `${TMP_DIR}/sajat.test.ts`], ['node', '--test', `${TMP_DIR}/sajat.test.ts`], ['npx', 'tsx', '--test', `${TMP_DIR}/sajat.test.ts`]]) {
    const own = planCommand(argv, planCtx);
    assert.equal(own.ok, true, JSON.stringify(argv));
    assert.equal(own.sandboxed, true, 'a modell saját fájlja csak homokozóban futhat');
    assert.equal(own.args[0], '--permission');
    assert.ok(own.args.includes(`--allow-fs-write=${join(repo.root, TMP_DIR)}`));
    assert.ok(!own.args.includes('--allow-child-process') && !own.args.includes('--allow-net') && !own.args.includes('--allow-worker') && !own.args.includes('--allow-addons'));
  }
  assert.equal(planCommand(['npx', 'playwright', 'test', 'source/tests/a.spec.ts', '--workers=1'], { ...planCtx, cfg: { ...CFG, allowPlaywright: false } }).ok, false);
});

test('B5: tiszta környezet — kulcs, token, adatbázis-URL, NODE_OPTIONS nem öröklődik', () => {
  const env = cleanEnv(SECRET_ENV);
  for (const k of Object.keys(env)) assert.doesNotMatch(k, /KEY|TOKEN|SECRET|PASSWORD|DATABASE|NODE_OPTIONS/i, k);
  assert.equal(env.NODE_ENV, 'test');
  assert.ok(Object.keys(env).some((k) => k.toUpperCase() === 'PATH'));
  assert.ok(!JSON.stringify(env).includes('NE-SZIVAROGJON'));
});

test('B5: valódi gyerekfolyamat (követett teszt) környezetében nincs kulcs és adatbázis-URL', async () => {
  const outText = await tools().call('run_command', { argv: ['node', '--test', 'scripts/ok.test.mjs'] });
  assert.match(outText, /kilépési kód: 0/);
  assert.match(outText, /KULCS=nincs;DB=nincs;NODE_ENV=test/);
  assert.ok(!outText.includes('NE-SZIVAROGJON'));
});

test('B6: a modell saját fájlja valódi homokozóban fut — munkafán kívüli olvasás / írás, gyerekfolyamat, hálózat tiltva; a kulcs nem látszik', async () => {
  const t = tools();
  const probe = `import fs from 'node:fs';
import cp from 'node:child_process';
const res = {};
try { fs.readFileSync(${JSON.stringify(join(outside, 'titok.txt'))}, 'utf8'); res.readOutside = 'SIKERULT'; } catch (e) { res.readOutside = e.code; }
try { fs.writeFileSync(${JSON.stringify(join(repo.root, 'docs', 'iras.txt'))}, 'x'); res.writeTracked = 'SIKERULT'; } catch (e) { res.writeTracked = e.code; }
try { fs.writeFileSync(new URL('./ok.txt', import.meta.url), 'x'); res.writeTmp = 'ok'; } catch (e) { res.writeTmp = e.code; }
try { cp.execFileSync(process.execPath, ['-e', '1']); res.child = 'SIKERULT'; } catch (e) { res.child = e.code; }
try { await fetch('https://example.com'); res.net = 'SIKERULT'; } catch (e) { res.net = e.cause?.code ?? e.code ?? 'hiba'; }
res.key = process.env.OPENROUTER_API_KEY ?? 'nincs';
res.inside = fs.readFileSync(new URL('../docs/a.md', import.meta.url), 'utf8').includes('alma');
console.log('EREDMENY ' + JSON.stringify(res));
`;
  assert.match(await t.call('write_temp_file', { name: 'proba.mjs', content: probe }), /^megírva/);
  const outText = await t.call('run_command', { argv: ['node', `${TMP_DIR}/proba.mjs`] });
  const m = /EREDMENY (\{.*\})/.exec(outText);
  assert.ok(m, outText);
  const r = JSON.parse(m[1]);
  assert.deepEqual(r, { readOutside: 'ERR_ACCESS_DENIED', writeTracked: 'ERR_ACCESS_DENIED', writeTmp: 'ok', child: 'ERR_ACCESS_DENIED', net: 'ERR_ACCESS_DENIED', key: 'nincs', inside: true });
  assert.ok(!existsSync(join(repo.root, 'docs', 'iras.txt')));
  assert.equal(t.runLog.length, 1, 'a végrehajtott parancs a futtató naplójába kerül');
});

test('write_temp_file: csak fájlnév, csak az ideiglenes mappába; mappa / kijutás / tiltott kiterjesztés elutasítva', async () => {
  const t = tools();
  for (const name of ['../x.mjs', 'a/b.mjs', '..\\x.mjs', 'x.exe', 'x.sh', '.env', 'C:x.mjs', '/abs.mjs', 'x']) {
    assert.match(await t.call('write_temp_file', { name, content: 'x' }), /^HIBA/, name);
  }
  assert.match(await t.call('write_temp_file', { name: 'jo.test.mjs', content: 'x' }), /^megírva: \.blind-review-tmp\/jo\.test\.mjs/);
  assert.equal(readFileSync(join(repo.root, TMP_DIR, 'jo.test.mjs'), 'utf8'), 'x');
});

test('az eszköz-eredmény maszkolt, csonkolt, és a munkafa abszolút útvonala nem megy ki a modellnek', async () => {
  const t = tools({ run: async () => ({ code: 1, stdout: `hiba itt: ${repo.root}\\source\\x.ts kulcs NE-SZIVAROGJON-123456 ${'z'.repeat(40_000)}`, stderr: `${repo.root.replace(/\\/g, '/')}/y`, ms: 5, timedOut: false }) });
  const outText = await t.call('run_command', { argv: ['node', '--test', 'scripts/ok.test.mjs'] });
  assert.ok(!outText.includes('NE-SZIVAROGJON'));
  assert.ok(!outText.includes(repo.root) && !outText.includes(repo.root.replace(/\\/g, '/')), 'a gépfüggő útvonal (felhasználónévvel) nem mehet ki');
  assert.match(outText, /<munkafa>/);
  assert.ok(outText.length <= CFG.toolOutputMaxChars + 200);
  assert.match(truncate('a'.repeat(100), 50), /csonkolva: 50 karakter/);
});

test('a homokozó TypeScript-betöltője: saját .ts ellenpróba importálja a vizsgált modult (álnév és kiterjesztés nélküli import)', async (tc) => {
  const nm = join(repo.root, 'source', 'node_modules');
  const real = join(import.meta.dirname, '..', '..', '..', '..', 'source', 'node_modules');
  if (!existsSync(join(real, 'typescript'))) { tc.skip('nincs telepített typescript ebben a checkoutban (source/node_modules)'); return; }
  symlinkSync(realpathSync.native(real), nm, 'junction');
  try {
    const t = tools({ nodeModulesReal: realpathSync.native(real) });
    await t.call('write_temp_file', { name: 'ts-proba.test.ts', content: "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { total } from '../source/shared/user';\nimport { LIMIT } from '@shared/calc';\ntest('ts', () => { const n: number = total(1); assert.equal(n, LIMIT + 1); console.log('TS-OK ' + n); });\n" });
    const outText = await t.call('run_command', { argv: ['npx', 'tsx', '--test', `${TMP_DIR}/ts-proba.test.ts`] });
    assert.match(outText, /TS-OK 24/, outText);
    assert.match(outText, /kilépési kód: 0/);
  } finally {
    rmSync(nm, { recursive: false, force: true });
  }
});

// docs/specs/2026-11-18-vak-ellenor-deepseek.md — 4. kiegészítés, E2: nehéz futások (DB, e2e, saját böngészős forgatókönyv), B30–B32.
// Valódi Dockert / böngészőt NEM indít: a futtató és a `docker ps` hamis; a biztonsági döntéseket méri.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG, makeRepo } from './_fixture.mjs';
import { assertSafeHeavyEnv, freshForeign, heavyEnv, ownLeftovers, parseDockerPs, unsafeHeavyEnvKeys, validateScenario, waitForMachine } from './heavy.mjs';
import { SCENARIO_RUNNER, SCENARIO_SPEC_REL, TMP_DIR, cleanEnv, makeTools } from './tools.mjs';

const NOW = Date.parse('2026-11-18T22:00:00+01:00');
const psLine = (name, minsAgo) => {
  const d = new Date(NOW - minsAgo * 60_000 + 60 * 60_000); // +01:00 helyi idő szövegként
  const iso = d.toISOString().replace('T', ' ').slice(0, 19);
  return `${name}\t${iso} +0100 CET`;
};

const repo = makeRepo({ files: { 'source/tests/advent-calendar.spec.ts': 'export {};\n', 'source/tests/unit.test.ts': 'export {};\n', 'source/package.json': '{}\n' } });
mkdirSync(join(repo.root, 'source', 'node_modules'), { recursive: true });
mkdirSync(join(repo.root, TMP_DIR), { recursive: true });
after(() => repo.cleanup());

/** Hamis futtató: a docker-hívásokat és a node-futást rögzíti; a válaszok testre szabhatók. */
function harness({ image = true, psBefore = '', psAfter = null, onNode, envFile = false } = {}) {
  const calls = [];
  let psCount = 0;
  let clock = NOW;
  const run = async (file, args, opts) => {
    calls.push({ file, args, env: opts.env, timeoutMs: opts.timeoutMs });
    if (file === 'docker' && args[0] === 'image') return { code: image ? 0 : 1, stdout: image ? 'sha256:x' : '', stderr: '', ms: 1 };
    if (file === 'docker' && args[0] === 'stop') return { code: 0, stdout: args.at(-1), stderr: '', ms: 1 };
    if (file === 'git') return { code: 0, stdout: '', stderr: '', ms: 1 };
    nodeRan = true;
    return onNode ? onNode(file, args, opts) : { code: 0, stdout: 'kész', stderr: '', ms: 1000 };
  };
  let nodeRan = false;
  const dockerPs = async () => { psCount += 1; return !nodeRan || psAfter == null ? psBefore : psAfter; };
  if (envFile) writeFileSync(join(repo.root, 'source', '.env'), 'X=1\n');
  const tools = makeTools({ root: repo.root, base: repo.base, head: repo.head, cfg: { ...CFG, maxHeavyRuns: 2, heavyWaitMaxSec: 30 }, env: { ...process.env, RESEND_API_KEY: 're_titok_123', DATABASE_URL: 'x' },
    run, dockerPs, sleep: async (ms) => { clock += ms; }, now: () => clock, onReport: () => ({ ok: true }), isTracked: (rel) => existsSync(join(repo.root, rel)) });
  return { tools, calls };
}

test('B30: a nehéz futás környezete: nincs e-mail-küldő kulcs / titok / adatbázis-URL; a kimenő hálózat halott proxyn át', () => {
  const env = heavyEnv(cleanEnv({ ...process.env, RESEND_API_KEY: 're_x', SMTP_PASSWORD: 'p', DATABASE_URL: 'postgres://x', SESSION_SECRET: 's', GITHUB_TOKEN: 't' }));
  assert.deepEqual(unsafeHeavyEnvKeys(env), []);
  assert.doesNotThrow(() => assertSafeHeavyEnv(env));
  assert.equal(env.NODE_USE_ENV_PROXY, '1');
  assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:9');
  assert.match(env.NO_PROXY, /127\.0\.0\.1/);
  for (const k of ['RESEND_API_KEY', 'SMTP_HOST', 'SENDGRID_API_KEY', 'DATABASE_URL', 'NEON_DATABASE_URL', 'POSTMARK_TOKEN', 'MAIL_SECRET', 'OPENROUTER_API_KEY']) {
    assert.throws(() => assertSafeHeavyEnv({ ...env, [k]: 'x' }), /tiltott változó/, k);
  }
  const { HTTPS_PROXY: _, ...noLock } = env;
  assert.throws(() => assertSafeHeavyEnv(noLock), /kimenő hálózati zárja hiányzik/);
});

test('B30: a valódi nehéz futásnak átadott környezetben nincs kulcs / adatbázis-URL, és van hálózati zár (a hívó környezetében volt)', async () => {
  const { tools, calls } = harness();
  const out = await tools.call('run_db_tests', {});
  assert.match(out, /kilépési kód: 0/);
  const node = calls.find((c) => c.file === process.execPath);
  assert.ok(node, 'a futás elindult');
  assert.deepEqual(node.args, ['--import', 'tsx', 'scripts/run-learning-db-tests.ts']);
  assert.equal(node.env.RESEND_API_KEY, undefined);
  assert.equal(node.env.DATABASE_URL, undefined);
  assert.equal(node.env.NODE_USE_ENV_PROXY, '1');
  assert.ok(node.timeoutMs <= 900_000);
});

test('B30: második védvonal — ha a környezet-szűrő hibás lenne (kulcs átjut), a nehéz futás akkor sem indul el', async () => {
  const calls = [];
  const run = async (file, args, opts) => { calls.push({ file, args, env: opts.env }); return file === 'docker' ? { code: 0, stdout: '', stderr: '', ms: 1 } : { code: 0, stdout: 'futott', stderr: '', ms: 1 }; };
  const tools = makeTools({ root: repo.root, base: repo.base, head: repo.head, cfg: CFG, env: { PATH: process.env.PATH ?? '', RESEND_API_KEY: 're_titok_123' }, envFilter: (e) => ({ ...e }),
    run, dockerPs: async () => '', sleep: async () => {}, onReport: () => ({ ok: true }), isTracked: () => true });
  const out = await tools.call('run_db_tests', {});
  assert.match(out, /tiltott változó van \(RESEND_API_KEY\)/);
  assert.ok(!out.includes('re_titok_123'), 'a kulcs értéke nem jelenik meg');
  assert.ok(!calls.some((c) => c.file === process.execPath), 'a futás nem indult el');
});

test('B30: source/.env a munkafában, vagy hiányzó postgres:17 kép → a futás el sem indul', async () => {
  const noImg = harness({ image: false });
  assert.match(await noImg.tools.call('run_db_tests', {}), /^ELUTASÍTVA: a postgres:17 kép nincs helyben/);
  assert.ok(!noImg.calls.some((c) => c.file === process.execPath));
  const withEnv = harness({ envFile: true });
  try {
    assert.match(await withEnv.tools.call('run_e2e', { specs: ['source/tests/advent-calendar.spec.ts'] }), /^ELUTASÍTVA: a vizsgált munkafában source\/\.env van/);
    assert.ok(!withEnv.calls.some((c) => c.file === process.execPath));
  } finally { writeFileSync(join(repo.root, 'source', '.env'), ''); fsUnlink(join(repo.root, 'source', '.env')); }
});

function fsUnlink(p) { try { require('node:fs').unlinkSync(p); } catch { /* nincs */ } }
const require = createRequire(import.meta.url);

test('B31: sorompó — 2 friss idegen websuli-* konténernél várakozás, a plafon után elutasítás; régi vagy nem websuli konténer nem számít', async () => {
  const busy = [psLine('websuli-e2e-aaa', 5), psLine('websuli-learning-test-bbb', 2), psLine('ec-residence-db', 1)].join('\n');
  assert.equal(freshForeign(parseDockerPs(busy), NOW).length, 2);
  assert.equal(freshForeign(parseDockerPs([psLine('websuli-e2e-old', 90), psLine('websuli-e2e-new', 3)].join('\n')), NOW).length, 1);
  let t = NOW;
  const slept = [];
  const r = await waitForMachine({ ps: async () => busy, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; }, maxWaitMs: 60_000, pollMs: 15_000 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /a gép foglalt: 2 friss idegen/);
  assert.equal(slept.length, 4);
  let n = 0;
  const freed = await waitForMachine({ ps: async () => (++n < 3 ? busy : psLine('websuli-e2e-aaa', 5)), now: () => t, sleep: async (ms) => { t += ms; }, maxWaitMs: 600_000 });
  assert.equal(freed.ok, true);
  const { tools, calls } = harness({ psBefore: busy });
  assert.match(await tools.call('run_db_tests', {}), /^ELUTASÍTVA: a gép foglalt/);
  assert.ok(!calls.some((c) => c.file === process.execPath), 'foglalt gépen a futás nem indul');
});

test('saját konténer takarítása: a futás alatt megjelent, a kimenetben megnevezett konténert leállítja — idegent nem', async () => {
  assert.deepEqual(ownLeftovers(parseDockerPs(psLine('websuli-e2e-x', 1)), parseDockerPs([psLine('websuli-e2e-x', 1), psLine('websuli-e2e-sajat', 0), psLine('websuli-e2e-idegen', 0)].join('\n')), 'container websuli-e2e-sajat'), ['websuli-e2e-sajat']);
  const { tools, calls } = harness({ psBefore: '', psAfter: [psLine('websuli-e2e-sajat1', 0), psLine('websuli-e2e-idegen1', 0)].join('\n'), onNode: () => ({ code: 124, timedOut: true, stdout: '[E2E-HARNESS] … container websuli-e2e-sajat1, 127.0.0.1:5555', stderr: '', ms: 900_000 }) });
  const out = await tools.call('run_e2e', { specs: ['source/tests/advent-calendar.spec.ts'] });
  assert.match(out, /leállította a maradék saját konténert: 1 db/);
  const stops = calls.filter((c) => c.file === 'docker' && c.args[0] === 'stop').map((c) => c.args.at(-1));
  assert.deepEqual(stops, ['websuli-e2e-sajat1']);
});

test('nehéz futás plafonja és a követett spec feltétele', async () => {
  const { tools } = harness();
  assert.match(await tools.call('run_e2e', { specs: ['source/tests/unit.test.ts'] }), /^ELUTASÍTVA: csak a fej követett source\/tests\/\*\.spec\.ts/);
  assert.match(await tools.call('run_e2e', { specs: ['../x.spec.ts'] }), /^ELUTASÍTVA/);
  assert.match(await tools.call('run_e2e', { specs: [] }), /^ELUTASÍTVA/);
  await tools.call('run_db_tests', {});
  await tools.call('run_e2e', { specs: ['tests/advent-calendar.spec.ts'] });
  assert.match(await tools.call('run_db_tests', {}), /nehéz futások száma elérte a plafont \(2/);
  assert.deepEqual(tools.runLog.map((e) => e.kind), ['db', 'e2e']);
});

test('B32: a forgatókönyv érvényesítése — nem helyi cím, /api/-n kívüli mock, ismeretlen / több művelet, túl sok kép → elutasítva', () => {
  const ok = { cases: [{ name: 'alap', viewport: { width: 390, height: 844 }, observeLayoutShift: true, steps: [
    { goto: '/advent' }, { mockApi: '/api/advent/open', status: 502, body: '<html>502</html>', delayMs: 100 }, { delayApi: '/api/advent/state', delayMs: 3000 },
    { click: '[data-testid="door-1"]' }, { fill: 'input', value: 'x' }, { press: 'Enter' }, { wait: 500 }, { waitFor: '.x', state: 'hidden' },
    { offline: true }, { evaluate: 'document.title' }, { measure: 'main' }, { readLayoutShift: true }, { screenshot: 'kep_1', fullPage: false },
  ] }] };
  assert.equal(validateScenario(JSON.stringify(ok)).ok, true);
  const bad = (step, re) => { const v = validateScenario({ cases: [{ ...ok.cases[0], steps: [step] }] }); assert.equal(v.ok, false, JSON.stringify(step)); if (re) assert.match(v.error, re); };
  bad({ goto: 'https://evil.example/x' }, /helyi útvonal/);
  bad({ goto: '//evil.example/x' }, /helyi útvonal/);
  bad({ goto: '/javascript:alert(1)' }, /helyi útvonal/);
  bad({ mockApi: '/login', status: 200 }, /\/api\//);
  bad({ mockApi: 'https://x/api/a', status: 200 });
  bad({ click: 'a', goto: '/' }, /pontosan egy művelet/);
  bad({ shell: 'rm -rf /' }, /pontosan egy művelet/);
  bad({ click: 'a', extra: 1 }, /ismeretlen mező/);
  bad({ wait: 999_999 }, /0–10000/);
  bad({ screenshot: '../x' });
  assert.equal(validateScenario('{nem json').ok, false);
  assert.equal(validateScenario({ cases: [] }).ok, false);
  assert.equal(validateScenario({ cases: [{ ...ok.cases[0], viewport: { width: 5000, height: 800 } }] }).ok, false);
  const shots = { cases: [{ ...ok.cases[0], steps: Array.from({ length: 7 }, (_, i) => ({ screenshot: `k${i}` })) }] };
  assert.match(validateScenario(shots, { maxScreenshots: 6 }).error, /legfeljebb 6 képernyőkép/);
});

test('B32: érvénytelen forgatókönyv NEM fut; érvényesnél a rögzített spec kerül a munkafába, a képek visszajönnek a modellnek', async () => {
  const { tools, calls } = harness({ onNode: (file, args, opts) => {
    const outDir = opts.env.BLIND_SCENARIO_OUT;
    writeFileSync(join(outDir, 'case-1.json'), JSON.stringify({ name: 'alap', log: [{ step: 1, action: 'goto', ok: true, status: 200 }] }));
    writeFileSync(join(outDir, '1-kep.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    return { code: 0, stdout: 'ok', stderr: '', ms: 5000 };
  } });
  writeFileSync(join(repo.root, TMP_DIR, 'rossz.json'), JSON.stringify({ cases: [{ name: 'x', viewport: { width: 390, height: 844 }, steps: [{ goto: 'https://evil.example' }] }] }));
  assert.match(await tools.call('run_browser_scenario', { scenario_file: `${TMP_DIR}/rossz.json` }), /^ELUTASÍTVA \(a forgatókönyv érvénytelen, nem futott\)/);
  assert.match(await tools.call('run_browser_scenario', { scenario_file: 'docs/x.json' }), /^ELUTASÍTVA/);
  assert.ok(!calls.some((c) => c.file === process.execPath));
  writeFileSync(join(repo.root, TMP_DIR, 'jo.json'), JSON.stringify({ cases: [{ name: 'alap', viewport: { width: 390, height: 844 }, steps: [{ goto: '/' }, { screenshot: 'kep' }] }] }));
  const res = await tools.call('run_browser_scenario', { scenario_file: `${TMP_DIR}/jo.json` });
  assert.equal(typeof res, 'object');
  assert.equal(res.images.length, 1);
  assert.equal(res.images[0].mime, 'image/jpeg');
  assert.match(res.text, /"status":200/);
  const node = calls.find((c) => c.file === process.execPath);
  assert.deepEqual(node.args.slice(0, 4), ['--import', 'tsx', 'scripts/run-e2e-tests.ts', SCENARIO_SPEC_REL]);
  assert.equal(readFileSync(join(repo.root, 'source', SCENARIO_SPEC_REL), 'utf8'), readFileSync(SCENARIO_RUNNER, 'utf8'), 'a futtató RÖGZÍTETT spec-je, nem a modellé');
  assert.equal(tools.runLog.at(-1).kind, 'scenario');
});

test('a rögzített forgatókönyv-spec szintaktikailag érvényes TypeScript, és minden nem helyi kérést megszakít', (tc) => {
  const tsPath = join(fileURLToPath(new URL('../../../../source/node_modules/typescript', import.meta.url)));
  if (!existsSync(tsPath)) { tc.skip('nincs telepített typescript'); return; }
  const ts = require(tsPath);
  const src = readFileSync(SCENARIO_RUNNER, 'utf8');
  const r = ts.transpileModule(src, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual((r.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
  assert.match(src, /route\.abort\('blockedbyclient'\)/);
  assert.match(src, /if \(!isLocal\)/);
  assert.doesNotMatch(src, /child_process|require\(/, 'a rögzített spec nem indít folyamatot');
});

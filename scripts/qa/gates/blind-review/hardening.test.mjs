// A GPT-6.2 Sol vak ellenőr 1. körének leletei (L1–L14) — bukó tesztek a javítás ELŐTT
// (docs/specs/2026-11-20-gpt-teljesitesi-or.md, „Kiegészítés 3”). A minták SZINTETIKUSAK; egyik teszt sem hív valódi API-t.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CFG, fakeOpenRouter, makeRepo, reply } from './_fixture.mjs';
import { checkCompleteness } from './completeness.mjs';
import { createBudget, makeReportGate, runReview } from './blind-review.mjs';
import { makeTools } from './tools.mjs';
import { countFindings, summaryMarkdown } from './findings.mjs';
import { runCodexComplete, watchedExec } from './codex-complete.mjs';
import { writeHeartbeat } from './heartbeat.mjs';
import { callOpenRouterStream } from './stream.mjs';
import { findSensitive } from './sensitive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const POINTS = ['1', '2', '3', '4', '5', '6', '7', '8a', '8b', '9'];
const HEAD = 'c'.repeat(40);
const OKPT = 'Próbáltam megtörni, nem sikerült — a vizsgált úton a viselkedés a terv szerinti, futtatással igazolva.';
const F1 = { id: 'L1', severity: 'közepes', title: 'Kétszer küld', file: 'a.ts', line: 3, quote: 'queue.push(x)',
  scenario: 'A gyerek kétszer koppint a beküldésre gyenge hálózaton; két kérés megy ki, a szülő két levelet kap.',
  fix: 'A küldés előtt foglalás egyedi kulccsal (INSERT … ON CONFLICT DO NOTHING), teszttel a kettős koppintásra.' };

function report(mut = {}) {
  const pts = (mut.points ?? POINTS).map((p) => `${p}. ${mut.pointText?.[p] ?? OKPT}`).join('\n');
  return [
    '# Független review — próba', `Fej: ${HEAD}`, `## Ítélet: ${mut.verdict ?? 'IGEN, FELTÉTELLEL'}`,
    mut.leletek ?? '## Leletek\n- **L1 — közepes: Kétszer küld** `a.ts:3` — forgatókönyv: kettős koppintás; javaslat: egyedi kulcs.',
    `## A hibakereső pontok (ítélet + bizonyíték)\n${pts}`,
    '## Mit próbáltam megtörni, és nem sikerült\n- kettős koppintás, megszakadt hálózat',
    '## Mit NEM vizsgáltam\n- valódi mobil Safari (nem állt rendelkezésre)',
    mut.extra ?? '',
    mut.closing ?? 'TELJESSÉG: 10 / 10 pont — HIÁNYZÓ: nincs',
  ].filter((x) => x !== '').join('\n');
}
const check = (text, findings = [F1]) => checkCompleteness(text, { points: POINTS, findings });

test('alapeset: a szintetikus teljes jelentés átmegy (a többi teszt ehhez képest bukik)', () => {
  const r = check(report());
  assert.equal(r.ok, true, r.problems.join(' | '));
});

test('L1: a pont puszta címe, ítélet bizonyíték nélkül, vagy „talált hiba” lelet-azonosító nélkül NEM tárgyalt pont', () => {
  const title = check(report({ pointText: { 2: 'Adatvédelmi hibakereső pont' }, closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 2' }));
  assert.deepEqual(title.missing, ['2'], 'a „hibakereső” szóban levő „hiba” nem ítélet');
  const bare = check(report({ pointText: { 3: '**Talált hiba**' }, closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 3' }));
  assert.deepEqual(bare.missing, ['3'], 'ítélet bizonyíték nélkül');
  const short = check(report({ pointText: { 4: 'Nem alkalmazható — nincs ilyen.' }, closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 4' }));
  assert.deepEqual(short.missing, ['4'], 'ítélet + elválasztó, de 30 karakternél rövidebb bizonyíték');
  const longTitle = check(report({ pointText: { 4: 'Regresszió a meglévő folyamatokban, a közös modul többi hívója, hibakereső szempontból' }, closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 4' }));
  assert.deepEqual(longTitle.missing, ['4'], 'hosszú cím ítélet-token nélkül');
  const noRef = check(report({ pointText: { 5: 'Talált hiba — a migráció és a séma eltér egymástól, de lelet-azonosító nélkül.' }, closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 5' }));
  assert.deepEqual(noRef.missing, ['5'], 'talált hibánál a Leletek azonosítója kötelező');
  const good = check(report({ pointText: { 5: '**Talált hiba** — L1: a kettős koppintás két levelet küld (a.ts:3).' } }));
  assert.equal(good.ok, true, good.problems.join(' | '));
});

test('L2: Markdown-lelet a findings tömbből kimaradva, üres tömb feltételes ítélettel, vagy a gépi összegzésben hiányzó lelet → elutasítva', () => {
  const extra = report({ leletek: '## Leletek\n- **L1 — közepes: Kétszer küld** forgatókönyv: …; javaslat: …\n- **L2 — közepes: Javítás nélkül** a b.ts:9 sor hibás.' });
  assert.match(check(extra).problems.join(' | '), /L2: a „Leletek” szakaszban szerepel, de a findings tömbben nincs/);
  assert.match(check(report(), []).problems.join(' | '), /L1: a „Leletek” szakaszban szerepel, de a findings tömbben nincs/);
  const noFind = report({ leletek: '## Leletek\nnincs' });
  assert.match(check(noFind, []).problems.join(' | '), /„IGEN, FELTÉTELLEL” ítélethez legalább egy lelet kell/);
  assert.equal(check(report({ leletek: '## Leletek\nnincs', verdict: 'IGEN' }), []).ok, true);

  const items = [{ id: 'L1', severity: 'közepes', title: 'Kétszer küld', file: 'a.ts', line: 3, refOk: true, scenario: F1.scenario, fix: F1.fix }];
  const sum = summaryMarkdown({ items, counts: countFindings(items), cache: { hitRatioFromSecondCall: null, savedUsdEstimate: 0 },
    state: { calls: 1, retries: 0, promptTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, completionTokens: 0, spentUsd: 0 }, model: 'teszt/modell' });
  assert.ok(sum.includes(F1.scenario) && sum.includes(F1.fix), 'a rögzített jelentésben olvasható a forgatókönyv és a javítás');
  assert.equal(checkCompleteness(`${report()}\n${sum}`, { points: POINTS }).ok, true, 'rögzítéskor (tömb nélkül) a gépi összegzés a viszonyítás');
  assert.match(checkCompleteness(`${extra}\n${sum}`, { points: POINTS }).problems.join(' | '), /L2: .*gépi összegzésben nincs/);
  assert.match(checkCompleteness(extra, { points: POINTS }).problems.join(' | '), /L2: .*forgatókönyv.*javaslat/, 'tömb és összegzés nélkül a lelet szövegében kell a forgatókönyv és a javaslat');
});

test('L3: kódkerítésben idézett fejléc nem szakítja meg a pontszakaszt; idézett pontsor nem pótol hiányzót', () => {
  const quoted = report({ pointText: { 2: 'Próbáltam megtörni, nem sikerült — a naplóban ez áll:\n```md\n## Idézett fejléc\n8b. Talált hiba — L1 hamis pontsor a kódban\n```\nés a kulcs nem került ki.' } });
  assert.equal(check(quoted).ok, true, check(quoted).problems.join(' | '));
  const fake = report({ points: POINTS.filter((p) => p !== '8b'), pointText: { 2: 'Próbáltam megtörni, nem sikerült — idézet:\n```\n8b. Próbáltam megtörni, nem sikerült — ez csak idézet a kódból, nem pont\n```' }, closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 8b' });
  assert.deepEqual(check(fake).missing, ['8b']);
});

test('L4: a tiltott fordulatok önmagukban, ékezetes betű után / mondat elején is fogva', () => {
  for (const phrase of ['Az első két helyet ellenőriztem, és így tovább.', 'És így tovább a többi fájlban.', 'Ellenőriztem pár helyet, példaként néhány: a.ts.',
    'A hívókat később, ha szeretnéd, átnézem.', 'Ezt megnézem holnap.']) {
    const r = check(report({ extra: `## Megjegyzés\n${phrase}` }));
    assert.equal(r.ok, false, phrase);
    assert.match(r.problems.join(' | '), /megállási \/ felajánló fordulat/, phrase);
  }
});

// ---- A futtató hurka (L5, L6) --------------------------------------------------------------------------------------------------

const repo = makeRepo({ files: { 'a.ts': 'export function send(x) {\n  if (!x) return;\n  queue.push(x)\n}\n' } });
after(() => repo.cleanup());
function loop(steps, { maxRounds = 20 } = {}) {
  const or = fakeOpenRouter(steps);
  const box = { report: null, abort: null };
  let tools;
  const gate = makeReportGate({ head: repo.head, cfg: CFG, root: repo.root, points: POINTS, box, maxRetries: 3, getTools: () => tools });
  tools = makeTools({ root: repo.root, base: repo.base, head: repo.head, cfg: CFG, env: process.env, onReport: gate.onReport });
  const budget = createBudget({ maxUsd: 2, maxRounds, maxWallMs: 1e9, maxCompletionTokens: 1e9, cfg: CFG });
  return { or, box, gate, run: () => runReview({ cfg: CFG, key: 'k-0000', system: 'S', user: 'U', tools, box, budget, fetchImpl: or.fetchImpl, sleep: async () => {} }) };
}
const sub = (text) => reply({ calls: [['submit_report', { report: text.replace(`Fej: ${HEAD}`, `Fej: ${repo.head}`), findings: [F1] }]] });

test('L5: az üres / csak szóközös leadás is fogyasztja a teljességi keretet (4 üres leadás → NEM TELJES, 5. hívás nincs)', async () => {
  const s = loop([reply({ calls: [['submit_report', { report: '   ', findings: [] }]] })]);
  const r = await s.run();
  assert.equal(r.complete, false);
  assert.match(r.stopReason, /teljesség: 3 folytatás után is hiányos/);
  assert.equal(s.or.bodies.length, 4);
});

test('L6: keretelfogyáskor a megállás oka a legutóbbi hiányos leadás hiánylistáját is tartalmazza', async () => {
  const incomplete = report({ points: POINTS.filter((p) => p !== '8b'), closing: 'TELJESSÉG: 9 / 10 pont — HIÁNYZÓ: 8b' });
  const s = loop([sub(incomplete)], { maxRounds: 1 });
  const r = await s.run();
  assert.equal(r.complete, false);
  assert.match(r.stopReason, /körszám|kör/);
  assert.match(r.stopReason, /utolsó leadás hiányos.*8b/s);
});

// ---- Codex-burok (L7, L8, L11) --------------------------------------------------------------------------------------------------

test('L7: a --max-resumes / --max-net kemény plafon; 3 fölött vagy nem egész érték → indítás előtt elutasítva', async () => {
  let called = 0;
  const exec = async () => { called += 1; return { code: 0, stdout: '', stderr: '' }; };
  for (const bad of [{ maxResumes: 4 }, { maxResumes: Number.NaN }, { maxResumes: 1.5 }, { maxNet: 9 }, { maxNet: Number.NaN }]) {
    await assert.rejects(runCodexComplete({ exec, prompt: 'p', out: join(repo.dir, 'x.md'), mode: 'generic', ...bad }), /plafon|egész/, JSON.stringify(bad));
  }
  assert.equal(called, 0);
});

test('L8: az alapmód (generic) a visszakérdezést és a 0 / 0 zárósort nem fogadja el; ismert feladatszámnál a nevező kötött', () => {
  const g = (t, o = {}) => checkCompleteness(t, { mode: 'generic', ...o });
  assert.equal(g('Milyen eszközzel dolgozzak?\nTELJESSÉG: 0 / 0 — HIÁNYZÓ: nincs').ok, false);
  assert.match(g('Elkészült a fájl.\nMilyen eszközzel dolgozzak tovább?\nTELJESSÉG: 1 / 1 — HIÁNYZÓ: nincs').problems.join(' | '), /kérdéssel zárul/, 'kérdés a zárósor előtt, nem nulla nevezővel');
  assert.equal(g('TELJESSÉG: 3 / 3 — HIÁNYZÓ: nincs').ok, false, 'önmagában álló zárósor (üres törzs)');
  assert.equal(g('Elkészült a három fájl.\nTELJESSÉG: 3 / 3 — HIÁNYZÓ: nincs', { expectedTotal: 5 }).ok, false);
  assert.equal(g('Elkészült az öt fájl: a, b, c, d, e.\nTELJESSÉG: 5 / 5 — HIÁNYZÓ: nincs', { expectedTotal: 5 }).ok, true);
});

const childDir = mkdtempSync(join(tmpdir(), 'hard-child-'));
after(() => rmSync(childDir, { recursive: true, force: true }));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; } };

test('L11: élő hálózati hurkot (folyamatos reconnect-kimenet) a burok megszakít; beragadásnál a TELJES folyamatfa leáll, és csak utána tér vissza', async () => {
  const net = join(childDir, 'net.mjs');
  writeFileSync(net, "setInterval(() => process.stderr.write('Reconnecting... 5/5\\n'), 30);\n");
  const t0 = Date.now();
  const r = await watchedExec(process.execPath, [net], { stallMs: 60_000, pollMs: 100 });
  assert.equal(r.network, true);
  assert.ok(Date.now() - t0 < 20_000);

  const pidFile = join(childDir, 'gc.pid');
  const tree = join(childDir, 'tree.mjs');
  writeFileSync(tree, `import { spawn } from 'node:child_process';\nimport { writeFileSync } from 'node:fs';\nconst c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\nwriteFileSync(${JSON.stringify(pidFile)}, String(c.pid));\nsetInterval(() => {}, 1000);\n`);
  const s = await watchedExec(process.execPath, [tree], { stallMs: 400, pollMs: 100 });
  assert.equal(s.stalled, true);
  const gc = Number(readFileSync(pidFile, 'utf8'));
  let dead = false;
  for (let i = 0; i < 30 && !dead; i += 1) { dead = !alive(gc); if (!dead) await new Promise((x) => setTimeout(x, 100)); }
  assert.equal(dead, true, 'az unoka-folyamat is leállt');
});

// ---- Életjel (L9, L10) -----------------------------------------------------------------------------------------------------------

test('L9: a szívverés friss (nem létező) tárban is létrejön; a stream minden darabja haladás-jelet ad', async () => {
  const d = join(childDir, 'uj', 'tar');
  writeHeartbeat(join(d, 'hb.json'), { phase: 'start' });
  assert.equal(JSON.parse(readFileSync(join(d, 'hb.json'), 'utf8')).phase, 'start');
  const enc = new TextEncoder();
  const chunks = [': OPENROUTER PROCESSING\n\n', 'data: {"id":"g","model":"m","choices":[{"delta":{"content":"a"}}]}\n\n', 'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\n', 'data: [DONE]\n\n'];
  const body = new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close(); } });
  let progress = 0;
  await callOpenRouterStream({ fetchImpl: async () => ({ ok: true, status: 200, body }), endpoint: 'x', key: 'k', body: {}, onProgress: () => { progress += 1; } });
  assert.ok(progress >= 4, `haladás-jelek: ${progress}`);
});

test('L10: a fejlécek előtti csendre is él a csend-óra (függő fetch → megszakítás, újrapróbálható hiba)', async () => {
  const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
  await assert.rejects(callOpenRouterStream({ fetchImpl: hang, endpoint: 'x', key: 'k', body: {}, idleMs: 80, timeoutMs: 60_000 }),
    (e) => e.retryable === true && /csendben/.test(e.message));
});

// ---- Leállítás SIGTERM-re (L13) ------------------------------------------------------------------------------------------------

test('L13: SIGTERM-re előbb a saját nehéz gyerekfolyamat áll le (a zár még a miénk), csak utána szabadul a zár és lép ki 2-vel', () => {
  const lockDir = join(childDir, 'lock');
  const marker = join(childDir, 'marker.json');
  const f = join(childDir, 'sig.mjs');
  const u = (m) => JSON.stringify(pathToFileURL(join(HERE, m)).href);
  writeFileSync(f, [
    `import { existsSync, writeFileSync } from 'node:fs';`,
    `import { createExitTrace } from ${u('exit-trace.mjs')};`,
    `import { acquireMachineLock } from ${u('heavy.mjs')};`,
    `import { realRun, emergencyCleanup, activeChildPids } from ${u('tools.mjs')};`,
    `const alive = (p) => { try { process.kill(p, 0); return true; } catch (e) { return e?.code === 'EPERM'; } };`,
    `let pid = null;`,
    `createExitTrace().install(process, { onSignal: async () => { await emergencyCleanup(); writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ lockHeld: existsSync(${JSON.stringify(lockDir)}), childAlive: alive(pid) })); } });`,
    `const l = await acquireMachineLock({ dir: ${JSON.stringify(lockDir)}, owner: 'teszt', maxWaitMs: 0 });`,
    `if (!l.ok) process.exit(9);`,
    `realRun(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 60_000 });`,
    `setTimeout(() => { pid = activeChildPids()[0]; process.emit('SIGTERM'); }, 500);`,
    `setInterval(() => {}, 1000);`,
  ].join('\n'));
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /KILÉPÉS 2 — ok: jelzés: SIGTERM/);
  const m = JSON.parse(readFileSync(marker, 'utf8'));
  assert.deepEqual(m, { lockHeld: true, childAlive: false }, 'a gyerek a zár elengedése ELŐTT állt le');
  assert.equal(existsSync(lockDir), false, 'a kilépés után a zár szabad');
});

// ---- Titokszűrés az API előtt (L14) --------------------------------------------------------------------------------------------

test('L14: a cél / terv titokra utaló mintáját a futtató az API-hívás előtt elutasítja, az érték kiírása nélkül', () => {
  const secret = ['Authorization: Bearer ', 'abcdEFGH1234ijklMNOP5678qrst'].join('');
  assert.deepEqual(findSensitive(`első sor\n${secret}\n`).map((x) => [x.kind, x.line]), [['authorization-fejléc', 2]]);
  assert.equal(findSensitive(['sk-or-v1-', 'a'.repeat(40)].join('')).length, 1);
  assert.equal(findSensitive('kapcsolat: valaki@pelda-iskola.hu', { email: true })[0].kind, 'e-mail-cím');
  assert.equal(findSensitive('Az ADMIN_EMAILS változó három címzettet tartalmaz.', { email: true }).length, 0);

  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  const goal = join(childDir, 'cel.md');
  writeFileSync(goal, `Cél: teszt\n${secret}\n`);
  const r = spawnSync(process.execPath, [join(HERE, 'blind-review.mjs'), '--base', head, '--head', head, '--spec', 'docs/minosegkapuk.md', '--goal', goal,
    '--out', join(childDir, 'j.md'), '--dry-run'], { cwd: REPO, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /titokra vagy személyes adatra utaló minta.*authorization-fejléc.*cel\.md:2/);
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /abcdEFGH1234/);
});

// docs/specs/2026-11-18-vak-ellenor-deepseek.md — a futtató ciklusa hamis OpenRouter-válaszokkal: B1, B2, B7, B8, B10, B13, gyorsítótár (C).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG, REPORT, fakeOpenRouter, makeRepo, reply, usage } from './_fixture.mjs';
import {
  BOOL_FLAGS, VALUE_FLAGS, buildEvidence, buildSystemPrompt, buildUserMessage, backoffMs, cacheStats, checkTemplate, cleanupWorktree, createBudget, estimateNextUsd,
  incompleteReport, parseArgs, prepareWorktree, runReview, unlinkJunction, validateReport, withCacheMarkers,
} from './blind-review.mjs';
import { makeTools } from './tools.mjs';
import { reportVerdict } from '../record-review.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const HEAD = 'a'.repeat(40);
const KEY = 'TESZT-KULCS-NE-SZIVAROGJON-0001';
const repo = makeRepo({ files: { 'src/a.mjs': 'export const a = 1;\nexport function f(x) { return x + a; }\n' } });
after(() => repo.cleanup());

const ARGV = ['--base', 'origin/main', '--head', HEAD, '--spec', 'docs/specs/a.md,docs/specs/b.md', '--goal', 'g.md', '--out', 'o.md'];

/** Egy teljes futás összerakása hamis válaszokkal; `over` a keretet / órát írja felül. */
function setup(steps, { budget = {}, cfg = CFG, now } = {}) {
  const or = fakeOpenRouter(steps);
  const box = { report: null, check: null };
  const tools = makeTools({
    root: repo.root, base: repo.base, head: repo.head, cfg, key: KEY, env: process.env,
    onReport: (t, findings, runLog) => { const v = validateReport(t, repo.head, cfg, { findings, root: repo.root, runLog }); if (v.ok) { box.report = t; box.check = v.check; } return v; },
  });
  const b = createBudget({ maxUsd: 2, maxRounds: 60, maxWallMs: 25 * 60_000, maxCompletionTokens: 200_000, cfg, ...(now ? { now } : {}), ...budget });
  const events = [];
  const run = () => runReview({ cfg, key: KEY, system: 'RENDSZER', user: 'FELADAT', tools, box, budget: b, fetchImpl: or.fetchImpl, log: (e) => events.push(e), sleep: async () => {}, sessionId: 's1' });
  return { ...or, box, tools, budget: b, events, run };
}
const submit = (verdict = 'IGEN', findings = []) => reply({ calls: [['submit_report', { report: REPORT(repo.head, verdict), findings }]] });
const strip = (messages) => messages.map((m) => (Array.isArray(m.content) ? { ...m, content: m.content.map((p) => p.text).join('') } : m));

test('B1: szigorú argumentumok — ismeretlen kapcsoló (fejlesztői jelentés, modell) hiba; nincs rá kapcsoló a listában sem', () => {
  const a = parseArgs(ARGV, CFG);
  assert.equal(a.maxUsd, 2);
  assert.deepEqual(a.specs, ['docs/specs/a.md', 'docs/specs/b.md']);
  for (const extra of [['--dev-report', 'x.md'], ['--report', 'x.md'], ['--summary=x'], ['--model', 'anthropic/claude'], ['--context', 'x'], ['egyeb']]) {
    assert.throws(() => parseArgs([...ARGV, ...extra], CFG), /ismeretlen kapcsoló/, extra.join(' '));
  }
  assert.deepEqual([...VALUE_FLAGS, ...BOOL_FLAGS].sort(), ['--base', '--dry-run', '--goal', '--head', '--max-minutes', '--max-rounds', '--max-usd', '--node-modules', '--out', '--spec']);
  assert.throws(() => parseArgs(ARGV.map((x) => (x === HEAD ? 'abc1234' : x)), CFG), /TELJES \(40 jegyű\)/);
  assert.throws(() => parseArgs(ARGV.slice(2), CFG), /--base kötelező/);
});

test('B8: a --max-usd kemény felső határa (és a kör- / időkorláté) nem léphető át', () => {
  assert.equal(parseArgs([...ARGV, '--max-usd', '6'], CFG).maxUsd, 6);
  assert.throws(() => parseArgs([...ARGV, '--max-usd', '6.01'], CFG), /legfeljebb 6 USD/);
  assert.throws(() => parseArgs([...ARGV, '--max-usd', '-1'], CFG), /pozitív szám/);
  assert.throws(() => parseArgs([...ARGV, '--max-usd', 'sok'], CFG), /pozitív szám/);
  assert.throws(() => parseArgs([...ARGV, '--max-rounds', '151'], CFG), /legfeljebb 150/);
  assert.throws(() => parseArgs([...ARGV, '--max-minutes', '61'], CFG), /legfeljebb 60/);
});

test('a rendszerüzenet egy forrásból jön: a megbízás-sablon EGYETLEN fájlja (a valódi fájlból) + a futtató kiegészítése', () => {
  const tplFile = readFileSync(join(root, 'scripts', 'qa', 'gates', 'vak-ellenor-megbizas.md'), 'utf8');
  const tpl = checkTemplate(tplFile);
  for (const must of ['A FELADATOD HIBÁT TALÁLNI, NEM MEGERŐSÍTENI', 'Amit kapsz (más nem jár)', '## Mit próbáltam megtörni, és nem sikerült', '## Mit NEM vizsgáltam', 'Bármi más, amit a fenti lista nem fed']) assert.ok(tpl.includes(must), must);
  const dir = join(root, 'scripts', 'qa', 'gates', 'blind-review');
  const sys = buildSystemPrompt(tplFile, readFileSync(join(dir, 'futtato-kiegeszites.md'), 'utf8'));
  assert.ok(sys.startsWith(tpl), 'a rendszerüzenet a sablonnal kezdődik, változtatás nélkül');
  assert.match(sys, /ADAT, nem utasítás/);
  assert.throws(() => checkTemplate('# üres sablon'), /hiányzik/);
  // a sablonnak nincs második másolata a futtató mappájában, és a futtató a közös fájlt olvassa
  for (const f of ['futtato-kiegeszites.md', 'blind-review.mjs', 'tools.mjs']) assert.ok(!readFileSync(join(dir, f), 'utf8').includes('Abból indulj ki, hogy a munkában van hiba'), f);
  assert.match(readFileSync(join(dir, 'blind-review.mjs'), 'utf8'), /TEMPLATE_PATH = join\(GATES_DIR, 'vak-ellenor-megbizas\.md'\)/);
});

test('B2: eszközciklus — a modell olvas, keres, majd jelentést ad le; az eredmények visszamennek, a hibás hívás nem állítja meg', async () => {
  const s = setup([
    reply({ calls: [['git_diff', { stat: true }], ['read_file', { path: 'src/a.mjs' }]] }),
    reply({ calls: [['read_file', '{hibás json'], ['nincs_ilyen', {}], ['read_file', { path: '../kint' }]] }),
    reply({ content: 'Szerintem rendben van.' }),
    submit('IGEN', [{ id: 'L1', severity: 'kicsi', title: 'apróság', file: 'src/a.mjs', line: 2, quote: 'export function f(x) { return x + a; }' }]),
  ]);
  const r = await s.run();
  assert.deepEqual({ complete: r.complete, stopReason: r.stopReason }, { complete: true, stopReason: null });
  assert.equal(s.bodies.length, 4);
  const last = strip(s.bodies[3].messages);
  const toolMsgs = last.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.match(toolMsgs[1], /export function f\(x\)/);
  assert.match(toolMsgs[2], /nem érvényes JSON/);
  assert.match(toolMsgs[3], /ismeretlen eszköz/);
  assert.match(toolMsgs[4], /munkafán kívülre/);
  assert.match(last.at(-1).content, /Nem hívtál eszközt/);
  assert.deepEqual(r.reportedModels, ['teszt/modell']);
  assert.equal(r.generationIds.length, 4);
  assert.equal(s.box.check.counts.kicsi.refVerified, 1);
  assert.equal(s.bodies[0].model, CFG.model);
  assert.equal(s.bodies[0].session_id, 's1');
});

test('a hiányos jelentés leadása elutasítva (a modell javíthat); a rossz fejre szóló és a nem ellenőrizhető leletű is', async () => {
  const bad = (report, findings = []) => reply({ calls: [['submit_report', { report, findings }]] });
  const s = setup([
    bad('# csak ennyi'),
    bad(REPORT('b'.repeat(40))),
    bad(REPORT(repo.head, 'IGEN, FELTÉTELLEL'), [{ id: 'L1', severity: 'közepes', title: 'kitalált', file: 'src/nincs.mjs', line: 5, quote: 'kitalált kódsor ez' }]),
    submit(),
  ]);
  const r = await s.run();
  assert.equal(r.complete, true);
  const t = strip(s.bodies[3].messages).filter((m) => m.role === 'tool').map((m) => m.content);
  assert.match(t[0], /ELUTASÍTVA.*nincs „## Ítélet.*nincs „Fej:.*hiányzó kötelező fejléc/);
  assert.match(t[1], /nem a vizsgált fejre/);
  assert.match(t[2], /L1 \(közepes\): a hivatkozás nem ellenőrizhető/);
});

test('B7: USD-plafon — a hívás ELŐTT áll meg (eddigi tényleges költség + a következő hívás becslése), nem utána', async () => {
  const s = setup([reply({ calls: [['read_file', { path: 'src/a.mjs' }]], use: usage(1000, 100, { cost: 0.4 }) })], { budget: { maxUsd: 1 } });
  const r = await s.run();
  assert.equal(r.complete, false);
  assert.match(r.stopReason, /USD-plafon \(1 USD/);
  assert.equal(s.bodies.length, 2, 'két hívás (0,8 USD) fért bele; a harmadik becslése már átlépné a plafont, ezért NEM indult el');
  assert.ok(s.budget.state.spentUsd <= 1, 'a tényleges költés a plafon alatt maradt');
});

test('B7: körszám-, falióra- és kimenet-plafon; megszakító jelzés', async () => {
  const loop = [reply({ calls: [['read_file', { path: 'src/a.mjs' }]] })];
  const rounds = setup(loop, { budget: { maxRounds: 3 } });
  assert.match((await rounds.run()).stopReason, /körszám-plafon \(3 modellhívás\)/);
  assert.equal(rounds.bodies.length, 3);

  let t = 0;
  const wall = setup(loop, { budget: { maxWallMs: 10_000 }, now: () => { t += 3000; return t; } });
  const w = await wall.run();
  assert.match(w.stopReason, /falióra-időkorlát/);
  assert.ok(wall.bodies.length >= 1 && wall.bodies.length < 6);

  const outCap = setup([reply({ calls: [['read_file', { path: 'src/a.mjs' }]], use: usage(1000, 600, { cost: 0.001 }) })], { budget: { maxCompletionTokens: 1000 } });
  assert.match((await outCap.run()).stopReason, /kimenet-plafon/);
  assert.equal(outCap.bodies.length, 2);

  let stop = null;
  const abort = setup([() => { stop = 'megszakító fájl'; return loop[0]; }], { budget: { stopRequested: () => stop } });
  const a = await abort.run();
  assert.match(a.stopReason, /megszakítva \(megszakító fájl\)/);
  assert.equal(abort.bodies.length, 1);
});

test('B7: az újrapróba is hívásnak számít és a keretet terheli; a végleges hiba „nem futott” (fatal), kulcs nélkül az üzenetben', async () => {
  const flaky = setup([{ status: 503, body: { error: 'overloaded' } }, { throw: `socket hang up Authorization: Bearer ${KEY}` }, submit()]);
  const r = await flaky.run();
  assert.equal(r.complete, true);
  assert.equal(flaky.budget.state.calls, 3);
  assert.equal(flaky.budget.state.retries, 2);
  assert.ok([...flaky.budget.state.costSources].some((x) => /ismeretlen kimenetelű/.test(x)), 'a hálózati hibájú hívás a becsléssel terhel');
  assert.ok(!JSON.stringify(flaky.events).includes(KEY), 'a naplóba kerülő hibaüzenet maszkolt');

  const dead = setup([{ status: 401, body: { error: { message: `bad key ${KEY}` } } }]);
  const d = await dead.run();
  assert.deepEqual({ complete: d.complete, fatal: d.fatal }, { complete: false, fatal: true });
  assert.match(d.stopReason, /OpenRouter-hiba: OpenRouter HTTP 401/);
  assert.ok(!d.stopReason.includes(KEY));
  assert.equal(dead.bodies.length, 1, '401 nem újrapróbálható');

  // ENOTFOUND (a DNS átmenetileg nem old fel): újrapróba, és ha nem jön helyre, NEM TELJES — ítélet és jelentés nélkül
  const dns = setup([{ throw: 'getaddrinfo ENOTFOUND openrouter.ai' }]);
  const n = await dns.run();
  assert.deepEqual({ complete: n.complete, fatal: n.fatal }, { complete: false, fatal: true });
  assert.match(n.stopReason, /hálózati hiba: getaddrinfo ENOTFOUND/);
  assert.equal(dns.bodies.length, 1 + CFG.maxRetries, 'korlátos számú újrapróba');
  assert.equal(dns.budget.state.retries, CFG.maxRetries);
  assert.equal(dns.box.report, null);
  const healed = setup([{ throw: 'getaddrinfo ENOTFOUND openrouter.ai' }, { throw: 'getaddrinfo ENOTFOUND openrouter.ai' }, submit()]);
  assert.equal((await healed.run()).complete, true, 'helyreálló hálózatnál a futás folytatódik');
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(backoffMs), [2000, 4000, 8000, 16000, 30000, 30000]);
  const down = setup([{ status: 500, body: {} }], { budget: { maxRounds: 2 } });
  assert.match((await down.run()).stopReason, /körszám-plafon/, 'az újrapróbák a körszám-plafont is fogyasztják');
});

test('a modell eszközhívás nélkül válaszol → két emlékeztető után NEM TELJES', async () => {
  const s = setup([reply({ content: 'Ítélet: IGEN, minden rendben.' })]);
  const r = await s.run();
  assert.equal(r.complete, false);
  assert.match(r.stopReason, /nem adott le jelentést/);
  assert.equal(s.bodies.length, 3);
  const text = incompleteReport({ head: repo.head, stopReason: r.stopReason, notes: r.notes });
  assert.match(text, /^NEM TELJES — /m);
  assert.equal(reportVerdict(text), null, 'a NEM TELJES jelentésből nem olvasható ki ítélet (a modell szövegéből sem)');
  // a kimeneti korláton megállt (üres) válasz külön, célzott emlékeztetőt kap
  const cut = reply({ content: '' });
  cut.body.choices[0].finish_reason = 'length';
  const t = setup([cut, submit()]);
  assert.equal((await t.run()).complete, true);
  assert.match(strip(t.bodies[1].messages).at(-1).content, /elérte a kimeneti korlátot/);
});

test('C: az előtag körről körre BÁJTRA AZONOS — a korábbi üzenetek soha nem változnak; a jelölők a rögzített blokk végén és a mozgó végen', async () => {
  const s = setup([
    reply({ calls: [['git_diff', { stat: true }]] }),
    reply({ calls: [['read_file', { path: 'src/a.mjs' }], ['list_dir', { path: '.' }]] }),
    reply({ content: 'gondolkodom' }),
    reply({ calls: [['search', { pattern: 'export' }]] }),
    submit(),
  ]);
  await s.run();
  assert.equal(s.bodies.length, 5);
  for (let i = 1; i < s.bodies.length; i += 1) {
    const prev = strip(s.bodies[i - 1].messages);
    const cur = strip(s.bodies[i].messages);
    assert.ok(cur.length > prev.length);
    assert.equal(JSON.stringify(cur.slice(0, prev.length)), JSON.stringify(prev), `a(z) ${i + 1}. kérés előtagja eltér az előző kéréstől`);
    assert.equal(JSON.stringify(s.bodies[i].tools), JSON.stringify(s.bodies[0].tools), 'az eszközdefiníciók sorrendje és tartalma változatlan');
  }
  for (const b of s.bodies) {
    const marked = b.messages.map((m, i) => (Array.isArray(m.content) && m.content.some((p) => p.cache_control) ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(marked, [...new Set([1, b.messages.length - 1])], 'töréspont: a rögzített feladatblokk vége + a beszélgetés vége');
    assert.equal(b.messages[0].content, 'RENDSZER');
    assert.equal(b.messages[1].content[0].text, 'FELADAT');
  }
  assert.equal(withCacheMarkers([{ role: 'system', content: 'a' }, { role: 'user', content: 'b' }], 'none')[1].content, 'b', 'automatikus gyorsítótárnál nincs jelölő');
});

test('C: az előtagban nincs időbélyeg, véletlen azonosító vagy munkafa-útvonal — két azonos bemenetű megbízás bájtra azonos', () => {
  const input = { head: HEAD, base: 'b'.repeat(40), specs: [{ path: 'docs/specs/a.md', text: 'terv' }], goal: 'cél', stat: ' a | 1 +', warnings: [] };
  const a = buildUserMessage(input);
  assert.equal(a, buildUserMessage(structuredClone(input)));
  assert.doesNotMatch(a, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|websuli-blind-|[A-Za-z]:\\/);
});

test('C: gyorsítótár-mutatók a tényleges usage-ből; a plafon-becslés a kedvezményes árral számol, lejárt TTL után a teljes írási árral', () => {
  const b = createBudget({ maxUsd: 2, maxRounds: 9, maxWallMs: 1e9, maxCompletionTokens: 1e9, cfg: CFG, now: () => 1000 });
  b.charge(usage(10_000, 100, { cached: 0, write: 10_000, cost: 0.02 }), 0);
  b.charge(usage(12_000, 100, { cached: 10_000, write: 2_000, cost: 0.004 }), 0);
  b.charge(usage(15_000, 100, { cached: 12_000, write: 3_000, cost: 0.005 }), 0);
  const c = cacheStats(b.state, CFG);
  assert.ok(Math.abs(c.hitRatioFromSecondCall - 22_000 / 27_000) < 1e-9);
  assert.equal(c.cachedTokens, 22_000);
  assert.ok(Math.abs(b.state.spentUsd - 0.029) < 1e-9, 'a költség a tényleges usage.cost összege');
  assert.equal(b.state.callsDetail.length, 3);
  assert.deepEqual(b.state.callsDetail[1], { prompt: 12_000, cached: 10_000, cacheWrite: 2_000, completion: 100, usd: 0.004 });
  const warm = estimateNextUsd({ pendingChars: 2000, lastPromptTokens: 100_000, cacheWarm: true, cfg: CFG });
  const cold = estimateNextUsd({ pendingChars: 2000, lastPromptTokens: 100_000, cacheWarm: false, cfg: CFG });
  assert.ok(Math.abs(warm - (100_000 * 0.1 + 1000 * 1.25 + 16_000 * 4) / 1e6) < 1e-9);
  assert.ok(Math.abs((cold - warm) - 100_000 * (1.25 - 0.1) / 1e6) < 1e-9, 'hideg gyorsítótárnál a teljes előtag írási áron számolódik');
});

test('B10: a bizonyíték a VÁLASZBÓL visszaolvasott modellt, a jelentés hash-ét, a tokeneket, a költséget és az eszközhívásokat rögzíti', async () => {
  const s = setup([reply({ calls: [['git_diff', {}], ['read_file', { path: 'src/a.mjs' }]], model: 'masik/modell' }), submit()]);
  const r = await s.run();
  const text = `${s.box.report}\nlábléc`;
  const ev = buildEvidence({ args: { head: repo.head, maxUsd: 2, maxRounds: 60, maxMinutes: 25 }, cfg: CFG, baseSha: repo.base, result: r, state: s.budget.state, counts: s.tools.counts,
    reportText: text, verdict: reportVerdict(text), startedAt: 0, endedAt: 60_000, reportPath: '/x/j.md', cache: cacheStats(s.budget.state, CFG), findings: s.box.check });
  assert.equal(ev.kind, 'blind-review');
  assert.equal(ev.modelRequested, 'teszt/modell');
  assert.deepEqual(ev.modelReported, ['masik/modell', 'teszt/modell'], 'nem a kérésből másol: ha a válasz más modellt jelez, az látszik');
  assert.equal(ev.reportSha256.length, 64);
  assert.equal(ev.complete, true);
  assert.equal(ev.verdict, 'IGEN');
  assert.deepEqual(ev.toolCalls, { git_diff: 1, read_file: 1, submit_report: 1 });
  assert.equal(ev.calls, 2);
  assert.equal(ev.costUsd, 0.02);
  assert.equal(ev.callsDetail.length, 2);
  assert.ok(!JSON.stringify(ev).includes(KEY));
});

test('B13: a takarítás ELŐSZÖR a node_modules csatolást bontja — a cél tartalma megmarad; valódi mappát nem töröl csatolásként', () => {
  const target = realpathSync.native(mkdtempSync(join(tmpdir(), 'blind-nm-')));
  mkdirSync(join(target, 'csomag'));
  writeFileSync(join(target, 'csomag', 'index.js'), 'module.exports = 1;\n');
  const parent = realpathSync.native(mkdtempSync(join(tmpdir(), 'blind-wt-')));
  const src = makeRepo({ files: { 'source/x.ts': 'export {};\n' } });
  try {
    const wt = prepareWorktree({ repo: src.root, head: src.head, nodeModulesSrc: target, parent });
    assert.ok(existsSync(join(wt.root, 'source', 'node_modules', 'csomag', 'index.js')), 'a csatoláson át látszik a csomag');
    assert.ok(existsSync(join(wt.root, '.blind-review-tmp')));
    const c = cleanupWorktree({ repo: src.root, wt });
    assert.equal(c.ok, true, c.error ?? '');
    assert.ok(!existsSync(wt.dir), 'az eldobható munkafa eltűnt');
    assert.ok(existsSync(join(target, 'csomag', 'index.js')), 'A CSATOLT node_modules TARTALMA MEGMARADT');
    assert.equal(unlinkJunction(join(target, 'csomag')), false, 'valódi mappát nem bont „csatolásként”');
    mkdirSync(join(target, 'ures'));
    assert.equal(unlinkJunction(join(target, 'ures')), false);
    assert.ok(existsSync(join(target, 'ures')), 'ÜRES valódi mappát sem töröl');
    assert.ok(existsSync(join(target, 'csomag', 'index.js')));
  } finally {
    src.cleanup();
    rmSync(parent, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test('E2: a képernyőkép a kör eszköz-eredményei UTÁN, egy user-üzenetben megy a modellnek (csak hozzáfűzés); töréspont a képes üzeneten is', async () => {
  const or = fakeOpenRouter([reply({ calls: [['run_browser_scenario', { scenario_file: 'x' }]] }), reply({ calls: [['submit_report', {}]] })]);
  const box = { report: null };
  const tools = { counts: {}, call: async (name) => {
    if (name === 'run_browser_scenario') return { text: 'eredmény', images: [{ name: '1-kep.jpg', mime: 'image/jpeg', base64: 'AAAA' }] };
    box.report = 'kész';
    return 'ELFOGADVA';
  } };
  const b = createBudget({ maxUsd: 2, maxRounds: 9, maxWallMs: 1e9, maxCompletionTokens: 1e9, cfg: CFG });
  const r = await runReview({ cfg: CFG, key: KEY, system: 'RENDSZER', user: 'FELADAT', tools, box, budget: b, fetchImpl: or.fetchImpl, sleep: async () => {} });
  assert.equal(r.complete, true);
  const msgs = or.bodies[1].messages;
  const toolIdx = msgs.findIndex((m) => m.role === 'tool');
  assert.equal(msgs[toolIdx].content, 'eredmény');
  const img = msgs[toolIdx + 1];
  assert.equal(img.role, 'user');
  assert.equal(img.content[1].type, 'image_url');
  assert.equal(img.content[1].image_url.url, 'data:image/jpeg;base64,AAAA');
  assert.deepEqual(img.content.at(-1).cache_control, { type: 'ephemeral' }, 'mozgó töréspont a képes utolsó üzeneten');
  assert.equal(img.content[0].cache_control, undefined);
});

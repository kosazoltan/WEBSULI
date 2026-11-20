// Mélységi őr és szolgáltató-rögzítés (mért ok 2026-11-20: 8 ellenőrzés ~1 perc alatt, 4–6 hívással „IGEN, FELTÉTELLEL”-t adott; a
// kérések az Amazon Bedrock útvonalra kerültek, ahol a reasoning.effort nem érvényesül — 0 gondolkodó token).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, REPORT, fakeOpenRouter, makeRepo, reply } from './_fixture.mjs';
import { createBudget, runReview, validateReport } from './blind-review.mjs';
import { summaryMarkdown } from './findings.mjs';
import { isSubstantive, makeTools } from './tools.mjs';

const repo = makeRepo({
  baseFiles: { 'README.md': 'alap\n' },
  files: { 'source/server/a.ts': 'export const a = 1;\n', 'source/tests/a.test.ts': 'export {};\n', 'docs/specs/terv.md': '# terv\n', 'source/package-lock.json': '{}\n' },
});
after(() => repo.cleanup());
const tools = () => makeTools({ root: repo.root, base: repo.base, head: repo.head, cfg: CFG, env: process.env, onReport: () => ({ ok: true }) });
const rep = (notTested = '- semmi') => REPORT(repo.head).replace('## Mit NEM vizsgáltam\n- böngésző\n', `## Mit NEM vizsgáltam\n${notTested}\n`);

test('érdemi fájl: kód, teszt, konfig igen; dokumentum, lock-fájl nem', () => {
  for (const f of ['source/server/a.ts', 'source/tests/a.test.ts', 'scripts/x.mjs', 'source/client/x.tsx', 'a.css', 'gates.config.json']) assert.ok(isSubstantive(f), f);
  for (const f of ['docs/specs/terv.md', 'README.md', 'source/package-lock.json', 'docs/x.json', 'kep.png']) assert.equal(isSubstantive(f), false, f);
});

test('MÉLYSÉGI ŐR: kevés vizsgáló hívás vagy beolvasatlan, nem indokolt érdemi fájl → a jelentés elutasítva; olvasás vagy indoklás után elfogadva', async () => {
  const t = tools();
  assert.deepEqual(t.depth().substantive.sort(), ['source/server/a.ts', 'source/tests/a.test.ts']);
  const v0 = validateReport(rep(), repo.head, CFG, { findings: [], root: repo.root, depth: t.depth() });
  assert.equal(v0.ok, false);
  assert.match(v0.error, /MÉLYSÉGI ŐR: eddig csak 0 vizsgáló eszközhívás történt \(legalább 8 kell\)/);
  assert.match(v0.error, /MÉLYSÉGI ŐR: a diff 2 érdemi fájlját nem olvastad be/);
  await t.call('read_file', { path: 'source/server/a.ts' });
  for (let i = 0; i < 7; i += 1) await t.call('search', { pattern: 'a' });
  const v1 = validateReport(rep(), repo.head, CFG, { findings: [], root: repo.root, depth: t.depth() });
  assert.equal(v1.ok, false);
  assert.match(v1.error, /a diff 1 érdemi fájlját nem olvastad be.*source\/tests\/a\.test\.ts/);
  assert.doesNotMatch(v1.error, /vizsgáló eszközhívás/);
  assert.equal(validateReport(rep('- source/tests/a.test.ts: üres teszt-váz, nem érdemi'), repo.head, CFG, { findings: [], root: repo.root, depth: t.depth() }).ok, true, 'indoklással elfogadva');
  const full = await t.call('git_diff', {});
  assert.match(full, /diff --git a\/source\/tests\/a\.test\.ts/);
  assert.equal(validateReport(rep(), repo.head, CFG, { findings: [], root: repo.root, depth: t.depth() }).ok, true, 'a teljes diffben látott fájl beolvasottnak számít');
  const t2 = tools();
  await t2.call('git_diff', { stat: true });
  assert.equal(t2.depth().unseen.length, 2, 'a --stat összesítő nem számít beolvasásnak');
});

test('MÉLYSÉGI ŐR a ciklusban: a túl korai submit_report visszautasítva, a modell folytatja; ha nem folytatja, a keret végén NEM TELJES (nem ítélet)', async () => {
  const box = { report: null };
  const t = makeTools({ root: repo.root, base: repo.base, head: repo.head, cfg: CFG, env: process.env,
    onReport: (txt, findings) => { const v = validateReport(txt, repo.head, CFG, { findings, root: repo.root, depth: t.depth() }); if (v.ok) box.report = txt; return v; } });
  const submit = reply({ calls: [['submit_report', { report: rep(), findings: [] }]] });
  const early = fakeOpenRouter([reply({ calls: [['git_diff', { stat: true }]] }), submit]);
  const b = createBudget({ maxUsd: 2, maxRounds: 6, maxWallMs: 1e9, maxCompletionTokens: 1e9, cfg: CFG });
  const r = await runReview({ cfg: CFG, key: 'k-0000', system: 'S', user: 'U', tools: t, box, budget: b, fetchImpl: early.fetchImpl, sleep: async () => {} });
  assert.equal(r.complete, false, 'csak leadogatással nem lehet ítéletet szerezni');
  assert.match(r.stopReason, /körszám-plafon/);
  const c = early.bodies.at(-1).messages.filter((m) => m.role === 'tool').at(-1).content;
  const lastTool = Array.isArray(c) ? c.map((p) => p.text).join('') : c; // a gyorsítótár-töréspont tömbbé alakíthatja
  assert.match(lastTool, /^ELUTASÍTVA — javítsd, és add le újra: .*MÉLYSÉGI ŐR/);

  const box2 = { report: null };
  const t3 = makeTools({ root: repo.root, base: repo.base, head: repo.head, cfg: CFG, env: process.env,
    onReport: (txt, findings) => { const v = validateReport(txt, repo.head, CFG, { findings, root: repo.root, depth: t3.depth() }); if (v.ok) box2.report = txt; return v; } });
  const deep = fakeOpenRouter([
    reply({ calls: [['git_diff', { stat: true }]] }), submit,
    reply({ calls: [['read_file', { path: 'source/server/a.ts' }], ['read_file', { path: 'source/tests/a.test.ts' }], ['search', { pattern: 'a' }], ['search', { pattern: 'b' }], ['git_log', {}], ['git_diff', {}], ['list_dir', { path: '.' }]] }),
    submit,
  ]);
  const r2 = await runReview({ cfg: CFG, key: 'k-0000', system: 'S', user: 'U', tools: t3, box: box2, budget: createBudget({ maxUsd: 2, maxRounds: 20, maxWallMs: 1e9, maxCompletionTokens: 1e9, cfg: CFG }), fetchImpl: deep.fetchImpl, sleep: async () => {} });
  assert.equal(r2.complete, true, 'a visszautasítás után a mélyebb vizsgálattal elfogadva');
});

test('szolgáltató: a konfigurált listán kívüli válaszadó (pl. Amazon Bedrock) → NEM TELJES, nem ítélet; a szolgáltató és a gondolkodó tokenek a gépi összegzésben', async () => {
  const cfg = { ...CFG, requestExtras: { reasoning: { effort: 'high' }, provider: { order: ['OpenAI', 'Azure'], allow_fallbacks: false } } };
  const bedrock = reply({ calls: [['git_diff', { stat: true }]] });
  bedrock.body.provider = 'Amazon Bedrock';
  const or = fakeOpenRouter([bedrock]);
  const b = createBudget({ maxUsd: 2, maxRounds: 9, maxWallMs: 1e9, maxCompletionTokens: 1e9, cfg });
  const r = await runReview({ cfg, key: 'k-0000', system: 'S', user: 'U', tools: tools(), box: { report: null }, budget: b, fetchImpl: or.fetchImpl, sleep: async () => {} });
  assert.deepEqual({ complete: r.complete, fatal: r.fatal }, { complete: false, fatal: true });
  assert.match(r.stopReason, /a válaszadó szolgáltató \(Amazon Bedrock\) nincs a konfigurált listán \(OpenAI, Azure\)/);
  assert.deepEqual(or.bodies[0].provider, { order: ['OpenAI', 'Azure'], allow_fallbacks: false }, 'a kérés rögzíti a szolgáltatót');
  const md = summaryMarkdown({ items: [], counts: { blokkoló: { total: 0, refVerified: 0, runFull: 0, runPartial: 0, invalid: 0 }, közepes: { total: 0, refVerified: 0, runFull: 0, runPartial: 0, invalid: 0 }, kicsi: { total: 0, refVerified: 0, runFull: 0, runPartial: 0, invalid: 0 } },
    model: 'm', cache: { hitRatioFromSecondCall: null, savedUsdEstimate: 0 }, state: { ...b.state, reasoningTokens: 1234, providers: new Set(['OpenAI']) } });
  assert.match(md, /szolgáltató \(a válasz szerint\): OpenAI/);
  assert.match(md, /gondolkodó \(reasoning\) tokenek összesen: 1234/);
});

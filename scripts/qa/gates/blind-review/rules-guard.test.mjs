// docs/specs/2026-11-18-vak-ellenor-deepseek.md — kizárólagosság és szabályrendszer: B12, B17, B18. Őr-teszt a VALÓDI fájlokon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib.mjs';
import { BOOL_FLAGS, VALUE_FLAGS } from './blind-review.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const read = (...p) => readFileSync(join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
const cfg = loadConfig().blindReview;

/** A függetlenség feltétele: a vak ellenőr modellje nem a fejlesztő ügynök modellcsaládja. */
export function isIndependentModel(model) {
  return typeof model === 'string' && /^[a-z0-9-]+\/[A-Za-z0-9._:-]+$/.test(model) && !/anthropic|claude|opus|sonnet|haiku|fable/i.test(model);
}

test('B12 / B17: a vak ellenőr modellje a konfig EGYETLEN sorában áll, nem Anthropic-modell, és az OpenRouteren fut', () => {
  // Tulajdonosi döntés 2026-11-19: „A teljes ökoszisztémában az ellenőr, független ellenőr modellt cseréld le […] a GPT-6.2 SOL modellre
  // high efforttal.” A csere tulajdonosi döntés + e teszt módosítása.
  assert.equal(cfg.model, 'openai/gpt-6.2-sol');
  assert.deepEqual(cfg.requestExtras?.reasoning, { effort: 'high' }, 'a tulajdonos high effortot rendelt el');
  assert.equal(cfg.requestExtras?.temperature, undefined, 'a modell nem fogad temperature paramétert');
  // Mért 2026-11-20: az Amazon Bedrock útvonalon a reasoning.effort nem érvényesül (0 gondolkodó token), az OpenAI és az Azure
  // útvonalon igen — a szolgáltató ezért rögzített, tartalék nélkül.
  assert.deepEqual(cfg.requestExtras?.provider, { order: ['OpenAI', 'Azure'], allow_fallbacks: false });
  assert.ok(cfg.minInvestigativeCalls >= 8, 'mélységi őr: legalább 8 vizsgáló eszközhívás');
  // GPT teljesítési őr (docs/specs/2026-11-20-gpt-teljesitesi-or.md): teljesség kötelező, legfeljebb 3 folytatás, streaming életjel-felügyelet.
  assert.equal(cfg.requireCompleteness, true);
  assert.equal(cfg.completenessMaxRetries, 3);
  assert.equal(cfg.stream, true);
  assert.ok(cfg.streamIdleSec > 0 && cfg.streamIdleSec <= 300);
  const addendum = readFileSync(join(here, 'futtato-kiegeszites.md'), 'utf8');
  for (const must of ['TELJESÍTÉSI SZERZŐDÉS', 'NEM interaktív', 'TELJESSÉG: <tárgyalt pontok> / <összes pont> pont — HIÁNYZÓ:', '`fix`', '`scenario`']) assert.ok(addendum.includes(must), must);
  const runner = readFileSync(join(here, 'blind-review.mjs'), 'utf8');
  assert.match(runner, /onReport: \(t, findings, runLog\) => reportGate\.onReport\(t, findings, runLog\)/, 'a teljesség-kapu be van kötve');
  assert.ok(isIndependentModel(cfg.model));
  for (const bad of ['anthropic/claude-opus-5', 'openrouter/claude-sonnet', 'x/Fable-5', 'claude', '', null, 'qwen4-max']) assert.equal(isIndependentModel(bad), false, String(bad));
  assert.equal(new URL(cfg.endpoint).hostname, 'openrouter.ai');
  // F2 (terv, 5. kiegészítés; tulajdonosi döntés 2026-11-19): a futtató kizárólagos — a kötelező ítélet a futtatóé, a Claude-alügynök
  // ítéletet nem ad. Visszakapcsolása KIZÁRÓLAG tulajdonosi döntéssel, ennek a sornak a módosításával.
  assert.equal(cfg.exclusive, true, 'blindReview.exclusive: BE (tulajdonosi döntés 2026-11-19)');
  assert.ok(Number.isFinite(Date.parse(cfg.exclusiveSince)) && cfg.exclusiveSince.startsWith('2026-11-19'), 'az átkapcsolás időpontja');
  assert.equal(cfg.mode, undefined, 'a régi mode mező megszűnt');
  assert.equal(cfg.requiredFrom, undefined, 'a dátumhoz kötött átállás megszűnt');
  assert.ok(cfg.minToolCalls >= 5);
  const raw = read('scripts', 'qa', 'gates', 'gates.config.json');
  assert.equal(raw.split(`"${cfg.model}"`).length - 1, 1, 'a modell-azonosító a konfigban pontosan egyszer szerepel');
});

test('B8: a költségplafon alapértéke 2 USD, kemény felső határa 6 USD; a korlátok megvannak', () => {
  assert.equal(cfg.maxUsdDefault, 2);
  assert.equal(cfg.maxUsdHardCap, 6);
  for (const k of ['maxRounds', 'maxRoundsHardCap', 'maxWallMinutes', 'maxWallMinutesHardCap', 'maxTokensPerCall', 'maxCompletionTokensTotal', 'commandTimeoutSec']) assert.ok(cfg[k] > 0, k);
  assert.equal(cfg.allowPlaywright, false, 'a böngészős futtatás alapból tiltott (e-mail- / DB-biztonság)');
  assert.ok(cfg.commandTimeoutSec < cfg.promptCache.ttlSec, 'egy parancs nem futhat tovább a gyorsítótár élettartamánál');
  assert.equal(cfg.promptCache.mode, 'none', 'az OpenAI-végpont maga gyorsítótáraz; cache_control töréspont nincs');
});

test('B17: a futtató kódjában nincs modell-literál és nincs modell- / szolgáltató- / végpont-kapcsoló (nincs megkerülő út)', () => {
  const files = readdirSync(here).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && f !== '_fixture.mjs');
  assert.ok(files.includes('blind-review.mjs') && files.includes('openrouter.mjs') && files.includes('tools.mjs'));
  for (const f of files) {
    const src = readFileSync(join(here, f), 'utf8');
    assert.doesNotMatch(src, /["'`](?:qwen|deepseek|anthropic|openai|google|x-ai|meta-llama|mistralai)\/[a-z0-9]/i, `${f}: modell-literál a kódban`);
    assert.doesNotMatch(src, /https?:\/\/[a-z0-9.-]*openrouter\.ai\/api/i, `${f}: beégetett végpont (a konfigból jöjjön)`);
    assert.doesNotMatch(src, /process\.env\.[A-Z_]*(MODEL|ENDPOINT|PROVIDER)/, `${f}: környezeti változós modell- / végpont-felülírás`);
  }
  for (const flag of [...VALUE_FLAGS, ...BOOL_FLAGS]) assert.doesNotMatch(flag, /model|provider|endpoint|report|summary|context|dev/i, flag);
  const runner = readFileSync(join(here, 'blind-review.mjs'), 'utf8');
  assert.match(runner, /model: cfg\.model/);
  // A mélységi őr a valódi futásban is be van kötve (a jelentés-ellenőrzés megkapja a futás mélységi adatait).
  // 2026-11-20: a mélységi őr a teljesség-kapun át (makeReportGate, useDepth: true) van bekötve.
  assert.match(runner, /makeReportGate\(\{[^}]*useDepth: true[^}]*\}\)/);
  assert.equal(runner.split('model:').filter((_, i) => i > 0).filter((rest) => !/^ (cfg\.model|result\.reportedModels|\{)/.test(rest) && !/^ ?[`'"]?\$?\{?(model|result)/.test(rest)).length, 0, 'a kérés modellje csak cfg.model lehet');
});

const RULE_FILES = ['AGENTS.md', 'CLAUDE.md', '.cursor/rules/vak-ellenor.mdc', '.cursor/rules/minosegkapuk.mdc', '.cursorrules', '.github/copilot-instructions.md',
  'docs/minosegkapuk.md', 'docs/agent-haromfazisu-munka.md', 'docs/codex-felhokornyezet.md',
  '.agents/skills/websuli-vak-ellenor/SKILL.md', '.agents/skills/websuli-fejlesztesi-ellenor/SKILL.md', '.agents/skills/websuli-push-elotti-kapu/SKILL.md',
  '.agents/skills/websuli-pr-elotti-kapu/SKILL.md', '.agents/skills/websuli-merge-elotti-kapu/SKILL.md'];
const OPTIONAL_RULE_FILES = ['CODEX.md', 'GEMINI.md', '.windsurfrules', '.clinerules'];

test('B18: minden ügynök-vezérlő fájl és kapu-skill a futtató parancsára mutat (kitörlésnél bukik); a kapcsoló szabályát kimondják', () => {
  for (const f of RULE_FILES) assert.ok(read(...f.split('/')).includes('gate:blind-review'), `nincs futtató-hivatkozás: ${f}`);
  for (const f of OPTIONAL_RULE_FILES) if (existsSync(join(root, f))) assert.ok(read(f).includes('gate:blind-review'), `létező vezérlőfájl futtató-hivatkozás nélkül: ${f}`);
  for (const f of ['AGENTS.md', 'CLAUDE.md', '.cursor/rules/vak-ellenor.mdc', '.cursorrules', '.github/copilot-instructions.md', 'docs/minosegkapuk.md', '.agents/skills/websuli-vak-ellenor/SKILL.md']) {
    assert.ok(read(...f.split('/')).includes('blindReview.exclusive'), `a kizárólagosság kapcsolója nincs megnevezve: ${f}`);
  }
  const agents = read('AGENTS.md');
  const sec = agents.slice(agents.indexOf('## Vak hibakereső ellenőr — kötelező'), agents.indexOf('## Minőségkapuk'));
  for (const must of ['npm run gate:blind-review', 'KIZÁRÓLAG a gépi futtató', '`blindReview.exclusive` BE', 'openai/gpt-6.2-sol', 'GPT-6.2 SOL modellre high efforttal', 'csendes tartalék nincs', 'websuli-vak-ellenor', 'nem Anthropic']) {
    assert.ok(sec.includes(must), `az AGENTS.md szakaszából hiányzik: ${must}`);
  }
  assert.match(read('CLAUDE.md'), /AGENTS\.md/);
});

test('B18 / K3: a websuli-vak-ellenor skill tükrözött, automatikus betöltésre szóló leírással és a kötelező tartalommal', () => {
  assert.ok(loadConfig().mirroredSkills.includes('websuli-vak-ellenor'));
  const skill = read('.agents', 'skills', 'websuli-vak-ellenor', 'SKILL.md');
  assert.equal(read('.claude', 'skills', 'websuli-vak-ellenor', 'SKILL.md'), skill, 'a tükör bájtra azonos');
  const desc = /^description: (.*)$/m.exec(skill)?.[1] ?? '';
  for (const re of [/MINDEN elkészült fejlesztés \/ javítás után/, /a PR megnyitása ELŐTT/, /minden javító feltöltés előtt/, /blindReview\.exclusive/, /KIZÁRÓLAG ez a futtató/, /npm run gate:blind-review/, /nem adhatja át/]) assert.match(desc, re);
  for (const must of ['## 1. Mikor kötelező', '## 3. A parancs', '## 4. A `--goal` fájl', '## 6. Mit tegyél az ítélet szerint', '## 7. Ha a futtató megáll', 'TILOS a `--goal` fájlba', 'Gépi összegzés', 'Visszakapcsolás csak tulajdonosi döntéssel', 'run_browser_scenario', 'részben igazolt']) {
    assert.ok(skill.includes(must), `a skillből hiányzik: ${must}`);
  }
  assert.ok(skill.includes(cfg.model), 'a skill a konfigurált modellt nevezi meg');
  assert.ok(read('.agents', 'skills', 'websuli-fejlesztesi-ellenor', 'SKILL.md').includes('websuli-vak-ellenor'), 'a megbízás-sablon skillje a futtató skilljére mutat');
});

test('a package.json szkriptje a futtatóra mutat', () => {
  assert.equal(JSON.parse(read('package.json')).scripts['gate:blind-review'], 'node scripts/qa/gates/blind-review/blind-review.mjs');
});

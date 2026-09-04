import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  LEGACY_MODELS,
  aiKeyStatus,
  effortFor,
  providerForModel,
  requiredKeyFor,
  resolveLegacyModel,
  type LegacyTask,
} from "../server/ai/models";

/**
 * Guard for a defect class measured 2026-09-04 against the live Render service.
 *
 * The admin AI features (the "okosítás", HTML repair, theme rewrite, file analysis,
 * ChatGPT chat) each construct a vendor SDK with `process.env.<KEY>` and a model id.
 * Two things had drifted apart from `models.ts`:
 *
 *  - three model ids were still string literals in `routes.ts` and `improveAsync.ts`,
 *    so retuning a model meant editing request handlers again — exactly what LS-0d set
 *    out to end;
 *  - production had NONE of the three AI keys set, and nothing said so. The routes
 *    build the client anyway, so the first admin click surfaces a raw SDK error rather
 *    than "nincs API kulcs".
 *
 * These tests pin both: every model id comes from `models.ts`, and every AI task can
 * name the key it needs so a startup check (and the admin diagnostics endpoint) can
 * report readiness without ever reading a key's value.
 */

const SERVER = path.join(import.meta.dirname, "..", "server");
const read = (rel: string) => readFileSync(path.join(SERVER, rel), "utf8");

test("nincs beégetett modell-azonosító a route-okban és az okosításban", () => {
  // Vendor model ids look like `gpt-4o`, `claude-sonnet-4-20250514`, `qwen/...`.
  const MODEL_LITERAL = /model:\s*["'`]([\w.\-/]+)["'`]/g;
  const offenders: string[] = [];

  for (const rel of ["routes.ts", "improveAsync.ts", "gameQuizGeneratorService.ts"]) {
    const src = read(rel);
    for (const m of src.matchAll(MODEL_LITERAL)) {
      offenders.push(`${rel} → ${m[1]}`);
    }
    // The improve flow used its own MODELS array; that is the same defect in list form.
    if (/const\s+MODELS\s*=\s*\[/.test(src)) {
      offenders.push(`${rel} → saját MODELS tömb`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "Ezek a modellek nem a models.ts-ből jönnek, tehát nem állíthatók egy helyen:\n" +
      offenders.join("\n"),
  );
});

test("a render.yaml deklarálja mind a három AI-kulcsot", () => {
  // Measured 2026-09-04: production had zero AI keys and render.yaml named none, so a
  // blueprint redeploy would have silently produced a service where every AI feature
  // dies on first click. `sync: false` keeps the VALUE in the dashboard; what belongs
  // in the repo is the fact that the variable must exist.
  const yaml = readFileSync(
    path.join(import.meta.dirname, "..", "..", "render.yaml"),
    "utf8",
  );

  const missing = [
    "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
    "AI_INTEGRATIONS_OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
  ].filter((key) => !yaml.includes(key));

  assert.deepEqual(missing, [], `a render.yaml-ból hiányzik: ${missing.join(", ")}`);

  // A kulcs ÉRTÉKE soha nem kerülhet a repóba.
  assert.ok(
    !/sk-[A-Za-z0-9_-]{20,}/.test(yaml),
    "a render.yaml valódi kulcs-értéket tartalmaz — azonnal vissza kell vonni",
  );
});

test("az okosítás modelljei a models.ts-ből jönnek", () => {
  assert.ok(Array.isArray(LEGACY_MODELS.improve), "az improve egy sorrendezett lista");
  assert.ok(LEGACY_MODELS.improve.length >= 2, "van tartalék modell is");
  assert.equal(LEGACY_MODELS.improve[0], "claude-opus-5");
});

test("az okosítás tartalék modellje MÁS szolgáltatónál van", () => {
  // Owner decision 2026-09-04. A második Anthropic modell nem tartalék: pont azért
  // esünk vissza, mert az Anthropic túlterhelt. A régi haiku-tartalék ráadásul
  // gyengébb anyagot adott, mint a bemenet.
  const [primary, fallback] = LEGACY_MODELS.improve;

  assert.notEqual(
    providerForModel(primary),
    providerForModel(fallback),
    "a tartaléknak másik szolgáltatót kell hívnia",
  );
  assert.equal(providerForModel(fallback), "openrouter");
  assert.equal(fallback, "z-ai/glm-5.3-flash");
});

test("nincs elavult modell-generáció a routingban", () => {
  // Regresszió-őr a 2026-09-04-i frissítéshez: ezek a modellek már nem megfelelőek.
  const RETIRED = [
    "gpt-4o",
    "gpt-4o-2024-11-20",
    "gpt-5",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-sonnet-4-20250514",
  ];
  const inUse = new Set(
    Object.values(LEGACY_MODELS).flatMap((v) => (Array.isArray(v) ? [...v] : [v])),
  );

  const stale = RETIRED.filter((m) => inUse.has(m));
  assert.deepEqual(stale, [], `elavult modellek maradtak a routingban: ${stale.join(", ")}`);
});

test("minden legacy feladat megmondja, melyik kulcs kell hozzá", () => {
  const tasks: LegacyTask[] = [
    "htmlFix",
    "htmlTheme",
    "htmlFixStream",
    "claudeChat",
    "analyzeFiles",
    "chatgptChat",
    "improve",
    "quizGenerator",
  ];

  for (const task of tasks) {
    const key = requiredKeyFor(task);
    assert.match(
      key,
      /^AI_INTEGRATIONS_(OPENAI|ANTHROPIC)_API_KEY$/,
      `${task} kulcsneve nem valós: ${key}`,
    );
  }

  assert.equal(requiredKeyFor("improve"), "AI_INTEGRATIONS_ANTHROPIC_API_KEY");
  assert.equal(requiredKeyFor("chatgptChat"), "AI_INTEGRATIONS_OPENAI_API_KEY");
});

test("resolveLegacyModel környezeti felülírást is elfogad", () => {
  assert.equal(resolveLegacyModel("chatgptChat", {}), "gpt-5.6-sol");
  assert.equal(
    resolveLegacyModel("chatgptChat", { LEGACY_MODEL_CHATGPT_CHAT: "gpt-5.6-luna" }),
    "gpt-5.6-luna",
  );
  // Üres felülírás nem számít felülírásnak.
  assert.equal(
    resolveLegacyModel("chatgptChat", { LEGACY_MODEL_CHATGPT_CHAT: "  " }),
    "gpt-5.6-sol",
  );
});

test("a hosszú generáló feladatok medium reasoning efforttal futnak", () => {
  // A két szolgáltató MÁSKÉNT nevezi ezt a paramétert; a route-ok a megfelelő alakot
  // küldik (OpenAI: reasoning_effort, Anthropic: output_config.effort) — mindkettő
  // élő hívással igazolva 2026-09-04.
  for (const task of ["improve", "claudeHtml", "analyzeFiles", "chatgptChat"] as LegacyTask[]) {
    assert.equal(effortFor(task), "medium", `${task} effortja nem medium`);
  }
});

test("providerForModel az azonosító alakjából dönt", () => {
  assert.equal(providerForModel("claude-opus-5"), "anthropic");
  assert.equal(providerForModel("gpt-5.6-sol"), "openai");
  assert.equal(providerForModel("z-ai/glm-5.3-flash"), "openrouter");
});

test("aiKeyStatus kulcsérték nélkül jelenti a készenlétet", () => {
  const status = aiKeyStatus({
    AI_INTEGRATIONS_OPENAI_API_KEY: "sk-titkos-ertek",
    OPENROUTER_API_KEY: "",
  });

  const flat = JSON.stringify(status);
  assert.ok(!flat.includes("sk-titkos-ertek"), "a kulcs ÉRTÉKE soha nem szivároghat ki");

  assert.equal(status.openai.configured, true);
  assert.equal(status.anthropic.configured, false);
  assert.equal(status.openrouter.configured, false, "üres string nem beállított kulcs");
});

test("aiKeyStatus megnevezi, mely funkciók esnek ki egy hiányzó kulcs miatt", () => {
  const status = aiKeyStatus({ AI_INTEGRATIONS_OPENAI_API_KEY: "x" });

  assert.ok(
    status.anthropic.blockedFeatures.includes("improve"),
    "az okosítás Claude-ot használ, tehát a hiányzó Anthropic kulcs kiüti",
  );
  assert.ok(status.openai.blockedFeatures.length === 0, "a beállított kulcs semmit nem blokkol");
});

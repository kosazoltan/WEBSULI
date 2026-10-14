/**
 * Central model routing for the Lesson Studio pipeline (LS-0d).
 *
 * Why this file exists: model ids used to be string literals inside routes.ts, so
 * changing a model meant editing request handlers, and nothing could check that two
 * pipeline steps were not accidentally the same model.
 *
 * The D1 rule ("the source always wins") is enforced by a Lektor that re-reads the
 * Author's lesson against the KnowledgeMap. If both run on the same model family the
 * review is worthless — a model rarely catches its own fabrication. `assertDistinctFamilies`
 * makes that a startup error rather than a silent quality loss.
 *
 * Owner decision 2026-09-04: no local models. The workstation GPU is dead, so every id
 * here is hosted; Terra and Grok use direct vendor APIs (2026-09-11).
 */

export const STUDIO_STEPS = [
  "extract",
  "ocr",
  // Spec 2026-10-14-forras-besorolo-openai-luna: a tantárgy/évfolyam-felismerés saját lépés (korábban az `ocr` modelljén futott).
  "scope",
  "pedagogue",
  "author",
  "animator",
  // Spec 2026-09-19: the 45/75 practice bank is its own role (bulk JSON on a cheap model),
  // still built inside the animator step but routed and budgeted separately.
  "bank",
  "lektor",
  "gateHelper",
  "quizPolish",
] as const;

export type StudioStep = (typeof STUDIO_STEPS)[number];

/** Environment-variable name that overrides a step, e.g. STUDIO_MODEL_AUTHOR. */
function envVarName(step: StudioStep): string {
  return `STUDIO_MODEL_${step.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

/**
 * Terra/Grok direct access verified 2026-09-11; OCR retains OpenRouter routing.
 * Fallbacks live in FALLBACK_MODELS and are used by the provider factory on failure.
 */
const DEFAULT_MODELS: Record<StudioStep, string> = {
  extract: "gpt-5.6-terra", // vision + verbatim quoting
  // #190 (mérve 2026-09-06, 3 valódi kézírásos matek-lapon, kulcs-token recall;
  //  a mérés REPRODUKÁLHATÓ: tests/studio-ocr-recall.test.ts a rögzített
  //  átiratokból számol újra, hálózat nélkül):
  //   qwen3-vl-32b-instruct  92.6%   <- ez
  //   gemini-3.1-flash-lite  90.2%
  //   glm-5.3-flash          86.8%   (a korábbi elsődleges)
  // A tulajdonos kézírásos jegyzeteket is feltölt, és >=95% felismerést kért:
  // ez a cél a mezőnyben NINCS elérve, a legjobb elérhető opciót választjuk.
  // A glm az `r`-t rendszeresen `m`-nek olvasta (r=4cm -> m=4cm), ami a
  // fogalmak idézet-ellenőrzését is elbuktatta.
  // Újramérve 2026-09-23 ugyanezen a 3 valódi lapon, a „Magyar kézírás” OCR-skillel (tulajdonosi döntés
  // a mérés után: qwen marad, GLM az ellenőrző):
  //   qwen3-vl-32b-instruct  95.4%  <- ez (nem gondolkodó modell)
  //   glm-5.3-flash          89.1%  (a kettős olvasás második olvasója, FALLBACK_MODELS.ocr)
  //   gpt-5.6-luna           87.3%  (átfogalmaz: „ezerév” -> „évezred” — verbatim OCR-re alkalmatlan)
  //   deepseek-v4.1-flash     0.0%  (hibrid gondolkodás: az effort=low-t figyelmen kívül hagyja, a 6000
  //                                  tokenes keretből 5998 gondolkodás, minden válasz csonkolt)
  ocr: "qwen/qwen3-vl-32b-instruct",
  // Tulajdonosi döntés 2026-10-14 (docs/specs/2026-10-14-forras-besorolo-openai-luna.md): a qwen3-vl-32b-t az OpenRouter
  // 2026-10-09-én kivezette (404), és a tantárgy/évfolyam-felismerés ezen állt meg (4 élő futás). Saját OpenAI-kulcs, GPT-6 Luna
  // („GPT-6.1 Luna” nem létezik: /v1/models + 404). Mérve high efforttal 56 jóváhagyott forráson: tantárgy 102/112, évfolyam
  // ±1-en belül 93/112; a 10 leckés kézi pilot-besoroláson 20/20; 0,001 USD/hívás.
  scope: "gpt-6-luna",
  // Spec 2026-09-19 (tulajdonosi döntés): a tervkészítő a közvetlen Anthropic API-n futó
  // Opus 5, medium efforttal — a terv minősége dönti el a további körök számát.
  pedagogue: "claude-opus-5",
  // Tulajdonosi döntés 2026-09-29 (docs/specs/2026-09-29-szerzomodell-gpt6-luna.md): GPT-6 Luna, tartaléka
  // GPT-5.6 Terra. Mérve ugyanazon a webes jobon: Luna 2/2 érvényes, sémát teljesítő lecke (84 s, 96 s);
  // a Terra élesben egyszer érvénytelen JSON-t adott, és tartalék híján az egész gyártás leállt.
  // Tulajdonosi döntés 2026-10-05 (docs/specs/2026-10-05-lektor-szerzo-modellcsere.md): a szerző Claude Opus 5.5 (a lektor
  // OpenAI-ra került, a D1-független lektor szabálya így marad teljesítve); tartaléka Qwen 3.8 max-prime (OpenRouter, high).
  author: "claude-opus-5-5", // long structured Hungarian output
  // Spec 2026-09-19 (mérve, két 46–49 fogalmas futás): az animátor+bank a lecke költségének
  // 3/4-e volt Terrán (~3 USD). A glm-5.3-flash 6,3 s alatt, 0 gondolkodó tokennel, érvényes
  // magyar bankcsomag-JSON-t adott (0,09/0,30 USD/M); a rubrikát determinisztikus kód ellenőrzi.
  // Tulajdonosi döntés 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md): az ábrákat Claude Opus 5.5
  // tervezi (a glm-flash rajzi/téri feladatra gyenge volt — „csak egy kört rajzolt”). A kimenet csak ábra-folt,
  // nem a teljes lecke, így a kimeneti tokenszám kicsi. Élő próbahívás: HTTP 200 (2026-09-24).
  animator: "claude-opus-5-5",
  // Spec 2026-09-24 (docs/specs/2026-09-24-bankmodell-valasztas.md, tulajdonosi utasítás): ugyanazon a leckén,
  // a termelési banképítő úton, a kész bankot a bank-ellenőr mérte: glm-5.3-flash 653 s, 9 bukott kísérlet,
  // 22/146 hiba; gpt-5.6-luna 130/143 s, 5/4 bukott, 9/144 hiba (két futás), 0,09 USD; terra 8/144, 0,71 USD;
  // sonnet-5 17/146; glm-5.3 építési hiba. A glm javító köre nem konvergált (újraépítve 16/106 hiba).
  bank: "gpt-5.6-luna",
  // 2026-09-09 (tulajdonosi döntés): a `qwen/qwen3.8-max` id eltűnt az OpenRouter nyilvános
  // /models listájából (csak `qwen3.8-max-0902` maradt), ezért a lektor Grok 4.6-ra vált.
  // x-ai és openai külön család; a szerző tartaléka is openai (spec 2026-09-29), így a lektor független marad.
  // Tulajdonosi döntés 2026-10-05: a grok-4.6 helyett GPT-6.1 Sol — „képes hosszú futásokra, nem akad el” (mérve élesben:
  // „[xAI] Request timed out.”, és üres grok-válasz a Mezopotámia-futáson). Responses API, medium effort, streamelve.
  lektor: "gpt-6.1-sol", // MUST differ in family from author
  gateHelper: "deepseek/deepseek-v4-flash", // cheap classification (0,04/0,08 USD/M)
  quizPolish: "deepseek/deepseek-v4-flash",
};

/**
 * Spec 2026-09-19: the bank packet's rescue model — after PACKET_ATTEMPTS failed attempts on the
 * cheap primary/fallback the packet is rebuilt once on the strong author-class model.
 */
export const BANK_RESCUE_MODEL = "gpt-5.6-terra";

/**
 * Spec 2026-10-05-s11/2 (tulajdonosi döntés): a vitatott OCR-helyek harmadik, erős, független olvasója (2 a 3-ból). Mért a
 * Mezopotámia-füzetfotón: gpt-6.1-sol 8,3 s alatt szinte hibátlan olvasat (a két alap-olvasó 11 helyen eltért).
 */
export const OCR_THIRD_READER_MODEL = "gpt-6.1-sol";

/** Az OCR-olvasó gondolkodási mélysége (OpenAI: `reasoning_effort`, OpenRouter: `reasoning`, Anthropic: `output_config.effort`). */
export type OcrEffort = "low" | "medium" | "high";

/**
 * Spec 2026-10-14-forras-besorolo-openai-luna: a `scope` lépés gondolkodási mélysége — ezzel mérve (gpt-6-luna). A kimenet
 * high mellett p95 1475, max 2448 token; a kérés kerete ehhez igazodik (`scopeRequestParams`).
 */
export const SCOPE_EFFORT: OcrEffort = "high";
export type OcrReaderSpec = { readonly model: string; readonly effort: OcrEffort };

/**
 * Spec 2026-10-05-s11/7 (tulajdonosi döntés a friss 4-lapos futás után, map d344e889): a studió forrás-OCR-je KÉT ERŐS, független
 * olvasóval fut (A = gpt-6.1-sol high, B = claude-opus-5-5 medium), a döntő a fúziójuk. Az A az összerakás alapja.
 */
export const OCR_FUSION_READERS = [
  { model: "gpt-6.1-sol", effort: "high" },
  { model: "claude-opus-5-5", effort: "medium" },
] as const satisfies readonly [OcrReaderSpec, OcrReaderSpec];

/** Spec S11/7: a fúziós lépés (csak választ vitánként: A | B | own) — a végső szöveget a kód rakja össze. */
export const OCR_FUSION_DECIDER: OcrReaderSpec = { model: "gpt-6.1-sol", effort: "high" };

/**
 * Spec 2026-09-30 (U6, C11): modellenkénti kimeneti plafon a hosszkorlát utáni EGYSZERI nagyobb kerethez. Forrás: az
 * OpenRouter /models lista `top_provider.max_completion_tokens` mezője, 2026-09-30-án lekérve
 * (`docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/evidence-models-raw.json`). Ismeretlen modellnél nincs
 * újrapróba (a régi viselkedés: a csonka válasz hiba). Kulcs: a gyártó-előtag és a pont/kötőjel különbség nélkül.
 */
const MAX_OUTPUT_BY_MODEL: Record<string, number> = {
  "gpt-6-luna": 128_000, "gpt-6-astra": 128_000, "gpt-5-6-terra": 128_000, "gpt-6-1-sol": 128_000,
  "claude-opus-5-5": 128_000, "claude-opus-5": 128_000, "claude-sonnet-5": 128_000,
  "qwen3-8-max-prime": 131_072, "qwen3-8-max-0902": 131_072, // 0902: OpenRouter /models + /endpoints, 2026-10-14
  "glm-5-3-flash": 943_717, "grok-4-6": 450_000, "deepseek-v4-flash": 384_000, "qwen3-vl-32b-instruct": 32_768,
};
export function maxOutputForModel(modelId: string): number | undefined {
  const key = modelId.replace(/^[^/]+\//, "").replace(/\./g, "-").toLowerCase();
  return MAX_OUTPUT_BY_MODEL[key];
}

/**
 * Spec 2026-09-30-nem-elakado-kozzetetel (4. szelet): a második tartalék, csak modellhívás-hibára. A SZERZŐ szándékosan
 * nincs benne: tulajdonosi döntés 2026-09-29 (szerzomodell-gpt6-luna) — a szerző nem eshet ki a saját (openai)
 * családjából, hogy a lektor független maradjon. A lektor második tartaléka ezért sem openai.
 */
export const SECOND_FALLBACK_MODELS = {
  pedagogue: "gpt-5.6-terra",
  // Tulajdonosi döntés 2026-10-05: a lektor lánca gpt-6.1-sol → gpt-5.6-terra; a korábbi második tartalék (claude-opus-5-5)
  // a szerző (anthropic) családjába esne, ezért megszűnt.
} as const satisfies Partial<Record<StudioStep, string>>;

/**
 * Tulajdonosi döntés 2026-10-14 (docs/specs/2026-10-14-ellentetes-csalad-tartalek.md): minden OpenAI GPT elsődleges tartaléka
 * az Anthropic Opus 5.5, minden Anthropic elsődlegesé az OpenAI GPT-6.1 Sol — mindkettő medium efforttal (a hívó
 * `{ fallback: true }`-val kéri, lásd `createStudioStepProvider`). Más családú elsődleges (qwen, glm, deepseek, grok) változatlan.
 */
export const CROSS_FAMILY_FALLBACK: Readonly<Record<"openai" | "anthropic", string>> = {
  openai: "claude-opus-5-5",
  anthropic: "gpt-6.1-sol",
};
export const CROSS_FAMILY_FALLBACK_EFFORT = "medium" as const;
/** Az elsődleges modell ellentétes családú tartaléka; OpenAI/Anthropic családon kívül `undefined`. */
export function crossFamilyFallback(model: string): string | undefined {
  const family = modelFamily(model);
  return family === "openai" || family === "anthropic" ? CROSS_FAMILY_FALLBACK[family] : undefined;
}
/** A tartalékhívás effortja: az ellentétes családú tartalék medium; minden más modellnél nincs felülírás. */
export function isCrossFamilyFallbackModel(model: string): boolean {
  return Object.values(CROSS_FAMILY_FALLBACK).includes(model);
}
/**
 * Review #216: a lépés TÉNYLEGES (env-vel felülírható) elsődlegeséből képzett tartalék — OpenAI/Anthropic elsődlegesnél az
 * ellentétes család, más családnál a `FALLBACK_MODELS` tábla (a korábbi útvonal). Így `STUDIO_MODEL_PEDAGOGUE=gpt-6-luna`
 * mellett a tartalék Opus 5.5, nem ugyanaz a család.
 */
export function fallbackModelFor(
  step: StudioStep,
  env: EnvLike = process.env,
  table: Partial<Record<StudioStep, string>> = FALLBACK_MODELS,
): string | undefined {
  return crossFamilyFallback(resolveStudioModel(step, env)) ?? table[step];
}

/**
 * Tulajdonosi döntés 2026-10-14: ha a leckébe GPT (a szerző tartaléka) írt, a lektor harmadik családra vált — Qwen 3.8 Max 0902,
 * OpenRouteren, high efforttal (`MODEL_REASONING_EFFORT`). Az OpenRouter /models listáján ellenőrizve 2026-10-14.
 */
export const LEKTOR_THIRD_FAMILY_MODEL = "qwen/qwen3.8-max-0902";

export const FALLBACK_MODELS: Partial<Record<StudioStep, string>> = {
  extract: "grok-4.6",
  // Tulajdonosi döntés 2026-09-23: Gemini nem használható. Az OCR tartaléka és a kettős olvasás második,
  // független olvasója a GLM 5.3 Flash (mért 89.1%, más család; a Luna átfogalmazott, 87.3%).
  ocr: "z-ai/glm-5.3-flash",
  // Tulajdonosi döntés 2026-10-14: ellentétes családú tartalék (a korábbi grok-4.6 helyett); a második tartalék (terra) marad.
  pedagogue: CROSS_FAMILY_FALLBACK.anthropic,
  // Tulajdonosi döntés 2026-10-14: a szerző tartaléka GPT-6.1 Sol (a korábbi Qwen 3.8 max-prime helyett). A D1-független
  // lektor ezért a tényleges szerzőség szerint választ (`lektorChainFor`): GPT-szerzőnél Qwen 3.8 Max 0902.
  author: CROSS_FAMILY_FALLBACK.anthropic,
  // Tulajdonosi döntés 2026-10-14: ellentétes családú tartalék (a korábbi gpt-5.6-terra helyett, medium efforttal).
  animator: CROSS_FAMILY_FALLBACK.anthropic,
  // Tulajdonosi döntés 2026-10-14: a bank (gpt-5.6-luna) első tartaléka az ellentétes család, Opus 5.5; a mentőkör
  // (BANK_RESCUE_MODEL) változatlan. (Korábban: mérve 2026-09-20, a tartalék egyből az erős mentőmodell volt.)
  bank: CROSS_FAMILY_FALLBACK.openai,
  gateHelper: "z-ai/glm-5.3-flash",
  quizPolish: "z-ai/glm-5.3-flash",
  // Spec 2026-09-19 (mérve élesben): a grok-4.6 lektor 480 s után időtúllépett és a
  // gyártás generikus hibával állt meg. A tartalék OpenRouteren futó Anthropic-modell —
  // az „anthropic" család különbözik a szerző „openai" családjától, így az
  // `assertDistinctFamilies` őr a tartalékra is teljesül. Létezése és válasza az
  // OpenRouter /models listán és egy valódi hívással ellenőrizve (2026-09-19).
  // Tulajdonosi döntés 2026-10-14: a lektor (gpt-6.1-sol) ellentétes tartaléka Opus 5.5 — de a futás a tényleges szerzőség
  // szerinti láncot használja (`lektorChainFor`), amely a szerzők családját kiszűri (Claude-szerzőnél ez a tag kiesik → Qwen).
  lektor: CROSS_FAMILY_FALLBACK.openai,
};

/**
 * Tulajdonosi döntés 2026-10-05: modellenkénti gondolkodási effort, ha a lépés szabályzata nem ad meg (a szerző-tartalék Qwen
 * „maximum efforttal”; a `high` a konfigurációs típus és az OpenRouter dokumentált felső foka).
 * Tulajdonosi döntés 2026-10-14: a harmadik családú lektor (Qwen 3.8 Max 0902) high efforton.
 */
export const MODEL_REASONING_EFFORT: Readonly<Record<string, "low" | "medium" | "high">> = {
  "qwen/qwen3.8-max-prime": "high",
  [LEKTOR_THIRD_FAMILY_MODEL]: "high",
};

/**
 * Model ids the pre-Studio routes already used.
 *
 * These are vendor SDK ids (Anthropic / OpenAI direct), not a
 * single family — the admin features predate the Studio and call the vendors straight.
 * They live here for the same reason the Studio ids do: a model change must be one edit
 * in one file, not a hunt through 5,600 lines of request handlers.
 *
 * Refreshed 2026-09-04 (owner decision). The previous generation — `gpt-5`, `gpt-4o`,
 * `claude-sonnet-4`, `claude-3-5-sonnet`, `claude-3-5-haiku` — had aged out; the haiku
 * fallback in particular was weak enough to make a "successful" retry produce worse
 * material than no retry at all. Every id below was verified against the vendor's live
 * model list and answered a real request before being written here.
 */
export const LEGACY_MODELS = {
  /** adminRouter POST /html-fix/errors — Claude JSON HTML repair (routes.ts ~1226) */
  htmlFix: "claude-opus-5",
  /** adminRouter POST /html-fix/theme — Claude JSON theme rewrite (routes.ts ~1316) */
  htmlTheme: "claude-opus-5",
  /** Enhanced Creator SSE two-phase OpenAI HTML fix (routes.ts ~1479, ~1508) */
  htmlFixStream: "gpt-6.1-sol",
  /** Enhanced Creator Claude chat stream, full HTML generation (routes.ts ~1790) */
  claudeChat: "claude-opus-5",
  /** Vision analysis of uploaded files (routes.ts ~1942 multi, ~2055 single) */
  analyzeFiles: "gpt-6.1-sol",
  /** Enhanced Creator ChatGPT chat stream (routes.ts ~2212) */
  chatgptChat: "gpt-6.1-sol",
  /** Enhanced Creator Claude HTML generation stream (routes.ts ~2417) */
  claudeHtml: "claude-opus-5",
  /** HTML modernisation: Anthropic primary, direct OpenAI Terra fallback. */
  improve: ["claude-opus-5", "gpt-5.6-terra"],
  /** Quiz item generation from a material (gameQuizGeneratorService.ts) */
  quizGenerator: "claude-opus-5",
  /**
   * Internetes tananyag — csak a forrásgyűjtés (web_search + web_fetch).
   * A szerzői HTML és a 45/75 bank a Studio `author` modellt használja
   * (`resolveStudioModel("author")`), nem ezt az azonosítót.
   */
  webResearch: "claude-opus-5",
} as const;

export type LegacyTask = keyof typeof LEGACY_MODELS;

/**
 * Reasoning effort per task, for the models that accept one.
 *
 * Verified live 2026-09-04, because the two vendors spell this differently and guessing
 * would have produced a 400 in production:
 *
 *  - OpenAI (`gpt-6.1-sol`, tulajdonosi döntés 2026-10-03 a gpt-5.6-sol helyett): top-level `reasoning_effort: "medium"`.
 *  - Anthropic (`claude-opus-5`): `output_config: { effort: "medium" }`. The older
 *    `thinking: {type:"enabled"}` shape is rejected by this model — the API itself
 *    replied "use thinking.type.adaptive and output_config.effort".
 *
 * Medium everywhere: these are long structured-HTML jobs where low effort degrades the
 * output and high effort mostly buys latency.
 */
export const TASK_EFFORT: Partial<Record<LegacyTask, "low" | "medium" | "high">> = {
  htmlFix: "medium",
  htmlTheme: "medium",
  htmlFixStream: "medium",
  claudeChat: "medium",
  analyzeFiles: "medium",
  chatgptChat: "medium",
  claudeHtml: "medium",
  improve: "medium",
  quizGenerator: "medium",
  webResearch: "low",
};

/** Effort for a task, or undefined when the task/model takes none. */
export function effortFor(task: LegacyTask): "low" | "medium" | "high" | undefined {
  return TASK_EFFORT[task];
}

/** Prefixes retained in old environment overrides also route directly. */
export function providerForModel(modelId: string): AIVendor {
  if (modelId.startsWith("openai/")) return "openai";
  if (modelId.startsWith("x-ai/") || modelId.startsWith("grok-")) return "xai";
  if (modelId.includes("/")) return "openrouter";
  return modelId.startsWith("claude") ? "anthropic" : "openai";
}

/** The env var a given model id needs. */
export function keyNameForModel(modelId: string): string {
  return AI_KEY_NAMES[providerForModel(modelId)];
}

/**
 * Which API key each legacy task needs.
 *
 * Explicit rather than inferred from the model id: `gpt-6.1-sol` obviously means OpenAI
 * today, but the mapping is what a readiness check reports to an admin, and a guess
 * there is worse than no check. Measured 2026-09-04: production had none of these set,
 * and every route built its SDK client anyway — the first admin click got a raw vendor
 * error instead of "nincs API kulcs".
 */
const TASK_KEYS: Record<LegacyTask, "openai" | "anthropic"> = {
  htmlFix: "anthropic",
  htmlTheme: "anthropic",
  htmlFixStream: "openai",
  claudeChat: "anthropic",
  analyzeFiles: "openai",
  chatgptChat: "openai",
  claudeHtml: "anthropic",
  improve: "anthropic",
  quizGenerator: "anthropic",
  webResearch: "anthropic",
};

export const AI_KEY_NAMES = {
  openai: "AI_INTEGRATIONS_OPENAI_API_KEY",
  anthropic: "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
} as const;

export type AIVendor = keyof typeof AI_KEY_NAMES;

/** The environment variable a task's provider reads. */
export function requiredKeyFor(task: LegacyTask): string {
  return AI_KEY_NAMES[TASK_KEYS[task]];
}

/** Environment-variable name overriding a legacy task, e.g. LEGACY_MODEL_CHATGPT_CHAT. */
function legacyEnvVarName(task: LegacyTask): string {
  return `LEGACY_MODEL_${task.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

/**
 * The model a legacy task should use, honouring a non-blank environment override.
 *
 * For `improve` this returns the primary; the runner reads `LEGACY_MODELS.improve` for
 * the whole fallback chain.
 */
export function resolveLegacyModel(task: LegacyTask, env: EnvLike = process.env): string {
  const override = env[legacyEnvVarName(task)];
  if (typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }
  const value = LEGACY_MODELS[task];
  return Array.isArray(value) ? value[0] : value;
}

export type AIKeyStatus = Record<
  AIVendor,
  {
    /** Whether the key is present and non-blank. NEVER the key itself. */
    configured: boolean;
    envVar: string;
    /** Admin features that cannot run while this key is missing. */
    blockedFeatures: string[];
  }
>;

/**
 * Report which AI providers are ready, without ever touching a key's value.
 *
 * Returns the blocked feature list too, because "OPENROUTER_API_KEY missing" means
 * nothing to the owner while "a Tudás-térkép kinyerés nem fog menni" does.
 */
export function aiKeyStatus(env: EnvLike = process.env): AIKeyStatus {
  const isSet = (name: string) => {
    const v = env[name];
    return typeof v === "string" && v.trim().length > 0;
  };

  const featuresOf = (vendor: AIVendor): string[] => {
    return [...(Object.keys(TASK_KEYS) as LegacyTask[]).filter((t) => TASK_KEYS[t] === vendor),
      ...STUDIO_STEPS.filter(step => providerForModel(resolveStudioModel(step, env)) === vendor)];
  };

  return Object.fromEntries(
    (Object.keys(AI_KEY_NAMES) as AIVendor[]).map((vendor) => {
      const envVar = AI_KEY_NAMES[vendor];
      const configured = isSet(envVar) || (vendor === "openai" && isSet("OPENAI_API_KEY"));
      return [vendor, { configured, envVar, blockedFeatures: configured ? [] : featuresOf(vendor) }];
    }),
  ) as AIKeyStatus;
}

type EnvLike = Record<string, string | undefined>;

/** Resolves the model for a step, honouring a non-blank environment override. */
export function resolveStudioModel(step: StudioStep, env: EnvLike = process.env): string {
  const override = env[envVarName(step)];
  if (typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }
  return DEFAULT_MODELS[step];
}

/** Internetes tananyag szerzői HTML és bank: mindig a Studio author, ne hardcode-olt vendor-id. */
export function resolveWebResearchAuthorModel(env: EnvLike = process.env): string {
  return resolveStudioModel("author", env);
}

/** Vendor prefix of an OpenRouter id (`openai/gpt-5` → `openai`). */
export function modelFamily(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? (modelId.startsWith("gpt-") ? "openai" : modelId.startsWith("grok-") ? "x-ai" : modelId.startsWith("claude") ? "anthropic" : modelId) : modelId.slice(0, slash);
}

/**
 * Tulajdonosi döntés 2026-10-14 (docs/specs/2026-10-14-ellentetes-csalad-tartalek.md): a lektor-lánc a lecke TÉNYLEGES
 * szerzői (minden modell, amely a leckébe írt) szerint. A lektor családja egyik szerzőével sem egyezhet (D1). Ha GPT írt a
 * leckébe, az első lektor a harmadik család (Qwen 3.8 Max 0902); különben a konfigurált lektor, majd az ellentétes tartaléka,
 * végül a Qwen. Ismeretlen szerzőség (a 2026-10-14 előtt írt job): a konfigurált szerző-elsődleges számít szerzőnek — a régi
 * szerző-tartalék Qwen volt, GPT nem írhatott bele, ezért a konzervatív „tartalék is” feltevés indokolatlanul Qwen-re vinné a lektort.
 */
export function lektorChainFor(
  authorModels: readonly string[] | undefined,
  env: EnvLike = process.env,
  fallbacks: Partial<Record<StudioStep, string>> = FALLBACK_MODELS,
): string[] {
  const authors = authorModels?.length ? authorModels : [resolveStudioModel("author", env)];
  const authorFamilies = new Set(authors.map(modelFamily));
  const primary = resolveStudioModel("lektor", env);
  const fallback = fallbackModelFor("lektor", env, fallbacks);
  const ordered = authorFamilies.has("openai")
    ? [LEKTOR_THIRD_FAMILY_MODEL, primary, fallback]
    : [primary, fallback, LEKTOR_THIRD_FAMILY_MODEL];
  return [...new Set(ordered.filter((m): m is string => !!m && !authorFamilies.has(modelFamily(m))))];
}

/**
 * Fails fast when the Author and the Lektor would run on the same vendor family,
 * which would silently disable the independent D1 source-fidelity review.
 *
 * Audit 2026-09-05 (D): a failover must not collapse the two roles onto one vendor. Tulajdonosi döntés 2026-10-14: a lektor
 * a tényleges szerzőség szerint választ (`lektorChainFor`), ezért az őr (1) a konfigurált lektor-elsődleges és
 * szerző-elsődleges családját veti össze (konfigurációs hiba), és (2) minden lehetséges szerzői családhalmazra (csak az
 * elsődleges, csak a tartalék, mindkettő) ellenőrzi, hogy marad-e lektor.
 */
export function assertDistinctFamilies(
  env: EnvLike = process.env,
  fallbacks: Partial<Record<StudioStep, string>> = FALLBACK_MODELS,
): void {
  const author = resolveStudioModel("author", env);
  const lektor = resolveStudioModel("lektor", env);
  if (modelFamily(author) === modelFamily(lektor)) {
    throw new Error(
      `Studio model routing: author (${author}) and lektor (${lektor}) resolve to the ` +
        `same model family "${modelFamily(author)}". The Lektor is the independent ` +
        `source-fidelity check (D1) and must come from a different vendor family. ` +
        `Set STUDIO_MODEL_LEKTOR or STUDIO_MODEL_AUTHOR to fix.`,
    );
  }
  const candidates = [author, fallbackModelFor("author", env, fallbacks)].filter((m): m is string => !!m);
  for (const authors of [[author], ...(candidates.length > 1 ? [[candidates[1]], candidates] : [])]) {
    if (lektorChainFor(authors, env, fallbacks).length === 0) {
      throw new Error(
        `Studio model routing: no lektor model outside the author families (${authors.join(", ")}). ` +
          `The Lektor is the independent source-fidelity check (D1). Set STUDIO_MODEL_LEKTOR to fix.`,
      );
    }
  }
}

/** All resolved step→model pairs; used by the Studio UI and by startup logging. */
export function studioModelMap(env: EnvLike = process.env): Record<StudioStep, string> {
  return Object.fromEntries(
    STUDIO_STEPS.map((step) => [step, resolveStudioModel(step, env)]),
  ) as Record<StudioStep, string>;
}

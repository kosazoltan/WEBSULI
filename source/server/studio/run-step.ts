import { stripJsonFences } from "../ai/OpenRouterProvider";
import { AIProviderTimeoutError, type AIResponse, type IAIProvider } from "../ai/AIProvider";
import type { StudioStep } from "./pipeline";
import { LEKTOR_TIMEOUT_MS, STUDIO_STEP_POLICY } from "../ai/studio-provider";
import { logger } from "../lib/logger";

/**
 * A modell két MÉRT sorosítási hibája, determinisztikus javítással (spec §7o/3). Mindkettőt
 * szondával reprodukáltam a termelési paraméterekkel (glm-5.3-flash, JSON-mód), és a bájtokat
 * a hibapozíciónál olvastam ki:
 *  1. A sztringet magyar záró idézőjel (U+201D) zárja a `"` helyett, ezért a sztring nem ér véget,
 *     és a következő sorvég vezérlőkarakterként kerül bele („Bad control character in string
 *     literal”). Csak akkor javítunk, ha a hibapozíció ELŐTTI karakter PONTOSAN ez az idézőjel.
 *  2. A kész JSON után szemét marad (csonka ```` ``` ```` kerítés) — a JSON a hibapozícióig érvényes.
 * Minden javítás után ÚJRA elemzünk: amit nem sikerül értelmezni, az az eredeti hibával bukik.
 * Ez nem heurisztikus „JSON-javító": nem talál ki tartalmat, csak a lezáró karaktert állítja helyre.
 */
const MAX_JSON_REPAIRS = 8;
const CLOSING_QUOTE = "”";

function repairJsonOnce(text: string, error: unknown): { text: string; name: string } | null {
  const message = error instanceof Error ? error.message : "";
  const position = Number(/position (\d+)/.exec(message)?.[1]);
  if (!Number.isFinite(position) || position <= 0 || position > text.length) return null;
  if (/after JSON/i.test(message)) {
    const head = text.slice(0, position).trimEnd();
    return head ? { text: head, name: "JSON utáni szemét eldobva" } : null;
  }
  if (text[position - 1] === CLOSING_QUOTE) {
    return { text: `${text.slice(0, position - 1)}"${text.slice(position)}`, name: "gépelt záró idézőjel lezárásként" };
  }
  // 3. osztály: a belső idézetet a modell magyar nyitó idézőjellel („) kezdi, de EGYENES "-rel zárja,
  // ami idő előtt lezárja a JSON-sztringet (pl. `Használd a „mállás" és a „talajréteg" szavakat!`).
  // Ilyenkor a záró idézőjel után elválasztót várna az elemző. A karaktert escape-eljük — tartalmat
  // nem törlünk és nem találunk ki. Ha a hibapozíción MAGA egy idézőjel áll, az hiányzó vessző lehet
  // két mező között: ott nem nyúlunk hozzá (különben két mezőt vonnánk össze).
  if (/Expected ',' or/.test(message) && text[position] !== '"') {
    const head = text.slice(0, position).replace(/\s+$/, "");
    if (head.endsWith('"')) return { text: `${head.slice(0, -1)}\\"${text.slice(head.length)}`, name: "sztringen belüli idézőjel escape-elve" };
  }
  return null;
}

/** JSON.parse with the two measured repairs above; the repair names are returned for the log. */
export function parseModelJson(text: string): { json: unknown; repairs: string[] } {
  const repairs: string[] = [];
  let candidate = text;
  for (;;) {
    try { return { json: JSON.parse(candidate), repairs }; }
    catch (error) {
      const repaired = repairs.length < MAX_JSON_REPAIRS ? repairJsonOnce(candidate, error) : null;
      if (!repaired) throw error;
      candidate = repaired.text;
      repairs.push(repaired.name);
    }
  }
}

/**
 * Structural description of a JSON parse failure — length, first/last character class and the parse
 * position, never the text itself. Truncation ends mid-value and fails at the very end; a serialisation
 * bug ends with the closing brace and fails in the middle (spec §7o/2).
 */
export function jsonFailureShape(text: string, error: unknown): string {
  const first = text[0] ?? "", last = text.at(-1) ?? "";
  const closed = (first === "{" && last === "}") || (first === "[" && last === "]");
  const position = Number(/position (\d+)/.exec(error instanceof Error ? error.message : "")?.[1]);
  const where = Number.isFinite(position) ? `${position}. pozíció` : "ismeretlen pozíció";
  const kind = !closed ? "csonka vagy nem JSON alakú" : Number.isFinite(position) && position < text.length * 0.9
    ? "lezárt, de középen hibás (a modell sorosítása)" : "lezárt, a végén hibás";
  return `${text.length} karakter, ${kind}, ${where}`;
}

/** Outer, body-inclusive deadline of one model request for a step (spec §7o); undefined = none. */
export function stepDeadlineMs(step: string): number | undefined {
  return step === "lektor" ? LEKTOR_TIMEOUT_MS : STUDIO_STEP_POLICY[step]?.timeoutMs;
}
import { workflowCheckpoint, workflowRuntimeVersion, workflowUsage, workflowSkillPrompt, workflowValidationFailure } from "../workflows/engine";
import { isFrozenBundle } from "../../shared/instruction-bundles/roles";
import { maxOutputForModel } from "../ai/models";
import type { PromptRole } from "../../shared/instruction-bundles/roles";
import type { ResponseFormatJsonSchema } from "../ai/AIProvider";

/**
 * LS-2c — the call layer between the pipeline state machine and the provider.
 *
 * Deliberately narrow: it sends one prompt pair, gets one answer, strips fences and
 * parses JSON. Persisting the job row, the input-hash idempotency and the transition
 * stay with the routes layer — this module fails closed and returns nothing but a
 * parsed object, so a caller can never accidentally carry a raw model string forward.
 */

export class StepModelError extends Error {
  override readonly name = "StepModelError";
  /** The step that failed, so the job row can be marked `error` precisely. */
  readonly step: StudioStep;

  constructor(step: StudioStep, message: string, options?: { cause?: unknown }) {
    super(`A(z) "${step}" lépés modellhívása hibára futott: ${message}`, options);
    this.step = step;
  }
}

export type StepCallInput = {
  step: StudioStep;
  model: string;
  system: string;
  user: string;
  /** A határidő szabálya, ha eltér a lépésétől (spec 2026-09-24: az ábra-hívás "visuals"). */
  policy?: string;
  /**
   * Spec 2026-09-30 (U0, §C-V/3): a hívás TÉNYLEGES szerepe — ez dönti el, mely runbook-részt és tanult szabályt kapja.
   * A bankhívás `bank`, a vak megoldó `blind-solver`, akkor is, ha az `animator`/`lektor` lépésen belül fut. KÖTELEZŐ
   * (review #158: a lépésből képzett csendes tartalék több hívót rossz szerephez sorolt volna) — a lépés-alapú
   * alapértelmezést a hívó a `requireRoleForStep(step)` segéddel adja meg, ha valóban a lépés szerepét akarja.
   */
  role: PromptRole;
  /** Spec 2026-09-30 (U2/C8): hívásonkénti szigorú JSON-séma (`json_schema`, strict) — csak a támogató szolgáltató használja. */
  responseFormat?: ResponseFormatJsonSchema;
};

export type StepCallResult = {
  /** The parsed answer. Schema validation happens at the call site. */
  json: unknown;
  usage: AIResponse["usage"];
};

/**
 * One pipeline step's model call.
 *
 * The answer must be JSON and must parse, or the call throws — fail closed, per the
 * master plan §6. The raw text never leaves this function; the error carries at most
 * the provider's message.
 */
export async function callStepModel(
  provider: IAIProvider,
  input: StepCallInput,
  signal?: AbortSignal,
): Promise<StepCallResult> {
  signal?.throwIfAborted();
  // Spec 2026-09-30 (U6, C10): prompt-sorrend — a STABIL rész (runbook, utána a hívó skill-blokkja) elöl, a változó adat
  // hátul, hogy a szolgáltatói gyorsítótár az előtagot újrahasznosíthassa. A befagyasztott (runtime-2) futás a régi,
  // bájtra azonos sorrendet kapja (B0: régi futás = régi szöveg).
  const runbook = workflowSkillPrompt(input.role);
  input = { ...input, system: runbook && !isFrozenBundle(workflowRuntimeVersion()) ? `${runbook.replace(/^\s+/, "")}\n\n${input.system}` : input.system + runbook };
  return workflowCheckpoint("studio-model", input, async () => {
    // Mérve (5. mérés, run a0eb2bed): az animátor glm-hívása 609 s-ig futott a 240 s-os kliens-timeout
    // ellenére. Ok a forrásból: az OpenAI SDK `fetchWithTimeout` a `finally`-ban törli az időzítőt, amint a
    // fejlécek megérkeztek — a TÖRZS (a lassú, 24k-ig futó generálás) olvasása korlát nélkül fut, az
    // OpenRouter pedig azonnal küld fejlécet. A lektor külső AbortSignal-határideje ezt már áthidalta;
    // ugyanez jár minden szabályzatos lépésnek: a jelzés a törzs olvasását is megszakítja.
    const deadlineMs = stepDeadlineMs(input.policy ?? input.step);
    if (deadlineMs) {
      const deadline = AbortSignal.timeout(deadlineMs);
      signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    }
    const result = await callUncachedStepModel(provider, input, signal);
    await workflowUsage(result.usage);
    return result;
  });
}
/**
 * Spec 2026-09-30 (U6, C10): a stabil előtag hossza — a runbook (ha elöl áll) és az első skill-blokk vége
 * („=== SKILL VÉGE ===” / „=== TANANYAGJAVÍTÓ SKILL VÉGE ===”). Csak a jelölésre kell (Anthropic `cache_control`).
 */
export function stablePrefixChars(system: string): number {
  const ends = ["=== SKILL VÉGE ===", "=== TANANYAGJAVÍTÓ SKILL VÉGE ==="].map((m) => { const i = system.indexOf(m); return i >= 0 ? i + m.length : -1; }).filter((i) => i > 0);
  if (ends.length) return Math.min(...ends);
  const runbookEnd = system.startsWith("WEBSULI SAJÁT RUNBOOK") ? system.indexOf("\n\n", 40) : -1;
  return runbookEnd > 0 ? runbookEnd : 0;
}

/** Spec 2026-09-30 (U6): ársáv-figyelés — a hosszú kontextusú (≥ 200 k bemeneti token) hívás drágább sávba esik. */
export const LONG_CONTEXT_PRICE_BAND = 200_000;

async function callUncachedStepModel(provider: IAIProvider, input: StepCallInput, signal?: AbortSignal): Promise<StepCallResult> {
  let response: AIResponse;
  const messages = [
    { role: "system" as const, content: input.system },
    { role: "user" as const, content: input.user },
  ];
  const baseOptions = {
    ...(input.responseFormat ? { responseFormat: input.responseFormat } : {}),
    ...(stablePrefixChars(input.system) > 0 ? { cachePrefixChars: stablePrefixChars(input.system) } : {}),
  };
  try {
    response = await provider.chat(messages, signal, Object.keys(baseOptions).length ? baseOptions : undefined);
    signal?.throwIfAborted();
    // Spec 2026-09-30 (U6, C11): hosszkorlát → EGYSZER nagyobb keret a modell plafonjáig; ismeretlen plafon vagy már
    // maximális keret esetén marad a régi viselkedés (a csonka válasz nem használható).
    const current = provider.maxOutputTokens;
    const cap = maxOutputForModel(input.model);
    if ((response.finishReason === "length" || response.finishReason === "max_tokens") && current && cap && cap > current) {
      const enlarged = Math.min(cap, current * 2);
      await workflowUsage(response.usage);
      logger.warn(`[STUDIO] A(z) "${input.step}" válasza elérte a ${current} tokenes keretet — egyszeri újrapróba ${enlarged} tokennel (${input.model}).`);
      response = await provider.chat(messages, signal, { ...baseOptions, maxTokens: enlarged });
      signal?.throwIfAborted();
    }
    if ((response.usage?.promptTokens ?? 0) >= LONG_CONTEXT_PRICE_BAND) {
      logger.warn(`[STUDIO] Hosszú kontextus (${response.usage!.promptTokens} bemeneti token ≥ ${LONG_CONTEXT_PRICE_BAND}) — drágább ársáv (${input.step}, ${input.model}).`);
    }
  } catch (error) {
    await workflowValidationFailure("A modell szolgáltatója hibát jelzett.");
    // Spec 2026-09-30 (témafókusz-késleltetés): the label must name the deadline that actually fired — the
    // policy's, not the step's (topicFocus runs as step "pedagogue": 60 s cut, but the log said 300000ms).
    const deadlineMs = stepDeadlineMs(input.policy ?? input.step);
    const cause = deadlineMs && signal?.aborted && signal.reason?.name === "TimeoutError"
      ? new AIProviderTimeoutError(provider.name, deadlineMs) : error;
    throw new StepModelError(input.step, "a szolgáltató hibát jelzett", { cause });
  }

  const text = stripJsonFences(response.content ?? "").trim();
  // Spec 2026-09-29 (PR #131 review, R2): a rejected answer was still paid for. The success path books its
  // usage in callStepModel; the three rejecting branches below book it here, so a fallback after an invalid
  // answer does not hide the first call's tokens.
  const bookRejectedUsage = () => workflowUsage(response.usage);
  if (response.finishReason === "length" || response.finishReason === "max_tokens") {
    await bookRejectedUsage();
    await workflowValidationFailure("A szolgáltató válasza elérte a hosszkorlátot.");
    throw new StepModelError(input.step, "a válasz elérte a hosszkorlátot; csonka eredmény nem használható");
  }
  if (text.length === 0) {
    await bookRejectedUsage();
    await workflowValidationFailure("A szolgáltató válasza üres.");
    throw new StepModelError(input.step, "a válasz üres");
  }

  try {
    const { json, repairs } = parseModelJson(text);
    // Names only, never content: the repair itself is a single closing character.
    if (repairs.length) logger.warn(`[STUDIO] A(z) "${input.step}" válaszának sorosítása javítva: ${repairs.join("; ")}.`);
    return { json, usage: response.usage };
  } catch (error) {
    // Shape only, never content: the raw text may itself be a prompt injection. Mérve (§7o/2, 6–7.
    // mérés): a puszta hossz nem mondta meg, csonka válaszról vagy a modell hibás sorosításáról
    // van-e szó, és emiatt kétszer kellett szondázni. A nyitó/záró karakter és a hibapozíció
    // szerkezeti tény — ezekből a következő eset magától megkülönböztethető.
    await bookRejectedUsage();
    await workflowValidationFailure("A válasz nem érvényes JSON.");
    throw new StepModelError(input.step, `a válasz nem érvényes JSON (${jsonFailureShape(text, error)})`);
  }
}

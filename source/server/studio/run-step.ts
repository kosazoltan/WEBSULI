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
import { workflowCheckpoint, workflowUsage, workflowSkillPrompt, workflowValidationFailure } from "../workflows/engine";

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
  input = { ...input, system: input.system + workflowSkillPrompt() };
  return workflowCheckpoint("studio-model", input, async () => {
    // Mérve (5. mérés, run a0eb2bed): az animátor glm-hívása 609 s-ig futott a 240 s-os kliens-timeout
    // ellenére. Ok a forrásból: az OpenAI SDK `fetchWithTimeout` a `finally`-ban törli az időzítőt, amint a
    // fejlécek megérkeztek — a TÖRZS (a lassú, 24k-ig futó generálás) olvasása korlát nélkül fut, az
    // OpenRouter pedig azonnal küld fejlécet. A lektor külső AbortSignal-határideje ezt már áthidalta;
    // ugyanez jár minden szabályzatos lépésnek: a jelzés a törzs olvasását is megszakítja.
    const deadlineMs = stepDeadlineMs(input.step);
    if (deadlineMs) {
      const deadline = AbortSignal.timeout(deadlineMs);
      signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    }
    const result = await callUncachedStepModel(provider, input, signal);
    await workflowUsage(result.usage);
    return result;
  });
}
async function callUncachedStepModel(provider: IAIProvider, input: StepCallInput, signal?: AbortSignal): Promise<StepCallResult> {
  let response: AIResponse;
  try {
    response = await provider.chat([
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ], signal);
    signal?.throwIfAborted();
  } catch (error) {
    await workflowValidationFailure("A modell szolgáltatója hibát jelzett.");
    const deadlineMs = stepDeadlineMs(input.step);
    const cause = deadlineMs && signal?.aborted && signal.reason?.name === "TimeoutError"
      ? new AIProviderTimeoutError(provider.name, deadlineMs) : error;
    throw new StepModelError(input.step, "a szolgáltató hibát jelzett", { cause });
  }

  const text = stripJsonFences(response.content ?? "").trim();
  if (response.finishReason === "length" || response.finishReason === "max_tokens") {
    await workflowValidationFailure("A szolgáltató válasza elérte a hosszkorlátot.");
    throw new StepModelError(input.step, "a válasz elérte a hosszkorlátot; csonka eredmény nem használható");
  }
  if (text.length === 0) {
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
    await workflowValidationFailure("A válasz nem érvényes JSON.");
    throw new StepModelError(input.step, `a válasz nem érvényes JSON (${jsonFailureShape(text, error)})`);
  }
}

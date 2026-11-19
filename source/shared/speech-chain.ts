import { speechStartTimeoutMs, SPEECH_START_TIMEOUT_MS } from "./speech-fallback";
import { engineSilent, voiceSkipped, UNKNOWN_ENGINE, voiceKey, type EngineKnowledge } from "./speech-preload";
import { rankVoices, type RankableVoice } from "./voice-rank";

/**
 * Spec 2026-11-18-tananyag-gyartas-minoseg, S8b-2 (E33; az S8a review K1 / K2 feltétele): a lecke felolvasásának lánca — tiszta
 * döntési logika (a lejátszó csak végrehajtja). Sorrend:
 *  1. előre gyártott hang a hangtárból — csak ha az elérhetőségi jegyzék szerint megvan (a lecke betöltésekor egy kéréssel érkezik);
 *     jegyzék nélkül vagy hiánynál a lánc AZONNAL, a kattintás gesztusában a böngészőhanggal indul (nincs 404-es kör);
 *  2. a böngésző hangjai: a rangsor legjobbja, majd a legjobb TELEPÍTETT HELYI hang (tiltott hangszolgáltatású hálózaton ez szól),
 *     legfeljebb három — hibaeseménynél a következő azonnal jön, néma motornál a szakasz ÖSSZESÍTETT csendkerete dönt;
 *  3. legvégül a szerver (nem brit) tartalék hangja.
 * Bármelyik lépés hibája a következőre visz; ha nincs több, a hívó hibajelzést kap.
 */
export type SpeechStep =
  | { kind: "prepared"; id: string }
  /** `voiceIndex === null`: a hanglista még üres (Android: később töltődik) — a böngésző a `lang` alapján választ. */
  | { kind: "voice"; voiceIndex: number | null }
  | { kind: "fallback" };

/**
 * Ennyit vár a lecke az előre gyártott hang megszólalására, mielőtt a böngészőhangra lép. A gyerek ne várjon csendben: a hang kis
 * (legfeljebb 300 KB-os), tartósan gyorsítótárazott fájl, amelynek ennyi idő alatt el kell indulnia; lassabb hálózaton a böngésző
 * helyben lévő hangja gyorsabb. (Éles mérés a gyártás — S8c — után lehetséges; az érték addig tervezési felső korlát.)
 */
export const PREPARED_AUDIO_START_TIMEOUT_MS = 1500;
/** Legfeljebb ennyi böngészőhangot próbál a lánc, hogy a hibás motor ne nyújtsa a csendet a végtelenbe. */
export const MAX_BROWSER_VOICE_ATTEMPTS = 3;
/**
 * Ennél rövidebb időszeletet böngészőhang nem kap: a beszédmotor indulási eseménye ennyi idő alatt nem jön meg (a leggyorsabb helyi
 * motoré is tíz ezredmásodperces nagyságrend, a böngésző időzítőinek szórása néhány ezredmásodperc), így a rövidebb szelet biztosan
 * lejárna — hang nélkül, hamis negatív ítélettel. A csendkeretet ez legfeljebb ennyivel RÖVIDÍTI (a tartalék hamarabb szól), nem nyújtja.
 */
export const MIN_VOICE_STEP_MS = 250;
/** A szerveres tartalék betöltési őre: lógó válasznál (lassú háló, lassú külső szolgáltatás) ennyi után hibaüzenet jön, nem csend. */
export const FALLBACK_AUDIO_START_TIMEOUT_MS = 8000;

export type SpeechPlanInput = {
  language: string;
  voices: ReadonlyArray<RankableVoice>;
  /** Van-e használható beszédmotor (`speechSynthesis` + `SpeechSynthesisUtterance`). */
  synthAvailable: boolean;
  /**
   * Az előre gyártott hang, ha a jegyzék szerint megvan (lásd `preparedAudioCandidate`). `ready`: az előtöltés lejátszásra készre
   * pufferelte — koppintásra azonnal szól. Nem kész (még töltődik / a plafon fölött van): ha van böngészőhang, az szól azonnal, és az
   * előre gyártott lépés KIMARAD (a letöltés a háttérben előre ugrik); ha nincs, a hang kérésre töltődik.
   */
  prepared?: { id: string; ready: boolean } | null;
  /** A hangmotor munkamenet-szintű ismerete (S8d, valódi koppintásokból): igazolt hang előre; lejáró negatív ítéletű hang / néma motor kimarad. */
  engine?: EngineKnowledge;
  /** `navigator.onLine === false`: a telepített helyi hang a hálózati elé kerül (az nem tud megszólalni). */
  offline?: boolean;
  /** Van-e a szöveghez szerveres tartalék (támogatott nyelv, nem túl hosszú szöveg). */
  fallbackAvailable: boolean;
};

const isLocal = (voice: RankableVoice | undefined) => voice?.localService !== false;

/**
 * A lánc böngészőhangjai, legfeljebb `MAX_BROWSER_VOICE_ATTEMPTS`: a rangsor legjobbja, MÁSODIKKÉNT a legjobb telepített helyi hang (ha a
 * legjobb hálózati) — így tiltott hangszolgáltatásnál a helyi brit hang sorra kerül a nem brit szerverhang előtt —, utána a rangsor
 * szerinti többi. Hálózat nélkül (`offline`) a helyi hangok kerülnek előre, a rangsoruk megtartásával.
 */
export function chainVoiceOrder(voices: ReadonlyArray<RankableVoice>, language: string, offline = false, engine: EngineKnowledge = UNKNOWN_ENGINE): number[] {
  // A munkamenetben elbukott hang kimarad; az igazoltan megszólaló hang az első (az már nem próba, azonnal szól).
  const usable = rankVoices(voices, language).filter((i) => !voiceSkipped(engine, voiceKey(voices[i])));
  const verified = usable.find((i) => voiceKey(voices[i]) === engine.verified);
  const ranked = verified === undefined ? usable : [verified, ...usable.filter((i) => i !== verified)];
  const order = offline ? [...ranked.filter((i) => isLocal(voices[i])), ...ranked.filter((i) => !isLocal(voices[i]))] : ranked;
  const bestLocal = order.find((i) => isLocal(voices[i]));
  const picked = bestLocal === undefined || bestLocal === order[0] ? order : [order[0], bestLocal, ...order.filter((i, at) => at > 0 && i !== bestLocal)];
  return picked.slice(0, MAX_BROWSER_VOICE_ATTEMPTS);
}

/**
 * A böngészőhang-szakasz összesített csendkerete (spec 2026-11-09-felolvasas-tartalek A2 és a 2026-11-10-es módosítás): ha a szakasz
 * első hangja helyi (vagy ismeretlen), 3 mp; ha hálózati, 6 mp (a hálózati hang lassabban indul). Ha a keret alatt egyik próbált hang
 * sem szólal meg, a szerveres tartalék jön — a próbált hangok száma a csendet NEM nyújtja.
 */
export function voicePhaseBudgetMs(firstVoice: RankableVoice | undefined): number {
  return speechStartTimeoutMs(firstVoice?.localService);
}

/**
 * Egy böngészőhang-lépés indulási őre a kereten belül. Hálózati hang, amely után még helyi hang jön, legfeljebb 3 mp-et kap (utána a
 * helyi hang próbálkozik a maradék keretből); minden más lépés a teljes maradékot. 0: a keret elfogyott — a lépés kimondás nélkül kimarad.
 * A `MIN_VOICE_STEP_MS`-nél kisebb maradék is ELFOGYOTT keret: az előző lépés őre a keret vége előtt töredék ezredmásodperccel is
 * lejárhat (az óra tört ezredmásodperces, az időzítő késleltetése egészre vágott) — a maradék „0,3 ms”-ból a következő hang csak egy
 * fölösleges kimondást és egy hamis „nem indult el” ítéletet kapna.
 */
export function voiceStepTimeoutMs(input: { budgetMs: number; elapsedMs: number; network: boolean; laterLocalVoice: boolean }): number {
  const remaining = input.budgetMs - input.elapsedMs;
  if (!(remaining >= MIN_VOICE_STEP_MS)) return 0;
  return input.network && input.laterLocalVoice ? Math.min(remaining, SPEECH_START_TIMEOUT_MS) : remaining;
}

/** Jön-e a terv `index` utáni részében helyi böngészőhang. */
export function hasLaterLocalVoice(plan: ReadonlyArray<SpeechStep>, index: number, voices: ReadonlyArray<RankableVoice>): boolean {
  return plan.slice(index + 1).some((step) => step.kind === "voice" && (step.voiceIndex === null || isLocal(voices[step.voiceIndex])));
}

/**
 * Hamis órás számolás (teszt és review): mennyi a csend a szerveres tartalékig, ha EGYIK lépés sem ad eseményt (néma motor, el nem
 * induló előre gyártott hang). A lejátszó ugyanezeket a függvényeket hívja valódi órával.
 */
export function silenceBeforeFallbackMs(plan: ReadonlyArray<SpeechStep>, voices: ReadonlyArray<RankableVoice>): number {
  let clock = 0;
  let phaseStart: number | null = null;
  let budgetMs = 0;
  plan.forEach((step, index) => {
    if (step.kind === "prepared") clock += PREPARED_AUDIO_START_TIMEOUT_MS;
    if (step.kind !== "voice") return;
    const voice = step.voiceIndex === null ? undefined : voices[step.voiceIndex];
    if (phaseStart === null) { phaseStart = clock; budgetMs = voicePhaseBudgetMs(voice); }
    clock += voiceStepTimeoutMs({ budgetMs, elapsedMs: clock - phaseStart, network: !isLocal(voice), laterLocalVoice: hasLaterLocalVoice(plan, index, voices) });
  });
  return clock;
}

export function speechPlan(input: SpeechPlanInput): SpeechStep[] {
  const engine = input.engine ?? UNKNOWN_ENGINE;
  const voiceSteps: SpeechStep[] = [];
  if (input.synthAvailable && !engineSilent(engine)) {
    if (input.voices.length === 0) { if (!voiceSkipped(engine, voiceKey(null))) voiceSteps.push({ kind: "voice", voiceIndex: null }); }
    else for (const voiceIndex of chainVoiceOrder(input.voices, input.language, input.offline, engine)) voiceSteps.push({ kind: "voice", voiceIndex });
  }
  const steps: SpeechStep[] = [];
  // Kész (pufferelt) hang: elöl. Nem kész hang: csak akkor kerül a tervbe (kérésre töltve), ha böngészőhang nincs — különben a gyerek
  // ne várjon a letöltésre: a böngészőhang szól azonnal, a kattintás gesztusában.
  if (input.prepared && (input.prepared.ready || voiceSteps.length === 0)) steps.push({ kind: "prepared", id: input.prepared.id });
  steps.push(...voiceSteps);
  if (input.fallbackAvailable) steps.push({ kind: "fallback" });
  return steps;
}

/** A lépés kimenete: `done` — megszólalt (vagy a tanuló maga szakította meg): a lánc megáll; `failed` — a következő lépés jön. */
export type StepOutcome = "done" | "failed";
/** A következő lépés indexe; `null`: a lánc véget ért. `exhausted`: minden lépés elbukott — a hívó hibát jelez. */
export function nextSpeechStep(plan: ReadonlyArray<SpeechStep>, index: number, outcome: StepOutcome, options: { skipVoices?: boolean } = {}): { next: number | null; exhausted: boolean } {
  if (outcome === "done") return { next: null, exhausted: false };
  // `skipVoices`: a böngészőhang-szakasz egészét át kell ugrani (a motor megszakította / nem engedte a kimondást — egy másik hang
  // ugyanígy járna, és a rangsor legjobbja helyett szólna): a lánc a tartalékra lép.
  let next = index + 1;
  if (options.skipVoices) while (next < plan.length && plan[next].kind === "voice") next += 1;
  return next < plan.length ? { next, exhausted: false } : { next: null, exhausted: true };
}

/** Miért nem szólt az előre gyártott hang. */
export type PreparedFailure = "error" | "timeout" | "not-allowed" | "aborted";
/**
 * Megjegyezze-e a kliens a munkamenet idejére, hogy ez a hang nem tölthető be (a jegyzék szerint megvolt, mégis hibázott)? Csak a HIBA
 * (404 / 429 / hálózat) igen. Az időtúllépés nem: egy lassú pillanat ne rontsa el a szót az egész munkamenetre (a letöltés a háttérben
 * befejeződhet); a böngésző lejátszási tiltása és a tanuló megszakítása pedig nem a hang hibája.
 */
export function rememberPreparedFailure(reason: PreparedFailure): boolean {
  return reason === "error";
}

/**
 * Kérhető-e az előre gyártott hang: csak a hangtár nyelvein, kiszámolt kulccsal, ha az elérhetőségi jegyzék szerint MEGVAN, és ebben a
 * munkamenetben még nem hibázott. Jegyzék híján (még nem jött meg, hibázott, üres a tár) a válasz nem — hangfájl-kérés ilyenkor nem megy.
 */
export function preparedAudioCandidate(input: { languageSupported: boolean; id: string | undefined; available: boolean; knownMissing: boolean; ready?: boolean }): { id: string; ready: boolean } | null {
  return input.languageSupported && input.id && input.available && !input.knownMissing ? { id: input.id, ready: input.ready === true } : null;
}

/** A jegyzék méretei (bájt) a kért kulcsokra — az előtöltés adatforgalmi plafonjához; méret nélküli (régi alakú) válasznál becsült érték. */
export const ASSUMED_AUDIO_BYTES = 40_000;
export function sizesFromManifest(body: unknown, asked: readonly string[]): Record<string, number> {
  const sizes = body && typeof body === "object" ? (body as { sizes?: unknown }).sizes : undefined;
  const known = sizes && typeof sizes === "object" ? sizes as Record<string, unknown> : {};
  return Object.fromEntries(availableFromManifest(body, asked).map((id) => { const size = known[id]; return [id, typeof size === "number" && size > 0 ? size : ASSUMED_AUDIO_BYTES]; }));
}

/** A jegyzék-válasz értelmezése: csak a KÉRT, érvényes alakú kulcsok számítanak elérhetőnek; hibás alakú válaszra üres lista. */
export function availableFromManifest(body: unknown, asked: readonly string[]): string[] {
  const list = body && typeof body === "object" ? (body as { available?: unknown }).available : undefined;
  if (!Array.isArray(list)) return [];
  const wanted = new Set(asked);
  return list.filter((id): id is string => typeof id === "string" && wanted.has(id));
}

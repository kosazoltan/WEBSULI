import { LESSON_AUDIO_PRELOAD_MAX } from "./tts-audio-key";
import type { RankableVoice } from "./voice-rank";

/**
 * Terv 2026-11-18-tananyag-gyartas-minoseg, S8d (tulajdonosi kérés: a hang a koppintásra AZONNAL szóljon): az előtöltés rendje és
 * korlátai, valamint a hangmotor munkamenet-szintű állapota — tiszta döntési logika (a lejátszó csak végrehajtja).
 */
export const SPEECH_PRELOAD = {
  /** Egyszerre ennyi hangfájl töltődik (a hangtár sebességkorlátjához és a lecke többi kéréséhez igazítva). */
  concurrency: 3,
  /** Leckénkénti előtöltési adatforgalmi plafon; a fölötte lévő rész csak koppintásra töltődik. */
  maxBytes: 3.5 * 1024 * 1024,
  /** Legfeljebb ennyi hangelem él egyszerre (mobil böngészők médialejátszó-korlátja alatt). A hangtár sebességkerete ebből számol. */
  maxElements: LESSON_AUDIO_PRELOAD_MAX,
  /** Adatkímélő módban / lassú kapcsolaton csak a lecke első ennyi szövege töltődik elő (az első szakasz: 6 tétel × szó + példamondat). */
  firstSectionTexts: 12,
  /** Hibás letöltés (429, hálókiesés) visszatartásos újrapróbái; utána a szó `failureTtlMs`-ig nem elérhető. */
  retryDelaysMs: [4000, 15_000],
  failureTtlMs: 60_000,
  /** A jegyzék legfeljebb ilyen sűrűn frissül a munkameneten belül (a lap újra láthatóvá válásakor). */
  manifestRefreshMs: 60_000,
  /** Ennyi idő után a lógó letöltés hibának számít. */
  loadTimeoutMs: 20_000,
  /** Elutasított jegyzék-kérés (429): a szerver `Retry-After` értéke szerint, de legfeljebb ennyi idő múlva és legfeljebb ennyiszer próbálunk újra. */
  manifestRetryMaxMs: 120_000,
  manifestRetries: 2,
} as const;

export type ConnectionHint = { saveData?: boolean; effectiveType?: string };
/** Adatkímélő mód vagy 2g / slow-2g kapcsolat: csak az első szakasz töltődik elő. */
export function constrainedConnection(connection: ConnectionHint | undefined): boolean {
  return connection?.saveData === true || connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g";
}

/**
 * Az előtöltendő kulcsok, a szószedet sorrendjében (az első szakasz elöl). Csak a jegyzék szerint meglévő hang kerül be; korlátok:
 * darabszám (`maxElements`), összméret (`maxBytes` — az első be nem férő hangnál megáll), szűk kapcsolaton csak az első szakasz.
 */
export function preloadPlan(input: { ids: readonly string[]; sizes: Readonly<Record<string, number>>; connection?: ConnectionHint }): string[] {
  const scope = constrainedConnection(input.connection) ? input.ids.slice(0, SPEECH_PRELOAD.firstSectionTexts) : input.ids;
  const picked: string[] = [];
  let bytes = 0;
  for (const id of scope) {
    const size = input.sizes[id];
    if (!(size > 0) || picked.includes(id)) continue;
    if (picked.length >= SPEECH_PRELOAD.maxElements || bytes + size > SPEECH_PRELOAD.maxBytes) break;
    picked.push(id);
    bytes += size;
  }
  return picked;
}

/** A sorból most indítható letöltések: legfeljebb `concurrency` fut egyszerre. */
export function nextPreloads(pending: readonly string[], activeCount: number): string[] {
  return pending.slice(0, Math.max(0, SPEECH_PRELOAD.concurrency - activeCount));
}

/** A koppintott szó előre ugrik a sorban (a többi sorrendje marad); ha nincs a sorban, az elejére kerül. */
export function prioritized(pending: readonly string[], id: string): string[] {
  return [id, ...pending.filter((other) => other !== id)];
}

/** A hibás letöltés N. újrapróbája előtti várakozás; null: nincs több próba (a szó `failureTtlMs`-ig nem elérhető). */
export function retryDelayMs(failedAttempts: number): number | null {
  return SPEECH_PRELOAD.retryDelaysMs[failedAttempts - 1] ?? null;
}

/** Az elutasított jegyzék-kérés újrapróbájáig hátralévő idő: a szerver `Retry-After` értéke, 5 mp és a felső korlát közé szorítva. */
export function manifestRetryDelayMs(retryAfterMs: number | null): number {
  const wanted = retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : SPEECH_PRELOAD.manifestRefreshMs;
  return Math.min(SPEECH_PRELOAD.manifestRetryMaxMs, Math.max(5000, wanted));
}

/** Nem elérhető-e még a szó egy korábbi végleges hiba miatt (lejárat után újra próbálható — a 429 nem zár ki a munkamenet végéig). */
export function failureActive(failedAt: number | null, now: number): boolean {
  return failedAt !== null && now - failedAt < SPEECH_PRELOAD.failureTtlMs;
}

/**
 * A hangmotor munkamenet-szintű ismerete — kizárólag a gyerek VALÓDI koppintásaiból tanulva (kéretlen próba-kimondás nincs), a lecke
 * nyelvenként külön.
 *  - POZITÍV bizonyíték: ha egy koppintásra a böngészőhang `start` eseménye megjön, az a hang a munkamenetre igazolt (`verified`) —
 *    a következő koppintásoknál közvetlenül az szól, próbalánc és várakozás nélkül.
 *  - NEGATÍV ítélet soha nem végleges: a hibát adó vagy el nem induló hang (`skip`) és az eseményt egyáltalán nem adó motor
 *    (`silentTaps`) csak a következő `NEGATIVE_VERDICT_TAPS` koppintásra marad ki, utána a lánc újra megpróbálja a rangsor legjobbját.
 *    Koppintásszám szerinti lejárat (nem idő): a gyerek rögtön újra koppint — a következő két koppintás ne várjon, a harmadik viszont
 *    adjon új esélyt akkor is, ha közben percek teltek el vagy a lap háttérben volt.
 *  - Nem a hang hibája (nem kerül az ismeretbe): a megszakítás (`interrupted` / `canceled` — Android: a `cancel()` utáni azonnali
 *    `speak()`), a hiányzó felhasználói aktiváció (`not-allowed`), és amit a lejátszó maga állított le.
 */
export type EngineKnowledge = { verified: string | null; skip: Readonly<Record<string, number>>; silentTaps: number };
export const UNKNOWN_ENGINE: EngineKnowledge = { verified: null, skip: {}, silentTaps: 0 };
export const NEGATIVE_VERDICT_TAPS = 2;

/** A hang munkamenet-kulcsa (név + nyelv); a „`lang` dönt” (hang nélküli) kimondásé az üres kulcs. */
export function voiceKey(voice: Pick<RankableVoice, "name" | "lang"> | undefined | null): string {
  return voice ? `${voice.name}\n${voice.lang}` : "";
}

/** Kimarad-e a hang a mostani koppintás tervéből (lejáró negatív ítélet). */
export function voiceSkipped(knowledge: EngineKnowledge, voice: string): boolean {
  return (knowledge.skip[voice] ?? 0) > 0;
}
/** Néma-e a motor a mostani koppintás terve szerint (lejáró negatív ítélet). */
export function engineSilent(knowledge: EngineKnowledge): boolean {
  return knowledge.silentTaps > 0;
}

export type VoiceOutcome = "started" | "error" | "timeout";
/** Egy VALÓDI kimondás kimenetele után az ismeret: az elindult hang igazolt (és minden negatív ítélete törlődik), az elbukott lejáró ítéletet kap. */
export function engineAfter(knowledge: EngineKnowledge, voice: string, outcome: VoiceOutcome): EngineKnowledge {
  if (outcome === "started") {
    const skip = { ...knowledge.skip };
    delete skip[voice];
    return { verified: voice, skip, silentTaps: 0 };
  }
  return { verified: knowledge.verified === voice ? null : knowledge.verified, skip: { ...knowledge.skip, [voice]: NEGATIVE_VERDICT_TAPS }, silentTaps: knowledge.silentTaps };
}

/**
 * Egy koppintás böngészőhang-szakaszának vége: ha egyetlen hang sem indult el, és MINDEGYIK esemény nélkül járt le, a motor a
 * következő koppintásokra némának számít (a böngészőhang-lépés kimarad, a gyerek nem vár újra 3 / 6 mp-et). Hibaeseményt adó motor
 * nem néma (él, csak a hangjai rosszak).
 */
export function engineAfterRound(knowledge: EngineKnowledge, outcomes: readonly VoiceOutcome[]): EngineKnowledge {
  const silent = outcomes.length > 0 && outcomes.every((outcome) => outcome === "timeout");
  return knowledge.verified || !silent ? knowledge : { ...knowledge, silentTaps: NEGATIVE_VERDICT_TAPS };
}

/** Egy koppintás „elhasználja” a negatív ítéletek egy egységét: a koppintás terve a régi ismeretből készül, a tárolt ismeret öregszik. */
export function engineAged(knowledge: EngineKnowledge): EngineKnowledge {
  const skip = Object.fromEntries(Object.entries(knowledge.skip).flatMap(([voice, taps]) => taps > 1 ? [[voice, taps - 1]] : []));
  return { verified: knowledge.verified, skip, silentTaps: Math.max(0, knowledge.silentTaps - 1) };
}
/** A helyben megőrzött utolsó jegyzék (csak lenyomatok és méretek): hálózat nélküli megnyitáskor ebből tudjuk, mi van a tartós gyorsítótárban. */
export const STORED_MANIFEST_MAX_ENTRIES = 600;
export function mergeStoredManifest(stored: unknown, voiceVersion: string, fresh: Readonly<Record<string, number>>): { v: string; sizes: Record<string, number> } {
  const sizes: Record<string, number> = { ...readStoredManifest(stored, voiceVersion), ...fresh };
  const keys = Object.keys(sizes);
  // A legrégebbi bejegyzések esnek ki (a beszúrási sorrend a régi → új).
  for (const key of keys.slice(0, Math.max(0, keys.length - STORED_MANIFEST_MAX_ENTRIES))) delete sizes[key];
  return { v: voiceVersion, sizes };
}
export function readStoredManifest(stored: unknown, voiceVersion: string): Record<string, number> {
  if (!stored || typeof stored !== "object" || (stored as { v?: unknown }).v !== voiceVersion) return {};
  const sizes = (stored as { sizes?: unknown }).sizes;
  if (!sizes || typeof sizes !== "object") return {};
  return Object.fromEntries(Object.entries(sizes as Record<string, unknown>).filter(([id, size]) => /^[a-f0-9]{32}$/.test(id) && typeof size === "number" && size > 0)) as Record<string, number>;
}

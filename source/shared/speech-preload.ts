import { speechStartTimeoutMs } from "./speech-fallback";
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
  /** Legfeljebb ennyi hangelem él egyszerre (mobil böngészők médialejátszó-korlátja alatt). */
  maxElements: 60,
  /** Adatkímélő módban / lassú kapcsolaton csak a lecke első ennyi szövege töltődik elő (az első szakasz: 6 tétel × szó + példamondat). */
  firstSectionTexts: 12,
  /** Hibás letöltés (429, hálókiesés) visszatartásos újrapróbái; utána a szó `failureTtlMs`-ig nem elérhető. */
  retryDelaysMs: [4000, 15_000],
  failureTtlMs: 60_000,
  /** A jegyzék legfeljebb ilyen sűrűn frissül a munkameneten belül (a lap újra láthatóvá válásakor). */
  manifestRefreshMs: 60_000,
  /** Ennyi idő után a lógó letöltés hibának számít. */
  loadTimeoutMs: 20_000,
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

/** Nem elérhető-e még a szó egy korábbi végleges hiba miatt (lejárat után újra próbálható — a 429 nem zár ki a munkamenet végéig). */
export function failureActive(failedAt: number | null, now: number): boolean {
  return failedAt !== null && now - failedAt < SPEECH_PRELOAD.failureTtlMs;
}

/**
 * A hangmotor munkamenet-szintű ismerete: a böngészőhang kiválasztása és a „néma motor” felismerése EGYSZER dől el (próba-megszólalás
 * az első felhasználói mozdulatnál), nem szavanként. `verified`: a hang, amely igazoltan megszólalt; `bad`: a munkamenetben elbukott
 * hangok; `silent`: a motor egyetlen próbált hangra sem adott eseményt.
 */
export type EngineKnowledge = { verified: string | null; bad: readonly string[]; silent: boolean };
export const UNKNOWN_ENGINE: EngineKnowledge = { verified: null, bad: [], silent: false };

/** A hang munkamenet-kulcsa (név + nyelv); a „`lang` dönt” (hang nélküli) kimondásé az üres kulcs. */
export function voiceKey(voice: Pick<RankableVoice, "name" | "lang"> | undefined | null): string {
  return voice ? `${voice.name}\n${voice.lang}` : "";
}

export type VoiceOutcome = "started" | "error" | "timeout";
/** Egy kimondás (próba vagy valódi) kimenetele után az ismeret: az elindult hang igazolt, az elbukott kimarad a további tervekből. */
export function engineAfter(knowledge: EngineKnowledge, voice: string, outcome: VoiceOutcome): EngineKnowledge {
  if (outcome === "started") return { verified: voice, bad: knowledge.bad.filter((key) => key !== voice), silent: false };
  return { verified: knowledge.verified === voice ? null : knowledge.verified, bad: knowledge.bad.includes(voice) ? knowledge.bad : [...knowledge.bad, voice], silent: knowledge.silent };
}

/**
 * Egy teljes próbasor (vagy valódi böngészőhang-szakasz) vége: ha egyetlen hang sem indult el, és MINDEGYIK esemény nélkül járt le,
 * a motor néma — a felület ezt előre tudja, a böngészőhang-lépés a továbbiakban kimarad. Hibaeseményt adó motor nem néma (él, csak a
 * hangjai rosszak).
 */
export function engineAfterRound(knowledge: EngineKnowledge, outcomes: readonly VoiceOutcome[]): EngineKnowledge {
  const silent = outcomes.length > 0 && outcomes.every((outcome) => outcome === "timeout");
  return knowledge.verified || !silent ? knowledge : { ...knowledge, silent: true };
}

/** A próba-megszólalás türelme hangonként: helyi 3 mp, hálózati 6 mp — a háttérben fut, a gyerek nem vár rá. */
export function probeTimeoutMs(voice: Pick<RankableVoice, "localService"> | undefined): number {
  return speechStartTimeoutMs(voice?.localService);
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

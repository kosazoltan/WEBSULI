import { rankVoices, type RankableVoice } from "./voice-rank";

/**
 * Spec 2026-11-18-tananyag-gyartas-minoseg, S8b-2 (E33; az S8a review K1 / K2 feltétele): a lecke felolvasásának lánca — tiszta
 * döntési logika (a lejátszó csak végrehajtja). Sorrend:
 *  1. előre gyártott hang a hangtárból (csak ha a nyelvhez készül, a kulcs megvan, és ebben a munkamenetben még nem hiányzott);
 *  2. a böngésző hangjai RANGSOR szerint — ha az első hibázik vagy nem indul, a következő jön (legfeljebb három);
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

export type SpeechPlanInput = {
  language: string;
  voices: ReadonlyArray<RankableVoice>;
  /** Van-e használható beszédmotor (`speechSynthesis` + `SpeechSynthesisUtterance`). */
  synthAvailable: boolean;
  /** Az előre gyártott hang kulcsa, ha kérhető (lásd `preparedAudioCandidate`). */
  preparedId?: string | null;
  /** `navigator.onLine === false`: a telepített helyi hang a hálózati elé kerül (az nem tud megszólalni). */
  offline?: boolean;
  /** Van-e a szöveghez szerveres tartalék (támogatott nyelv, nem túl hosszú szöveg). */
  fallbackAvailable: boolean;
};

/** A böngészőhangok sorrendje a lánchoz: a rangsor, hálózat nélkül a helyi hangok előre (a rangsoruk megtartásával). */
export function chainVoiceOrder(voices: ReadonlyArray<RankableVoice>, language: string, offline = false): number[] {
  const ranked = rankVoices(voices, language);
  if (!offline) return ranked;
  return [...ranked.filter((i) => voices[i].localService !== false), ...ranked.filter((i) => voices[i].localService === false)];
}

export function speechPlan(input: SpeechPlanInput): SpeechStep[] {
  const steps: SpeechStep[] = [];
  if (input.preparedId) steps.push({ kind: "prepared", id: input.preparedId });
  if (input.synthAvailable) {
    if (input.voices.length === 0) steps.push({ kind: "voice", voiceIndex: null });
    else for (const voiceIndex of chainVoiceOrder(input.voices, input.language, input.offline).slice(0, MAX_BROWSER_VOICE_ATTEMPTS)) steps.push({ kind: "voice", voiceIndex });
  }
  if (input.fallbackAvailable) steps.push({ kind: "fallback" });
  return steps;
}

/** A lépés kimenete: `done` — megszólalt (vagy a tanuló maga szakította meg): a lánc megáll; `failed` — a következő lépés jön. */
export type StepOutcome = "done" | "failed";
/** A következő lépés indexe; `null`: a lánc véget ért. `exhausted`: minden lépés elbukott — a hívó hibát jelez. */
export function nextSpeechStep(plan: ReadonlyArray<SpeechStep>, index: number, outcome: StepOutcome): { next: number | null; exhausted: boolean } {
  if (outcome === "done") return { next: null, exhausted: false };
  return index + 1 < plan.length ? { next: index + 1, exhausted: false } : { next: null, exhausted: true };
}

/** Miért nem szólt az előre gyártott hang. */
export type PreparedFailure = "error" | "timeout" | "not-allowed" | "aborted";
/**
 * Megjegyezze-e a kliens a munkamenet idejére, hogy ehhez a kulcshoz nincs hang (ne kérje újra minden kattintásnál)? A hiány (404), a
 * korlát (429), a hálózati hiba és az időtúllépés igen; a böngésző lejátszási tiltása és a tanuló megszakítása nem a hang hibája.
 */
export function rememberPreparedFailure(reason: PreparedFailure): boolean {
  return reason === "error" || reason === "timeout";
}

/** Kérhető-e az előre gyártott hang: csak a hangtár nyelvein, kiszámolt kulccsal, és ha a munkamenetben még nem bizonyult hiányzónak. */
export function preparedAudioCandidate(input: { languageSupported: boolean; id: string | undefined; knownMissing: boolean }): string | null {
  return input.languageSupported && input.id && !input.knownMissing ? input.id : null;
}

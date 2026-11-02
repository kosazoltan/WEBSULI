import { useEffect, type RefObject } from "react";

/**
 * Spec 2026-10-21-diktalas-hid — a főoldali oldal: a kereszt-domaines tananyag-iframe beszédfelismerési kéréseit (a keretbe injektált
 * `SpeechRecognition`-híd üzeneteit) a főoldal futtatja, ahol a böngésző engedélyezi a mikrofont, és az eredményt visszaküldi.
 * Review #360: csak a SAJÁT iframe-jének (`event.source`) és csak a várt originről (`event.origin`) fogad kérést; minden indításhoz
 * FRISS felhasználói gesztus kell (`userActivation.isActive` — a keretbeli kattintás az ősökre is kiterjed), így egy anyag nem indíthatja
 * a mikrofont a tanuló szándéka nélkül; a keret újratöltésekor a futó felismerés leáll.
 */
type Alternative = { transcript: string; confidence?: number };
type ResultList = ArrayLike<ArrayLike<Alternative> & { isFinal?: boolean }>;
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex?: number; results: ResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; onstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
type StartRequest = { type: "websuli-sr:start"; id: string; lang?: string; continuous?: boolean; interimResults?: boolean; maxAlternatives?: number };

/** Tiszta: a felismerés TELJES (kumulatív) eredménylistájának továbbítható (klónozható) alakja — a natív eseményalak megmarad. */
export function serializeResults(results: ResultList) {
  const out: Array<{ isFinal: boolean; alternatives: Alternative[] }> = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    out.push({ isFinal: !!r.isFinal, alternatives: Array.from({ length: r.length }, (_, k) => ({ transcript: r[k].transcript, confidence: r[k].confidence })) });
  }
  return out;
}

/** Tiszta: elfogadható-e a keret kérése (saját keret, várt origin). */
export const acceptsBridgeMessage = (event: { source: unknown; origin: string }, frame: unknown, expectedOrigin: string) =>
  !!frame && event.source === frame && event.origin === expectedOrigin;

/** Tiszta: van-e friss felhasználói gesztus (ahol a böngésző nem méri, nem tiltunk — a mikrofon-engedélyt a böngésző úgyis kéri). */
export const hasFreshGesture = (activation: { isActive?: boolean } | undefined) => !activation || activation.isActive !== false;

export function useSpeechBridgeHost(iframeRef: RefObject<HTMLIFrameElement | null>, frameOrigin: string): void {
  useEffect(() => {
    let active: { id: string; engine: Recognition } | null = null;
    const stopActive = () => { if (active) { const engine = active.engine; active = null; try { engine.abort(); } catch { /* már leállt */ } } };
    const expectedOrigin = frameOrigin || window.location.origin;
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current?.contentWindow;
      if (!acceptsBridgeMessage(event, frame, expectedOrigin) || !frame) return;
      const data = event.data as { type?: unknown; id?: unknown } | null;
      if (!data || typeof data.type !== "string" || !data.type.startsWith("websuli-sr:") || typeof data.id !== "string") return;
      const reply = (message: Record<string, unknown>) => frame.postMessage({ ...message, id: data.id }, expectedOrigin);
      if (data.type === "websuli-sr:stop" || data.type === "websuli-sr:abort") {
        if (active?.id === data.id) { try { if (data.type === "websuli-sr:stop") active.engine.stop(); else active.engine.abort(); } catch { /* már leállt */ } }
        return;
      }
      if (data.type !== "websuli-sr:start") return;
      reply({ type: "websuli-sr:ack" });
      const request = data as StartRequest;
      const Constructor = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
      if (!Constructor || !window.isSecureContext) { reply({ type: "websuli-sr:error", error: "not-supported" }); return; }
      if (!hasFreshGesture((navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation)) { reply({ type: "websuli-sr:error", error: "not-allowed" }); return; }
      stopActive();
      let engine: Recognition;
      try { engine = new Constructor(); } catch { reply({ type: "websuli-sr:error", error: "audio-capture" }); return; }
      const session = { id: request.id, engine };
      active = session;
      // Review #360: a keret újratöltése / navigációja leállítja a futó felismerést (a régi dokumentum munkamenete megszűnt).
      iframeRef.current?.addEventListener("load", () => { if (active === session) stopActive(); }, { once: true });
      engine.lang = typeof request.lang === "string" && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(request.lang) ? request.lang : "hu-HU";
      engine.continuous = !!request.continuous;
      engine.interimResults = !!request.interimResults;
      engine.maxAlternatives = Math.min(5, Math.max(1, Number(request.maxAlternatives) || 1));
      engine.onstart = () => reply({ type: "websuli-sr:started" });
      engine.onresult = e => reply({ type: "websuli-sr:result", resultIndex: e.resultIndex ?? 0, results: serializeResults(e.results) });
      engine.onerror = e => reply({ type: "websuli-sr:error", error: e.error });
      engine.onend = () => { if (active === session) active = null; reply({ type: "websuli-sr:end" }); };
      try { engine.start(); } catch { active = null; reply({ type: "websuli-sr:error", error: "audio-capture" }); }
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); stopActive(); };
  }, [iframeRef, frameOrigin]);
}

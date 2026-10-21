import { useEffect, type RefObject } from "react";

/**
 * Spec 2026-10-21-diktalas-hid — a főoldali oldal: a kereszt-domaines tananyag-iframe beszédfelismerési kéréseit (a keretbe injektált
 * `SpeechRecognition`-híd üzeneteit) a főoldal futtatja, ahol a böngésző engedélyezi a mikrofont, és az eredményt visszaküldi.
 * Csak a SAJÁT iframe-jének (`event.source`) válaszol, a keret originjére címezve. Az oldalbetöltéskori, felhasználói interakció nélküli
 * indítást elutasítja (ahol a böngésző ezt méri), hogy egy anyag ne kapcsolhassa be magától a mikrofont.
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

/** Tiszta: a felismerés eredményének továbbítható (klónozható) alakja. */
export function serializeResults(results: ResultList, from = 0) {
  const out: Array<{ isFinal: boolean; alternatives: Alternative[] }> = [];
  for (let i = from; i < results.length; i++) {
    const r = results[i];
    out.push({ isFinal: !!r.isFinal, alternatives: Array.from({ length: r.length }, (_, k) => ({ transcript: r[k].transcript, confidence: r[k].confidence })) });
  }
  return out;
}

export function useSpeechBridgeHost(iframeRef: RefObject<HTMLIFrameElement | null>, frameOrigin: string): void {
  useEffect(() => {
    let active: { id: string; engine: Recognition } | null = null;
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current?.contentWindow;
      if (!frame || event.source !== frame) return;
      const data = event.data as { type?: unknown; id?: unknown } | null;
      if (!data || typeof data.type !== "string" || !data.type.startsWith("websuli-sr:") || typeof data.id !== "string") return;
      // A válasz a keret tényleges originjére megy (same-origin fejlesztésnél ez az app originje).
      const target = frameOrigin || window.location.origin;
      const reply = (message: Record<string, unknown>) => frame.postMessage({ ...message, id: data.id }, target);
      if (data.type === "websuli-sr:stop" || data.type === "websuli-sr:abort") {
        if (active?.id === data.id) { try { if (data.type === "websuli-sr:stop") active.engine.stop(); else active.engine.abort(); } catch { /* már leállt */ } }
        return;
      }
      if (data.type !== "websuli-sr:start") return;
      reply({ type: "websuli-sr:ack" });
      const request = data as StartRequest;
      const Constructor = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
      if (!Constructor || !window.isSecureContext) { reply({ type: "websuli-sr:error", error: "not-supported" }); return; }
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (activation && !activation.hasBeenActive) { reply({ type: "websuli-sr:error", error: "not-allowed" }); return; }
      if (active) { try { active.engine.abort(); } catch { /* a régi munkamenet */ } }
      const engine = new Constructor();
      const session = { id: request.id, engine };
      active = session;
      engine.lang = typeof request.lang === "string" && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(request.lang) ? request.lang : "hu-HU";
      engine.continuous = !!request.continuous;
      engine.interimResults = !!request.interimResults;
      engine.maxAlternatives = Math.min(5, Math.max(1, Number(request.maxAlternatives) || 1));
      engine.onstart = () => reply({ type: "websuli-sr:started" });
      engine.onresult = e => reply({ type: "websuli-sr:result", resultIndex: 0, results: serializeResults(e.results, e.resultIndex ?? 0) });
      engine.onerror = e => reply({ type: "websuli-sr:error", error: e.error });
      engine.onend = () => { if (active === session) active = null; reply({ type: "websuli-sr:end" }); };
      try { engine.start(); } catch { active = null; reply({ type: "websuli-sr:error", error: "audio-capture" }); }
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); if (active) { try { active.engine.abort(); } catch { /* leállítva */ } } };
  }, [iframeRef, frameOrigin]);
}

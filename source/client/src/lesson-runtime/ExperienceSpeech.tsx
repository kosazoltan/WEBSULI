import { useEffect, useRef, useState } from "react";
import { Keyboard, Mic, Square, Volume2 } from "lucide-react";
import { pronunciationVerdict, type PronunciationVerdict } from "@shared/pronunciation";
import { ttsAudioHash } from "@shared/tts-audio-key";
import { createSpeechPlayer, type AudioLike, type SpeechEnv, type SynthLike, type UtteranceLike } from "./speech-player";

type Alternative = { transcript: string };
type Recognition = {
  lang: string; interimResults: boolean; maxAlternatives?: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<Alternative>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const recognitionConstructor = () => (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
/** Beszédfelismerés: Android Chrome / Edge és iOS Safari (webkit előtaggal) — biztonságos (HTTPS) környezetben. */
const recognitionSupported = () => window.isSecureContext && !!recognitionConstructor();
// Egyszerre egy felismerés fut (diktálás vagy kiejtésgyakorlás): az új a régit leállítja.
let cancelActiveDictation: (() => void) | null = null;

/** A billentyűzetes diktálás útmutatója — ahol a böngésző nem ad beszédfelismerést, a telefon billentyűzetének 🎤 gombja minden böngészőben működik. */
const KEYBOARD_HINT = "Ezen a böngészőn a beépített diktálás nem érhető el: koppints a mezőbe, és használd a billentyűzet 🎤 (mikrofon) gombját.";

export function DictationButton({ onText, active = true, language = "hu-HU" }: { onText(text: string): void; active?: boolean; language?: string }) {
  const [supported] = useState(recognitionSupported);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const cancelRecognition = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!active) cancelRecognition.current?.();
    return () => { cancelRecognition.current?.(); };
  }, [active]);
  // Spec 2026-10-21-nyelvlecke-kiejtes: támogatás hiányában a lehetőség nem tűnik el nyom nélkül — útmutató a billentyűzetes diktáláshoz.
  if (!supported) return <p className="fusion-speech-hint"><Keyboard size={15} /> {KEYBOARD_HINT}</p>;
  const start = () => {
    if (listening) { recognition.current?.stop(); return; }
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    cancelActiveDictation?.();
    const engine = new Constructor();
    recognition.current = engine;
    const cancel = () => {
      recognition.current = null;
      engine.onresult = null; engine.onerror = null; engine.onend = null;
      if (cancelActiveDictation === cancel) cancelActiveDictation = null;
      cancelRecognition.current = null;
      engine.abort();
      setListening(false);
      setMessage("");
    };
    cancelRecognition.current = cancel;
    cancelActiveDictation = cancel;
    engine.lang = language;
    engine.interimResults = false;
    let failed = false;
    engine.onresult = e => { if (recognition.current === engine) onText(Array.from(e.results).map(result => result[0].transcript).join(" ")); };
    engine.onerror = e => {
      failed = true;
      setListening(false);
      setMessage(e.error === "not-allowed" ? "A böngésző nem engedélyezte a mikrofont. Engedélyezd a címsor melletti lakatnál, vagy használd a billentyűzet 🎤 gombját." : "A diktálás nem sikerült. Próbáld újra, vagy használd a billentyűzet 🎤 gombját.");
    };
    engine.onend = () => {
      if (recognition.current !== engine) return;
      recognition.current = null; cancelRecognition.current = null;
      if (cancelActiveDictation === cancel) cancelActiveDictation = null;
      setListening(false); if (!failed) setMessage("A diktálás befejeződött. Ellenőrizd a szöveget.");
    };
    try { engine.start(); setListening(true); setMessage("Hallgatlak…"); }
    catch { cancel(); setMessage("A mikrofon most nem indítható. Gépeléssel is válaszolhatsz."); }
  };
  return <div className="fusion-speech"><button type="button" className="lesson-outline-btn" onClick={start}>{listening ? <Square size={16} /> : <Mic size={16} />}{listening ? "Diktálás leállítása" : "Válasz diktálása"}</button><span role="status">{message}</span></div>;
}

/**
 * A lecke felolvasásának bekötése a valódi böngészőhöz (terv 2026-11-18-tananyag-gyartas-minoseg, S8d). A logika a
 * `speech-player.ts`-ben van (befecskendezett környezettel, ál-órával tesztelve); itt csak a böngésző felületei állnak:
 * hangelem, beszédmotor, jegyzék-lekérés, kapcsolat, helyi tár, és a munkamenet-szintű figyelők.
 */
const MANIFEST_STORAGE_KEY = "websuli-lesson-audio-manifest";
type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };
const browserEnv: SpeechEnv = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: handle => { if (typeof handle === "number") window.clearTimeout(handle); },
  idle: callback => { if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => callback(), { timeout: 2000 }); else window.setTimeout(callback, 200); },
  createAudio: () => new Audio() as unknown as AudioLike,
  synth: () => "speechSynthesis" in window ? window.speechSynthesis as unknown as SynthLike : undefined,
  createUtterance: text => typeof SpeechSynthesisUtterance === "undefined" ? undefined : new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
  hash: (text, language) => ttsAudioHash(text, language),
  fetchManifest: async (url, signal) => {
    const response = await fetch(url, { credentials: "same-origin", signal });
    if (response.ok) return { ok: true, body: await response.json() };
    const seconds = Number(response.headers.get("Retry-After"));
    return { ok: false, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null };
  },
  connection: () => {
    const info = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    return { saveData: info?.saveData, effectiveType: info?.effectiveType, online: navigator.onLine !== false };
  },
  storage: {
    read: () => { const raw = window.localStorage.getItem(MANIFEST_STORAGE_KEY); return raw ? JSON.parse(raw) : null; },
    write: value => window.localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(value)),
  },
};
const player = createSpeechPlayer(browserEnv);

if (typeof window !== "undefined") {
  // A hanglista „bemelegítése” (Android Chrome: az első lekérés üres lehet); a később betöltődő hangok (`voiceschanged`) után a
  // munkamenet-ismeret újraépül. Hiba esetén sem állhat le a lecke.
  if ("speechSynthesis" in window && typeof window.speechSynthesis?.getVoices === "function") {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener?.("voiceschanged", () => { window.speechSynthesis.getVoices(); player.voicesChanged(); });
    } catch { /* hiányos felület: a lang beállítás dönt */ }
  }
  // Valódi koppintás (`click` — ez ad felhasználói aktivációt; görgetés és hosszú nyomás nem): iOS-en a futó hangletöltések feloldása.
  // A beszédmotorhoz itt semmi nem nyúl: kimondás csak a „Meghallgatás” gomb koppintására indul.
  document.addEventListener("click", () => player.noteUserActivation(), { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => player.setVisible(document.visibilityState !== "hidden"));
}

/** Minden hang leállítása: böngészőhang, előre gyártott hang, tartalék MP3 és az indulási őrök (új gombnyomás, fülváltás, a lecke elhagyása). */
export function stopSpeech(): void {
  player.stop();
}

/** A lecke megnyitása: a szószedet hangjainak jegyzéke (egy kérés) és előtöltése a háttérben. */
export function prepareLessonSpeech(texts: readonly string[], language: string): void {
  player.prepareLesson(texts, language);
}

/** A lecke elhagyása: a futó letöltések megszakadnak, a pufferelt hangok felszabadulnak. */
export function releaseLessonSpeech(): void {
  player.release();
}

export function speakText(text: string, language: string, rate: number, onError?: () => void): void {
  player.speak(text, language, rate, onError);
}

/** Mérés és teszt: a lejátszó állapota (előtöltés, hangmotor-ismeret). Csak a futásidejű próba-kapcsolóval érhető el. */
if (typeof window !== "undefined" && import.meta.env.VITE_ENABLE_RUNTIME_PROBE === "1") {
  (window as unknown as { __lessonSpeech?: () => ReturnType<typeof player.inspect> }).__lessonSpeech = () => player.inspect();
}
export function SpeakButton({ text, language, rate }: { text: string; language: string; rate: number }) {
  const [error, setError] = useState("");
  return <><button className="lesson-outline-btn" data-tts={text} aria-label={`${text} meghallgatása`} onClick={() => {
    setError("");
    speakText(text, language, rate, () => setError("A hang most nem érhető el ezen az eszközön."));
  }}><Volume2 size={18} /> Meghallgatás</button>{error && <span role="status">{error}</span>}</>;
}
const VERDICT_TEXT: Record<PronunciationVerdict["state"], string> = {
  ok: "✅ Szép kiejtés!",
  close: "🟡 Majdnem! Hallgasd meg még egyszer, és próbáld újra.",
  retry: "🔁 Próbáld újra! Hallgasd meg, és mondd lassan, tisztán.",
};

/**
 * Spec 2026-10-21-nyelvlecke-kiejtes: kiejtésgyakorlás — a tanuló kimondja a szót / mondatot, a beszédfelismerő a lecke nyelvén hallgat,
 * a hallott szöveg a célhoz mérve (✅ / 🟡 / 🔁). Beszédfelismerés nélkül (vagy megtagadott mikrofonnál) beviteli mező: a billentyűzet 🎤
 * gombjával bediktált szöveg ugyanúgy összevetődik — így minden telefonos böngészőben gyakorolható.
 */
export function PronounceButton({ target, language, active = true }: { target: string; language: string; active?: boolean }) {
  const [supported] = useState(recognitionSupported);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState("");
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<{ heard: string; verdict: PronunciationVerdict } | null>(null);
  const [message, setMessage] = useState("");
  const cancelRef = useRef<(() => void) | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  // Review #360: a rejtett (nem látható fülön lévő) gyakorló nem hallgathat tovább.
  useEffect(() => { if (!active) cancelRef.current?.(); }, [active]);
  useEffect(() => () => { cancelRef.current?.(); }, []);
  const judge = (alternatives: string[]) => {
    const scored = alternatives.filter(a => a.trim()).map(heard => ({ heard, verdict: pronunciationVerdict(target, heard) }))
      .sort((a, b) => b.verdict.similarity - a.verdict.similarity);
    setResult(scored[0] ?? { heard: "", verdict: { state: "retry", similarity: 0 } });
  };
  const start = () => {
    if (!supported) { setManual(true); return; }
    // Review #360: a tanuló leállítása befejezi (stop) a felismerést — a végső eredmény még kiértékelődik; az abort csak takarítás.
    if (listening) { stopRef.current?.(); return; }
    const Constructor = recognitionConstructor();
    if (!Constructor) { setManual(true); return; }
    cancelActiveDictation?.();
    const engine = new Constructor();
    const cancel = () => {
      engine.onresult = null; engine.onerror = null; engine.onend = null;
      if (cancelActiveDictation === cancel) cancelActiveDictation = null;
      cancelRef.current = null;
      engine.abort();
      setListening(false);
    };
    cancelRef.current = cancel;
    stopRef.current = () => { try { engine.stop(); } catch { cancel(); } };
    cancelActiveDictation = cancel;
    engine.lang = language;
    engine.interimResults = false;
    engine.maxAlternatives = 3;
    engine.onresult = e => { const first = e.results[0]; judge(first ? Array.from(first).map(a => a.transcript) : []); };
    engine.onerror = e => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { setManual(true); setMessage("A mikrofon nincs engedélyezve — a billentyűzet 🎤 gombjával is bediktálhatod."); }
      else if (e.error === "no-speech") setMessage("Nem hallottam semmit — nyomd meg újra, és mondd ki hangosan.");
      else { setManual(true); setMessage("A beszédfelismerés most nem érhető el — a billentyűzet 🎤 gombjával is bediktálhatod."); }
    };
    engine.onend = () => { if (cancelRef.current === cancel) { cancelRef.current = null; stopRef.current = null; if (cancelActiveDictation === cancel) cancelActiveDictation = null; } setListening(false); };
    setResult(null); setMessage("");
    try { engine.start(); setListening(true); }
    catch { cancel(); setManual(true); setMessage("A mikrofon most nem indítható — a billentyűzet 🎤 gombjával is bediktálhatod."); }
  };
  return <div className="fusion-pronounce" data-testid="pronounce">
    <button type="button" className="lesson-outline-btn" aria-label={`${target} kimondása`} onClick={start}>{listening ? <Square size={16} /> : <Mic size={16} />}{listening ? "Hallgatlak… (koppints a leállításhoz)" : "Mondd ki!"}</button>
    {manual && <form className="fusion-pronounce-manual" onSubmit={ev => { ev.preventDefault(); judge([typed]); }}>
      <label className="fusion-label">{supported ? "Vagy diktáld be a billentyűzet 🎤 gombjával:" : "Diktáld be a billentyűzet 🎤 gombjával (vagy írd be):"}<input lang={language} value={typed} onChange={ev => setTyped(ev.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} /></label>
      <button type="submit" className="lesson-outline-btn">Ellenőrzés</button>
    </form>}
    <p role="status" className="fusion-pronounce-result" data-state={result?.verdict.state}>{result ? <>{VERDICT_TEXT[result.verdict.state]}{result.heard && <> Ezt hallottam: <q lang={language}>{result.heard}</q></>}</> : message}</p>
  </div>;
}

import { useEffect, useRef, useState } from "react";
import { Keyboard, Mic, Square, Volume2 } from "lucide-react";
import { pronunciationVerdict, type PronunciationVerdict } from "@shared/pronunciation";
import { isSoftSpeechError, ttsAudioUrl } from "@shared/speech-fallback";
import {
  availableFromManifest, hasLaterLocalVoice, nextSpeechStep, preparedAudioCandidate, rememberPreparedFailure, speechPlan, voicePhaseBudgetMs, voiceStepTimeoutMs,
  PREPARED_AUDIO_START_TIMEOUT_MS, type PreparedFailure, type StepOutcome,
} from "@shared/speech-chain";
import { hasPreparedAudio, ttsAudioAvailabilityUrl, ttsAudioHash, ttsAudioPath, TTS_AUDIO_AVAILABILITY_MAX_KEYS } from "@shared/tts-audio-key";

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

// A hanglista „bemelegítése” (Android Chrome: az első lekérés üres lehet). A lánc minden kimondásnál frissen kéri le a listát, így a később
// betöltődő hangok (`voiceschanged`) után a következő felolvasás már rangsorolt hangot kap. Hiba esetén sem állhat le a lecke.
if (typeof window !== "undefined" && "speechSynthesis" in window && typeof window.speechSynthesis?.getVoices === "function") {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", () => window.speechSynthesis.getVoices());
  } catch { /* hiányos felület: a lang beállítás dönt */ }
}

// Spec 2026-11-09-felolvasas-tartalek: egyszerre egy hang szól — az új gombnyomás az előző kimondást, az előre gyártott és a tartalék hangot is leállítja.
let activeAudio: HTMLAudioElement | null = null;
let cancelActiveSpeech: (() => void) | null = null;

/** Minden hang leállítása: böngészőhang, előre gyártott hang, tartalék MP3 és az indulási őrök (új gombnyomás, fülváltás, a lecke elhagyása). */
export function stopSpeech(): void {
  cancelActiveSpeech?.();
  cancelActiveSpeech = null;
  if (activeAudio) { activeAudio.pause(); activeAudio = null; }
  const synth = "speechSynthesis" in window ? window.speechSynthesis : undefined;
  // Android Chrome: a feltétel nélküli cancel() közvetlenül a speak() előtt az új kimondást is megszakíthatja.
  if (synth && (synth.speaking || synth.pending)) synth.cancel();
}

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8b-2 (review J1–J2): ELÉRHETŐSÉGI JEGYZÉK. A lecke betöltésekor a kliens kiszámolja a
// szószedet szövegeinek kulcsát (a lenyomat aszinkron), és EGY kéréssel megkérdezi, melyikhez van hang a tárban. Kattintáskor így
// szinkron tudja: ha a kulcs elérhető → előre gyártott hang; ha nem (vagy a jegyzék még nem jött meg / hibázott) → azonnal, a kattintás
// GESZTUSÁBAN a rangsorolt böngészőhang. Üres tárnál hangfájl-kérés egyáltalán nem megy, és nincs 404-re váró kör.
const preparedIds = new Map<string, string>();
const availablePrepared = new Set<string>();
const failedPrepared = new Set<string>();
const requestedManifests = new Set<string>();
const preparedKey = (text: string, language: string) => `${language}\n${text}`;
/** A lecke felolvasható szövegeinek előkészítése; WebCrypto híján, hibás válaszra vagy hálózati hibára csendben kimarad (a böngészőhang szól). */
export function prepareLessonSpeech(texts: readonly string[], language: string): void {
  if (!hasPreparedAudio(language)) return;
  const unique = Array.from(new Set(texts.filter(text => text.trim()))).slice(0, TTS_AUDIO_AVAILABILITY_MAX_KEYS);
  if (!unique.length) return;
  Promise.all(unique.map(async text => { const id = await ttsAudioHash(text, language); preparedIds.set(preparedKey(text, language), id); return id; }))
    .then(async ids => {
      const url = ttsAudioAvailabilityUrl(ids);
      if (!url || requestedManifests.has(url)) return;
      requestedManifests.add(url);
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        // 429 / hiba: nincs jegyzék → a böngészőhang szól; a következő leckebetöltés újra megpróbálhatja.
        if (!response.ok) { requestedManifests.delete(url); return; }
        for (const id of availableFromManifest(await response.json(), ids)) availablePrepared.add(id);
      } catch { requestedManifests.delete(url); }
    })
    .catch(() => { /* nincs kulcs: a böngészőhang szól */ });
}
type StepDone = (outcome: StepOutcome) => void;

/** 1. lépés: az előre gyártott hang azonos eredetről. Hiba, lejátszási tiltás vagy el nem induló hang → a következő lépés. */
function playPrepared(id: string, rate: number, alive: () => boolean, done: StepDone): () => void {
  const audio = new Audio(ttsAudioPath(id));
  audio.preservesPitch = true;
  audio.playbackRate = rate;
  activeAudio = audio;
  let settled = false;
  const settle = (outcome: StepOutcome, failure?: PreparedFailure) => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    if (failure && rememberPreparedFailure(failure)) failedPrepared.add(id);
    if (outcome === "failed") { audio.pause(); if (activeAudio === audio) activeAudio = null; }
    if (alive()) done(outcome);
  };
  const watchdog = setTimeout(() => settle("failed", "timeout"), PREPARED_AUDIO_START_TIMEOUT_MS);
  audio.onplaying = () => settle("done");
  audio.onerror = () => settle("failed", "error");
  audio.play().catch((error: unknown) => {
    const name = error instanceof Error ? error.name : "";
    // A megszakítás (pause() új gombnyomásnál) és a böngésző lejátszási tiltása nem a hang hibája: nem jegyezzük meg hiányként.
    settle("failed", name === "NotAllowedError" ? "not-allowed" : name === "AbortError" ? "aborted" : "error");
  });
  return () => { settled = true; clearTimeout(watchdog); };
}

/** 2. lépés: a böngésző egy hangja. Hiba vagy el nem induló kimondás → a következő lépés (a rangsor következő hangja, végül a tartalék). */
function speakWithVoice(synth: SpeechSynthesis, text: string, language: string, rate: number, voice: SpeechSynthesisVoice | undefined, startTimeoutMs: number, done: StepDone): () => void {
  // A szakasz csendkerete elfogyott: ez a hang már nem próbálkozik (a lánc a tartalékra lép).
  if (startTimeoutMs <= 0) { done("failed"); return () => {}; }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = rate;
  // A motor a nem saját hangobjektumot elutasítja: ilyenkor a `lang` beállítás dönt.
  if (voice) { try { utterance.voice = voice; } catch { /* a lang dönt */ } }
  let settled = false;
  let started = false;
  const finish = (outcome: StepOutcome) => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    if (outcome === "failed" && (synth.speaking || synth.pending)) synth.cancel();
    done(outcome);
  };
  // Néma motor (pl. Google-szolgáltatás nélküli Android): ha a kimondás a kapott időn belül nem indul el, a következő lépés jön. Az időt a
  // lánc adja a böngészőhang-szakasz ÖSSZESÍTETT csendkeretéből (`voiceStepTimeoutMs`), így több próbált hang sem nyújtja a csendet.
  const watchdog = setTimeout(() => { if (!started) finish("failed"); }, startTimeoutMs);
  utterance.onstart = () => { started = true; };
  // Egyes motorok `onstart` nélkül szólnak: a szóhatár-esemény is indulás.
  utterance.onboundary = () => { started = true; };
  utterance.onend = () => finish("done");
  utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
    if (settled) return;
    // A megszakítás (új gombnyomás, fülváltás) nem hiba: se másik hang, se üzenet. Az új gombnyomás és a fülváltás ezt a kimondást előbb
    // lezárja (`settled`), ide tehát csak a motor saját megszakítása jut: ha a kimondás el sem indult (Android Chrome: a `cancel()` utáni
    // azonnali `speak()`), a tanuló semmit sem hallott — a következő lépés szól.
    if (isSoftSpeechError(e?.error) && started) { finish("done"); return; }
    finish("failed");
  };
  synth.speak(utterance);
  return () => { settled = true; clearTimeout(watchdog); };
}

/** 3. lépés: a szerver MP3-a azonos eredetről (/api/tts/audio) — a böngésző beszédmotorja nélkül is szól. */
function playFallback(text: string, language: string, rate: number, done: StepDone): () => void {
  const url = ttsAudioUrl(text, language);
  if (!url) { done("failed"); return () => {}; }
  const audio = new Audio(url);
  audio.playbackRate = rate;
  activeAudio = audio;
  let settled = false;
  const fail = () => { if (!settled && activeAudio === audio) { settled = true; activeAudio = null; done("failed"); } };
  audio.onerror = fail;
  audio.play().catch(fail);
  return () => { settled = true; };
}

/**
 * A felolvasás lánca (`shared/speech-chain.ts` — a sorrendet a tiszta `speechPlan` adja): előre gyártott hang (ha a jegyzék szerint megvan)
 * → a böngésző hangjai sorban, közös csendkerettel → a szerver tartalék hangja. A lejátszó csak végrehajt: minden elbukott lépés után a terv következő lépése jön.
 */
export function speakText(text: string, language: string, rate: number, onError?: () => void): void {
  stopSpeech();
  const synth = "speechSynthesis" in window ? window.speechSynthesis : undefined;
  // Egyes (régi / gyártói) böngészőkben a hanglista-felület hiányos — ilyenkor a `lang` beállítás dönt.
  const voices = synth && typeof synth.getVoices === "function" ? synth.getVoices() ?? [] : [];
  const id = preparedIds.get(preparedKey(text, language));
  const plan = speechPlan({
    language, voices, synthAvailable: !!synth && typeof SpeechSynthesisUtterance !== "undefined",
    preparedId: preparedAudioCandidate({ languageSupported: hasPreparedAudio(language), id, available: !!id && availablePrepared.has(id), knownMissing: !!id && failedPrepared.has(id) }),
    offline: typeof navigator !== "undefined" && navigator.onLine === false,
    fallbackAvailable: !!ttsAudioUrl(text, language),
  });
  let cancelled = false;
  let cancelStep: () => void = () => {};
  // A böngészőhang-szakasz összesített csendkerete az első hanglépés indulásától számít.
  let voicePhase: { startedAt: number; budgetMs: number } | null = null;
  const cancel = () => { cancelled = true; cancelStep(); };
  cancelActiveSpeech = cancel;
  const run = (index: number) => {
    const step = plan[index];
    if (!step) { if (cancelActiveSpeech === cancel) cancelActiveSpeech = null; onError?.(); return; }
    const done: StepDone = (outcome) => {
      if (cancelled) return;
      const { next, exhausted } = nextSpeechStep(plan, index, outcome);
      if (next !== null) { run(next); return; }
      if (cancelActiveSpeech === cancel) cancelActiveSpeech = null;
      if (exhausted) onError?.();
    };
    if (step.kind === "prepared") cancelStep = playPrepared(step.id, rate, () => !cancelled, done);
    else if (step.kind === "voice") {
      const voice = step.voiceIndex === null ? undefined : voices[step.voiceIndex];
      voicePhase ??= { startedAt: Date.now(), budgetMs: voicePhaseBudgetMs(voice) };
      const startTimeoutMs = voiceStepTimeoutMs({ budgetMs: voicePhase.budgetMs, elapsedMs: Date.now() - voicePhase.startedAt, network: voice?.localService === false, laterLocalVoice: hasLaterLocalVoice(plan, index, voices) });
      cancelStep = speakWithVoice(synth!, text, language, rate, voice, startTimeoutMs, done);
    }
    else cancelStep = playFallback(text, language, rate, done);
  };
  run(0);
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

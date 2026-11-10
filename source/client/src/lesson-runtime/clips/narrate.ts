import { silentSceneMs } from "@shared/lesson-clip";

/**
 * A kisfilm hanglánca (v1 és v2 közös): azonos eredetű hangfájl → a böngésző beszédmotorja → néma időzítő. A jelenet a hang végén lép.
 */
export type ClipAudioMode = "mp3" | "speech" | "silent";
const SPEECH_START_MS = 3000;
/** A felolvasás tartalék hangja kissé lassú: a v1 ezzel a sebességgel játssza. */
export const CLIP_AUDIO_RATE = 1.1;

/** Egy mondat elmondása; a visszaadott függvény megszakítja. `onDone` pontosan egyszer fut, megszakításkor nem. */
export function narrate(audio: HTMLAudioElement, url: string | null, say: string, rate: number, onMode: (mode: ClipAudioMode) => void, onDone: () => void): () => void {
  let over = false;
  let stage: ClipAudioMode = "mp3";
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const synth = "speechSynthesis" in window ? window.speechSynthesis : undefined;
  const quiet = () => { audio.onended = null; audio.onerror = null; audio.pause(); timers.forEach(clearTimeout); if (stage === "speech") synth?.cancel(); };
  const finish = () => { if (over) return; over = true; quiet(); onDone(); };
  const silent = () => {
    if (over || stage === "silent") return;
    if (stage === "speech") synth?.cancel();
    stage = "silent"; onMode("silent");
    timers.push(setTimeout(finish, silentSceneMs(say)));
  };
  const speech = () => {
    if (over || stage !== "mp3") return;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") { silent(); return; }
    stage = "speech";
    const utterance = new SpeechSynthesisUtterance(say);
    utterance.lang = "hu-HU";
    let started = false;
    utterance.onstart = () => { started = true; if (!over && stage === "speech") onMode("speech"); };
    utterance.onboundary = () => { started = true; };
    utterance.onend = () => { if (stage === "speech") finish(); };
    utterance.onerror = () => { if (stage === "speech") silent(); };
    // Néma motor: ha a kimondás nem indul el, vagy végtelenbe nyúlik, a néma időzítő viszi tovább a kisfilmet.
    timers.push(setTimeout(() => { if (!started) silent(); }, SPEECH_START_MS));
    timers.push(setTimeout(() => { if (stage === "speech") finish(); }, silentSceneMs(say) * 3));
    synth.speak(utterance);
  };
  if (!url) { speech(); return () => { over = true; quiet(); }; }
  audio.onended = finish;
  audio.onerror = speech;
  audio.src = url;
  audio.playbackRate = rate;
  audio.play().then(() => { if (!over && stage === "mp3") onMode("mp3"); }, speech);
  return () => { over = true; quiet(); };
}


import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";

type Recognition = {
  lang: string; interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function DictationButton({ onText, active = true }: { onText(text: string): void; active?: boolean }) {
  const [supported] = useState(() => window.isSecureContext && !!((window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition));
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => {
    if (!active) recognition.current?.abort();
    return () => { recognition.current?.abort(); recognition.current = null; };
  }, [active]);
  if (!supported) return null;
  const start = () => {
    if (listening) { recognition.current?.stop(); return; }
    const Constructor = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) return;
    const engine = new Constructor();
    recognition.current = engine;
    engine.lang = "hu-HU";
    engine.interimResults = false;
    let failed = false;
    engine.onresult = e => onText(Array.from(e.results).map(result => result[0].transcript).join(" "));
    engine.onerror = e => {
      failed = true;
      setListening(false);
      setMessage(e.error === "not-allowed" ? "A böngésző nem engedélyezte a mikrofont. Beágyazott nézetben nyisd meg külön a tananyagot; gépeléssel is válaszolhatsz." : "A diktálás nem sikerült. Próbáld újra, vagy írd be a válaszod.");
    };
    engine.onend = () => { setListening(false); if (!failed) setMessage("A diktálás befejeződött. Ellenőrizd a szöveget."); };
    try { engine.start(); setListening(true); setMessage("Hallgatlak…"); }
    catch { setMessage("A mikrofon most nem indítható. Gépeléssel is válaszolhatsz."); }
  };
  return <div className="fusion-speech"><button type="button" className="lesson-outline-btn" onClick={start}>{listening ? <Square size={16} /> : <Mic size={16} />}{listening ? "Diktálás leállítása" : "Válasz diktálása"}</button><span role="status">{message}</span></div>;
}

export function SpeakButton({ text, language, rate }: { text: string; language: string; rate: number }) {
  const [available] = useState(() => "speechSynthesis" in window);
  const [error, setError] = useState("");
  if (!available) return <span className="lesson-muted">Felolvasás ezen az eszközön nem elérhető.</span>;
  return <><button className="lesson-outline-btn" data-tts={text} aria-label={`${text} meghallgatása`} onClick={() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = rate;
    utterance.onerror = () => setError("A hang most nem érhető el ezen az eszközön.");
    setError("");
    window.speechSynthesis.speak(utterance);
  }}><Volume2 size={18} /> Meghallgatás</button>{error && <span role="status">{error}</span>}</>;
}

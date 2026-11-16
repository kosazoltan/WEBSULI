/**
 * J0c — felolvasás a játékban (végrehajtás J0c „Szerződés”; terv D4, J14; LS-4 szabály: `L/tts.ts:1-10`).
 *
 * A meglévő TTS-infrastruktúrára épül (`speak`, `readAloudEnabled`, `speechSupported`, `prefersReducedMotion` az
 * `@/lib/tts`-ből) — új beszéd-motor nincs. A kapuk, mind teljesülnie kell:
 *  1. a játékos beállítása (`websuli.gameSettings.v1` `tts`, alap BE — D4 (a));
 *  2. `readAloudEnabled({ readAloud: true, reducedMotion, supported })`: támogatott böngésző, nincs csökkentett mozgás;
 *  3. a játékos már koppintott (`arm()` az indító gomb kattintás-kezelőjéből): automatikus felolvasás SOHA nem
 *     történik felhasználói gesztus előtt (a böngésző autoplay-szabálya és az LS-4 szerint). Saját jelzőre épül, nem a
 *     `navigator.userActivation`-re (U-J0c-1).
 *
 * Használat (játéklap):
 *   const speech = useGameSpeech();
 *   <StartScreen onStart={() => { speech.arm(); start(); }} />
 *   // új nyelvi kérdésnél (a `usePlayQuestion` ezt magától megteszi, ha megkapja a `speech`-et):
 *   speech.say(p.question.speakText, p.question.lang);
 */
import { useMemo } from "react";

import type { VocabLang } from "@/data/vocabBank/types";
import { prefersReducedMotion, readAloudEnabled, speak, speechSupported } from "@/lib/tts";

import { currentGameSettings } from "./gameSettings";

export const SPEECH_LANG: Record<VocabLang, string> = { en: "en-GB", de: "de-DE", fr: "fr-FR" };

export type GameSpeech = {
  /** Az indító gomb kattintás-kezelőjéből hívandó (az első felhasználói gesztus). */
  arm(): void;
  /** true, ha elhangzott. Üres szöveg, ismeretlen nyelv, zárt kapu → false, kivétel nélkül. */
  say(text: string, lang: VocabLang): boolean;
  /** A beszéd most elérhető-e (beállítás + kapu; az `armed` jelzőtől független — a 🔊 gomb maga is gesztus). */
  available(): boolean;
};

export function createGameSpeech(deps: {
  speak: (t: string, lang: string) => void;
  supported: () => boolean;
  reducedMotion: () => boolean;
  /** A játékos felolvasás-beállítása; alap: `currentGameSettings().tts`. */
  ttsEnabled?: () => boolean;
}): GameSpeech {
  let armed = false;
  const ttsEnabled = deps.ttsEnabled ?? (() => currentGameSettings().tts);

  function gateOpen(): boolean {
    try {
      return ttsEnabled() && readAloudEnabled({ readAloud: true, reducedMotion: deps.reducedMotion(), supported: deps.supported() });
    } catch (_err) {
      return false;
    }
  }

  return {
    arm() {
      armed = true;
    },
    say(text, lang) {
      const code = SPEECH_LANG[lang];
      const t = typeof text === "string" ? text.trim() : "";
      if (!armed || !code || t.length === 0 || !gateOpen()) return false;
      try {
        deps.speak(t, code);
        return true;
      } catch (_err) {
        // A Web Speech egyes böngészőkben dob (nincs hang a nyelvhez): a játék megy tovább.
        return false;
      }
    },
    available: gateOpen,
  };
}

/** React-kötés: laponként egy példány a valódi `@/lib/tts`-sel. */
export function useGameSpeech(): GameSpeech {
  return useMemo(() => createGameSpeech({ speak, supported: speechSupported, reducedMotion: prefersReducedMotion }), []);
}

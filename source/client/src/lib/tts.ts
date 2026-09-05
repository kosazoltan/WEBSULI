/**
 * LS-4 — read-aloud (TTS) gate and speaker (master plan §4).
 *
 * Two hard rules live here, not in the component:
 *  - `readAloud: false` means silent, always — the block's own flag wins.
 *  - reduced-motion users get no speech either, and speech never happens
 *    outside a user gesture because the ONLY call site of `speak` is a button
 *    click handler; the browser's autoplay policy is honoured by construction,
 *    not by hope.
 */

export type ReadAloudGate = {
  readAloud: boolean;
  reducedMotion: boolean;
  supported: boolean;
};

/** Whether the read-aloud button may exist at all for this block and device. */
export function readAloudEnabled(gate: ReadAloudGate): boolean {
  return gate.readAloud && gate.supported && !gate.reducedMotion;
}

/** True when the Web Speech API is available in this browser. */
export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** True when the user prefers reduced motion (static frames, no speech). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Speak one explanation block. Only ever called from a click handler (the
 * gesture), and it cancels any running utterance first so rapid taps do not
 * queue overlapping speech.
 */
export function speak(text: string, lang = "hu-HU"): void {
  if (!speechSupported()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/**
 * A kérdés-sáv célrész-kiemelése (Szólétra olvashatóság, docs/specs/2026-11-17-szoletra-olvashatosag.md D) — tiszta,
 * React nélküli segéd az `InlineQuestion` opcionális `promptFocus` propjához. A célrész a kérdés ADATÁBÓL jön
 * (`VocabQuiz.focus`, `LadderItem.focus`), itt csak a prompt mechanikus felbontása történik (rész-szöveg keresés).
 */

const BLANK_RE = /_{3,}/u;

export type PromptFocusParts = {
  /** A keretsor: a prompt a célrész helyén „…”-val; üres, ha a prompt maga a célrész. */
  frame: string;
  focus: string;
  /** Mondat (≥ 3 szó vagy hiányos mondat): kisebb plafonú betű a kártyán. */
  sentence: boolean;
  /** A célrész leghosszabb szava (karakter) — a kártya betűmérete ehhez igazodik, hogy szó közepén ne törjön. */
  longest: number;
};

/** A prompt felbontása a célrész köré; `null`, ha nincs célrész vagy nem rész-szövege a promptnak. */
export function splitPromptFocus(prompt: string, focus: string | null | undefined): PromptFocusParts | null {
  if (typeof focus !== "string" || focus.trim().length === 0 || typeof prompt !== "string") return null;
  const at = prompt.indexOf(focus);
  if (at < 0) return null;
  const before = prompt.slice(0, at);
  const after = prompt.slice(at + focus.length);
  const frame = before.trim().length + after.trim().length === 0 ? "" : `${before}…${after}`.replace(/\s+/gu, " ").trim();
  const words = focus.trim().split(/\s+/u);
  return { frame, focus, sentence: words.length >= 3 || BLANK_RE.test(focus), longest: Math.max(...words.map((w) => w.length)) };
}

/** A célrész darabjai: szöveg, illetve a hiány (`___`) helye. */
export function focusSegments(focus: string): { text: string; blank: boolean }[] {
  return focus
    .split(/(_{3,})/u)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, blank: BLANK_RE.test(part) }));
}

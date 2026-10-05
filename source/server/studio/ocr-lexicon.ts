/**
 * Spec 2026-10-05-s11/4 — szótár-őr az OCR-átiraton (tulajdonosi döntés, a 7. élő futás után).
 *
 * Mért (map b6647e0c): a két alap-olvasó UGYANAZT a zagyva sort adta („Kesia, Föld - Felt. térsége”) → nem volt vita,
 * jel, harmadik olvasat, és a szerző a nem-szavakból hihető, de hamis tényt rakott össze. A magyar helyesírási szótár
 * (hunspell-asm + dictionary-hu, lustán, egyszer betöltve) megtalálja a nem-szót tartalmazó sorokat; ezeket az erős
 * olvasó célzottan újraolvassa (ocr.ts `verifyNonWords`). A szótár egyedül nem dönt: a „sumérok”, „Hammurapi” alakot is
 * jelzi — a döntés az erős olvasaté.
 *
 * Fail-safe: betöltési hiba → `null` (a hívó a régi viselkedéssel megy tovább, „degraded” naplóval); a szerver indulását a
 * wasm sosem érinti (dinamikus import, csak az első kép-OCR-kor).
 */

import { logger } from "../lib/logger";

export type IsWord = (word: string) => boolean;
export type NonWordLine = { line: number; text: string; words: string[] };

/** Rövidítések (kisbetűsen, pont nélkül) — a szótár nem ismeri őket, de nem OCR-zaj. */
export const LEXICON_ABBREVIATIONS: ReadonlySet<string> = new Set(["kr", "e", "pl", "stb", "ill", "kb", "sz", "i", "u"]);

/** Idegen nyelvű szöveg: ennél nagyobb nem-szó arány mellett a szótár-őr kimarad. */
export const FOREIGN_TEXT_RATIO = 0.4;
/** Az arány-szabály csak ennyi ellenőrzött szótól alkalmazandó (két szavas rövid sornál az 50 % nem nyelvjel). */
const FOREIGN_TEXT_MIN_WORDS = 8;

const UNCERTAIN = "⟦?⟧";
const WORD = /\p{L}+(?:-\p{L}+)*/gu;
const ROMAN = /^[IVXLCDM]+$/;

/** A sor ellenőrzendő szavai a helyükkel: a ⟦?⟧-es (már jelölt) szó és a „[…]” jelölő (KERET, olvashatatlan, oldal) kimarad. */
export function lexiconWordsOf(line: string): { word: string; end: number }[] {
  const out: { word: string; end: number }[] = [];
  const masked = line.replace(/\[[^\]\n]*\]/g, (m) => " ".repeat(m.length));
  for (const token of masked.matchAll(/\S+/g)) {
    if (token[0].includes(UNCERTAIN)) continue;
    const base = token.index ?? 0;
    for (const m of token[0].matchAll(WORD)) {
      const word = m[0];
      if (word.replace(/-/g, "").length <= 2 || ROMAN.test(word) || LEXICON_ABBREVIATIONS.has(word.toLowerCase())) continue;
      out.push({ word, end: base + (m.index ?? 0) + word.length });
    }
  }
  return out;
}

/** Létező szó-e: a kötőjeles szó egyben VAGY minden (> 2 betűs) része külön átmegy a szótáron. */
export function passesLexicon(word: string, isWord: IsWord): boolean {
  const w = word.normalize("NFC");
  if (isWord(w)) return true;
  if (!w.includes("-")) return false;
  const parts = w.split("-").filter((p) => p.length > 2 && !LEXICON_ABBREVIATIONS.has(p.toLowerCase()));
  return parts.length > 0 && parts.every((p) => isWord(p));
}

/**
 * A nem-szót tartalmazó sorok (1-től számozva, a sor szövegével és a kérdéses szavakkal, soron belül egyszer).
 * Ha az ellenőrzött szavak > 40 %-a nem-szó (és legalább 8 szó van), a szöveg idegen nyelvű → üres lista.
 */
export function nonWordLines(text: string, isWord: IsWord): NonWordLine[] {
  const out: NonWordLine[] = [];
  let checked = 0, failed = 0;
  text.split("\n").forEach((raw, index) => {
    const words: string[] = [];
    for (const { word } of lexiconWordsOf(raw)) {
      checked++;
      if (passesLexicon(word, isWord)) continue;
      failed++;
      if (!words.includes(word)) words.push(word);
    }
    if (words.length) out.push({ line: index + 1, text: raw.replace(/\r$/, ""), words });
  });
  if (checked >= FOREIGN_TEXT_MIN_WORDS && failed / checked > FOREIGN_TEXT_RATIO) return [];
  return out;
}

let loading: Promise<IsWord | null> | null = null;

/** Lusta, egyszer betöltött magyar szótár. Hiba → `null` és „degraded” napló; a következő hívás újrapróbálja. */
export function loadHungarianLexicon(): Promise<IsWord | null> {
  loading ??= (async () => {
    try {
      const started = Date.now();
      const { loadModule } = await import("hunspell-asm");
      const dictionary = (await import("dictionary-hu")).default;
      const factory = await loadModule();
      const aff = factory.mountBuffer(dictionary.aff, "hu.aff");
      const dic = factory.mountBuffer(dictionary.dic, "hu.dic");
      const hunspell = factory.create(aff, dic);
      logger.info(`[STUDIO/OCR] Magyar szótár betöltve (${Date.now() - started} ms).`);
      return (word: string) => hunspell.spell(word);
    } catch (error) {
      logger.warn(`[STUDIO/OCR] degraded: a magyar szótár nem töltődött be (${error instanceof Error ? error.message : String(error)}) — szótár-őr nélkül.`);
      loading = null;
      return null;
    }
  })();
  return loading;
}

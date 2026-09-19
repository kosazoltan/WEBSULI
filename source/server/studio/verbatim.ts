/**
 * D1 enforcement: a concept may only claim what the source actually says.
 *
 * The extractor returns concepts with a `quote`; this module decides whether that
 * quote genuinely occurs in the text pulled out of the uploaded files. Concepts
 * that fail are stored with verbatimOk=false and block approval of the map.
 *
 * The comparison is normalised rather than literal, because real PDF/OCR text
 * carries noise that has nothing to do with truthfulness: hard line wraps, doubled
 * spaces, typographic quotes, dash variants and soft hyphens from hyphenated line
 * breaks. Normalising those away keeps the guard focused on the one question that
 * matters — is this sentence in the book or did the model invent it?
 */

export type VerbatimReason = "empty" | "no_source" | "not_found";

export type VerbatimResult =
  | { ok: true }
  | { ok: false; reason: VerbatimReason };

/**
 * Fold away formatting noise while preserving word order and wording.
 *
 * Deliberately NOT removing punctuation wholesale or sorting words: a bag-of-words
 * match would accept a sentence built from the source's vocabulary that the source
 * never states, which is precisely the hallucination this guard exists to catch.
 */
export function normalizeForCompare(input: string): string {
  return input
    .normalize("NFC")
    // Soft hyphen and zero-width characters: artefacts of hyphenated line breaks.
    .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, "")
    // Typographic quotes (including the Hungarian „ ” pair) → ASCII quote.
    .replace(/[\u201A\u201B\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    // Dash family → ASCII hyphen.
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    // Any run of whitespace (incl. newlines, NBSP) → single space.
    .replace(/[\s\u00A0]+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * `normalizeForCompare` with an index map back into the (NFC) original, so a match found
 * on the normalised text can be returned as the source's own wording and casing.
 */
function normalizeWithMap(input: string): { text: string; map: number[]; original: string } {
  const original = input.normalize("NFC");
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    if (/[\u00AD\u200B-\u200D\uFEFF]/.test(ch)) continue;
    if (/[\s\u00A0]/.test(ch)) {
      pendingSpace = text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text += " ";
      map.push(i);
      pendingSpace = false;
    }
    let out: string;
    if (/[\u201A\u201B\u201C\u201D\u201E\u201F\u00AB\u00BB]/.test(ch)) out = '"';
    else if (/[\u2018\u2019\u2032]/.test(ch)) out = "'";
    else if (/[\u2010-\u2015\u2212]/.test(ch)) out = "-";
    else out = ch.toLowerCase();
    for (const piece of out) {
      text += piece;
      map.push(i);
    }
  }
  return { text, map, original };
}

/** Classic two-row Levenshtein distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Spec 2026-09-19: a quote is relocated only when it is the source's sentence with noise. */
export const RELOCATE_MIN_SIMILARITY = 0.9;
const RELOCATE_MIN_WORDS = 3;
const RELOCATE_MAX_SOURCE_CHARS = 200_000;
const RELOCATE_MAX_ANCHORS = 300;

/**
 * Find the source passage the quote was transcribed from, tolerating OCR noise.
 *
 * The D1 guard stays exact: this does NOT accept the quote. It looks for a window of the
 * source, aligned on word boundaries and anchored on the quote's own words, whose
 * normalised text is within a small edit distance of the normalised quote, and returns
 * that window in the source's original wording — which `checkVerbatim` then accepts
 * because it IS the source. A paraphrase (another sentence built from the same words)
 * stays far below the threshold and yields `null`.
 *
 * Measured on production maps (2026-09-19): "burokelevelek"→"buroklevelek" and
 * "főgyökerzete"→"főgyökérzete" are the whole difference in 4 of 5 parked concepts.
 */
export function relocateQuote(quote: string, sourceText: string): string | null {
  const needle = normalizeForCompare(quote ?? "");
  const words = needle.split(" ").filter(Boolean);
  if (words.length < RELOCATE_MIN_WORDS) return null;
  if (!sourceText || sourceText.length > RELOCATE_MAX_SOURCE_CHARS) return null;

  const { text: hay, map, original } = normalizeWithMap(sourceText);
  // A quote may be slightly longer than the source (inserted noise); far longer cannot match.
  if (!hay || needle.length > Math.ceil(hay.length * 1.2)) return null;

  // Exact hit after normalisation: return the source's own spelling of it.
  const exact = hay.indexOf(needle);
  if (exact !== -1) return original.slice(map[exact], map[exact + needle.length - 1] + 1).trim();

  // Anchor candidates: occurrences of the first three and last two words of the quote,
  // each shifted back by the word's offset inside the quote so the window aligns.
  const anchors: Array<{ word: string; offset: number }> = [];
  let offset = 0;
  for (let i = 0; i < words.length; i++) {
    if (i < 3 || i >= words.length - 2) anchors.push({ word: words[i], offset });
    offset += words[i].length + 1;
  }
  const starts = new Set<number>();
  for (const anchor of anchors) {
    let from = 0;
    while (starts.size < RELOCATE_MAX_ANCHORS) {
      const at = hay.indexOf(anchor.word, from);
      if (at === -1) break;
      const wholeWord = (at === 0 || hay[at - 1] === " ") && (at + anchor.word.length === hay.length || hay[at + anchor.word.length] === " ");
      if (wholeWord) {
        let start = Math.max(0, at - anchor.offset);
        while (start > 0 && hay[start - 1] !== " ") start--;
        if (start > 0 && hay[start] === " ") start++;
        starts.add(start);
      }
      from = at + 1;
    }
  }
  if (!starts.size) return null;

  const minLen = Math.floor(needle.length * 0.85);
  const maxLen = Math.ceil(needle.length * 1.15);
  let best: { start: number; end: number; similarity: number } | null = null;
  for (const start of starts) {
    // Candidate ends on word boundaries inside the tolerated length band.
    let end = Math.min(start + minLen, hay.length);
    while (end < hay.length && hay[end] !== " ") end++;
    while (end <= Math.min(hay.length, start + maxLen)) {
      const window = hay.slice(start, end);
      const distance = levenshtein(needle, window);
      const similarity = 1 - distance / Math.max(needle.length, window.length);
      if (similarity >= RELOCATE_MIN_SIMILARITY && (!best || similarity > best.similarity)) best = { start, end, similarity };
      if (end >= hay.length) break;
      end++;
      while (end < hay.length && hay[end] !== " ") end++;
    }
  }
  if (!best) return null;
  return original.slice(map[best.start], map[best.end - 1] + 1).trim();
}

/** True when `quote` occurs in `sourceText` once formatting noise is folded away. */
export function checkVerbatim(quote: string, sourceText: string): VerbatimResult {
  const needle = normalizeForCompare(quote ?? "");
  if (!needle) return { ok: false, reason: "empty" };

  const haystack = normalizeForCompare(sourceText ?? "");
  if (!haystack) return { ok: false, reason: "no_source" };

  return haystack.includes(needle) ? { ok: true } : { ok: false, reason: "not_found" };
}

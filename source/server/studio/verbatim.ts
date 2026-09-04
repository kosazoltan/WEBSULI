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

/** True when `quote` occurs in `sourceText` once formatting noise is folded away. */
export function checkVerbatim(quote: string, sourceText: string): VerbatimResult {
  const needle = normalizeForCompare(quote ?? "");
  if (!needle) return { ok: false, reason: "empty" };

  const haystack = normalizeForCompare(sourceText ?? "");
  if (!haystack) return { ok: false, reason: "no_source" };

  return haystack.includes(needle) ? { ok: true } : { ok: false, reason: "not_found" };
}

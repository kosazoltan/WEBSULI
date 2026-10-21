/**
 * Spec 2026-10-21-nyelvlecke-kiejtes: a kiejtésgyakorlás összevetése — a beszédfelismerő (vagy a billentyűzetes diktálás) által hallott
 * szöveg a célszóhoz / -mondathoz mérve. Kis- és nagybetű, írásjel és többszörös szóköz nem számít; az ékezet igen (más szó lehet).
 */
export type PronunciationVerdict = { state: "ok" | "close" | "retry"; similarity: number };

export const normalizeSpoken = (s: string): string =>
  s.toLowerCase().normalize("NFC").replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Hasonlóság 0–1 (1 = azonos): a normalizált szövegek karakterszintű szerkesztési távolsága a hosszabbhoz mérve. */
export function spokenSimilarity(target: string, heard: string): number {
  const [t, h] = [normalizeSpoken(target), normalizeSpoken(heard)];
  if (!t || !h) return 0;
  return 1 - levenshtein(t, h) / Math.max(t.length, h.length);
}

/** Review #360: a cél minden szava elhangzott-e (szavanként legalább 0,75-ös hasonlóságú hallott szóval) — kihagyott szóval nincs ✅. */
export function allWordsSpoken(target: string, heard: string): boolean {
  const heardWords = normalizeSpoken(heard).split(" ").filter(Boolean);
  return normalizeSpoken(target).split(" ").filter(Boolean)
    .every((w) => heardWords.some((h) => h === w || 1 - levenshtein(w, h) / Math.max(w.length, h.length) >= 0.75));
}

/** ✅ egyezés (≥ 0,92 ÉS minden szó elhangzott) · 🟡 közeli (≥ 0,7) · 🔁 próbáld újra. */
export function pronunciationVerdict(target: string, heard: string): PronunciationVerdict {
  const similarity = spokenSimilarity(target, heard);
  const state = similarity >= 0.92 && allWordsSpoken(target, heard) ? "ok" : similarity >= 0.7 ? "close" : "retry";
  return { state, similarity };
}

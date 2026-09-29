import { startingDifficulty } from "./difficulty";

/**
 * Futáson belüli ismétlésmentes választás (spec: docs/specs/2026-09-29-jatek-bankok-ismetles.md).
 *
 * Mérve 2026-09-29: a Szólétra minden válasz után egy ~34-es készletből, visszatevéssel, csak az utolsó 8
 * azonosítót kerülve választott, a Villám matek pedig 8 próba után csendben elfogadta az ismétlést. Egy 25–30
 * kérdéses futásban így biztos volt, hogy ugyanaz a kérdés újra előjön.
 *
 * Tiszta modul: nincs óra, a véletlen kívülről jön — a szimulációs teszt visszajátszható.
 */

export type SeenItem = { id: string; prompt: string };

export function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

/** A szintek bejárási sorrendje: a kért, majd távolság szerint, azonos távolságon előbb a könnyebb. */
export function tierSearchOrder(count: number, preferred: number): number[] {
  if (count <= 0) return [];
  const start = Math.min(count - 1, Math.max(0, Math.round(preferred)));
  const order = [start];
  for (let d = 1; order.length < count; d++) {
    if (start - d >= 0) order.push(start - d);
    if (start + d < count) order.push(start + d);
  }
  return order;
}

function pickRandom<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/**
 * A kért szintből egy még nem látott tétel; ha ott nincs, a szomszédos szintből (előbb a könnyebb). Ha minden
 * szint elfogyott, a keresési sorrend első nem üres szintjéből a legrégebben látott. „Látott” az, akinek az
 * azonosítója VAGY normalizált promptja szerepel a futás listájában.
 */
export function pickUnseen<T extends SeenItem>(
  tiers: readonly (readonly T[])[],
  preferred: number,
  seen: readonly SeenItem[],
  rng: () => number = Math.random,
): T | null {
  const seenIds = new Set(seen.map((s) => s.id));
  const seenPrompts = new Set(seen.map((s) => normalizePrompt(s.prompt)));
  const order = tierSearchOrder(tiers.length, preferred);

  for (const index of order) {
    const unseen = tiers[index]!.filter((q) => !seenIds.has(q.id) && !seenPrompts.has(normalizePrompt(q.prompt)));
    if (unseen.length > 0) return pickRandom(unseen, rng);
  }

  // Teljes kimerülés: a legrégebben látott (a futásban utoljára mikor jelent meg).
  const lastSeenAt = new Map<string, number>();
  seen.forEach((s, i) => {
    lastSeenAt.set(`id:${s.id}`, i);
    lastSeenAt.set(`p:${normalizePrompt(s.prompt)}`, i);
  });
  const lastSeen = (q: T) => Math.max(lastSeenAt.get(`id:${q.id}`) ?? -1, lastSeenAt.get(`p:${normalizePrompt(q.prompt)}`) ?? -1);
  for (const index of order) {
    const tier = tiers[index]!;
    if (tier.length === 0) continue;
    let oldest = tier[0]!;
    for (const q of tier) if (lastSeen(q) < lastSeen(oldest)) oldest = q;
    return oldest;
  }
  return null;
}

type ContentItem = { prompt: string; options: readonly string[]; correctIndex: number };

/** Tartalmi duplikátumok (azonos prompt + azonos helyes válasz) összevonása; az első előfordulás marad. */
export function dedupeTiersByContent<T extends ContentItem>(tiers: readonly (readonly T[])[]): T[][] {
  const keys = new Set<string>();
  return tiers.map((tier) =>
    tier.filter((q) => {
      const key = `${normalizePrompt(q.prompt)}\u0000${normalizePrompt(q.options[q.correctIndex] ?? "")}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    }),
  );
}

/** A Szólétra öt szintje: 3–4., 5–6., 7–8., 9–10., 11–12. évfolyam. */
export const LADDER_TIER_LABELS = ["Könnyű (A1)", "Közepes (A1–A2)", "Nehéz (A2)", "B1", "B2"] as const;

/** Az évfolyam kezdő szintje (sáv-eltolás nélkül). */
export function ladderBaseTier(grade: number): number {
  const g = Number.isFinite(grade) ? Math.round(grade) : 3;
  if (g <= 4) return 0;
  if (g <= 6) return 1;
  if (g <= 8) return 2;
  if (g <= 10) return 3;
  return 4;
}

/**
 * Évfolyam + közös sáv → szint. A sáv a `startingDifficulty(évfolyam)`-ból indul; egy nehezítés (+0,10) egy
 * szinttel feljebb, egy könnyítés (−0,15) egy szinttel lejjebb visz.
 */
export function ladderTierIndex(grade: number, band: number, tierCount: number = LADDER_TIER_LABELS.length): number {
  const offset = Math.round((band - startingDifficulty(grade)) / 0.15);
  return Math.min(tierCount - 1, Math.max(0, ladderBaseTier(grade) + offset));
}

/**
 * Villám matek: a nem látott tanári tétel (ha tanárit kér és van), különben legfeljebb `maxAttempts` generálás
 * az első nem látott promptig; ha nincs, nem látott tanári tétel; ha az sincs, az utolsó generált.
 */
export function pickFreshTask<T extends { prompt: string }>(opts: {
  teacher: readonly T[];
  seenPrompts: readonly string[];
  preferTeacher: boolean;
  generate: () => T;
  maxAttempts?: number;
  rng?: () => number;
}): T {
  const rng = opts.rng ?? Math.random;
  const seen = new Set(opts.seenPrompts.map(normalizePrompt));
  const unseenTeacher = opts.teacher.filter((t) => !seen.has(normalizePrompt(t.prompt)));
  if (opts.preferTeacher && unseenTeacher.length > 0) return pickRandom(unseenTeacher, rng);

  let last: T | null = null;
  for (let i = 0; i < (opts.maxAttempts ?? 30); i++) {
    last = opts.generate();
    if (!seen.has(normalizePrompt(last.prompt))) return last;
  }
  if (unseenTeacher.length > 0) return pickRandom(unseenTeacher, rng);
  return last ?? opts.generate();
}

/**
 * S8 — a Brain Rot lények mérete, élettartama és sebessége a képernyőhöz és az évfolyamhoz igazodik
 * (terv 4.6/5: „kisebb gyereknek nagyobb, lassabb cél”). Tiszta függvények, a lap és a teszt közös forrása.
 * Szerződés: docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md S8 / 2. lépés.
 */

/** A legkisebb lény is legalább ekkora érintési cél (M2: ≥ 48 px, a lénynél szigorúbb 56 px). */
export const BRAIN_ROT_MIN_SIZE = 56;

/** Ennyi idővel a lejárat előtt figyelmeztet a lény (pulzáló piros glória). */
export const BRAIN_ROT_WARNING_MS = 1500;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Évfolyam-sávok: ≤ 4 (alsó), 5–6, 7–8, ≥ 9 vagy ismeretlen. */
type GradeBand = "low" | "mid" | "upper" | "high";

function gradeBand(grade: number | null | undefined): GradeBand {
  if (grade == null || !Number.isFinite(grade)) return "high";
  if (grade <= 4) return "low";
  if (grade <= 6) return "mid";
  if (grade <= 8) return "upper";
  return "high";
}

const SIZE_FACTOR: Record<GradeBand, number> = { low: 1.25, mid: 1.1, upper: 1.0, high: 0.9 };
const LIFETIME_MS: Record<GradeBand, number> = { low: 9000, mid: 7500, upper: 6500, high: 6000 };
const SPEED_SCALE: Record<GradeBand, number> = { low: 0.6, mid: 0.8, upper: 1, high: 1 };

/**
 * A lény átmérője CSS-képpontban.
 *
 * `base = clamp(round(min(táblaszél, táblamagasság) × 0,16), 64, 112)`, ezt szorozza az évfolyam-szorzó
 * (≤ 4 → 1,25; 5–6 → 1,1; 7–8 → 1,0; ≥ 9 / ismeretlen → 0,9) és egy ±10%-os véletlen szórás. Az eredmény
 * legalább 56; és — hogy a lény elférjen és mozogni tudjon — legfeljebb a tábla rövidebb oldalának fele
 * (de ez a felső korlát sem vihet 56 alá).
 */
export function brainRotSizeFor(
  args: { grade: number | null | undefined; boardW: number; boardH: number },
  rng: () => number = Math.random,
): number {
  const short = Math.max(0, Math.min(args.boardW, args.boardH));
  const base = clamp(Math.round(short * 0.16), 64, 112);
  const jitter = 0.9 + clamp(rng(), 0, 1) * 0.2;
  const raw = Math.round(base * SIZE_FACTOR[gradeBand(args.grade)] * jitter);
  const fitCap = Math.max(BRAIN_ROT_MIN_SIZE, Math.floor(short / 2));
  return Math.max(BRAIN_ROT_MIN_SIZE, Math.min(raw, fitCap));
}

/** Meddig marad a lény a pályán (ms): ≤ 4 → 9000; 5–6 → 7500; 7–8 → 6500; ≥ 9 / ismeretlen → 6000. */
export function brainRotLifetimeFor(grade: number | null | undefined): number {
  return LIFETIME_MS[gradeBand(grade)];
}

/** A mozgás sebesség-szorzója: ≤ 4 → 0,6; 5–6 → 0,8; különben 1. */
export function brainRotSpeedScaleFor(grade: number | null | undefined): number {
  return SPEED_SCALE[gradeBand(grade)];
}

/**
 * A lény kora (ms) a szünet- és kvízidő NÉLKÜL.
 *
 * A régi kód `Date.now() - spawnTime`-mal számolt, így a kvíz (és a magyarázókártya) alatt a pályán maradt
 * lények tovább öregedtek, és a kvíz után azonnal elszöktek. Itt a „befagyott” idő kimarad:
 * `pausedTotal` a futás eddigi összes befagyott ideje (lezárt szakaszok), `pausedTotalAtSpawn` ennek értéke a
 * lény születésekor, `pausedAt` a most folyó befagyás kezdete (ha van).
 */
export function brainRotAgeMs(args: {
  now: number;
  spawnTime: number;
  pausedTotal: number;
  pausedTotalAtSpawn: number;
  pausedAt: number | null;
}): number {
  const ongoing = args.pausedAt != null ? Math.max(0, args.now - args.pausedAt) : 0;
  const frozen = Math.max(0, args.pausedTotal - args.pausedTotalAtSpawn) + ongoing;
  return Math.max(0, args.now - args.spawnTime - frozen);
}

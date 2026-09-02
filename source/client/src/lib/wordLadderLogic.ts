/**
 * Szólétra (WordLadderHuEn) — tiszta játéklogika, UI nélkül, egységtesztelhető.
 * (spec: docs/specs/wordladder-redesign-2026-09-02.md)
 */

/** A létra teljes hossza (fokok száma a célig). */
export const LADDER_RUNGS = 16;
/** Könnyű / közepes / nehéz kérdések száma egy körben (összeg = LADDER_RUNGS). */
export const LADDER_EASY = 6;
export const LADDER_MED = 5;
export const LADDER_HARD = LADDER_RUNGS - LADDER_EASY - LADDER_MED;

export type LadderZoneId = "meadow" | "forest" | "clouds" | "stars";

export interface LadderZone {
  id: LadderZoneId;
  /** Ettől a foktól (inkluzív) érvényes. */
  from: number;
  /** Rövid, gyerekbarát név. */
  name: string;
  /** A zónába lépéskor megjelenő mérföldkő-felirat (a legelsőnek nincs). */
  milestone: string | null;
  /** Dekorációs emojik (háttér). */
  decor: string[];
  /** Háttér-gradiens (CSS). */
  background: string;
  /** A zóna fokainak színe (SVG fill). */
  rungColor: string;
}

export const LADDER_ZONES: readonly LadderZone[] = [
  {
    id: "meadow",
    from: 0,
    name: "Rét",
    milestone: null,
    decor: ["🌼", "🌷", "🐞", "🦋"],
    background: "linear-gradient(180deg, #7ec8e3 0%, #a8dcc0 45%, #7bbf6a 100%)",
    rungColor: "#c98b4a",
  },
  {
    id: "forest",
    from: 5,
    name: "Erdő",
    milestone: "🌲 Elérted az erdőt!",
    decor: ["🌲", "🍄", "🦊", "🌳"],
    background: "linear-gradient(180deg, #5aa9d6 0%, #3f8f7a 50%, #2f6b45 100%)",
    rungColor: "#a9713a",
  },
  {
    id: "clouds",
    from: 10,
    name: "Felhők",
    milestone: "☁️ Fel a felhők közé!",
    decor: ["☁️", "🐦", "🎈", "☁️"],
    background: "linear-gradient(180deg, #4f7fd9 0%, #7fb0ee 55%, #cfe5ff 100%)",
    rungColor: "#8fa7c9",
  },
  {
    id: "stars",
    from: 15,
    name: "Csillagok",
    milestone: "⭐ Csillagok között — mindjárt fent vagy!",
    decor: ["⭐", "🌙", "✨", "🪐"],
    background: "linear-gradient(180deg, #0f1b4d 0%, #2a2f7a 55%, #4b3d9c 100%)",
    rungColor: "#c9b7f5",
  },
];

/** Melyik zónában van az adott fok. */
export function zoneForRung(rung: number): LadderZone {
  let z = LADDER_ZONES[0]!;
  for (const zone of LADDER_ZONES) {
    if (rung >= zone.from) z = zone;
  }
  return z;
}

/** Ha a lépés új zónába visz FELFELÉ, a mérföldkő-felirat; különben null. */
export function milestoneFor(prevRung: number, nextRung: number): string | null {
  if (nextRung <= prevRung) return null;
  const before = zoneForRung(prevRung);
  const after = zoneForRung(nextRung);
  return after.id !== before.id ? after.milestone : null;
}

/** XP egy helyes válaszért (a meglévő képlet: 30 + 2·sorozat). */
export function xpForCorrect(streakBefore: number): number {
  return 30 + Math.max(0, streakBefore) * 2;
}

/** A következő fok: helyes = +1 (max a cél), hibás = −1 (min 0). */
export function nextRung(rung: number, isCorrect: boolean, total: number = LADDER_RUNGS): number {
  const n = rung + (isCorrect ? 1 : -1);
  return Math.max(0, Math.min(total, n));
}

/** Sorozat-felirat 3-as és 5-ös lépcsőnél (és minden további 5-nél). */
export function streakMessage(streak: number): string | null {
  if (streak === 3) return "🔥 3-as sorozat! Így tovább!";
  if (streak >= 5 && streak % 5 === 0) return `🔥🔥 ${streak}-ös sorozat! Fantasztikus!`;
  return null;
}

const ENCOURAGE_CORRECT = [
  "Szuper! Egy fokkal feljebb!",
  "Ez az! Mászol tovább!",
  "Ügyes vagy! Következő fok!",
  "Nagyszerű! Egyre magasabban!",
  "Pontosan! Fel, fel!",
];

const ENCOURAGE_WRONG = [
  "Hoppá! Nézd meg a zöld választ — legközelebb menni fog!",
  "Nem baj! A helyes szó zölden világít. Mászunk tovább!",
  "Majdnem! Jegyezd meg a zöldet, és folytasd!",
];

/**
 * Bátorító üzenet. A `pick` 0..1 közötti szám (teszthez determinisztikus), alapból véletlen.
 * 0. fokon hibázva külön, megnyugtató üzenet.
 */
export function encouragement(isCorrect: boolean, rungBefore: number, pick: number = Math.random()): string {
  if (!isCorrect && rungBefore === 0) return "Kapaszkodj — nem estél le! A zöld a jó válasz.";
  const list = isCorrect ? ENCOURAGE_CORRECT : ENCOURAGE_WRONG;
  const idx = Math.min(list.length - 1, Math.max(0, Math.floor(pick * list.length)));
  return list[idx]!;
}

/** Konfetti-részecskék determinisztikus elrendezése (left %, delay s, hue). */
export function confettiParticles(count: number, seed: number = 7): Array<{ left: number; delay: number; hue: number; size: number }> {
  const out: Array<{ left: number; delay: number; hue: number; size: number }> = [];
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    out.push({ left: Math.round(rnd() * 100), delay: Math.round(rnd() * 120) / 100, hue: Math.round(rnd() * 360), size: 6 + Math.round(rnd() * 8) });
  }
  return out;
}

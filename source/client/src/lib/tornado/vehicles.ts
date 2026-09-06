/**
 * Tornado Hunter 200 — the 160-vehicle catalogue.
 *
 * Everything here is DERIVED, not hand-typed: a seeded generator produces the
 * 148 invented storm chasers, and the twelve vehicles the owner's brief names
 * explicitly (TIV 2, Dominator 3, Stormrunner S1 …) are spliced in with their
 * exact prices. That split is the whole point — a generator cannot drift away
 * from a price the brief fixed, and a hand-written table of 160 rows cannot
 * stay consistent with the rarity bands.
 *
 * The module is pure and DOM-free so `tests/tornado-vehicles.test.ts` can hold
 * the invariants (count, bands, named prices) without a browser.
 */

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "ultimate";

export type VehicleCategoryId = "scout" | "interceptor" | "heavy" | "research" | "extreme";

export type VehicleCategory = {
  id: VehicleCategoryId;
  label: string;
  /** One-line description for the Storm Garage card. */
  blurb: string;
};

export type Vehicle = {
  id: string;
  name: string;
  category: VehicleCategoryId;
  rarity: Rarity;
  /** Storm Coin price. */
  price: number;
  /** The level the player must have reached before it may be bought. */
  unlockLevel: number;
  /** Top speed, km/h. */
  speed: number;
  /** 0-100 scale, feeds the drive model. */
  acceleration: number;
  handling: number;
  braking: number;
  /** kg — heavier vehicles resist the wind but turn lazily. */
  mass: number;
  stability: number;
  windResistance: number;
  anchorPower: number;
  /** Procedural mesh hints; there are no imported 3D assets by design. */
  colors: { body: string; accent: string; glass: string };
  /** Which mesh builder draws it. */
  silhouette: "pickup" | "wedge" | "tank" | "van" | "beast";
  /** Engine note, synthesised in the audio engine. */
  engineNote: { base: number; rasp: number };
};

export const VEHICLE_COUNT = 160;

export const RARITY_ORDER: readonly Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "ultimate",
] as const;

/** Price bands straight from the brief (inclusive on both ends). */
export const RARITY_PRICE_RANGE: Record<Rarity, [number, number]> = {
  common: [500, 2500],
  uncommon: [2500, 7500],
  rare: [7500, 20000],
  epic: [20000, 50000],
  legendary: [50000, 150000],
  ultimate: [150000, 500000],
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Gyakori",
  uncommon: "Ritkább",
  rare: "Ritka",
  epic: "Epikus",
  legendary: "Legendás",
  ultimate: "Ultimate",
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9aa5b1",
  uncommon: "#4ade80",
  rare: "#38bdf8",
  epic: "#c084fc",
  legendary: "#fbbf24",
  ultimate: "#fb7185",
};

export const VEHICLE_CATEGORIES: readonly VehicleCategory[] = [
  { id: "scout", label: "Scout", blurb: "Könnyű, gyors felderítő — előbb ér a viharhoz, de gyengén horgonyzik." },
  { id: "interceptor", label: "Interceptor", blurb: "Kiegyensúlyozott elfogó: sebesség és stabilitás középúton." },
  { id: "heavy", label: "Heavy Interceptor", blurb: "Nehéz páncélos: lassabb, viszont erős szélben is áll." },
  { id: "research", label: "Research Vehicle", blurb: "Mérőműszeres kutatóautó — pontosabb viharadat, több bónuszpont." },
  { id: "extreme", label: "Extreme Vehicle", blurb: "Végletekig felkészített gép: a legnagyobb viharokra tervezve." },
] as const;

/** The twelve vehicles the brief names, with the prices it fixes. */
export const NAMED_VEHICLE_PRICES: Record<string, number> = {
  "Stormrunner S1": 2500,
  "Cyclone X": 8500,
  "TIV 2": 15000,
  "Tempest R": 18000,
  "Dominator 3": 25000,
  "Vortex M": 28000,
  "Thunderhawk": 35000,
  "Stormforce 4": 45000,
  "Hurricane GT": 60000,
  "Stormtank": 75000,
  "Tornado-X": 110000,
  "Cyclone Titan": 200000,
};

type NamedSeed = {
  name: string;
  category: VehicleCategoryId;
  rarity: Rarity;
  unlockLevel: number;
  silhouette: Vehicle["silhouette"];
};

const NAMED_SEEDS: NamedSeed[] = [
  { name: "Stormrunner S1", category: "scout", rarity: "common", unlockLevel: 1, silhouette: "pickup" },
  { name: "Cyclone X", category: "interceptor", rarity: "rare", unlockLevel: 34, silhouette: "wedge" },
  { name: "TIV 2", category: "heavy", rarity: "rare", unlockLevel: 46, silhouette: "tank" },
  { name: "Tempest R", category: "interceptor", rarity: "rare", unlockLevel: 58, silhouette: "wedge" },
  { name: "Dominator 3", category: "heavy", rarity: "epic", unlockLevel: 72, silhouette: "tank" },
  { name: "Vortex M", category: "research", rarity: "epic", unlockLevel: 84, silhouette: "van" },
  { name: "Thunderhawk", category: "interceptor", rarity: "epic", unlockLevel: 96, silhouette: "wedge" },
  { name: "Stormforce 4", category: "heavy", rarity: "epic", unlockLevel: 112, silhouette: "tank" },
  { name: "Hurricane GT", category: "extreme", rarity: "legendary", unlockLevel: 128, silhouette: "beast" },
  { name: "Stormtank", category: "heavy", rarity: "legendary", unlockLevel: 142, silhouette: "tank" },
  { name: "Tornado-X", category: "extreme", rarity: "legendary", unlockLevel: 158, silhouette: "beast" },
  { name: "Cyclone Titan", category: "extreme", rarity: "ultimate", unlockLevel: 176, silhouette: "beast" },
];

/** How many vehicles of each rarity exist in total (named + generated). */
const RARITY_TARGET: Record<Rarity, number> = {
  common: 34,
  uncommon: 32,
  rare: 30,
  epic: 26,
  legendary: 22,
  ultimate: 16,
};

/** Unlock-level window per rarity: rarer machines arrive later in the campaign. */
const RARITY_UNLOCK_RANGE: Record<Rarity, [number, number]> = {
  common: [1, 25],
  uncommon: [10, 55],
  rare: [30, 95],
  epic: [60, 135],
  legendary: [100, 175],
  ultimate: [150, 200],
};

const CATEGORY_BY_RARITY_BIAS: Record<Rarity, VehicleCategoryId[]> = {
  common: ["scout", "interceptor", "research"],
  uncommon: ["scout", "interceptor", "research", "heavy"],
  rare: ["interceptor", "heavy", "research", "scout"],
  epic: ["heavy", "interceptor", "research", "extreme"],
  legendary: ["heavy", "extreme", "research", "interceptor"],
  ultimate: ["extreme", "heavy", "interceptor", "research"],
};

const SILHOUETTE_BY_CATEGORY: Record<VehicleCategoryId, Vehicle["silhouette"]> = {
  scout: "pickup",
  interceptor: "wedge",
  heavy: "tank",
  research: "van",
  extreme: "beast",
};

/* ============================ name generator ============================ */

const NAME_HEADS = [
  "Storm", "Cyclone", "Tempest", "Vortex", "Thunder", "Hurricane", "Twister", "Gale",
  "Squall", "Maelstrom", "Zephyr", "Tornado", "Monsoon", "Cumulus", "Nimbus", "Derecho",
  "Downburst", "Supercell", "Mesocell", "Updraft", "Downdraft", "Hailstone", "Rainshaft",
  "Wallcloud", "Anvil", "Skyhook", "Windshear", "Barometer", "Doppler", "Radarhawk",
];

const NAME_TAILS = [
  "runner", "hawk", "chaser", "breaker", "rider", "hunter", "lancer", "guard",
  "tracer", "rover", "prowler", "striker", "scout", "warden", "raider", "sentinel",
];

const MODEL_TAGS = ["S", "X", "R", "M", "GT", "V", "T", "Z", "K", "II", "III", "IV", "Pro", "Max"];

/** Deterministic PRNG (mulberry32) — the catalogue must be identical everywhere. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexByte(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

function mixColor(base: [number, number, number], rng: () => number, spread: number): string {
  return `#${base.map((c) => hexByte(c + (rng() - 0.5) * spread)).join("")}`;
}

const CATEGORY_BASE_COLOR: Record<VehicleCategoryId, [number, number, number]> = {
  scout: [86, 170, 220],
  interceptor: [230, 140, 60],
  heavy: [120, 130, 140],
  research: [235, 235, 225],
  extreme: [190, 60, 90],
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/* ============================ stat model ============================ */

type StatBase = {
  speed: number;
  acceleration: number;
  handling: number;
  braking: number;
  mass: number;
  stability: number;
  windResistance: number;
  anchorPower: number;
};

const CATEGORY_STATS: Record<VehicleCategoryId, StatBase> = {
  scout: { speed: 168, acceleration: 68, handling: 76, braking: 58, mass: 2100, stability: 46, windResistance: 40, anchorPower: 34 },
  interceptor: { speed: 176, acceleration: 72, handling: 68, braking: 66, mass: 3400, stability: 60, windResistance: 58, anchorPower: 52 },
  heavy: { speed: 132, acceleration: 48, handling: 46, braking: 78, mass: 9800, stability: 82, windResistance: 84, anchorPower: 82 },
  research: { speed: 146, acceleration: 55, handling: 58, braking: 68, mass: 5200, stability: 68, windResistance: 62, anchorPower: 60 },
  extreme: { speed: 192, acceleration: 80, handling: 70, braking: 82, mass: 12500, stability: 88, windResistance: 92, anchorPower: 90 },
};

/** Rarity multiplies the category baseline; ultimate machines are ~30% better. */
const RARITY_STAT_GAIN: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.06,
  rare: 0.12,
  epic: 0.18,
  legendary: 0.24,
  ultimate: 0.3,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function buildStats(category: VehicleCategoryId, rarity: Rarity, rng: () => number): StatBase {
  const base = CATEGORY_STATS[category];
  const gain = 1 + RARITY_STAT_GAIN[rarity];
  const jitter = () => 0.94 + rng() * 0.12;
  return {
    speed: clamp(Math.round(base.speed * gain * jitter()), 60, 260),
    acceleration: clamp(Math.round(base.acceleration * gain * jitter()), 10, 100),
    handling: clamp(Math.round(base.handling * gain * jitter()), 10, 100),
    braking: clamp(Math.round(base.braking * gain * jitter()), 10, 100),
    // Mass grows a little with rarity (more armour), never past the model's range.
    mass: clamp(Math.round(base.mass * (1 + RARITY_STAT_GAIN[rarity] * 0.6) * jitter()), 1200, 22000),
    stability: clamp(Math.round(base.stability * gain * jitter()), 10, 100),
    windResistance: clamp(Math.round(base.windResistance * gain * jitter()), 10, 100),
    anchorPower: clamp(Math.round(base.anchorPower * gain * jitter()), 10, 100),
  };
}

/** Spread `count` prices evenly inside the rarity band, rounded to a tidy number. */
function priceForSlot(rarity: Rarity, slot: number, count: number, rng: () => number): number {
  const [lo, hi] = RARITY_PRICE_RANGE[rarity];
  const span = hi - lo;
  const t = count <= 1 ? 0.5 : slot / (count - 1);
  const jitter = (rng() - 0.5) * (span / (count * 2.5));
  const step = span >= 100000 ? 1000 : span >= 20000 ? 500 : 50;
  const raw = lo + span * t + jitter;
  return clamp(Math.round(raw / step) * step, lo, hi);
}

function unlockForSlot(rarity: Rarity, slot: number, count: number): number {
  const [lo, hi] = RARITY_UNLOCK_RANGE[rarity];
  const t = count <= 1 ? 0 : slot / (count - 1);
  return clamp(Math.round(lo + (hi - lo) * t), 1, 200);
}

/* ============================ catalogue build ============================ */

function buildCatalogue(): Vehicle[] {
  const rng = mulberry32(0x70524e44); // "pRND" — fixed so the fleet is identical for every player
  const takenNames = new Set(Object.keys(NAMED_VEHICLE_PRICES));

  /** Deterministic, collision-free invented names. */
  const generatedNames: string[] = [];
  outer: for (let tail = 0; tail < NAME_TAILS.length; tail++) {
    for (let head = 0; head < NAME_HEADS.length; head++) {
      const core = `${NAME_HEADS[head]}${NAME_TAILS[tail]}`;
      const tag = MODEL_TAGS[(head + tail * 3) % MODEL_TAGS.length]!;
      const name = `${core} ${tag}`;
      if (takenNames.has(name)) continue;
      takenNames.add(name);
      generatedNames.push(name);
      if (generatedNames.length >= VEHICLE_COUNT - NAMED_SEEDS.length) break outer;
    }
  }

  const namedByRarity = new Map<Rarity, number>();
  for (const seed of NAMED_SEEDS) {
    namedByRarity.set(seed.rarity, (namedByRarity.get(seed.rarity) ?? 0) + 1);
  }

  const vehicles: Vehicle[] = [];
  let nameCursor = 0;
  const categoryCount = new Map<VehicleCategoryId, number>();
  const bump = (c: VehicleCategoryId) => categoryCount.set(c, (categoryCount.get(c) ?? 0) + 1);

  for (const seed of NAMED_SEEDS) bump(seed.category);

  for (const rarity of RARITY_ORDER) {
    const total = RARITY_TARGET[rarity];
    const generatedCount = total - (namedByRarity.get(rarity) ?? 0);
    const bias = CATEGORY_BY_RARITY_BIAS[rarity];

    for (let i = 0; i < generatedCount; i++) {
      const name = generatedNames[nameCursor++];
      if (!name) throw new Error("tornado: kifogytak a generált jármű-nevek");
      // Pick the least-populated category among this rarity's plausible ones —
      // deterministic, and it keeps every category comfortably above 10.
      let category = bias[0]!;
      let best = Infinity;
      for (const candidate of bias) {
        const n = categoryCount.get(candidate) ?? 0;
        if (n < best) {
          best = n;
          category = candidate;
        }
      }
      bump(category);

      const stats = buildStats(category, rarity, rng);
      const base = CATEGORY_BASE_COLOR[category];
      vehicles.push({
        id: slugify(name),
        name,
        category,
        rarity,
        price: priceForSlot(rarity, i, generatedCount, rng),
        unlockLevel: unlockForSlot(rarity, i, generatedCount),
        ...stats,
        colors: {
          body: mixColor(base, rng, 70),
          accent: mixColor([250, 190, 60], rng, 90),
          glass: mixColor([40, 70, 95], rng, 40),
        },
        silhouette: SILHOUETTE_BY_CATEGORY[category],
        engineNote: { base: 70 + Math.round(rng() * 60), rasp: 0.2 + rng() * 0.6 },
      });
    }
  }

  for (const seed of NAMED_SEEDS) {
    const stats = buildStats(seed.category, seed.rarity, rng);
    const base = CATEGORY_BASE_COLOR[seed.category];
    vehicles.push({
      id: slugify(seed.name),
      name: seed.name,
      category: seed.category,
      rarity: seed.rarity,
      price: NAMED_VEHICLE_PRICES[seed.name]!,
      unlockLevel: seed.unlockLevel,
      ...stats,
      colors: {
        body: mixColor(base, rng, 50),
        accent: mixColor([255, 210, 80], rng, 60),
        glass: mixColor([35, 60, 90], rng, 30),
      },
      silhouette: seed.silhouette,
      engineNote: { base: 62 + Math.round(rng() * 70), rasp: 0.25 + rng() * 0.55 },
    });
  }

  // Two starter-friendly machines at level 1 so the garage is never a dead end
  // before the first intercept (the brief's flow starts with "pick a vehicle").
  const commons = vehicles.filter((v) => v.rarity === "common").sort((a, b) => a.price - b.price);
  for (const v of commons.slice(0, 2)) v.unlockLevel = 1;

  return vehicles.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, "hu"));
}

export const VEHICLES: readonly Vehicle[] = Object.freeze(buildCatalogue());

const BY_ID = new Map(VEHICLES.map((v) => [v.id, v] as const));

/** The free vehicle every player starts with. */
export const STARTER_VEHICLE_ID: string = VEHICLES.filter((v) => v.unlockLevel === 1).sort(
  (a, b) => a.price - b.price,
)[0]!.id;

export function vehicleById(id: string): Vehicle | undefined {
  return BY_ID.get(id);
}

export function vehiclesByCategory(category: VehicleCategoryId): Vehicle[] {
  return VEHICLES.filter((v) => v.category === category);
}

export function categoryLabel(id: VehicleCategoryId): string {
  return VEHICLE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Vehicles the player may buy right now (unlocked, not yet owned). */
export function purchasableVehicles(highestLevel: number, owned: readonly string[]): Vehicle[] {
  const ownedSet = new Set(owned);
  return VEHICLES.filter((v) => !ownedSet.has(v.id) && v.unlockLevel <= highestLevel);
}

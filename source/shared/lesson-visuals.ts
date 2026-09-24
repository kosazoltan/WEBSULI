/**
 * Vizuális világok (spec 2026-09-20 „színes, figyelemfelkeltő tananyag").
 *
 * A gyerekek édesanyjának kérése: a tananyag ne legyen nyers és száraz — színek, figyelemfelkeltő
 * kiemelések, leckénként változó grafikai hangulat. Ötletforrás a 2026. jan–márc. leckék főlapja
 * (mérve: élénk többszínű paletták, 135°-os pasztell/űr gradiensek, emoji-val jelölt „világok",
 * tipp-dobozok). A világ a TERVEZŐ fázisban dől el, és végigmegy a láncon (fejezet-emoji,
 * kulcskifejezés-kiemelés, a bank témája, a runtime színei).
 */

export const VISUAL_WORLD_IDS = ["candy", "space", "jungle", "ocean-kids", "meadow", "dojo", "arena", "magic", "princess"] as const;
export type VisualWorldId = (typeof VISUAL_WORLD_IDS)[number];

export type VisualWorld = {
  id: VisualWorldId;
  name: string;
  mood: string;
  /** Emojis the planner may put before section headings (one per section). */
  emojis: readonly string[];
  /** Palette mirrored in client/src/lesson-runtime/lesson-experience.css — keep in sync (test). */
  palette: { bg: string; bg2: string; surface: string; ink: string; accent: string; accent2: string; key: string; keyInk: string };
  dark?: boolean;
};

export const VISUAL_WORLDS: readonly VisualWorld[] = [
  { id: "candy", name: "Cukorka-birodalom", mood: "vidám, édes, rózsaszín-lila-kék pasztell", emojis: ["🍭", "🍬", "🧁", "🍓", "🎈", "🌈", "🍦", "🎀"],
    palette: { bg: "#fdf2f8", bg2: "#e0f2fe", surface: "#ffffff", ink: "#3b1f4a", accent: "#ec4899", accent2: "#3b82f6", key: "#fde68a", keyInk: "#3b1f4a" } },
  { id: "space", name: "Galaktikus küldetés", mood: "sötét űr, neon lila-cián-sárga kiemelés", emojis: ["🚀", "🪐", "🌟", "🌌", "👩‍🚀", "☄️", "🛸", "🌙"], dark: true,
    palette: { bg: "#0c0a1d", bg2: "#1a1535", surface: "#2d2654", ink: "#f0f4ff", accent: "#8b5cf6", accent2: "#06b6d4", key: "#fbbf24", keyInk: "#1a1535" } },
  { id: "jungle", name: "Dzsungel-expedíció", mood: "élénk zöld, narancs és sárga, kalandos", emojis: ["🦁", "🐒", "🌴", "🦜", "🐍", "🌺", "🐘", "🗺️"],
    palette: { bg: "#ecfdf5", bg2: "#fef3c7", surface: "#ffffff", ink: "#14342b", accent: "#16a34a", accent2: "#f97316", key: "#fde047", keyInk: "#14342b" } },
  { id: "ocean-kids", name: "Vízalatti kaland", mood: "türkiz, kék, korall — hullámos, friss", emojis: ["🌊", "🐸", "🐠", "🐙", "🐚", "🦆", "🏝️", "🐬"],
    palette: { bg: "#e8f8f5", bg2: "#dff3ff", surface: "#ffffff", ink: "#0f3a44", accent: "#0abde3", accent2: "#fd79a8", key: "#55efc4", keyInk: "#0f3a44" } },
  { id: "meadow", name: "Mező és rét", mood: "virágos rózsaszín-lila-kék, pillangók, méhek", emojis: ["🦋", "🌸", "🐝", "🌼", "🐰", "🌷", "🌻", "🐞"],
    palette: { bg: "#fce4ec", bg2: "#e1f5fe", surface: "#ffffff", ink: "#4a148c", accent: "#9c27b0", accent2: "#66bb6a", key: "#ffe082", keyInk: "#4a148c" } },
  { id: "dojo", name: "Ninja dojo", mood: "sötét kék-fekete, piros és sárga öv-színek, kihívás", emojis: ["🥷", "⚔️", "🔥", "🏆", "🎯", "🥋", "💪", "⚡"], dark: true,
    palette: { bg: "#0f172a", bg2: "#1e293b", surface: "#334155", ink: "#f1f5f9", accent: "#dc2626", accent2: "#facc15", key: "#22d3ee", keyInk: "#0f172a" } },
  { id: "arena", name: "Matek-aréna", mood: "játékos sötét háttér, cián-lila-zöld neon", emojis: ["🎮", "🏆", "⚡", "🔢", "💡", "🥇", "🎲", "🕹️"], dark: true,
    palette: { bg: "#0c1222", bg2: "#1a2744", surface: "#2d3f5f", ink: "#f0f9ff", accent: "#22d3ee", accent2: "#8b5cf6", key: "#fbbf24", keyInk: "#0c1222" } },
  { id: "magic", name: "Varázslat-iskola", mood: "lila-rózsaszín-arany, csillogó, mesés", emojis: ["✨", "🔮", "🪄", "🧙", "🌟", "🎩", "🦄", "📜"],
    palette: { bg: "#f3e8ff", bg2: "#fae8ff", surface: "#ffffff", ink: "#3b0764", accent: "#a855f7", accent2: "#f97316", key: "#fef08a", keyInk: "#3b0764" } },
  // Spec 2026-09-24: egy 5. osztályos kislány édesanyjának kérése — fiatalos, rózsaszín, csillogó.
  { id: "princess", name: "Hercegnő-kastély", mood: "rózsaszín, lila és arany, csillogó, vidám", emojis: ["👑", "💖", "🦄", "🌸", "✨", "🎀", "🏰", "💎"],
    palette: { bg: "#fff0f7", bg2: "#f5e8ff", surface: "#ffffff", ink: "#4a1238", accent: "#db2777", accent2: "#a855f7", key: "#fbcfe8", keyInk: "#4a1238" } },
];

/**
 * Spec 2026-09-24 — lecke-szintű „különlegességek”: minden lecke 3 effektet kap a listából, hogy a
 * tananyagok ne legyenek egyformák. Tisztán CSS (lesson-experience.css), mozgáscsökkentésnél és
 * csendes módban kikapcsol. A modell nem írja: a kód választja (a séma enum), így nem hallucinálható.
 */
export const LESSON_FLAIRS = ["sparkles", "shimmer-keys", "float-emoji", "sticker-headings", "glow-cards", "pop-correct"] as const;
export type LessonFlair = (typeof LESSON_FLAIRS)[number];

/** Deterministic per seed (the lesson), different across lessons; no repeats. */
export function pickLessonFlair(seed: string, count = 3): LessonFlair[] {
  let hash = 2166136261;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const pool = [...LESSON_FLAIRS];
  const out: LessonFlair[] = [];
  while (out.length < Math.min(count, LESSON_FLAIRS.length)) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
    out.push(pool.splice(hash % pool.length, 1)[0]);
  }
  return out;
}

/**
 * The teacher's request may ask for a look („rózsaszín, kislánynak, effektekkel”). Deterministic keyword
 * match; undefined when the request says nothing about the look (the lesson keeps its own design).
 */
export function designFromInstruction(text: string | undefined, seed = ""): { world?: VisualWorldId; flair?: LessonFlair[] } | undefined {
  if (!text) return undefined;
  const t = text.toLocaleLowerCase("hu");
  // Audit 2026-09-24 (mért hamis találatok): „sűrűség”/„szűrd” → űr, „állatok testfelépítése” → dzsungel,
  // „ne legyen rózsaszín” → rózsaszín, „változatos feladatok”/„effektívebb” → effektek. Ezért csak a
  // SZÓ ELEJÉN illesztünk, a tartalmi témaszavak (állat, űr, víz) nem választanak világot, és a közvetlenül
  // tagadott említés („ne legyen”, „nem kell”, „nélkül”) nem számít.
  const B = "(?:^|[^a-záéíóöőúüű])";
  const said = (re: string) => {
    for (const m of t.matchAll(new RegExp(`${B}(${re})`, "g"))) {
      const before = t.slice(Math.max(0, (m.index ?? 0) - 18), (m.index ?? 0) + 1);
      const after = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 14);
      if (/(?:^|[^a-záéíóöőúüű])(ne|nem|se|sem)(\s+\S+)?\s*$/.test(before) || /^\S*\s+nélkül/.test(after)) continue;
      return true;
    }
    return false;
  };
  const world: VisualWorldId | undefined = said("rózsaszín|pink|kislány|lányos|hercegnő|királylány") ? "princess"
    : said("varázsvilág|varázslatos világ|varázs témá") ? "magic" : undefined;
  const wantsEffects = said("effekt(?!ív)|csillog|animáci|figyelemfelkelt|figyelemfelhív|látványos");
  if (!world && !wantsEffects) return undefined;
  const base = pickLessonFlair(seed || text);
  const flair = wantsEffects ? [...new Set<LessonFlair>(["sparkles", "shimmer-keys", "pop-correct", ...base])].slice(0, 4) : undefined;
  return { ...(world ? { world } : {}), ...(flair ? { flair } : {}) };
}

export function visualWorld(id: string | undefined): VisualWorld | undefined {
  return VISUAL_WORLDS.find((w) => w.id === id);
}

/** Random world; a `seed` makes it reproducible (tests). Never the same as `avoid` when a choice exists. */
export function pickVisualWorld(seed?: number, avoid?: VisualWorldId): VisualWorld {
  const candidates = VISUAL_WORLDS.filter((w) => w.id !== avoid);
  const r = seed === undefined ? Math.random() : Math.abs(Math.sin(seed * 9973.13)) % 1;
  return candidates[Math.floor(r * candidates.length)] ?? VISUAL_WORLDS[0];
}

/**
 * Mérve (JPG regressziós futás 29a8b8e6): a tervező „meadow"-ra váltott a javasolt „dojo"-ról, de a
 * fejezet-emojikat a dojo készletéből tartotta meg (🥷 ⚔️ 🥋). Ha a világ változott, az idegen
 * világból származó emojik a választott világ készletére cserélődnek (sorban); a saját, témához illő
 * emoji (pl. 🌊 a víznél) megmarad.
 */
export function harmoniseSectionEmojis<T extends { emoji?: string }>(sections: readonly T[], world: VisualWorld, proposed?: VisualWorld): T[] {
  if (!proposed || proposed.id === world.id) return [...sections];
  const foreign = new Set(proposed.emojis);
  let cursor = 0;
  return sections.map((section) => {
    if (!section.emoji || !foreign.has(section.emoji)) return section;
    const emoji = world.emojis[cursor % world.emojis.length];
    cursor += 1;
    return { ...section, emoji };
  });
}

/** `**kiemelés**` → [{ text, key }] runs; unbalanced markers are rendered as plain text. */
export function splitEmphasis(text: string): Array<{ text: string; key: boolean }> {
  const runs: Array<{ text: string; key: boolean }> = [];
  const parts = text.split("**");
  if (parts.length % 2 === 0) return [{ text, key: false }];
  parts.forEach((part, i) => { if (part) runs.push({ text: part, key: i % 2 === 1 }); });
  return runs.length ? runs : [{ text, key: false }];
}

/** The same text without markers — for speech and for any plain-text comparison. */
export function stripEmphasis(text: string): string {
  return splitEmphasis(text).map((r) => r.text).join("");
}

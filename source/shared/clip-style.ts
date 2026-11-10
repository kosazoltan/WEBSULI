import { designThemeForClassroom, type DesignThemeId } from "./lesson-design";

/**
 * Spec docs/specs/2026-11-10-fejezet-kisfilmek-v2.md (4.): a kisfilm KOROSZTÁLYOS profilja. Ahogy a tananyag képi és színvilága
 * évfolyamsávonként más, úgy a kisfilm figurája, képi stílusa, ábrastílusa, mesélése és hangja is. Egyetlen adatszerkezet: ebből
 * dolgozik a képbrief, a forgatókönyvíró utasítása, a hanggyártás és a lejátszó megjelenése.
 */
export type ClipBandStyle = {
  /** Angol stílusmondat a képmodellnek. */
  imageStyle: string;
  /** Az állandó figura(k) szó szerinti, minden képbriefbe bemásolt leírása; null: a sávban nincs figura. */
  cast: string | null;
  /** A sáv saját képi szabálya (a közös tiltások mellé). */
  imageRule: string;
  narration: {
    scenes: readonly [number, number];
    /** Egy jelenet elmondott szövegének plafonja (karakter). */
    sayMax: number;
    /** Magyar szabályok a forgatókönyvírónak (ember vagy modell). */
    rules: readonly string[];
  };
  voice: {
    /** A hangmodell hangazonosítója. */
    id: string;
    /** Hangnem-utasítás a hangmodellnek. */
    instructions: string;
    speed: number;
  };
  /** A lejátszó megjelenése (CSS-változók). */
  look: { radius: string; stroke: string; panel: string; ink: string; accent: string; accent2: string; font: "rounded" | "clean"; captionPx: number };
};

/** Minden sávban érvényes képi tiltások (a leckeborító szabályaival egyezően). */
export const CLIP_IMAGE_COMMON = "Wide 16:9 scene with calm empty space in the lower third for an overlay. Absolutely no text, letters, digits, numerals, symbols, equations, labels, signs, logos, watermarks or UI elements anywhere in the image. No brands or copyrighted characters. Gender-neutral and inclusive, no stereotypes. Safe for school children: nothing scary, violent or sad. Original artwork.";

const HU_VOICE = "Speak in natural, native Hungarian with clear articulation.";

export const CLIP_BAND_STYLE: Readonly<Record<DesignThemeId, ClipBandStyle>> = {
  explorer: {
    imageStyle: "Soft, rounded storybook illustration for young children, warm natural light, fresh mint and leaf greens with sunny yellow accents, simple large friendly shapes, thick gentle outlines, gentle depth like a modern picture book.",
    cast: "Recurring character in every image: Bodza, a small friendly hedgehog with a round cream face, big curious eyes, soft brown spines and a tiny yellow scarf, always shown clearly, cheerful and curious.",
    imageRule: "One clear subject, very few objects, nothing tiny or detailed.",
    narration: {
      scenes: [3, 3], sayMax: 90,
      rules: [
        "Egy kisfilm egyetlen gondolatot mutat meg.", "Rövid, egyszerű mondatok; szakszó csak azonnali, hétköznapi magyarázattal.",
        "Bodza, a kíváncsi sün kérdez vagy rácsodálkozik; a mesélő megszólítja a gyereket (te).", "A végén egy vidám, megerősítő mondat.",
      ],
    },
    voice: { id: "coral", instructions: `${HU_VOICE} Warm, gentle storyteller for six-year-olds: slow, smiling, playful, with small pauses of wonder.`, speed: 0.92 },
    look: { radius: "28px", stroke: "5px", panel: "#FFFDF2", ink: "#174A39", accent: "#17865F", accent2: "#F2B705", font: "rounded", captionPx: 22 },
  },
  adventure: {
    imageStyle: "Painterly adventure illustration for children aged nine to eleven, warm sand, apricot and orange tones with turquoise accents, sense of expedition and discovery, lively but uncluttered, soft hand-painted brushwork.",
    cast: "Recurring characters in every image: two child explorers about ten years old, Zsofi with short dark curly hair, a turquoise jacket and a small orange backpack, and Marci with light brown hair, a mustard yellow sweater and binoculars around his neck; friendly simple faces, shown from a little distance.",
    imageRule: "The children observe or point at the phenomenon; the landscape or object of the lesson is the main subject.",
    narration: {
      scenes: [3, 4], sayMax: 130,
      rules: [
        "Kaland: egy helyzet, amelyben Zsófi és Marci felfedez valamit — kihívás, megfigyelés, szabály.", "Élénk, barátságos, tegező; „gyere, nézzük meg” hang.",
        "Mondatonként egy új információ; a szakszó elhangzik és a képen megmutatkozik.", "A végén a szabály egy mondatban.",
      ],
    },
    voice: { id: "nova", instructions: `${HU_VOICE} Lively, friendly adventure guide for ten-year-olds: bright, curious, encouraging, medium pace.`, speed: 1 },
    look: { radius: "20px", stroke: "4px", panel: "#FFF8EA", ink: "#703C1B", accent: "#C36A28", accent2: "#0B7C71", font: "rounded", captionPx: 19 },
  },
  studio: {
    imageStyle: "Mature, inspiring semi-realistic digital illustration for young teenagers, indigo, violet and teal palette, modern everyday settings, cinematic framing, no childish cartoon look.",
    cast: null,
    imageRule: "No mascots or cartoon characters. People only as contemporary teenagers in everyday situations, seen from behind, in profile from a distance or as silhouettes, no close-up faces.",
    narration: {
      scenes: [4, 4], sayMax: 170,
      rules: [
        "Hétköznapi, kortárs helyzetből indul, és arra felel: miért van ez így?", "Természetes, nem gyerekes és nem kioktató hang; tegező.",
        "Jelenség → magyarázat → szabály → egy példa a fejezetből.", "Nincs kabala, nincs mesei keret.",
      ],
    },
    voice: { id: "sage", instructions: `${HU_VOICE} Natural, relaxed young narrator for teenagers: confident, clear, not childish, not lecturing.`, speed: 1.02 },
    look: { radius: "14px", stroke: "3px", panel: "#F7F6FF", ink: "#292F62", accent: "#5159A8", accent2: "#0B8F8A", font: "clean", captionPx: 17 },
  },
  laboratory: {
    imageStyle: "Crisp, realistic photographic look, cool blues and graphite, engineering and science subjects, precise and serious, clean studio or real-world documentary lighting.",
    cast: null,
    imageRule: "No cartoon characters, no mascots. The physical phenomenon or object is the main subject; people only from behind or far away, no identifiable faces.",
    narration: {
      scenes: [4, 4], sayMax: 200,
      rules: [
        "Tárgyszerű, pontos: jelenség → fogalom vagy törvény → számolás a fejezet adataival.", "Felnőttesen, tegezve; nincs kabala, nincs mese, nincs felkiáltó lelkesedés.",
        "A szakszavak pontosan úgy hangzanak el, ahogy a fejezetben állnak.", "A képlet szavakkal hangzik el, a jelölés az ábrán jelenik meg.",
      ],
    },
    voice: { id: "ash", instructions: `${HU_VOICE} Calm, precise, mature science narrator: measured pace, matter-of-fact, quietly engaging, no theatrical enthusiasm.`, speed: 1.04 },
    look: { radius: "8px", stroke: "2px", panel: "#F4F9FF", ink: "#143B62", accent: "#226493", accent2: "#0B7480", font: "clean", captionPx: 16 },
  },
  future: {
    imageStyle: "Cinematic, premium photographic look, deep navy with warm sunset or teal light, wide documentary framing, sophisticated and calm.",
    cast: null,
    imageRule: "No cartoon characters, no mascots. People only seen from behind or far away, no identifiable faces.",
    narration: {
      scenes: [4, 4], sayMax: 220,
      rules: [
        "Összefüggés és alkalmazás: hol számít ez a vizsgán, a továbbtanulásban, a valós döntésekben?", "Felnőtt, dokumentumfilmes hang; tegező, de nem bizalmaskodó.",
        "Állítás → indoklás → következmény; egy pontos példa a fejezetből.", "Nincs kabala, nincs mese.",
      ],
    },
    voice: { id: "onyx", instructions: `${HU_VOICE} Adult documentary narrator: composed, thoughtful, steady pace, understated.`, speed: 1.04 },
    look: { radius: "6px", stroke: "2px", panel: "#132540", ink: "#EFF8FF", accent: "#0C929C", accent2: "#F5B841", font: "clean", captionPx: 16 },
  },
};

export function clipBandFor(classroom: number): DesignThemeId {
  return designThemeForClassroom(classroom);
}

/** A képmodell teljes utasítása egy beállításhoz: a helyzet + (ha van) a figura + a sáv stílusa és szabálya + a közös tiltások. */
export function clipImagePrompt(brief: string, band: DesignThemeId): string {
  const style = CLIP_BAND_STYLE[band];
  return [brief.trim(), style.cast, style.imageStyle, style.imageRule, CLIP_IMAGE_COMMON].filter(Boolean).join(" ");
}

/**
 * Websuli Design — az öt évfolyamsávos arculat, adatoldal (docs/specs/2026-10-16-websuli-design.md; forrás: docs/design/).
 *
 * A mesterutasítás §1 táblázatának értékei (id, évfolyam, név, alapfelület, főszín, mély szöveg) VÁLTOZATLANOK. A §2.6 szerint
 * („a kezdeti hexszínek vizuális irányok, éles szövegpárokra kontrasztteszt szükséges”) a megjelenítési tokenek mérve kerültek
 * mellé: ahol fehér szöveg a főszínen nem éri el a 4,5:1-et (kalandok 3,88, jövőtervező 3,75), a gomb és a szöveges kiemelés
 * a `strong` változatot kapja; a főszín kitöltés, sáv és keret marad. A CSS (client/src/lesson-runtime/lesson-design.css)
 * ugyanezeket az értékeket adja ki — tests/lesson-design.test.ts egyezteti és méri őket. DOM-mentes, a szerver is importálhatja.
 */

export const DESIGN_THEME_IDS = ["explorer", "adventure", "studio", "laboratory", "future"] as const;
export type DesignThemeId = typeof DESIGN_THEME_IDS[number];

export type DesignTheme = {
  id: DesignThemeId;
  /** A mesterutasítás táblázatának oszlopai. */
  grades: string;
  name: string;
  surface: string;
  accent: string;
  ink: string;
  font: "Nunito Sans" | "Inter";
  /** Megjelenítési tokenek (mért kontraszttal). */
  panel: string;
  soft: string;
  deep: string;
  muted: string;
  line: string;
  strong: string;
  strongInk: string;
  /** Törzsszöveg legkisebb mérete px-ben (§2.5: 1–2. o. 20–24, 3–5. o. 18–20, egyébként ≥ 16). */
  minBodyPx: number;
  /** A koncepciókép sávmottója (docs/design/Websuli_Grafikai_Szabalyterv.md 1.2). */
  motto: string;
  /** A kabala szóbuboréka — csak az 1–5. évfolyamon van kabala (szabályterv 4/2). */
  bubble?: string;
  /**
   * Spec 2026-10-19-evfolyam-arculat-lathato: a lecke háttér-színátmenetének két végpontja (szabályterv 1.2 „Háttér” sor,
   * 2. pont `--ws-hero-from/-to`) — mért: a szöveg- és a halvány szövegszín mindkét végponton ≥ 4,5:1.
   */
  heroFrom: string;
  heroTo: string;
  /** A két kísérőszín (docs/design/design-system/project/tokens.json `accent-2`, `accent-3`). */
  accent2: string;
  accent3: string;
};

export const DESIGN_THEMES: Record<DesignThemeId, DesignTheme> = {
  explorer: { id: "explorer", grades: "1–2.", name: "Felfedező világ", surface: "#E9F9E9", accent: "#17865F", ink: "#174A39", font: "Nunito Sans",
    panel: "#FFFFFF", soft: "#E5F8ED", deep: "#225842", muted: "#3D6352", line: "#CFE3D6", strong: "#157A57", strongInk: "#FFFFFF", minBodyPx: 22, motto: "Kíváncsiság • Játék • Alapok", bubble: "Szia! Ma is felfedezünk valami újat!", heroFrom: "#C9EDC0", heroTo: "#FBF6DC", accent2: "#9A6A00", accent3: "#1F6FA8" },
  adventure: { id: "adventure", grades: "3–5.", name: "Tudás kalandjai", surface: "#FFF0D2", accent: "#C36A28", ink: "#703C1B", font: "Nunito Sans",
    panel: "#FFFFFF", soft: "#FFF3DF", deep: "#754520", muted: "#6E4A2E", line: "#F0D9B5", strong: "#A4561D", strongInk: "#FFFFFF", minBodyPx: 19, motto: "Fedezz fel • Próbáld ki • Fejlődj", bubble: "Minden lépés egy új felfedezés!", heroFrom: "#F9D9A6", heroTo: "#FFD9C2", accent2: "#0B7C71", accent3: "#9B2C3F" },
  studio: { id: "studio", grades: "6–8.", name: "Kreatív stúdió", surface: "#EFEFFF", accent: "#5159A8", ink: "#292F62", font: "Inter",
    panel: "#FFFFFF", soft: "#EFEFFE", deep: "#2B356B", muted: "#4C5378", line: "#D9DBF2", strong: "#5159A8", strongInk: "#FFFFFF", minBodyPx: 17, motto: "Gondolkodj • Alkoss • Oldj meg", heroFrom: "#D9D6FF", heroTo: "#EEE2FF", accent2: "#6D3FD8", accent3: "#1F6FA8" },
  laboratory: { id: "laboratory", grades: "9–10.", name: "Digitális tudáslabor", surface: "#E6F3FF", accent: "#226493", ink: "#143B62", font: "Inter",
    panel: "#FFFFFF", soft: "#E6F3FC", deep: "#173C62", muted: "#3D5873", line: "#CFE1F0", strong: "#226493", strongInk: "#FFFFFF", minBodyPx: 16, motto: "Elemezz • Kísérletezz • Valósítsd meg", heroFrom: "#C9E3F8", heroTo: "#F3F9FF", accent2: "#0B7480", accent3: "#3F4A5A" },
  future: { id: "future", grades: "11–12.", name: "Jövőtervező", surface: "#132540", accent: "#0C929C", ink: "#EFF8FF", font: "Inter",
    panel: "#233956", soft: "#1B3150", deep: "#0B1A2E", muted: "#BCD0E4", line: "#35506E", strong: "#0C929C", strongInk: "#061A22", minBodyPx: 16, motto: "Tudás • Célok • Lehetőségek", heroFrom: "#0B1A2E", heroTo: "#1D3557", accent2: "#B9A6FF", accent3: "#F5B841" },
};

/**
 * A lecke évfolyama → arculat. A 0. „évfolyam” (programozás alapjai) a `studio`, mint a korábbi 7–8-as csoport
 * (`learningAgeGroup`). A tananyag hozzáférését nem a téma szabályozza (§3), csak a megjelenést.
 */
export function designThemeForClassroom(classroom: number): DesignThemeId {
  if (classroom === 0) return "studio";
  if (classroom <= 2) return "explorer";
  if (classroom <= 5) return "adventure";
  if (classroom <= 8) return "studio";
  if (classroom <= 10) return "laboratory";
  return "future";
}

/** A felső sáv szövegei (a referencia élő előnézetének `pvbar` mintája). */
export const DESIGN_TOPBAR_TAGLINE = "Tanulás · Gyakorlás · Eredmények";

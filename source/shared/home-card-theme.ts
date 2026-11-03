import { DESIGN_THEMES, designThemeForClassroom, type DesignThemeId } from "./lesson-design";

/**
 * Spec 2026-11-03-fooldal-boritokartyak: a főoldali tananyagkártya évfolyamsáv-arculata — a lecke-lejátszó mért tokenjei
 * (`DESIGN_THEMES`), sávonként saját forma (kártyasarok 16–20 px, szabályterv 76. sor) és jelvényalak. DOM-mentes.
 */
export type HomeCardShape = "circle" | "tilted" | "hexagon" | "square" | "diamond";

const SHAPES: Record<DesignThemeId, { shape: HomeCardShape; radius: number }> = {
  explorer: { shape: "circle", radius: 20 },
  adventure: { shape: "tilted", radius: 20 },
  studio: { shape: "hexagon", radius: 18 },
  laboratory: { shape: "square", radius: 16 },
  future: { shape: "diamond", radius: 16 },
};

export type HomeCardTheme = {
  band: DesignThemeId; name: string; shape: HomeCardShape; radius: number;
  accent: string; strong: string; strongInk: string; panel: string; ink: string; muted: string; line: string; from: string; to: string;
};

export function homeCardTheme(classroom: number): HomeCardTheme {
  const band = designThemeForClassroom(classroom);
  const t = DESIGN_THEMES[band];
  // A kártya szövege a panelen áll: a sáv mély szövegszíne (deep) a világos paneleken, a sötét (future) panelen a sáv szövegszíne.
  const ink = band === "future" ? t.ink : t.deep;
  return { band, name: t.name, ...SHAPES[band], accent: t.accent, strong: t.strong, strongInk: t.strongInk, panel: t.panel, ink, muted: t.muted, line: t.line, from: t.heroFrom, to: t.heroTo };
}

/** A kártya bélyegképének forrás-azonosítója: a lecke borítója, ennek hiányában a sáv hős-képe. */
export function coverIdFor(cover: string | null | undefined, classroom: number): string {
  return cover && /^[a-z0-9-]{3,64}$/.test(cover) ? cover : `hero-${designThemeForClassroom(classroom)}`;
}

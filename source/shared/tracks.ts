/**
 * Külön tananyagcsoportok (docs/specs/2026-11-24-gimi-felveteli-csoport.md; #1986). A csoport anyaga a saját tartalmi
 * évfolyamán marad (`html_files.classroom`), a csoporttagságot a `html_files.tracks` tömb hordozza — így az évfolyam szűrője,
 * a korosztály, az arculat és a pontozás változatlan.
 */
export const GIMI6_TRACK = "gimi6" as const;

export type TrackId = typeof GIMI6_TRACK;

export type TrackOption = {
  id: TrackId;
  /** Teljes felirat (admin, címek). */
  label: string;
  /** A főoldali csip rövid felirata. */
  shortLabel: string;
  /** A csoport anyagainak tartalmi évfolyama (a tananyagkészítő ezt állítja be). */
  contentGrade: number;
  /** A csoportban készülő anyagok tantárgyai (felvételi tárgyak). */
  subjects: readonly string[];
};

export const TRACKS: readonly TrackOption[] = [
  { id: GIMI6_TRACK, label: "6-osztályos gimnáziumi felvételi", shortLabel: "Gimi felv.", contentGrade: 6, subjects: ["matematika", "magyar"] },
];

export const TRACK_IDS: readonly string[] = TRACKS.map((t) => t.id);

export function isTrackId(value: unknown): value is TrackId {
  return typeof value === "string" && TRACK_IDS.includes(value);
}

export function trackOption(id: string): TrackOption | undefined {
  return TRACKS.find((t) => t.id === id);
}

/** Érvényes, ismétlés nélküli csoportlista (ismeretlen elem → null, hogy a végpont 400-zal utasítsa el). */
export function normalizeTracks(value: unknown): TrackId[] | null {
  if (!Array.isArray(value) || value.length > TRACKS.length * 2) return null;
  if (!value.every(isTrackId)) return null;
  return [...new Set(value as TrackId[])];
}

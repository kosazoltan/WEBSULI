/**
 * JM7b — a játékos-avatarok zárt készlete (terv 10.4: „avatar előre gyártott készletből”; feltöltés NINCS).
 * 24 kódból rajzolt SVG-figura: 6 forma × 4 szín, formánként más szem és száj. A kliens (`PlayerAvatar`) rajzolja; a szerver
 * csak a kulcsot tárolja (`player_accounts.avatar_key`), és csak ebből a listából fogad el értéket.
 * A repó arculati bankja (`client/public/design/`) témaköri borítóképeket tartalmaz, avatarnak alkalmas készletet nem —
 * ezért kódból rajzolt, könnyű (nincs letöltendő kép) figurák.
 */

export type AvatarShape = "blob" | "square" | "drop" | "hex" | "star" | "ghost";
export type AvatarColor = "sky" | "lime" | "sun" | "rose";

export type AvatarDef = { key: string; shape: AvatarShape; color: AvatarColor; label: string };

export const AVATAR_SHAPES: readonly AvatarShape[] = ["blob", "square", "drop", "hex", "star", "ghost"];
export const AVATAR_COLORS: readonly AvatarColor[] = ["sky", "lime", "sun", "rose"];

const SHAPE_LABEL: Record<AvatarShape, string> = {
  blob: "Pamacs", square: "Kocka", drop: "Csepp", hex: "Méhecske", star: "Csillag", ghost: "Szellem",
};
const COLOR_LABEL: Record<AvatarColor, string> = { sky: "kék", lime: "zöld", sun: "sárga", rose: "rózsaszín" };

/** Kitöltés, körvonal és pofi-pír színe (a sötét és világos háttéren is jól látszó, telített árnyalatok). */
export const AVATAR_PALETTE: Record<AvatarColor, { fill: string; stroke: string; cheek: string }> = {
  sky: { fill: "#38bdf8", stroke: "#0c4a6e", cheek: "#f9a8d4" },
  lime: { fill: "#a3e635", stroke: "#365314", cheek: "#fda4af" },
  sun: { fill: "#facc15", stroke: "#713f12", cheek: "#fb923c" },
  rose: { fill: "#fb7185", stroke: "#881337", cheek: "#fde68a" },
};

export const AVATARS: readonly AvatarDef[] = AVATAR_SHAPES.flatMap((shape) =>
  AVATAR_COLORS.map((color) => ({ key: `${shape}-${color}`, shape, color, label: `${COLOR_LABEL[color]} ${SHAPE_LABEL[shape]}` })),
);

export const AVATAR_KEYS: readonly string[] = AVATARS.map((a) => a.key);

const BY_KEY = new Map(AVATARS.map((a) => [a.key, a]));

export function isAvatarKey(value: unknown): value is string {
  return typeof value === "string" && BY_KEY.has(value);
}

export function avatarByKey(key: string | null | undefined): AvatarDef | null {
  return key ? BY_KEY.get(key) ?? null : null;
}

/** Ha még nincs választott avatar: az azonosítóból determinisztikusan egy a készletből (mindig ugyanaz). */
export function defaultAvatarFor(seed: string): AvatarDef {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return AVATARS[(h >>> 0) % AVATARS.length]!;
}

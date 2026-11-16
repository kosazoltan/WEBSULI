/**
 * JM7b — a játékos-avatar (shared/player-avatars.ts zárt készletéből), kódból rajzolt SVG: forma + szín + arc.
 * Kép nem töltődik le, feltöltés nincs. A becenév sehol nem kerül az SVG-be (a hívó szövegként jeleníti meg).
 */
import { AVATAR_PALETTE, avatarByKey, defaultAvatarFor, type AvatarDef, type AvatarShape } from "@shared/player-avatars";

const BODY: Record<AvatarShape, string> = {
  blob: "M50 8c22 0 40 15 40 40 0 26-17 44-40 44S10 74 10 48C10 23 28 8 50 8z",
  square: "M20 12h60a10 10 0 0 1 10 10v58a10 10 0 0 1-10 10H20a10 10 0 0 1-10-10V22a10 10 0 0 1 10-10z",
  drop: "M50 6C66 28 88 44 88 64c0 17-17 28-38 28S12 81 12 64C12 44 34 28 50 6z",
  hex: "M50 6l38 22v44L50 94 12 72V28z",
  star: "M50 4l12 26 28 4-20 20 5 29-25-14-25 14 5-29L10 34l28-4z",
  ghost: "M50 8c21 0 36 16 36 38v44l-9-7-9 7-9-7-9 7-9-7-9 7-9-7-9 7V46C14 24 29 8 50 8z",
};

/** Formánként más szem / száj, hogy a 24 avatar színtől függetlenül is megkülönböztethető legyen. */
function Face({ shape, stroke }: { shape: AvatarShape; stroke: string }) {
  const eyeY = shape === "star" ? 46 : shape === "drop" ? 58 : 44;
  const mouthY = eyeY + 16;
  switch (shape) {
    case "square":
      return (
        <g>
          <rect x="31" y={eyeY - 6} width="10" height="12" rx="3" fill={stroke} />
          <rect x="59" y={eyeY - 6} width="10" height="12" rx="3" fill={stroke} />
          <path d={`M38 ${mouthY}h24`} stroke={stroke} strokeWidth="5" strokeLinecap="round" />
        </g>
      );
    case "hex":
      return (
        <g>
          <circle cx="37" cy={eyeY} r="7" fill="#fff" stroke={stroke} strokeWidth="3" />
          <circle cx="63" cy={eyeY} r="7" fill="#fff" stroke={stroke} strokeWidth="3" />
          <circle cx="38" cy={eyeY + 1} r="3" fill={stroke} />
          <circle cx="64" cy={eyeY + 1} r="3" fill={stroke} />
          <path d={`M40 ${mouthY}q10 8 20 0`} stroke={stroke} strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );
    case "star":
      return (
        <g>
          <path d={`M34 ${eyeY}q4-6 8 0`} stroke={stroke} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d={`M58 ${eyeY}q4-6 8 0`} stroke={stroke} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d={`M42 ${mouthY - 4}q8 9 16 0z`} fill={stroke} />
        </g>
      );
    case "ghost":
      return (
        <g>
          <ellipse cx="38" cy={eyeY} rx="6" ry="9" fill={stroke} />
          <ellipse cx="62" cy={eyeY} rx="6" ry="9" fill={stroke} />
          <ellipse cx="50" cy={mouthY + 2} rx="6" ry="5" fill={stroke} />
        </g>
      );
    case "drop":
      return (
        <g>
          <circle cx="39" cy={eyeY} r="5" fill={stroke} />
          <circle cx="61" cy={eyeY} r="5" fill={stroke} />
          <path d={`M41 ${mouthY - 2}q9 7 18 0`} stroke={stroke} strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );
    default:
      return (
        <g>
          <circle cx="37" cy={eyeY} r="6" fill={stroke} />
          <circle cx="63" cy={eyeY} r="6" fill={stroke} />
          <circle cx="39" cy={eyeY - 2} r="2" fill="#fff" />
          <circle cx="65" cy={eyeY - 2} r="2" fill="#fff" />
          <path d={`M38 ${mouthY - 2}q12 12 24 0`} stroke={stroke} strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}

export function PlayerAvatar({ avatarKey, seed, size = 48, className, title }: {
  avatarKey: string | null | undefined; seed?: string; size?: number; className?: string; title?: string;
}) {
  const def: AvatarDef = avatarByKey(avatarKey) ?? defaultAvatarFor(seed ?? "websuli");
  const pal = AVATAR_PALETTE[def.color];
  const cheekY = def.shape === "drop" ? 66 : def.shape === "star" ? 56 : 54;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={title ?? def.label} data-avatar={def.key}>
      <path d={BODY[def.shape]} fill={pal.fill} stroke={pal.stroke} strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="28" cy={cheekY} rx="6" ry="4" fill={pal.cheek} opacity="0.75" />
      <ellipse cx="72" cy={cheekY} rx="6" ry="4" fill={pal.cheek} opacity="0.75" />
      <Face shape={def.shape} stroke={pal.stroke} />
    </svg>
  );
}

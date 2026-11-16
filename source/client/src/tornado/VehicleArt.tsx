import { useId } from "react";

import { RARITY_COLOR, RARITY_LABEL, categoryLabel, type Vehicle } from "@/lib/tornado/vehicles";

/**
 * Vihargarázs — a jármű 2D oldalnézeti rajza (docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md, E4).
 *
 * A játékban nincs kép-eszköz (a 3D háló is procedurális, `tornado/buildMeshes.ts`); a járműnek viszont van formája:
 * a `silhouette` (pickup / wedge / tank / van / beast) — kategóriánként más. Ebből rajzolunk egy kis SVG-t a jármű
 * saját színeivel (`colors.body` / `accent` / `glass`), a ritkaság színű ragyogással és kerettel. Így a garázs, a
 * járműsor és a menü kártyája nem üres színátmenetes négyzetet mutat, hanem felismerhető, egymástól formában ÉS színben
 * eltérő járművet. Külső kép, licencelt grafika nincs.
 */

type Silhouette = Vehicle["silhouette"];

type Shape = {
  /** A karosszéria (body színnel). */
  body: string;
  /** Ablak(ok) (glass színnel). */
  glass: string;
  /** Díszcsík / páncél / ketrec (accent színnel). */
  accent: string;
  /** Ha igaz, az `accent` vonalként (körvonal) rajzolódik, nem kitöltésként. */
  accentStroke?: boolean;
  /** Kerekek: [cx, cy, r]. */
  wheels: Array<[number, number, number]>;
  /** Lánctalp-sáv (csak a páncélosnál). */
  tread?: string;
};

/** Az öt forma — exportálva, hogy a teszt az eltérésüket ellenőrizhesse. */
export const VEHICLE_SHAPES: Record<Silhouette, Shape> = {
  // Felderítő: alacsony fülke + nyitott plató, könnyű, két kerék.
  pickup: {
    body: "M8 38 H54 V24 H80 L94 38 H108 Q114 38 114 44 V52 H8 Z",
    glass: "M58 28 H78 L88 38 H58 Z",
    accent: "M8 44 H114 V47 H8 Z",
    wheels: [
      [28, 54, 9],
      [92, 54, 9],
    ],
  },
  // Elfogó: lapos ék, hátsó légterelő.
  wedge: {
    body: "M6 52 L8 42 L40 36 L68 27 L90 30 L116 44 V52 Z",
    glass: "M50 35 L68 29.5 L84 32 L68 37 Z",
    accent: "M4 30 H20 V34 H13 L15 41 H9 L10 34 H4 Z",
    wheels: [
      [28, 54, 9],
      [94, 54, 9],
    ],
  },
  // Nehéz elfogó: szögletes páncél, résablak, lánctalp, három kerék.
  tank: {
    body: "M8 30 L18 20 H98 L112 30 V50 H8 Z",
    glass: "M62 25 H94 V31 H62 Z",
    accent: "M14 36 H106 M14 42 H106 M40 22 V48",
    accentStroke: true,
    tread: "M6 48 H114 A6 6 0 0 1 114 62 H6 A6 6 0 0 1 6 48 Z",
    wheels: [
      [22, 55, 5],
      [60, 55, 5],
      [98, 55, 5],
    ],
  },
  // Kutatójármű: magas doboz, radartányér a tetőn.
  van: {
    body: "M10 18 H84 L104 34 Q112 36 112 42 V52 H10 Z",
    glass: "M86 22 L100 34 H86 Z M20 24 H48 V34 H20 Z",
    accent: "M36 18 V10 H40 V18 Z M26 10 Q38 1 50 10 Z",
    wheels: [
      [30, 54, 9],
      [92, 54, 9],
    ],
  },
  // Extrém jármű: bukócső-ketrec, óriáskerék, elöl horgonytüske.
  beast: {
    body: "M10 46 L16 30 H96 L110 40 V48 H10 Z M110 44 L119 42 L110 40 Z",
    glass: "M64 33 H86 L94 40 H64 Z",
    accent: "M34 30 L42 13 H80 L88 30 M61 13 V30",
    accentStroke: true,
    wheels: [
      [28, 54, 12],
      [94, 54, 12],
    ],
  },
};

export type VehicleArtProps = {
  vehicle: Pick<Vehicle, "name" | "category" | "rarity" | "colors" | "silhouette">;
  className?: string;
};

export default function VehicleArt({ vehicle, className = "" }: VehicleArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const glowId = `va-glow-${uid}`;
  const rarity = RARITY_COLOR[vehicle.rarity];
  const shape = VEHICLE_SHAPES[vehicle.silhouette] ?? VEHICLE_SHAPES.pickup;
  return (
    <svg
      viewBox="0 0 120 72"
      role="img"
      aria-label={`${vehicle.name} – ${categoryLabel(vehicle.category)}, ${RARITY_LABEL[vehicle.rarity]}`}
      data-testid="tornado-vehicle-art"
      data-silhouette={vehicle.silhouette}
      className={`block ${className}`}
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="62%" r="70%">
          <stop offset="0%" stopColor={rarity} stopOpacity="0.45" />
          <stop offset="100%" stopColor={rarity} stopOpacity="0.04" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="118" height="70" rx="10" fill={`url(#${glowId})`} stroke={rarity} strokeOpacity="0.7" strokeWidth="2" />
      <ellipse cx="60" cy="64" rx="50" ry="3.5" fill="#020617" opacity="0.45" />
      {shape.tread && <path d={shape.tread} fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />}
      <path d={shape.body} fill={vehicle.colors.body} stroke="#0f172a" strokeWidth="1.5" strokeLinejoin="round" />
      {shape.accentStroke ? (
        <path d={shape.accent} fill="none" stroke={vehicle.colors.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={shape.accent} fill={vehicle.colors.accent} stroke="#0f172a" strokeWidth="1" strokeLinejoin="round" />
      )}
      <path d={shape.glass} fill={vehicle.colors.glass} stroke="#0f172a" strokeWidth="1" opacity="0.9" />
      {shape.wheels.map(([cx, cy, r]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={r} fill="#0f172a" stroke="#334155" strokeWidth="2" />
          <circle cx={cx} cy={cy} r={r * 0.4} fill="#94a3b8" />
        </g>
      ))}
    </svg>
  );
}

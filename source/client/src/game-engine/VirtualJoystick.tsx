import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { joystickVector, knobOffset, type JoystickVector } from "./joystick";
import { useReducedMotion } from "./useReducedMotion";

/**
 * G-8 — virtuális joystick telefonra.
 *
 * Négy nyílgomb helyett egy hüvelykujjal kezelhető tárcsa. A különbség nem
 * szépészeti: a nyílgombokkal az átlós irány két gomb EGYIDEJŰ nyomását
 * követelte, ami egy hüvelykujjal nem megy — a gyerek gyakorlatilag négy
 * irányra volt korlátozva egy olyan játékban, ami nyolcat kínál.
 *
 * A tárca „dinamikus": a nyomás helyén jelenik meg, nem fix ponton. A mért
 * összehasonlítások szerint a lebegő és a fix tárcsa között elégedettségben
 * nincs érdemi különbség, fáradásban és tanulhatóságban viszont a lebegő
 * valamivel jobb — és nagyobb képernyőn a hüvelykujj kényelmesebb helyre teheti.
 *
 * A viselkedés két nem alkuképes pontja (mindkettő mért hibából jött):
 *  - pointer capture, `pointerleave` nélkül: a kicsúszó ujj nem szakítja meg a
 *    vezérlést;
 *  - `touch-action: none` és kijelölés-tiltás: hosszú nyomásra a böngésző
 *    egyébként kijelöl, felugró menüt nyit és görget.
 */

export type VirtualJoystickProps = {
  /** Minden változásnál meghívódik; felengedéskor nulla vektorral. */
  onChange: (v: JoystickVector) => void;
  /** A tárca sugara pixelben. */
  radius?: number;
  className?: string;
  label?: string;
};

export default function VirtualJoystick({
  onChange,
  radius = 56,
  className = "",
  label = "Irányítás",
}: VirtualJoystickProps) {
  const reduced = useReducedMotion();
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);

  const handleDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      // Dinamikus tárca: ahol a hüvelykujj leér, ott a közép.
      originRef.current = { x: e.clientX, y: e.clientY };
      setKnob({ x: 0, y: 0 });
    },
    [],
  );

  const handleMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const origin = originRef.current;
      if (!origin) return;
      e.preventDefault();

      const point = { x: e.clientX, y: e.clientY };
      onChange(joystickVector({ origin, point, radius }));
      setKnob(knobOffset({ origin, point, radius }));
    },
    [onChange, radius],
  );

  const handleUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!originRef.current) return;
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
      originRef.current = null;
      setKnob(null);
      // Felengedéskor MINDIG nullázunk: enélkül a hajó a legutolsó irányba
      // sodródna tovább, és a gyerek azt hinné, elromlott a vezérlés.
      onChange({ x: 0, y: 0, magnitude: 0 });
    },
    [onChange],
  );

  const active = knob !== null;

  return (
    <div
      role="application"
      aria-label={label}
      data-testid="virtual-joystick"
      data-active={active ? "true" : "false"}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex items-center justify-center rounded-full border-2 border-white/25 bg-slate-900/50 ${className}`}
      style={{
        width: radius * 2,
        height: radius * 2,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Holtsáv-jelzés: a gyerek látja, meddig „nem történik semmi". */}
      <span className="absolute rounded-full border border-white/10" style={{ width: radius * 0.3, height: radius * 0.3 }} />
      <span
        aria-hidden="true"
        className="absolute rounded-full bg-sky-400/85 shadow-lg"
        style={{
          width: radius * 0.72,
          height: radius * 0.72,
          transform: `translate(${knob?.x ?? 0}px, ${knob?.y ?? 0}px)`,
          transition: reduced || active ? "none" : "transform 120ms ease-out",
        }}
      />
    </div>
  );
}

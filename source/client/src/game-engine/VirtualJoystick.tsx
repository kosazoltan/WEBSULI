import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { JOYSTICK_DEAD_ZONE, createJoystickDrag, retireJoystickDrag, type JoystickVector } from "./joystick";
import { controlRadiusFor } from "./mobile/controlSize";
import { useReducedMotion } from "./useReducedMotion";
import { countRender } from "./inputProbe";

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
  /**
   * A tárca sugara pixelben, vagy "auto" (S2): `controlRadiusFor` a nézet méretéből (52–76 px),
   * átméretezéskor frissül.
   */
  radius?: number | "auto";
  className?: string;
  label?: string;
  /**
   * Opcionális reset-jel: minden VÁLTOZÁSA megszakítja a futó húzást (a gomb visszaáll, az
   * `onChange` nulla vektort kap, a pointer capture elenged). A hívó fókuszvesztéskor (blur,
   * visibilitychange) növeli. Aki nem adja meg, annál a viselkedés változatlan.
   */
  resetSignal?: number;
};

const ZERO_VECTOR: JoystickVector = { x: 0, y: 0, magnitude: 0 };

function viewportRadius(): number {
  if (typeof window === "undefined") return 56;
  return controlRadiusFor({ width: window.innerWidth, height: window.innerHeight });
}

/** "auto" → a nézethez igazított sugár (resize-ra frissül); szám → változatlanul az. */
function useResolvedRadius(radius: number | "auto"): number {
  const auto = radius === "auto";
  const [autoRadius, setAutoRadius] = useState<number>(viewportRadius);
  useEffect(() => {
    if (!auto || typeof window === "undefined") return;
    const apply = () => setAutoRadius(viewportRadius());
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [auto]);
  return auto ? autoRadius : radius;
}


export default function VirtualJoystick({
  onChange,
  radius: radiusProp = 56,
  className = "",
  label = "Irányítás",
  resetSignal,
}: VirtualJoystickProps) {
  countRender("joystick");
  const radius = useResolvedRadius(radiusProp);
  const reduced = useReducedMotion();
  const drag = useMemo(() => createJoystickDrag(radius), [radius]);
  const elementRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  // Az eseménykezelők és az effektek a legfrissebb onChange-et hívják — a hívó inline függvénye miatt
  // a kezelők nem jönnek létre újra minden renderben.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  /**
   * Joystick-reakció (#49): a gomb a DOM-on át, ugyanabban az eseményben követi az ujjat — React-render nélkül.
   * Mérve (Pixel 7 emuláció): a régi `setKnob` állapot minden `pointermove`-ra újrarenderelte a tárcsát, és a gomb
   * egy képkockával a játék bemenete UTÁN jelent meg. `null` = elengedve (visszaugrik középre, áttűnéssel).
   */
  const paintKnobRef = useRef((knob: { x: number; y: number } | null) => {
    const el = elementRef.current;
    const k = knobRef.current;
    if (el) el.dataset.active = knob ? "true" : "false";
    if (!k) return;
    k.style.transition = reducedRef.current || knob ? "none" : "transform 120ms ease-out";
    k.style.transform = `translate3d(${knob?.x ?? 0}px, ${knob?.y ?? 0}px, 0)`;
  });
  const setKnob = paintKnobRef.current;

  // Review PR #422: sugárváltáskor (radius="auto", elforgatás) új `drag` jön létre. A régi futó húzást
  // lezárjuk, a capture-t elengedjük, a gombot töröljük és nulla vektort küldünk — különben a felengedés
  // az új, inaktív példányon elnyelődne, és a játék tartaná az utolsó irányt.
  const prevDragRef = useRef(drag);
  useEffect(() => {
    const prev = prevDragRef.current;
    prevDragRef.current = drag;
    if (!retireJoystickDrag(prev, drag)) return;
    const setKnob = paintKnobRef.current;
    const el = elementRef.current;
    const id = pointerIdRef.current;
    pointerIdRef.current = null;
    if (el && id !== null && el.hasPointerCapture?.(id)) el.releasePointerCapture?.(id);
    setKnob(null);
    onChangeRef.current(ZERO_VECTOR);
  }, [drag]);

  const handleDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Több ujj: a tárcsát az első ujj birtokolja; egy második ujj leérése nem rántja át a közepét.
      if (pointerIdRef.current !== null && drag.active) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      pointerIdRef.current = e.pointerId;
      // Dinamikus tárca: ahol a hüvelykujj leér, ott a közép.
      drag.down({ x: e.clientX, y: e.clientY });
      setKnob({ x: 0, y: 0 });
    },
    [drag, setKnob],
  );

  const handleMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== pointerIdRef.current) return;
      const moved = drag.move({ x: e.clientX, y: e.clientY });
      if (!moved) return;
      e.preventDefault();
      onChangeRef.current(moved.vector);
      setKnob(moved.knob);
    },
    [drag, setKnob],
  );

  const handleUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== pointerIdRef.current) return;
      pointerIdRef.current = null;
      if (!drag.up()) return;
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
      setKnob(null);
      // Felengedéskor MINDIG nullázunk: enélkül a hajó a legutolsó irányba
      // sodródna tovább, és a gyerek azt hinné, elromlott a vezérlés.
      onChangeRef.current({ x: 0, y: 0, magnitude: 0 });
    },
    [drag, setKnob],
  );

  // Review PR #137: fókuszvesztéskor a hívó nullázta a saját irányait, de a tárcsa megtartotta a
  // húzás közepét és a gombot — egy későbbi mozgás új érintés nélkül újra vezetett.
  useEffect(() => {
    if (resetSignal === undefined) return;
    if (!drag.reset()) return;
    const setKnob = paintKnobRef.current;
    const el = elementRef.current;
    const id = pointerIdRef.current;
    pointerIdRef.current = null;
    if (el && id !== null && el.hasPointerCapture?.(id)) el.releasePointerCapture?.(id);
    setKnob(null);
    onChangeRef.current(ZERO_VECTOR);
    // A `drag` csak sugárváltáskor új; egy friss húzás-objektumon a reset nem csinál semmit.
  }, [resetSignal, drag]);

  return (
    <div
      ref={elementRef}
      role="application"
      aria-label={label}
      data-testid="virtual-joystick"
      data-active="false"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      // KSZ-14: ha a rendszer elveszi a capture-t (pl. értesítés, gesztus), az is elengedés.
      onLostPointerCapture={handleUp}
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
      <span
        className="absolute rounded-full border border-white/10"
        style={{ width: radius * 2 * JOYSTICK_DEAD_ZONE, height: radius * 2 * JOYSTICK_DEAD_ZONE }}
      />
      <span
        ref={knobRef}
        aria-hidden="true"
        className="absolute rounded-full bg-sky-400/85 shadow-lg"
        style={{
          width: radius * 0.72,
          height: radius * 0.72,
          willChange: "transform",
        }}
      />
    </div>
  );
}

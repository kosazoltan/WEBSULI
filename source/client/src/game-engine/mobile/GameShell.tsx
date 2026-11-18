import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { useJoystickSide } from "@/game-engine/play/gameSettings";

import { useAutoPause } from "./autoPause";
import { useOrientation } from "./orientation";
import RotateHint from "./RotateHint";
import { useTouchCapable } from "./touch";
import type { GameOrientationPreference, GameScreenState } from "./types";

/**
 * S2 / terv 4.5 — a játék gyökere. A meglévő `index.css` `.game-shell-fixed` szabályai (100dvh, görgetés
 * nélküli játéktér, biztonsági sáv a `main`-en) erre az osztályra és a `data-playing` /
 * `data-fixed-screen` attribútumokra épülnek, ezért ezek kötelezők.
 */

export type GameShellProps = {
  /** A gyökér `data-game` értéke: a játék MEGLÉVŐ értékét kell átadni (pl. "TornadoHunter200"). */
  gameId: string;
  state: GameScreenState;
  /** `data-fixed-screen`; alap: `state !== "start"`. */
  fixedScreen?: boolean;
  /** Alap "any"; ha mást kér, játék közben eltérő tájolásnál forgatási kérés jelenik meg. */
  orientation?: GameOrientationPreference;
  /** Lap háttérbe kerülése / elfordítás játék közben. */
  onAutoPause?: () => void;
  className?: string;
  /** A játék saját háttere ide kerül; alap a `--game-surface`. */
  style?: CSSProperties;
  children: ReactNode;
};

const noop = () => {};

export default function GameShell({
  gameId,
  state,
  fixedScreen,
  orientation = "any",
  onAutoPause,
  className = "",
  style,
  children,
}: GameShellProps) {
  const touch = useTouchCapable();
  // A képernyő-joystick oldala (alap: jobb). A joystick és a játékok CSS-e ezt az attribútumot olvassa
  // (docs/specs/2026-11-18-joystick-jobb-kez.md D2).
  const joystickSide = useJoystickSide();
  const current = useOrientation();
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const playing = state === "playing";
  const fixed = fixedScreen ?? state !== "start";

  useAutoPause(playing, onAutoPause ?? noop);

  // Új futásnál (vissza a kezdőképernyőre) a kérés újra megjelenhet.
  useEffect(() => {
    if (state === "start") setRotateDismissed(false);
  }, [state]);

  const wantRotate =
    orientation !== "any" && playing && current !== orientation && !rotateDismissed ? orientation : null;

  return (
    <div
      data-game={gameId}
      data-playing={playing || state === "paused" ? "true" : "false"}
      data-fixed-screen={fixed ? "true" : "false"}
      data-game-state={state}
      data-touch={touch ? "true" : "false"}
      data-joystick-side={joystickSide}
      className={`game-shell-fixed min-h-screen relative overflow-hidden text-white ${className}`}
      style={{ background: "var(--game-surface)", ...style }}
    >
      {children}
      {wantRotate && <RotateHint want={wantRotate} onContinue={() => setRotateDismissed(true)} />}
    </div>
  );
}

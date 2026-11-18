import { useGameSettings } from "@/game-engine/play/gameSettings";

import { JOYSTICK_SIDE_TEXT, type JoystickSide } from "./joystickSide";

/**
 * A joystick oldalának közös kapcsolója (`docs/specs/2026-11-18-joystick-jobb-kez.md` D5).
 *
 * Két gomb: „Jobb oldalt” (alap) / „Bal oldalt”. A választás a közös játékbeállításokba íródik
 * (`websuli.gameSettings.v1`), így minden joystickos játékra érvényes, és az eszköz megjegyzi. A közös szünet menü
 * magától mutatja, ha a lapon van joystick; a Brain Rot és a Tornádóvadász a kezdő beállításai között is kiteszi.
 */
const SIDES: JoystickSide[] = ["right", "left"];

export default function JoystickSideToggle({ className = "" }: { className?: string }) {
  const [settings, update] = useGameSettings();
  return (
    <div className={`game-joystick-side ${className}`} data-testid="joystick-side-toggle" data-side={settings.joystickSide}>
      <p className="game-joystick-side-label">{JOYSTICK_SIDE_TEXT.label}</p>
      <div className="game-joystick-side-options" role="group" aria-label={JOYSTICK_SIDE_TEXT.groupLabel}>
        {SIDES.map((side) => (
          <button
            key={side}
            type="button"
            className="game-joystick-side-btn"
            aria-pressed={settings.joystickSide === side}
            data-testid={`joystick-side-${side}`}
            onClick={() => update({ joystickSide: side })}
          >
            {JOYSTICK_SIDE_TEXT[side]}
          </button>
        ))}
      </div>
    </div>
  );
}

import type { Hand } from "./handedness";

const BUTTON =
  "min-h-[52px] rounded-xl border px-3 py-1.5 text-[15px] font-extrabold leading-tight text-white transition-colors " +
  "border-white/20 bg-slate-900/80 hover:bg-slate-800/90 " +
  "aria-pressed:border-cyan-100/60 aria-pressed:bg-gradient-to-b aria-pressed:from-cyan-500 aria-pressed:to-blue-700";

/**
 * JK (docs/specs/2026-11-26-jatek-kezesseg.md): a joystickos játékok közös kezesség-választója a kezdőképernyő beállításai között.
 * A kiválasztott gomb `aria-pressed="true"`; a joystick a választott kéz alá, az akciógombok a másik oldalra kerülnek.
 */
export function HandednessPicker({
  hand,
  onChange,
  testIdPrefix = "game-hand",
  buttonClassName = BUTTON,
  titleClassName = "mb-2 text-sm font-bold uppercase tracking-wide text-white/85",
}: {
  hand: Hand;
  onChange: (hand: Hand) => void;
  testIdPrefix?: string;
  buttonClassName?: string;
  titleClassName?: string;
}) {
  return (
    <div>
      <p className={titleClassName}>Joystick</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Melyik kézzel irányítasz?">
        <button type="button" className={buttonClassName} aria-pressed={hand === "right"} data-testid={`${testIdPrefix}-right`} onClick={() => onChange("right")}>
          Jobbkezes (bal oldalt)
        </button>
        <button type="button" className={buttonClassName} aria-pressed={hand === "left"} data-testid={`${testIdPrefix}-left`} onClick={() => onChange("left")}>
          Balkezes (jobb oldalt)
        </button>
      </div>
    </div>
  );
}

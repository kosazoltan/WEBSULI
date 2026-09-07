import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/**
 * G-8 — nyomva tartható vezérlőgomb telefonra.
 *
 * Ez a komponens két, kódból mért hibát javít, amit a tulajdonos telefonon
 * tapasztalt („megáll az irányítás", „kijelöli az elemet"):
 *
 *  1. **A `pointerleave` elengedte a gombot.** Mind a négy akciójáték kért
 *     pointer capture-t ÉS figyelte a `pointerleave`-et. A kettő egymás ellen
 *     dolgozik: a capture épp azért van, hogy az elcsúszó hüvelykujj is a
 *     gombhoz tartozzon, a `leave` viszont a határon túllépve azonnal elenged.
 *     Játék közben a hüvelykujj MINDIG elcsúszik. Itt nincs `onPointerLeave` —
 *     a capture tartja a nyomást, és `pointerup` / `pointercancel` engedi el.
 *
 *  2. **A böngésző saját gesztusai.** `touch-action: none` nélkül a hosszú
 *     nyomás kijelöl, felugró menüt nyit és görget. A `manipulation` érték itt
 *     kevés: az még enged görgetést. A `contextmenu` külön is tiltva, mert
 *     Androidon az hosszú nyomásra a capture ellenére is felugrik.
 *
 * A gomb `pointerdown`-ra azonnal aktivál (nem `click`-re): a `click` csak az
 * ujj felemelésekor tüzel, ami játékban észlelhető késés.
 */

export type HoldButtonProps = {
  /** Lenyomáskor. */
  onHoldStart: () => void;
  /** Felengedéskor, megszakításkor, unmountkor. */
  onHoldEnd: () => void;
  children: ReactNode;
  className?: string;
  /** Képernyőolvasónak; a gomb tartalma gyakran csak ikon. */
  label: string;
  disabled?: boolean;
};

export default function HoldButton({
  onHoldStart,
  onHoldEnd,
  children,
  className = "",
  label,
  disabled = false,
}: HoldButtonProps) {
  const heldRef = useRef(false);

  const start = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      // Megakadályozza a görgetést, a kijelölést és a szintetikus egéreseményeket.
      e.preventDefault();
      if (heldRef.current) return;
      heldRef.current = true;

      // A capture nélkül az elcsúszó ujj eseményei átkerülnek a felület alatti
      // elemre, és a gomb sosem kapja meg a felengedést — beragadt vezérlés.
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onHoldStart();
    },
    [disabled, onHoldStart],
  );

  const end = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!heldRef.current) return;
      heldRef.current = false;

      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
      onHoldEnd();
    },
    [onHoldEnd],
  );

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      // Hosszú nyomásra Androidon a capture ellenére felugrana a menü.
      onContextMenu={(e) => e.preventDefault()}
      className={`select-none touch-none ${className}`}
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        // iOS: hosszú nyomásra megjelenő „másolás/megosztás" buborék.
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </button>
  );
}

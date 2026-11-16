/**
 * Érintés MOZGÓ célpontra (közös utójavítás c, kanban #51; J4a pilot #451 tanulsága; K.5 KSZ-13, KSZ-14).
 *
 * A világban mozgó válaszcélok (számdrón, kristály, ketrec, kapaszkodó, kapu) koppintása három csapdát rejt:
 * 1. **Több ujj:** a böngésző a nem elsődleges mutatóra NEM szintetizál `click`-et (a telefont tartó hüvelykujj a képernyőn) —
 *    a `click`-re épülő választás ilyenkor elvész. Ezért pointer-eseményekre épül, mutatónként (`pointerId`).
 * 2. **Implicit pointer capture:** érintésnél a `pointerup` a lenyomott elemre érkezik akkor is, ha az ujjat lehúzták róla —
 *    a „lenyomás célpontja = felengedés célpontja” ellenőrzés nem elég. Ezért felengedéskor a KOORDINÁTÁT nézzük.
 * 3. **A cél elmozdul az ujj alól:** ha az ujj nem mozdult, de a cél elrepült alóla, az még szándékos koppintás.
 *
 * Szabály: a lenyomás `pointerdown`-ra „célzás” (a lap azonnali visszajelzést adhat), a választás FELENGEDÉSKOR véglegesedik,
 * ha az ujj a cél AKTUÁLIS dobozán belül (± `slopPx`) engedett fel, VAGY alig mozdult (≤ `stillPx`). Elhúzott ujj = visszavonás;
 * `pointercancel` = visszavonás. Billentyűzethez (Enter / Szóköz a fókuszált célon) a `click` `detail === 0` ága választ.
 *
 * React nélkül (strukturális esemény-típusokkal), így node-ban tesztelhető. Használat (a lapon):
 *
 *   const taps = useMemo(() => createPointerTapTracker(), []);
 *   <button {...pointerTapHandlers(taps, i, () => q.pick(i))} … />
 */

export const TAP_UP_SLOP_PX = 10;
export const TAP_STILL_PX = 12;

export type TapRect = { left: number; top: number; right: number; bottom: number };

export type PointerTapTracker = {
  /** Lenyomás: a mutató, a hely és a cél azonosítója. */
  down(pointerId: number, x: number, y: number, target: number): void;
  /** Felengedés: igaz, ha érvényes koppintás volt erre a célra (a `rect` a cél AKTUÁLIS doboza). */
  up(pointerId: number, x: number, y: number, target: number, rect: TapRect): boolean;
  /** Visszavonás (`pointercancel`, `lostpointercapture` a cél nélkül). */
  cancel(pointerId: number): void;
  /** Hány mutató van éppen lenyomva (teszthez / diagnosztikához). */
  pressed(): number;
};

export function createPointerTapTracker(opts: { slopPx?: number; stillPx?: number } = {}): PointerTapTracker {
  const slop = opts.slopPx ?? TAP_UP_SLOP_PX;
  const still = opts.stillPx ?? TAP_STILL_PX;
  const downs = new Map<number, { x: number; y: number; target: number }>();
  return {
    down(pointerId, x, y, target) {
      downs.set(pointerId, { x, y, target });
    },
    up(pointerId, x, y, target, rect) {
      const d = downs.get(pointerId);
      downs.delete(pointerId);
      if (!d || d.target !== target) return false;
      const inside = x >= rect.left - slop && x <= rect.right + slop && y >= rect.top - slop && y <= rect.bottom + slop;
      const notMoved = Math.hypot(x - d.x, y - d.y) <= still;
      return inside || notMoved;
    },
    cancel(pointerId) {
      downs.delete(pointerId);
    },
    pressed: () => downs.size,
  };
}

/** A szükséges esemény-mezők (a React `PointerEvent` / `MouseEvent` és a DOM-esemény is megfelel). */
type TapPointerEvent = {
  pointerId: number;
  clientX: number;
  clientY: number;
  currentTarget: { getBoundingClientRect(): TapRect };
  stopPropagation(): void;
};
type TapClickEvent = { detail: number };

/**
 * A célpont esemény-kezelői. `onDown` igaz visszatérése „elnyeli” a lenyomást (pl. a cél mögötti ellenfél közepére bökött
 * a gyerek — az lövés, nem válasz); ilyenkor a felengedés sem választ.
 */
export function pointerTapHandlers(
  tracker: PointerTapTracker,
  target: number,
  onTap: () => void,
  opts: { onDown?: (e: TapPointerEvent) => boolean | void } = {},
): {
  onPointerDown: (e: TapPointerEvent) => void;
  onPointerUp: (e: TapPointerEvent) => void;
  onPointerCancel: (e: TapPointerEvent) => void;
  onClick: (e: TapClickEvent) => void;
} {
  return {
    onPointerDown(e) {
      e.stopPropagation();
      if (opts.onDown?.(e) === true) return;
      tracker.down(e.pointerId, e.clientX, e.clientY, target);
    },
    onPointerUp(e) {
      e.stopPropagation();
      if (tracker.up(e.pointerId, e.clientX, e.clientY, target, e.currentTarget.getBoundingClientRect())) onTap();
    },
    onPointerCancel(e) {
      tracker.cancel(e.pointerId);
    },
    onClick(e) {
      // Billentyűzet (Enter / Szóköz): `detail === 0`. A mutatós választást a pointerup már elintézte.
      if (e.detail === 0) onTap();
    },
  };
}

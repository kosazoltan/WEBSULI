/**
 * Kérdéskártya + 2×2 válaszrács betűméret-illesztéssel (JM1r: az aréna `PlayerPane` kérdés-része, egy játékosra).
 *
 * - Bemenet (KSZ-13/14): `pointerdown` csak vizuális visszajelzés (+ a lenyomás időbélyege), a választás `pointerup`-on
 *   véglegesül, ha az ujj a gombon belül maradt; `pointercancel` / `lostpointercapture` lezár; billentyűzet: `click`
 *   `detail === 0`. Egy kártya = egy játékos, egyszerre egy lenyomás.
 * - Illesztés (review #447): kör- / állapot- / méretváltáskor a legnagyobb betűméret-szintet választjuk, amelyen a kérdés
 *   és a válaszok elférnek (a legkisebb szinten is ≥ 12 px szöveg és ≥ 48 px gomb). A szint DOM-attribútum, nem
 *   React-állapot: egy mérés-sor a kör elején, nem képkockánként.
 * - Felfedéskor csak a helyes és a választott válasz marad (hely a magyarázatnak).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { DUEL_FIT_LEVELS } from "./format";

/** Böngészőben elrajzolás előtti mérés; DOM nélkül (statikus renderelés, egységteszt) sima effekt. */
const useMeasureEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type QuestionCardState = "open" | "locked" | "reveal";

export type QuestionCardProps = {
  /** Körönként új érték (újramérés + a félbemaradt lenyomás törlése). */
  roundKey: string | number;
  prompt: string;
  options: readonly string[];
  state: QuestionCardState;
  chosenIndex: number | null;
  /** Csak felfedéskor ismert (online a szerver a kör zárásáig nem küldi). */
  correctIndex: number | null;
  /** Választás: `pressedAtMs` = a lenyomás `event.timeStamp`-je (a `performance.now()` időtengelyén), billentyűzetnél `null`. */
  onPick?: (index: number, pressedAtMs: number | null) => void;
  lockedText?: string;
  /** A kártya fölötti szalag (kör / „Döntő kérdés!”) — nem rövidíti az ablakot. */
  banner?: ReactNode;
  /** A rács alatti tartalom (ítélet-sáv). */
  footer?: ReactNode;
  testIdPrefix?: string;
};

type OptionState = "idle" | "chosen" | "correct" | "wrong" | "dim";

export function optionStateFor(i: number, state: QuestionCardState, chosenIndex: number | null, correctIndex: number | null): OptionState {
  const chosen = chosenIndex === i;
  if (state === "reveal" && correctIndex !== null) return i === correctIndex ? "correct" : chosen ? "wrong" : "dim";
  return chosen ? "chosen" : "idle";
}

export function QuestionCard(props: QuestionCardProps) {
  const { roundKey, prompt, options, state, chosenIndex, correctIndex, onPick, lockedText, banner, footer } = props;
  const p = props.testIdPrefix ?? "duel";
  const rootRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ pointerId: number; option: number; downAt: number } | null>(null);
  const [sizeKey, setSizeKey] = useState(0);

  useEffect(() => {
    const onResize = () => setSizeKey((k) => k + 1);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Új kör: a félbemaradt lenyomás (a gomb letiltódott, mielőtt az ujj felemelkedett) nem blokkolhatja a következőt.
  useEffect(() => {
    press.current = null;
    for (const el of Array.from(rootRef.current?.querySelectorAll<HTMLElement>(".duel-option[data-pressed]") ?? [])) delete el.dataset.pressed;
  }, [roundKey]);

  useMeasureEffect(() => {
    const root = rootRef.current;
    const stage = root?.querySelector<HTMLElement>(".duel-stage");
    if (!root || !stage) return;
    const overflows = () =>
      stage.scrollHeight > stage.clientHeight + 1 ||
      Array.from(stage.querySelectorAll<HTMLElement>(".duel-option, .duel-prompt")).some((el) => el.scrollWidth > el.clientWidth + 1);
    let level = 0;
    root.dataset.fit = "0";
    while (level < DUEL_FIT_LEVELS - 1 && overflows()) {
      level += 1;
      root.dataset.fit = String(level);
    }
  }, [roundKey, state, chosenIndex, correctIndex, sizeKey, prompt]);

  const canPick = state === "open" && !!onPick;

  const onDown = useCallback((i: number, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canPick || e.button > 0 || press.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a rögzítés nélkül is megy */
    }
    press.current = { pointerId: e.pointerId, option: i, downAt: e.timeStamp };
    e.currentTarget.dataset.pressed = "true";
  }, [canPick]);

  const onUp = useCallback((i: number, e: ReactPointerEvent<HTMLButtonElement>) => {
    const cur = press.current;
    if (!cur || cur.pointerId !== e.pointerId) return;
    press.current = null;
    const el = e.currentTarget;
    delete el.dataset.pressed;
    const r = el.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside && cur.option === i && canPick) onPick!(i, cur.downAt);
  }, [canPick, onPick]);

  const onCancel = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const cur = press.current;
    if (!cur || cur.pointerId !== e.pointerId) return;
    press.current = null;
    delete e.currentTarget.dataset.pressed;
  }, []);

  return (
    <div ref={rootRef} className="duel-qcard" data-state={state} data-testid={`${p}-qcard`}>
      {banner}
      <div className="duel-stage">
        <div className="duel-q">
          <p className="duel-prompt" data-testid={`${p}-prompt`}>
            {prompt}
          </p>
          <div className="duel-options" role="group" aria-label="Válaszok">
            {options.map((opt, i) => {
              const st = optionStateFor(i, state, chosenIndex, correctIndex);
              if (st === "dim") return null;
              return (
                <button
                  key={i}
                  type="button"
                  className="duel-option"
                  data-state={st}
                  data-testid={`${p}-option-${i}`}
                  disabled={!canPick}
                  aria-pressed={chosenIndex === i}
                  onPointerDown={(e) => onDown(i, e)}
                  onPointerUp={(e) => onUp(i, e)}
                  onPointerCancel={onCancel}
                  onLostPointerCapture={onCancel}
                  onClick={(e) => {
                    // Billentyűzet / akadálymentes választás (érintésnél a pointerup dönt, a click `detail`-je ≥ 1).
                    if (e.detail === 0 && canPick) onPick!(i, null);
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {state === "locked" ? (
            <p className="duel-locked" data-testid={`${p}-locked`}>
              {lockedText ?? "Rögzítve ✓ Várjuk a többieket…"}
            </p>
          ) : null}
          {footer}
        </div>
      </div>
    </div>
  );
}

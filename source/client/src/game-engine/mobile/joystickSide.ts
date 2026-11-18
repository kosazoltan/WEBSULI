/**
 * A képernyő-joystick oldala — közös szövegszótár és tiszta segédek
 * (`docs/specs/2026-11-18-joystick-jobb-kez.md` D2, D3, D5).
 *
 * A beállítás maga a közös játékbeállítások között él (`play/gameSettings.ts`, `joystickSide`, alap: "right"): a joystick
 * a jobb hüvelykujjé, az akciógombok (tűz, ugrás, bányász …) a bal oldalon állnak; balkezes játékos megfordíthatja.
 *
 * Hogyan ér el a beállítás a képernyőig:
 *  - a közös keret (`GameShell`) a gyökerén hirdeti: `data-joystick-side="right|left"`;
 *  - a közös joystick (`VirtualJoystick`) gyökere `game-joystick` osztályú; az `index.css` közös szabálya jobb oldali
 *    beállításnál `order: 1`-et ad neki, így a flex vezérlősávban az utolsó (jobb szélső) helyre kerül;
 *  - a játékok saját tükrözése (gombcsoport belső rendje, oszlop helye) ugyanerre az attribútumra épülő CSS;
 *  - ami nem CSS (súgószöveg, a Kockavadász körbenéző zónája), az ebből a modulból jön.
 */
import { useSyncExternalStore } from "react";

import type { JoystickSide } from "@/game-engine/play/gameSettings";

export type { JoystickSide };

export function oppositeSide(side: JoystickSide): JoystickSide {
  return side === "right" ? "left" : "right";
}

/** A kapcsoló feliratai (egy helyen, hogy a szünet menü és a kezdő beállítások ugyanazt mondják). */
export const JOYSTICK_SIDE_TEXT = {
  label: "Joystick oldala",
  groupLabel: "Melyik oldalon legyen a joystick?",
  right: "Jobb oldalt",
  left: "Bal oldalt",
} as const;

const THUMB: Record<JoystickSide, { capital: string; lower: string }> = {
  right: { capital: "Jobb", lower: "jobb" },
  left: { capital: "Bal", lower: "bal" },
};

export type JoystickSideHintKey = "asteroid-start" | "blockcraft-start" | "blockcraft-play";

/**
 * Az oldalfüggő érintős súgók. A joystick hüvelykujja a `side`, a másik hüvelykujjé az ellentétes oldal — a szöveg így
 * soha nem mond „bal hüvelykujjat” a joystickra, ha az a jobb oldalon áll.
 */
export function joystickSideHint(key: JoystickSideHintKey, side: JoystickSide): string {
  const stick = THUMB[side];
  const other = THUMB[oppositeSide(side)];
  switch (key) {
    case "asteroid-start":
      return `${stick.capital} hüvelykujj: joystick · ${other.lower}: tűz (célzássegéddel), mellette a bomba.`;
    case "blockcraft-start":
      return `${stick.capital} hüvelykujj: mozgás (tárcsa) · ${other.lower} hüvelykujj: körbenézés húzással · koppintás a blokkra vagy Bányász gomb: kvíz.`;
    case "blockcraft-play":
      return `${stick.capital}: mozgás · ${other.lower}: nézelődés · koppintás: bányászás`;
  }
}

/**
 * Igaz, ha az `x` (a `width` széles felület bal szélétől mérve) a joystickkal ELLENTÉTES oldali, `share` arányú sávba
 * esik. Jobb oldali joysticknál ez a bal `share` rész, bal oldalinál a jobb `share` rész. Ismeretlen szélességnél
 * (`width <= 0`) megengedő: igaz.
 */
export function isOppositeZone(x: number, width: number, side: JoystickSide, share: number): boolean {
  if (width <= 0) return true;
  return side === "right" ? x <= width * share : x >= width * (1 - share);
}

/* ------------------------------ joystick-jelenlét ------------------------------ */

let mounted = 0;
const listeners = new Set<() => void>();

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * A `VirtualJoystick` felcsatoláskor hívja; a visszaadott függvény a lecsatolás. A közös szünet menü ebből tudja, hogy
 * a lapon van képernyő-joystick (csak akkor mutatja az oldal-kapcsolót).
 */
export function joystickMounted(): () => void {
  mounted += 1;
  for (const l of listeners) l();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mounted -= 1;
    for (const l of listeners) l();
  };
}

/** Van-e éppen felcsatolt képernyő-joystick (React nélkül, teszthez). */
export function joystickPresent(): boolean {
  return mounted > 0;
}

export function useJoystickPresent(): boolean {
  return useSyncExternalStore(subscribe, joystickPresent, () => false);
}

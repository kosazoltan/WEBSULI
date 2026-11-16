import { GAME_TEST_HOOKS_ENABLED } from "./game-test-hooks";

/**
 * Joystick-reakció (kanban #49) — mérő-kampó a bemenet → válasz lánchoz, csak teszt-kampós buildben
 * (`VITE_ENABLE_GAME_TEST_HOOKS=1`); éles buildben minden hívás üres.
 *
 * - `registerInputProbe(id, read)`: a játék a saját mozgásállapotát (pozíció, irány, sebesség, a tárcsa
 *   értéke) képkockánként olvashatóvá teszi — a mérő a `window.__websuliInput.probes[id]()`-t hívja.
 * - `countRender(id)`: komponens-render számláló (`window.__websuliInput.renders[id]`); a mérő ebből
 *   igazolja, hogy a tárcsa húzása nem renderel újra sem a tárcsát, sem a játéklapot.
 */

type InputProbeRegistry = {
  probes: Record<string, () => Record<string, number>>;
  renders: Record<string, number>;
};

declare global {
  interface Window {
    __websuliInput?: InputProbeRegistry;
  }
}

function registry(): InputProbeRegistry | null {
  if (!GAME_TEST_HOOKS_ENABLED || typeof window === "undefined") return null;
  if (!window.__websuliInput) window.__websuliInput = { probes: {}, renders: {} };
  return window.__websuliInput;
}

export function registerInputProbe(id: string, read: () => Record<string, number>): () => void {
  const reg = registry();
  if (!reg) return () => {};
  reg.probes[id] = read;
  return () => {
    if (reg.probes[id] === read) delete reg.probes[id];
  };
}

export function countRender(id: string): void {
  const reg = registry();
  if (!reg) return;
  reg.renders[id] = (reg.renders[id] ?? 0) + 1;
}

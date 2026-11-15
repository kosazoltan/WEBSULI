/**
 * S2 / terv 4.5 „Érintés” — a joystick sugara a képernyő rövidebb oldalához igazodik.
 *
 * min(szélesség, magasság) × 0,16, 52–76 px közé vágva: 360×640 → 58, 390×844 → 62, asztali 1366×768 → 76.
 * A 52 px-es alsó határ mellett az átmérő 104 px, a gomb (0,72 × sugár) is ≥ 37 px — hüvelykujjal fogható.
 */
export function controlRadiusFor(vp: { width: number; height: number }): number {
  const raw = Math.round(Math.min(vp.width, vp.height) * 0.16);
  return Math.min(76, Math.max(52, raw));
}

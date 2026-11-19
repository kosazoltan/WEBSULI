/**
 * A gyártási kapuk üzemmódja (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, SK szelet), EGY helyen:
 *  - `off`     — a kapu nem fut;
 *  - `report`  — mér és ment (telemetria, napló), de a gyártást NEM állítja meg;
 *  - `enforce` — bukásnál a kapu saját, véges következménye fut (legfeljebb egy célzott pótló forduló, utána megállás).
 */
export const GATE_MODE_VALUES = ["off", "report", "enforce"] as const;
export type GateMode = (typeof GATE_MODE_VALUES)[number];
export type GateName = "sourceCoverage";

/**
 * A `sourceCoverage` (SK1) `report` módban érkezik: a megjelenítők (S2) és az ábrakészítő bekötése (S3) nélkül minden forrásábrás
 * gyártás megállna. `enforce`-ra az S3b utolsó lépése kapcsolja, teszttel.
 */
export const GATE_MODES: Record<GateName, GateMode> = { sourceCoverage: "report" };

/** A kapu érvényes üzemmódja; `overrides`: a futás saját felülírása (teszt, mérőharness) — érvénytelen érték esetén az alapérték marad. */
export function gateMode(name: GateName, overrides?: Partial<Record<GateName, GateMode>>): GateMode {
  const override = overrides?.[name];
  return override && (GATE_MODE_VALUES as readonly string[]).includes(override) ? override : GATE_MODES[name];
}

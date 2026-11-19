import type { SkippedSourceVisual, SourceVisual } from "../../../shared/source-visuals";

/**
 * Determinisztikus gyártási kapuk (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, SK szelet; tulajdonosi elv: szkript ítéljen, ne
 * modell). Minden kapu tiszta függvény — modell és adatbázis nélkül —, a kimenete gépi: `{ gate, ok, problems[], metrics }`.
 */
export type GateResult = { gate: string; ok: boolean; problems: string[]; metrics: Record<string, number> };

/** A kapuk a leckét szerkezetileg olvassák (a jövőbeli ábrafajtájú blokk sem dob hibát) — a séma megítélése nem a kapu dolga. */
export type GateLesson = { sections: ReadonlyArray<{ blocks: ReadonlyArray<object> }> };

/** A bejegyzett kapuk közös bemenete (a parancssori futtató és az SK5 alapvonal-mérője ezt adja át). */
export type GateInput = { lesson: GateLesson; visuals: ReadonlyArray<SourceVisual>; skipped?: ReadonlyArray<SkippedSourceVisual> };
export type GateFn = (input: GateInput) => GateResult;

/** Név → kapu. Minden kapu a saját moduljában jegyzi be magát (`registerGate`); az SK5 őr-tesztje ebből olvas. */
export const GATE_REGISTRY: Record<string, GateFn> = {};

export function registerGate(name: string, gate: GateFn): void {
  if (GATE_REGISTRY[name] && GATE_REGISTRY[name] !== gate) throw new Error(`A(z) „${name}” kapu már be van jegyezve.`);
  GATE_REGISTRY[name] = gate;
}

/** Minden bejegyzett kapu futtatása ugyanazon a bemeneten, név szerinti sorrendben (determinisztikus kimenet). */
export function runRegisteredGates(input: GateInput): GateResult[] {
  return Object.keys(GATE_REGISTRY).sort().map((name) => GATE_REGISTRY[name](input));
}

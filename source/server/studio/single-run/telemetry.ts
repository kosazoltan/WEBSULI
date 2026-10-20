/**
 * Egyfutásos gyártás — futásonkénti telemetria (docs/specs/2026-10-16-egyfutas-atvilagitas.md, J3; végrehajtás:
 * 2026-10-16-egy-futas-vegrehajtas.md). Állomásonként a fordulók, a javító fordulók, a token (be / gyorsítótár / ki) és az idő; a friss
 * (előzmény nélküli) hívások összesen; a kapuk eseményei; a tartalékváltás. A job `output.telemetry` mezőjébe kerül, utólag visszamérhető.
 */
import { LESSON_MODELS } from "../../ai/models";
import type { ModelReply } from "./conversation";
import type { RunGates, RunTelemetry, StationTelemetry } from "../../../shared/run-telemetry";

export type { RunGates, RunTelemetry, StationTelemetry } from "../../../shared/run-telemetry";
export { telemetryOf } from "../../../shared/run-telemetry";

const emptyGates = (): RunGates => ({ answerKeyNotes: 0, answerKeyFails: 0, quizBlindRemoved: 0, lektorRemoved: 0, rubricTightened: 0, outputTruncated: 0, lengthOverBudget: false, lengthShortened: false });

/** A futás telemetriájának gyűjtője. `previous`: folytatásnál a megszakadt futás mentett telemetriája (az idő és a számok összeadódnak). */
export class TelemetryRecorder {
  private readonly started: number;
  private readonly stations: Record<string, StationTelemetry>;
  private readonly freshTotals: RunTelemetry["fresh"];
  private readonly models: Set<string>;
  private readonly baseMs: number;
  readonly gates: RunGates;

  constructor(previous?: RunTelemetry | null, private readonly now: () => number = Date.now) {
    this.started = now();
    this.stations = structuredClone(previous?.stations ?? {});
    this.freshTotals = { ...(previous?.fresh ?? { calls: 0, input: 0, cached: 0, output: 0 }) };
    this.models = new Set(previous?.models ?? []);
    this.baseMs = previous?.totalMs ?? 0;
    this.gates = { ...emptyGates(), ...(previous?.gates ?? {}) };
  }

  /** Egy modellforduló: `fix` = javító forduló az állomáson belül; `fresh` = előzmény nélküli beszélgetésben futott. */
  record(station: string, reply: Pick<ModelReply, "model" | "usage">, ms: number, opts: { fix?: boolean; fresh?: boolean } = {}): void {
    const s = (this.stations[station] ??= { turns: 0, fixTurns: 0, input: 0, cached: 0, output: 0, ms: 0 });
    const input = reply.usage?.input ?? 0;
    const cached = reply.usage?.cachedInput ?? 0;
    const output = reply.usage?.output ?? 0;
    s.turns++; if (opts.fix) s.fixTurns++;
    s.input += input; s.cached += cached; s.output += output; s.ms += Math.max(0, Math.round(ms));
    if (opts.fresh) { this.freshTotals.calls++; this.freshTotals.input += input; this.freshTotals.cached += cached; this.freshTotals.output += output; }
    this.models.add(reply.model);
  }

  snapshot(model: string): RunTelemetry {
    const models = [...this.models];
    return { version: 1, model, fallback: models.includes(LESSON_MODELS.fallback), models, totalMs: this.baseMs + Math.max(0, this.now() - this.started),
      stations: structuredClone(this.stations), fresh: { ...this.freshTotals }, gates: { ...this.gates } };
  }
}

/** Egy állomás-forduló időmérése és rögzítése (a hiba változatlanul továbbmegy). */
export async function timed(recorder: TelemetryRecorder | undefined, station: string, send: () => Promise<ModelReply>, opts: { fix?: boolean; fresh?: boolean } = {}): Promise<ModelReply> {
  const start = Date.now();
  const reply = await send();
  recorder?.record(station, reply, Date.now() - start, opts);
  // Spec 2026-10-20-bank-kimeneti-keret: minden levágott forduló számít (a hívó dönt az újrapróbáról).
  if (recorder && reply.truncated) recorder.gates.outputTruncated = (recorder.gates.outputTruncated ?? 0) + 1;
  return reply;
}

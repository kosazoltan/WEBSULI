/**
 * Egyfutásos gyártás — a futás telemetriájának alakja és a felület nézete (docs/specs/2026-10-16-egyfutas-atvilagitas.md, J3).
 * A szerver (`server/studio/single-run/telemetry.ts`) gyűjti; a `GET /api/studio/jobs/:id` `produced.telemetry`-ként adja; a JobMonitor mutatja.
 */
export type StationTelemetry = { turns: number; fixTurns: number; input: number; cached: number; output: number; ms: number };
export type RunGates = {
  /** A szócsoport-pontozóval elvben megkülönböztethetetlen (nem blokkoló) hibás próbák (J1). */
  answerKeyNotes: number;
  /** A válaszkulcs-teszten blokkolóan bukott hibás próbák (bankkísérletenként számolva). */
  answerKeyFails: number;
  /** A kvíz vak előszűrője szerint kivett kvíztételek. */
  quizBlindRemoved: number;
  /** A lektor szerint hibás, kivett banktételek. */
  lektorRemoved: number;
  /** Spec 2026-10-20-s4 (S4a): a közzétett bank gépileg szigorított (S3c) feladatai. Régi telemetriában hiányzik (= 0). */
  rubricTightened?: number;
  /** A Tananyag lap a szókeret fölött maradt (a rövidítő forduló után is). */
  lengthOverBudget: boolean;
  /** A szókeret-túllépés rövidítő fordulója elfogadott, rövidebb leckét adott (J5). */
  lengthShortened: boolean;
};
export type RunTelemetry = {
  version: 1;
  model: string;
  /** A tartalékmodell válaszolt-e bármelyik fordulóban. */
  fallback: boolean;
  models: string[];
  totalMs: number;
  stations: Record<string, StationTelemetry>;
  fresh: { calls: number; input: number; cached: number; output: number };
  gates: RunGates;
};

/** A mentett telemetria biztonságos kiolvasása (régi jobnál nincs). */
export function telemetryOf(output: unknown): RunTelemetry | null {
  const t = (output as { telemetry?: unknown } | null)?.telemetry as Partial<RunTelemetry> | undefined;
  return t && t.version === 1 && t.stations && typeof t.stations === "object" ? t as RunTelemetry : null;
}

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M` : n >= 1000 ? `${Math.round(n / 1000)} e` : String(n));
const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

export type TelemetryView = {
  summary: string;
  rows: Array<{ station: string; turns: string; input: string; cachedPct: string; output: string; time: string }>;
  gates: string[];
};

/** A JobMonitor kompakt táblája: állomásonként forduló (javító), bemenet, gyorsítótár-arány, kimenet, idő; összegzés és kapuesemények. */
export function telemetryView(t: RunTelemetry): TelemetryView {
  const all = Object.values(t.stations);
  const input = all.reduce((s, x) => s + x.input, 0);
  const cached = all.reduce((s, x) => s + x.cached, 0);
  const output = all.reduce((s, x) => s + x.output, 0);
  const turns = all.reduce((s, x) => s + x.turns, 0);
  const pct = (c: number, i: number) => (i > 0 ? `${Math.round((100 * c) / i)}%` : "—");
  const g = t.gates;
  return {
    summary: `${t.model}${t.fallback ? " (tartalékváltással)" : ""} · ${seconds(t.totalMs)} · ${turns} forduló (${t.fresh.calls} friss) · bemenet ${tokens(input)} (${pct(cached, input)} gyorsítótárból) · kimenet ${tokens(output)}`,
    rows: Object.entries(t.stations).map(([station, s]) => ({
      station, turns: s.fixTurns ? `${s.turns} (${s.fixTurns} javító)` : String(s.turns), input: tokens(s.input), cachedPct: pct(s.cached, s.input), output: tokens(s.output), time: seconds(s.ms),
    })),
    gates: [
      ...(g.answerKeyFails ? [`Válaszkulcs-teszt bukás (javítókör): ${g.answerKeyFails}`] : []),
      ...(g.answerKeyNotes ? [`Válaszkulcs-teszt, nem blokkoló (a pontozó nem különbözteti meg): ${g.answerKeyNotes}`] : []),
      ...(g.quizBlindRemoved ? [`Kvíz vak előszűrő kivett: ${g.quizBlindRemoved}`] : []),
      ...(g.lektorRemoved ? [`Lektor szerint hibás, kivett banktétel: ${g.lektorRemoved}`] : []),
      ...(g.rubricTightened ? [`Gépi rubrika-szigorítás (feladat): ${g.rubricTightened}`] : []),
      ...(g.lengthShortened ? ["A szókeret-túllépés rövidítő fordulóval javítva"] : []),
      ...(g.lengthOverBudget ? ["A Tananyag lap a szókeret fölött maradt"] : []),
    ],
  };
}

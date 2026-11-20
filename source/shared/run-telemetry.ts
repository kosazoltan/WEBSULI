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
  /** Spec 2026-10-20-bank-kimeneti-keret: a kimeneti keretnél levágott modellválaszok (a válasz elveszett, újragenerálás kellett). */
  outputTruncated?: number;
  /** Spec 2026-11-18-tananyag-gyartas-minoseg (S1a): a térkép vizuális leltárának tételszáma. Régi telemetriában hiányzik. */
  visualsFound?: number;
  /** S6b (2026-11-20-tgm-valtozatossag-abrak, 13. szakasz): a kész lecke try-t tartalmazó fejezeteinek aránya (BE kapcsolónál). */
  tryShare?: number;
  /** S6c (14. szakasz): a lecke nem forráshoz kötött ábráinak fajtánkénti darabszáma (BE kapcsolónál). */
  visualKinds?: Record<string, number>;
  /** Az 1. állomás leltárából a program által kihagyott hibás tételek (javító forduló nélkül). */
  visualsDropped?: number;
  /** S2a (review B1): a szerző kimenetéből kivett, hibás paraméterű (kirajzolhatatlan) forrás-ábra blokkok száma. */
  undrawableVisualsDropped?: number;
  /** Ebből ennyi kivétel OKA került a modellnek szóló javító üzenetbe (a kivétel után kapu bukott — vak ellenőr B1). */
  undrawableVisualsExplained?: number;
  /** A megtartott tételekből törölt, nem létező fogalom-hivatkozások száma (review J2). */
  visualsConceptRefsRemoved?: number;
  /** A megtartott táblázatok csonkolt (túl hosszú) celláinak és fejléceinek száma (review U1). */
  visualsCellsTruncated?: number;
  /** 1, ha az 1. állomás válaszában nem volt `visuals` tömb (a futás üres leltárral megy tovább). */
  visualsMissing?: number;
  /** Egy determinisztikus gyártási kapu kivételt dobott (a futás ment tovább) — független review F12. Régi telemetriában hiányzik. */
  gateErrors?: number;
  /** A Tananyag lap a szókeret fölött maradt (a rövidítő forduló után is). */
  lengthOverBudget: boolean;
  /** A szókeret-túllépés rövidítő fordulója elfogadott, rövidebb leckét adott (J5). */
  lengthShortened: boolean;
};
/**
 * Spec 2026-11-18-tananyag-gyartas-minoseg (SK szelet): egy determinisztikus gyártási kapu mentett eredménye. `mode`: a kapu üzemmódja
 * a futásban (`report` — csak mér; `enforce` — bukásnál megállít). A szövegek és a listák vágva kerülnek a telemetriába.
 */
export type RunGateResult = { gate: string; mode: string; ok: boolean; problems: string[]; metrics: Record<string, number>; missingIds?: string[] };
export const RUN_GATE_RESULT_LIMITS = { results: 20, problems: 20, problemChars: 200, missingIds: 60 } as const;

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
  /** A determinisztikus gyártási kapuk eredményei futási sorrendben (SK1: forrás-fedettség). Régi telemetriában hiányzik. */
  gateResults?: RunGateResult[];
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
  const sourceCoverage = (t.gateResults ?? []).filter((r) => r.gate === "sourceCoverage").at(-1);
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
      ...(g.outputTruncated ? [`Levágott modellválasz (kimeneti keret): ${g.outputTruncated}`] : []),
      ...(g.visualsFound ? [`A forrás vizuális leltára: ${g.visualsFound} tétel`] : []),
      ...(g.visualsDropped ? [`A vizuális leltárból kihagyott hibás tétel: ${g.visualsDropped}`] : []),
      ...(g.undrawableVisualsDropped ? [`Hibás paraméterű (kirajzolhatatlan) táblázat / szabálydoboz / kártya blokk kivéve: ${g.undrawableVisualsDropped}`] : []),
      ...(g.visualsConceptRefsRemoved ? [`A vizuális leltárból törölt, nem létező fogalom-hivatkozás: ${g.visualsConceptRefsRemoved}`] : []),
      ...(g.visualsCellsTruncated ? [`A vizuális leltár csonkolt (túl hosszú) cellái: ${g.visualsCellsTruncated}`] : []),
      ...(g.visualsMissing ? ["A forrás-állomás válaszából hiányzott a vizuális leltár"] : []),
      ...(sourceCoverage && sourceCoverage.metrics.total ? [`Forrás-fedettség (${sourceCoverage.mode === "enforce" ? "éles kapu" : "csak mérés"}): ${sourceCoverage.metrics.shown}/${sourceCoverage.metrics.total - sourceCoverage.metrics.skipped} vizuális tétel jelent meg${sourceCoverage.ok ? "" : " — a kapu szerint hiányos"}`] : []),
      ...(g.gateErrors ? [`Gyártási kapu hibája (a futás ment tovább): ${g.gateErrors}`] : []),
      ...(g.lengthShortened ? ["A szókeret-túllépés rövidítő fordulóval javítva"] : []),
      ...(g.lengthOverBudget ? ["A Tananyag lap a szókeret fölött maradt"] : []),
    ],
  };
}

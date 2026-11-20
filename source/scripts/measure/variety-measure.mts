/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (15. szakasz; V28): a kiadott (vagy próbafutásban gyártott) leckék
 * változatossága a küszöbökhöz mérve — csak olvas; hálózat, véletlen és óra nélkül. A mérőszámok forrása: shared/variety-metrics.ts.
 * Használat (a `source/` mappából):
 *   node --import tsx scripts/measure/variety-measure.mts --population <population.json> --baseline scripts/measure/fixtures/variety-baseline.json [--since 2026-11-20]
 * Bemenet: JSON tömb, elemenként { published_at?, json: <Lesson JSON> } (a `variety-fetch.mjs` kimenete).
 * Kilépési kód: 0 = minden küszöb teljesül VAGY kis minta (< 10 lecke); 1 = küszöbsértés; 2 = hibás használat.
 */
import { readFileSync } from "node:fs";
import { measureVariety, thresholdReport } from "../../shared/variety-metrics";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const populationPath = arg("--population");
const baselinePath = arg("--baseline");
if (!populationPath || !baselinePath) {
  process.stderr.write("Használat: --population <json> --baseline <json> [--since <dátum>]\n");
  process.exit(2);
}
const since = arg("--since");
const rows = JSON.parse(readFileSync(populationPath, "utf8")) as Array<{ published_at?: string; json?: { sections?: unknown } }>;
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Record<string, number>;
const lessons = rows
  .filter((r) => !since || (typeof r.published_at === "string" && r.published_at >= since))
  .map((r) => r.json)
  .filter((j): j is { sections: Array<{ blocks: Array<{ kind?: unknown }> }> } => !!j && Array.isArray(j.sections));
const m = measureVariety(lessons);
const label: Record<string, string> = {
  topPatternShare: "leggyakoribb fejezetminta",
  samePatternProbability: "azonos minta valószínűsége",
  topFeedbackOpenerShare: "leggyakoribb hibás-nyitás",
  tryShare: "try a fejezetek arányában",
};
const base: Record<string, number | undefined> = {
  topPatternShare: baseline.topPatternShare, samePatternProbability: baseline.samePatternProbability,
  topFeedbackOpenerShare: baseline.topFeedbackOpenerShare, tryShare: undefined,
};
const hu = (x: number | undefined) => (x === undefined ? "–" : String(x).replace(".", ","));
const report = thresholdReport(m);
const lines = [
  `Mért leckék: ${m.lessons} (fejezet: ${m.sections})${since ? `, ${since} óta` : ""}`,
  "| mutató | alapvonal | most | küszöb | megfelel |",
  "|---|---:|---:|---:|---|",
  ...report.map((r) => `| ${label[r.metric]} | ${hu(base[r.metric])} | ${r.value} | ${r.metric === "tryShare" ? "≥" : "<"} ${hu(r.threshold)} | ${r.ok ? "igen" : "NEM"} |`),
];
const small = m.lessons < 10;
if (small) lines.push(`kis minta (${m.lessons} < 10 lecke) — a küszöb nem ítél`);
process.stdout.write(`${lines.join("\n")}\n`);
process.exitCode = small || report.every((r) => r.ok) ? 0 : 1;

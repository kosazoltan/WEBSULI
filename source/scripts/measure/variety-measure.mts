/**
 * SK2 — változatosság-mérés az élő (vagy bármely) adatbázis publikált leckéin, írásvédett tranzakcióban.
 *
 *   npx tsx scripts/measure/variety-measure.mts [--since 2026-11-24] [--baseline scripts/measure/fixtures/variety-baseline.json] [--out <fájl>]
 *
 * Kimenet: táblázat (alapvonal | most | küszöb | megfelel). Kilépési kód: 1, ha legalább 10 leckénél valamelyik állományszintű
 * küszöb nem teljesül; kevesebb leckénél „kis minta” jelzés, 0. Csak összesített szám kerül a kimenetbe (nincs cím, azonosító).
 * A DATABASE_URL a környezetből jön (soron belüli előtag), a szkript nem írja ki.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { failedThresholds, varietyReport, VARIETY_THRESHOLDS, type VarietyLesson, type VarietyReport } from "../../shared/variety-metrics";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
export const MIN_SAMPLE = 10;

export function measureTable(now: VarietyReport, baseline: Partial<VarietyReport> | null): { rows: string[]; failed: string[]; small: boolean } {
  const failed = failedThresholds(now);
  const small = now.lessons < MIN_SAMPLE;
  const line = (name: keyof VarietyReport, limit: number | null) => {
    const b = baseline?.[name];
    const ok = limit === null ? "—" : (now[name] as number) <= limit ? "igen" : "NEM";
    return `| ${name} | ${b ?? "—"} | ${now[name]} | ${limit === null ? "—" : `≤ ${Math.round(limit * 1000) / 1000}`} | ${ok} |`;
  };
  const rows = [
    `leckék: ${now.lessons}, fejezetek: ${now.sections}${small ? ` — KIS MINTA (< ${MIN_SAMPLE}), a küszöb nem ítél` : ""}`,
    "| mérőszám | alapvonal | most | küszöb | megfelel |", "| --- | --- | --- | --- | --- |",
    line("topPatternShare", VARIETY_THRESHOLDS.topPatternShare),
    line("samePatternProbability", VARIETY_THRESHOLDS.samePatternProbability),
    line("topFeedbackOpenerShare", VARIETY_THRESHOLDS.topFeedbackOpenerShare),
    line("legacyOpeners", null), line("kindHeavyLessonShare", null), line("lowTryLessonShare", null),
  ];
  return { rows, failed, small };
}

async function main() {
  const since = arg("--since") ?? "1970-01-01";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("--since: ÉÉÉÉ-HH-NN");
  const baselinePath = arg("--baseline");
  const baseline = baselinePath ? (JSON.parse(readFileSync(baselinePath, "utf8")) as Partial<VarietyReport>) : null;
  const { withReadOnlyDb } = await import("../lib/read-only-db");
  const rows = await withReadOnlyDb((query) => query<{ json: { sections?: VarietyLesson["sections"] } }>(
    // anyagonként a legutóbbi publikált változat; a szűrés a változat létrehozására vonatkozik
    "SELECT DISTINCT ON (coalesce(l.html_file_id, l.id)) l.json FROM lessons l WHERE l.published_at IS NOT NULL AND l.created_at >= $1::date " +
    "ORDER BY coalesce(l.html_file_id, l.id), l.version DESC, l.published_at DESC", [since]), { snapshot: true });
  const lessons = rows.map((r) => r.json).filter((j): j is VarietyLesson => Array.isArray(j?.sections));
  const report = varietyReport(lessons);
  const t = measureTable(report, baseline);
  console.log(t.rows.join("\n"));
  const out = arg("--out");
  if (out) writeFileSync(out, JSON.stringify({ since, report }, null, 2));
  process.exitCode = !t.small && t.failed.length ? 1 : 0;
}

if (process.argv[1] && /variety-measure\.mts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, "<URL>") : e); process.exitCode = 2; });
}

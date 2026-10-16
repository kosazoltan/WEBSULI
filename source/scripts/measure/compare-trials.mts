// Spec 2026-10-14-tananyag-tomorseg-lefedettseg: a próbaharness két változatának összevetése térképenként (alapvonal vs S2).
// Futtatás (source/ mappából): npx tsx scripts/measure/compare-trials.mts <mappa> <alapvonal-címkék vesszővel> <új címke>
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Row = Record<string, unknown> & { mapId: string; title?: string; error?: string };
const [dir, baseLabels, newLabel] = process.argv.slice(2);
const load = (label: string): Row[] => (existsSync(`${dir}/${label}-summary.json`) ? JSON.parse(readFileSync(`${dir}/${label}-summary.json`, "utf8")) : []);
// alapvonal: térképenként az első SIKERES futás a megadott címkék sorrendjében
const base = new Map<string, Row>();
for (const label of baseLabels.split(",")) for (const r of load(label)) if (!r.error && !base.has(r.mapId)) base.set(r.mapId, { ...r, label });
const next = load(newLabel);
const pct = (a: number, b: number) => (b ? Math.round((100 * (a - b)) / b) : null);
const rows = next.map((n) => {
  const b = base.get(n.mapId);
  const words = (r?: Row) => r?.visibleWords as number | undefined;
  return {
    térkép: String(n.title ?? b?.title ?? n.mapId).slice(0, 26), forrásSzó: (n.sourceWords ?? b?.sourceWords) as number,
    "alap szó": words(b), "új szó": n.error ? `HIBA` : words(n), "Δ szó %": b && !n.error ? pct(words(n)!, words(b)!) : null,
    "alap fej.": b?.sections, "új fej.": n.sections,
    "alap forrás→lecke%": b?.sourceInLessonPct, "új forrás→lecke%": n.sourceInLessonPct,
    "alap nem-forrás%": b?.nonSourcePct, "új nem-forrás%": n.nonSourcePct,
    "alap ism%": b?.repetitionPct, "új ism%": n.repetitionPct,
    "alap kapu/ív": b ? `${b.coverageGateOk ? "OK" : "BUK"}/${b.arcOk ? "OK" : "BUK"}` : "–", "új kapu/ív": n.error ? "–" : `${n.coverageGateOk ? "OK" : "BUK"}/${n.arcOk ? "OK" : "BUK"}`,
    "alap s": b?.seconds, "új s": n.seconds, hiba: n.error ? String(n.error).slice(0, 160) : "",
  };
});
console.table(rows);
writeFileSync(`${dir}/compare-${newLabel}.json`, JSON.stringify(rows, null, 2));

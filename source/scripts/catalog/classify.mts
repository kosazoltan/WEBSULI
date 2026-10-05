// Spec 2026-10-05-s2-tartalom-besorolas: tartalom alapú besorolás a kinyert katalógusból (S1: .catalog/<dátum>-items.json).
// Futtatás: npx tsx scripts/catalog/classify.mts --pilot   (a 10 előre rögzített lecke; tulajdonosi engedéllyel, fizetős)
//           npx tsx scripts/catalog/classify.mts --all     (mind a 201 lecke — külön engedéllyel)
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSIFIER_MODELS, classificationInput, classifyWithConsensus, type ClassifyCall } from "../../server/catalog/classify";
import type { CatalogItemDraft } from "../../server/catalog/catalog-item";
import { callStepModel } from "../../server/studio/run-step";
import { createStudioStepProvider } from "../../server/ai/studio-provider";

type Item = CatalogItemDraft & { lessonTitle: string; classroom: number | null; source: "legacy" | "fusion" };
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const mode = process.argv.includes("--all") ? "all" : process.argv.includes("--pilot") ? "pilot" : null;
if (!mode) throw new Error("Add meg: --pilot vagy --all");
const day = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 10);

const items = JSON.parse(readFileSync(resolve(here, "../../.catalog", `${day}-items.json`), "utf8")) as Item[];
const byLesson = new Map<string, Item[]>();
for (const i of items) { const g = byLesson.get(i.provenance); if (g) g.push(i); else byLesson.set(i.provenance, [i]); }

const expected = JSON.parse(readFileSync(resolve(repoRoot, "docs/measurements/2026-10-05-classify-pilot-expected.json"), "utf8")) as {
  lessons: Array<{ provenance: string; subject: string[]; lessonType: string[] }>;
};
const targets = mode === "pilot"
  ? expected.lessons.map((e) => { const key = [...byLesson.keys()].find((k) => k.startsWith(e.provenance)); if (!key) throw new Error(`Nincs ilyen lecke a katalógusban: ${e.provenance}`); return key; })
  : [...byLesson.keys()];

const call: ClassifyCall = async (model, system, user) => {
  const res = await callStepModel(createStudioStepProvider(model, "topicFocus"), { step: "pedagogue", policy: "topicFocus", role: "catalog-classifier", model, system, user });
  return { json: res.json, usage: { promptTokens: res.usage?.promptTokens ?? 0, completionTokens: res.usage?.completionTokens ?? 0 } };
};
const models = [...CLASSIFIER_MODELS];
const results: Array<Record<string, unknown>> = [];
let tokensIn = 0, tokensOut = 0;
// Mért (2026-10-05): a teljes futás a háttér-időkorláton megszakadt, és a csak a végén írt eredmény elveszett. Leckénként
// hozzáfűzött ellenőrzőpont: újraindításkor a kész lecke nem fut (és nem kerül) újra.
const partialPath = resolve(here, "../../.catalog", `${day}-classify-${mode}.partial.jsonl`);
const done = new Map<string, Record<string, unknown>>();
if (existsSync(partialPath)) for (const line of readFileSync(partialPath, "utf8").split(/\r?\n/)) if (line.trim()) { const r = JSON.parse(line) as Record<string, unknown>; done.set(String(r.provenance), r); }
// A teljes futás (201 lecke) sorosan > 3 óra — leckénként független hívások, ezért korlátozott párhuzamossággal; a sorrend a célok sorrendje.
const CONCURRENCY = Number(process.env.CLASSIFY_CONCURRENCY ?? 6);
async function classifyOne(provenance: string, at: number): Promise<void> {
  const saved = done.get(provenance);
  if (saved) {
    results[at] = saved;
    const u = saved.usage as { promptTokens?: number; completionTokens?: number } | undefined;
    tokensIn += u?.promptTokens ?? 0; tokensOut += u?.completionTokens ?? 0;
    return;
  }
  const input = classificationInput(byLesson.get(provenance)!);
  const started = Date.now();
  // Self-consistency: két független modell; eltérésnél admin-átnézés (S3), nem csendes döntés.
  const res = await classifyWithConsensus(input, models, call);
  tokensIn += res.usage.promptTokens; tokensOut += res.usage.completionTokens;
  const exp = expected.lessons.find((e) => provenance.startsWith(e.provenance));
  const row: Record<string, unknown> = { provenance, title: input.title, ms: Date.now() - started, usage: res.usage, status: res.status };
  if (res.status === "agreed") {
    Object.assign(row, { models: res.models, ...res.classification });
    if (exp) Object.assign(row, { subjectOk: exp.subject.includes(res.classification.subject), typeOk: exp.lessonType.includes(res.classification.lessonType) });
  } else if (res.status === "review") {
    Object.assign(row, { reason: res.reason, candidates: res.candidates });
    if (exp) Object.assign(row, { expectedAmongCandidates: res.candidates.some((c) => exp.subject.includes(c.classification.subject)) });
  } else Object.assign(row, { reason: res.reason });
  results[at] = row;
  appendFileSync(partialPath, JSON.stringify(row) + "\n");
  const label = res.status === "agreed" ? `${res.classification.subject} / ${res.classification.lessonType} / ${res.classification.grade} / ${res.classification.topic}` : res.reason.slice(0, 140);
  console.log(`${res.status === "agreed" ? "✓" : res.status === "review" ? "?" : "✗"} ${input.title.slice(0, 50).padEnd(50)} → ${label}${exp && res.status === "agreed" ? `  [tantárgy ${row.subjectOk ? "OK" : "ELTÉR"}, típus ${row.typeOk ? "OK" : "ELTÉR"}]` : ""}`);
}
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, async () => { while (next < targets.length) { const at = next++; await classifyOne(targets[at], at); } }));
const graded = results.filter((r) => r.subjectOk !== undefined);
const summary = {
  measuredAt: new Date().toISOString(), mode, models, lessons: results.length,
  agreed: results.filter((r) => r.status === "agreed").length,
  review: results.filter((r) => r.status === "review").length,
  unclassified: results.filter((r) => r.status === "unclassified").length,
  // Review #189: az egyezés a KÉZI mércéjű 10 pilot-leckére vonatkozik (a teljes futásban is) — a név ezt mondja ki.
  pilotSubjectAgreement: `${graded.filter((r) => r.subjectOk).length}/${expected.lessons.length}`,
  pilotTypeAgreement: `${graded.filter((r) => r.typeOk).length}/${expected.lessons.length}`,
  tokens: { in: tokensIn, out: tokensOut, perLessonIn: Math.round(tokensIn / Math.max(1, results.length)), perLessonOut: Math.round(tokensOut / Math.max(1, results.length)) },
  results,
};
mkdirSync(resolve(repoRoot, "docs/measurements"), { recursive: true });
writeFileSync(resolve(repoRoot, "docs/measurements", `${day}-classify-${mode}.json`), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ agreed: summary.agreed, review: summary.review, unclassified: summary.unclassified, pilotSubjectAgreement: summary.pilotSubjectAgreement, pilotTypeAgreement: summary.pilotTypeAgreement, tokens: summary.tokens }));

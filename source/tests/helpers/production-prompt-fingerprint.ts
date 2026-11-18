/**
 * A gyártás MODELLNEK KÜLDÖTT kéréseinek lenyomata egy rögzített, modell nélküli (forgatókönyves) mintafutáson
 * (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, 0. elv: önálló beolvaszthatóság).
 *
 * A motor modulját PARAMÉTERKÉNT kapja, ezért ugyanez a mintafutás a főág kódján is lefuttatható — a
 * `tests/source-visuals-flag.test.ts` rögzített lenyomatai így állíthatók elő újra (a `source/` mappából):
 *
 *   mkdir .main-ref
 *   git archive origin/main:source server shared | tar -x -C .main-ref
 *   node --import tsx tests/helpers/production-prompt-fingerprint.ts .main-ref
 *   (utána a .main-ref mappa törlendő — nem része a repónak)
 *
 * A forgatókönyv szándékosan „rosszindulatú”: a modell az 1. állomáson KÉRETLENÜL is ad `visuals` mezőt, a térképről indított
 * futásban pedig a térképen korábban mentett leltár áll — a főág mindkettőt figyelmen kívül hagyja.
 */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { standardFusionFixture } from "../../shared/fixtures/lesson-fusion";

type Block = { type: string; text?: string; file?: { name: string } };
type Turn = { blocks: Block[] };
type Engine = { runSingleLesson(input: never, deps: never): Promise<unknown>; singleRunSystemPrompt(): string };
type ConversationCtor = new (system: string, client: never, state: null) => unknown;
/** `newKinds`: új forrásból, de a modell a 3. állomás ELSŐ válaszában és a 4. állomás foltjában KÉRETLENÜL új fajtájú (`table`) ábrát ad. */
/**
 * `strayId` / `strayIdMap` (vak ellenőr B1): a modell a szerzői leckében (példa- és ábrablokkon) és a 4. állomás RÉGI fajtájú ábrafoltján
 * KÉRETLENÜL `sourceVisualId` mezőt ad — új forrásból, illetve tárolt leltáras térképről indítva.
 * `mixed` (vak ellenőr J1): az ELSŐ szerzői válaszban új fajtájú ábrablokk ÉS egy másik sémahiba (üres példamegoldás) is van.
 */
export type FingerprintScenario = "source" | "map" | "newKinds" | "strayId" | "strayIdMap" | "mixed";
const FROM_MAP: ReadonlyArray<FingerprintScenario> = ["map", "strayIdMap"];
const STRAY: ReadonlyArray<FingerprintScenario> = ["strayId", "strayIdMap"];

const fixture = standardFusionFixture();
const TRANSCRIPT = "A téglalap területe az oldalak szorzata. A terület mértékegysége a négyzetcentiméter.";
const SECOND = "A négyzet minden oldala egyenlő hosszú.";
export const FINGERPRINT_FILES = [{ name: "forras.txt", kind: "text" as const, content: TRANSCRIPT }, { name: "masik.txt", kind: "text" as const, content: SECOND }];
/** A modell kéretlen (illetve a térképen korábban mentett) leltára. */
export const FINGERPRINT_VISUALS = [
  { id: "v1", kind: "table", sourceFile: "forras.txt", page: 1, role: "A terület mértékegységei.", conceptIds: ["area"], data: { headers: ["mennyiség", "mértékegység"], rows: [["terület", "négyzetcentiméter"]] } },
  { id: "v2", kind: "process", sourceFile: "forras.txt", page: 1, role: "A számolás lépései.", conceptIds: [], data: { steps: ["Mérd meg az oldalakat.", "Szorozd össze őket."] } },
];

/** A forgatókönyv kéretlen, de ÉRVÉNYES paraméterű táblázata (a forrás szavaiból) — blokként a 3., foltként a 4. állomáson. */
export const FINGERPRINT_TABLE = { headers: ["mennyiség", "mértékegység"], rows: [["terület", "négyzetcentiméter"]] };
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export type FingerprintRun = { fingerprint: string; /** A futás naplósorainak és a közzétett leckének a lenyomata (a kimenet határának méréséhez). */ logsHash: string; lessonHash: string; prompts: string[]; stations: string[]; maps: Array<{ visuals?: unknown }>; gates: Record<string, unknown>; logs: string[];
  /** A job utolsó mentett telemetriája, a közzététel kérése (`publishLesson` argumentuma) és a mentett lecke. */
  telemetry: Record<string, unknown>; published: Record<string, unknown> | null; lesson: unknown };
/** `reply`: egy állomás forgatókönyves válaszának cseréje (a visszaadott érték megy a modell válaszaként; `undefined` → az alap). */
export type FingerprintOptions = { reply?(station: string, fallback: unknown, request: string): unknown };

export async function productionPromptRun(engine: Engine, Conversation: ConversationCtor, scenario: FingerprintScenario, extraDeps: Record<string, unknown> = {}, options: FingerprintOptions = {}): Promise<FingerprintRun> {
  const prompts: string[] = [];
  const stations: string[] = [];
  const { experience: _bank, ...teaching } = fixture;
  const outline = { sections: [{ heading: fixture.sections[0].heading, conceptIds: ["area"], plannedBlocks: ["explain", "example", "animate", "recap"], animationSuggestions: [] }], misconceptions: [] };
  const client = {
    model: "claude-opus-5-5",
    async complete(system: string, turns: Turn[]) {
      const blocks = turns.at(-1)!.blocks;
      const t = blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
      prompts.push(JSON.stringify([system, blocks.map((b) => (b.type === "text" ? b.text : [b.type, b.file?.name ?? null]))]));
      const station = /(\d)\. ÁLLOMÁS/.exec(t)?.[1] ?? (/A PROGRAM ELLENŐRZÉSE \((.+?)\)/.exec(t)?.[1] ?? "?");
      stations.push(station);
      let json: unknown = {};
      if (station === "1") json = { title: "Terület", subject: fixture.subject, classroom: fixture.classroom, transcript: TRANSCRIPT, visuals: FINGERPRINT_VISUALS,
        concepts: [{ id: "area", term: "terület", definition: "A síkidom által lefedett rész nagysága.", quote: "A téglalap területe az oldalak szorzata.", type: "concept", examWeight: "core", relatedIds: [], sourceFile: "forras.txt" }] };
      else if (station === "2") json = outline;
      else if (station === "3" || station === "tananyag") {
        json = teaching;
        // newKinds: az ELSŐ szerzői válasz (a záró összefoglaló ELŐTT) egy új fajtájú ábrablokkot is tartalmaz; a javító fordulóra a szokásos tanítás jön.
        if (STRAY.includes(scenario)) json = { ...teaching, sections: teaching.sections.map((section) => ({ ...section,
          blocks: section.blocks.map((b) => (b.kind === "example" || b.kind === "animate" ? { ...b, sourceVisualId: "v1" } : b)) })) };
        // mixed: az új fajtájú blokk a fejezet ELEJÉN áll, a másik sémahiba (üres megoldás) utána — a hibák sorrendje a séma sorrendje.
        if (scenario === "mixed" && station === "3") json = { ...teaching, sections: teaching.sections.map((section, i) => (i ? section : { ...section,
          blocks: [{ kind: "animate", animKind: "table", params: FINGERPRINT_TABLE, caption: "A terület mértékegysége a négyzetcentiméter.", coversConceptIds: ["area"] },
            ...section.blocks.map((b) => (b.kind === "example" ? { ...b, answer: "" } : b))] })) };
        if (scenario === "newKinds" && station === "3") json = { ...teaching, sections: teaching.sections.map((section, i) => (i ? section : { ...section,
          blocks: [...section.blocks.slice(0, -1), { kind: "animate", animKind: "table", params: FINGERPRINT_TABLE, caption: "A terület mértékegysége a négyzetcentiméter.", coversConceptIds: ["area"] }, ...section.blocks.slice(-1)] })) };
      }
      else if (station === "4") json = scenario === "newKinds"
        ? { sections: [{ index: 0, visuals: [{ after: 0, animKind: "table", params: FINGERPRINT_TABLE, caption: "A terület mértékegysége a négyzetcentiméter.", coversConceptIds: ["area"] }] }] }
        : STRAY.includes(scenario)
          ? { sections: [{ index: 0, visuals: [{ after: 0, animKind: "process", params: { steps: ["Mérd meg az oldalakat.", "Szorozd össze őket."] }, caption: "A terület kiszámításának lépései.", coversConceptIds: ["area"], sourceVisualId: "v2" }] }] }
          : { patches: "nem érvényes ábrafolt" };
      else if (station === "5") json = structuredClone(fixture.experience);
      else if (station === "6") json = { solutions: [], notes: [], reviewedAll: true };
      const override = options.reply?.(station, json, t);
      if (override !== undefined) json = override;
      return { text: JSON.stringify(json), model: "claude-opus-5-5", truncated: false, usage: { input: 1000, cachedInput: 600, output: 100 } };
    },
  };
  const steps: Array<{ output?: unknown }> = [];
  const maps: Array<{ visuals?: unknown; concepts: Array<{ id: string; examWeight: string; term: string; definition: string; quote: string }> }> = [];
  const logs: string[] = [];
  let published: Record<string, unknown> | null = null;
  let lesson: unknown = null;
  const storedVisuals = FINGERPRINT_VISUALS.map((v) => ({ ...v, verified: "visual-only" }));
  const baseConcepts = [{ localId: "area", examWeight: "core", term: "terület", definition: "A síkidom által lefedett rész nagysága." }];
  const store = {
    async loadMap(id: string) {
      if (id !== "m1") return null;
      const saved = maps.at(-1);
      return { meta: { id: "m1", title: "Terület", subject: fixture.subject, classroom: fixture.classroom, sourceText: `${TRANSCRIPT}\n\n${SECOND}`, visuals: FROM_MAP.includes(scenario) ? storedVisuals : saved?.visuals ?? [] },
        concepts: saved ? saved.concepts.map((c) => ({ localId: c.id, examWeight: c.examWeight, term: c.term, definition: c.definition, quote: c.quote })) : baseConcepts };
    },
    async createJob() { return "job1"; },
    async saveStep(_id: string, patch: { output?: unknown }) { steps.push(structuredClone(patch)); },
    async upsertLesson(_lessonId: string | null, _mapId: string, json: unknown) { lesson = json; return "lesson1"; },
    async publishLesson(request: Record<string, unknown>) { published = request; return { htmlFileId: "html1", exportedQuizItems: 3 }; },
    async loadJob() { return null; }, async loadBlockerNotes() { return []; }, async saveNotes() {},
  };
  const deps = {
    conversation: new Conversation(engine.singleRunSystemPrompt(), client as never, null),
    fresh: (system: string) => new Conversation(system, client as never, null),
    store,
    async saveMap(map: (typeof maps)[number]) { maps.push(map); return "m1"; },
    log: (m: string) => logs.push(m),
    ...extraDeps,
  };
  const input = FROM_MAP.includes(scenario) ? { files: [], mapId: "m1", ownerId: "u1" } : { files: FINGERPRINT_FILES, ownerId: "u1", instruction: "Rövid, áttekinthető tananyag legyen." };
  await engine.runSingleLesson(input as never, deps as never);
  // A párhuzamos (friss) hívások sorrendje nem rögzített: a lenyomat a kérések RENDEZETT sokasága.
  const sorted = [...prompts].sort();
  const telemetry = ((steps.at(-1)?.output as { telemetry?: Record<string, unknown> } | undefined)?.telemetry) ?? {};
  const gates = (telemetry.gates as Record<string, unknown> | undefined) ?? {};
  return { fingerprint: sha(sorted), logsHash: sha(logs), lessonHash: sha(lesson), prompts: sorted, stations, maps, gates, logs, telemetry, published, lesson };
}

/**
 * A modellkimenet SÉMÁJÁNAK próbája (motor nélkül): két ellenséges lecke a megadott sémán átengedve, az eredmény lenyomatával.
 * `stray`: érvényes lecke, a négy érintett blokkfajtán kéretlen `sourceVisualId` mezővel (a bővítés előtti séma levágja).
 * `mixed`: új fajtájú ábrablokk + több más sémahiba — a hibák TARTALMA és SORRENDJE a lenyomat része.
 * Ezt a sémát használja a szerzői állomás, a fogalomjavítás és a leckejavítás (`modelLessonSchema`), így a próba mindháromra áll.
 */
export function modelSchemaProbe(schema: { safeParse(json: unknown): { success: boolean; data?: unknown; error?: { issues: Array<{ path: Array<string | number>; message: string }> } } }): { stray: string; mixed: string } {
  const { experience: _bank, ...teaching } = fixture;
  const id = { sourceVisualId: "v1" };
  const check = { kind: "check", question: "Mi a terület mértékegysége?", options: ["négyzetcentiméter", "centiméter"], correctIndex: 0, feedbackPerOption: ["Igen.", "Ez hosszúság."], coversConceptIds: ["area"], ...id };
  const sort = { kind: "try", tryKind: "dragSort", spec: { items: ["mérés", "szorzás"], correctOrder: ["mérés", "szorzás"] }, coversConceptIds: ["area"], ...id };
  const blocks = teaching.sections[0].blocks;
  const base = { ...teaching, mapId: "m1", sourceOnly: true };
  const stray = { ...base, sections: [{ ...teaching.sections[0], blocks: [...blocks.slice(0, -1).map((b) => (b.kind === "explain" ? b : { ...b, ...id })), check, sort, ...blocks.slice(-1)] }] };
  const mixed = { ...base, title: "", sections: [{ ...teaching.sections[0], blocks: [
    { kind: "animate", animKind: "ruleBox", params: { tone: "rule", items: ["A terület az oldalak szorzata."] }, caption: "Szabály.", coversConceptIds: ["area"], ...id },
    ...blocks.map((b) => (b.kind === "example" ? { ...b, answer: "", steps: [] } : b)), { ...check, correctIndex: 7 }, { kind: "animate", animKind: "compareCards", params: {}, caption: "", coversConceptIds: [] }] }] };
  const result = (json: unknown) => { const r = schema.safeParse(json); return sha(r.success ? { ok: true, data: r.data } : { ok: false, issues: r.error!.issues.map((i) => i.path.join(".") + ": " + i.message) }); };
  return { stray: result(stray), mixed: result(mixed) };
}

/**
 * A TÁROLT lecke olvasási sémájának próbája régi leckealakokon (nincs új fajtájú blokk, nincs `sourceVisualId` — élesben ma csak ilyen
 * van): a normalizált kimenet (mezősorrend, alapértékek) lenyomata alakonként. A főágon és a láncon ugyanaz a `lessonSchema` export.
 */
export function storedLessonProbe(schema: Parameters<typeof modelSchemaProbe>[0]): Record<string, string> {
  const { experience: _bank, ...teaching } = fixture;
  const blocks = teaching.sections[0].blocks;
  const check = { kind: "check", question: "Mi a terület mértékegysége?", options: ["négyzetcentiméter", "centiméter"], correctIndex: 0, feedbackPerOption: ["Igen.", "Ez hosszúság."], hint: "Gondolj a négyzetre.", coversConceptIds: ["area"] };
  const fill = { kind: "try", tryKind: "fillBlank", spec: { text: "A terület az oldalak ___.", answers: ["szorzata"] }, coversConceptIds: ["area"] };
  const pairs = { kind: "try", tryKind: "match", spec: { pairs: [{ left: "terület", right: "cm²" }, { left: "hossz", right: "cm" }] }, coversConceptIds: ["area"] };
  // Alapértékek nélkül tárolt (régi) alak: nincs `readAloud`, `probaEnabled`, `misconceptions`; a kulcsok sorrendje is eltér a sémáétól.
  const bare = { sourceOnly: true, mapId: "m1", classroom: fixture.classroom, subject: fixture.subject, title: "Régi lecke",
    sections: [{ blocks: [{ coversConceptIds: ["area"], depth: "core", text: "  A terület az oldalak szorzata.  ", kind: "explain" }, { bullets: ["Szorozd össze az oldalakat."], kind: "recap" }], heading: "Terület" }] };
  const shapes: Record<string, unknown> = {
    "teljes lecke bankkal": { ...fixture, mapId: "m1", sourceOnly: true },
    "csak tanítás": { ...teaching, mapId: "m1", sourceOnly: true },
    "minden régi blokkfajta": { ...teaching, mapId: "m1", sourceOnly: true, sections: [{ ...teaching.sections[0], emoji: "📐", blocks: [...blocks.slice(0, -1), check, fill, pairs, ...blocks.slice(-1)] }],
      misconceptions: [{ conceptId: "area", text: "A terület nem a kerület." }], gaps: [{ id: "g1", point: "térfogat", reason: "a forrás nem tárgyalja" }], art: { subjectIcon: "matek-kid", topic: "geometria" } },
    "alapértékek nélkül, kevert kulcssorrenddel": bare,
    "ismeretlen kulcsokkal": { ...bare, legacyField: 1, sections: [{ ...bare.sections[0], extra: true, blocks: bare.sections[0].blocks.map((b) => ({ ...b, note: "régi mező" })) }] },
  };
  return Object.fromEntries(Object.entries(shapes).map(([name, json]) => {
    const r = schema.safeParse(json);
    return [name, sha(r.success ? { ok: true, data: r.data } : { ok: false, issues: r.error!.issues.map((i) => i.path.join(".") + ": " + i.message) })];
  }));
}

// Parancssori mód: a megadott mappa (pl. a főág kicsomagolt `server` + `shared` fája) motorjának lenyomatai.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(process.argv[2] ?? ".");
  const load = (p: string) => import(pathToFileURL(resolve(root, p)).href);
  const engine = await load("server/studio/single-run/engine.ts") as Engine;
  const { LessonConversation } = await load("server/studio/single-run/conversation.ts") as { LessonConversation: ConversationCtor };
  const { singleRunMapHash } = await load("server/studio/single-run/live.ts") as { singleRunMapHash(files: unknown, title?: string): string };
  for (const scenario of ["source", "map", "newKinds", "strayId", "strayIdMap", "mixed"] as const) {
    const run = await productionPromptRun(engine, LessonConversation, scenario);
    console.log(`${scenario}: ${run.fingerprint} (${run.prompts.length} kérés; állomások: ${[...new Set(run.stations)].join(",")})`);
    if (scenario !== "source" && scenario !== "map") console.log(`${scenario} napló: ${run.logsHash}` + String.fromCharCode(10) + `${scenario} lecke: ${run.lessonHash}`);
  }
  // A modellkimenet sémája: a főágon a `lessonSchema`, a láncon a kapcsoló KI állapotú sémája.
  const schemaModule = await load("shared/lesson-schema.ts") as { lessonSchema: Parameters<typeof modelSchemaProbe>[0]; modelLessonSchema?: (on: boolean) => Parameters<typeof modelSchemaProbe>[0] };
  const probe = modelSchemaProbe(schemaModule.modelLessonSchema ? schemaModule.modelLessonSchema(false) : schemaModule.lessonSchema);
  console.log(`séma stray: ${probe.stray}` + String.fromCharCode(10) + `séma mixed: ${probe.mixed}`);
  for (const [name, hash] of Object.entries(storedLessonProbe(schemaModule.lessonSchema))) console.log(`tárolt [${name}]: ${hash}`);
  console.log(`mapHash: ${singleRunMapHash(FINGERPRINT_FILES, "Terület")}`);
  process.exit(0);
}

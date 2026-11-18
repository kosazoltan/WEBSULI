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
export type FingerprintScenario = "source" | "map";

const fixture = standardFusionFixture();
const TRANSCRIPT = "A téglalap területe az oldalak szorzata. A terület mértékegysége a négyzetcentiméter.";
const SECOND = "A négyzet minden oldala egyenlő hosszú.";
export const FINGERPRINT_FILES = [{ name: "forras.txt", kind: "text" as const, content: TRANSCRIPT }, { name: "masik.txt", kind: "text" as const, content: SECOND }];
/** A modell kéretlen (illetve a térképen korábban mentett) leltára. */
export const FINGERPRINT_VISUALS = [
  { id: "v1", kind: "table", sourceFile: "forras.txt", page: 1, role: "A terület mértékegységei.", conceptIds: ["area"], data: { headers: ["mennyiség", "mértékegység"], rows: [["terület", "négyzetcentiméter"]] } },
  { id: "v2", kind: "process", sourceFile: "forras.txt", page: 1, role: "A számolás lépései.", conceptIds: [], data: { steps: ["Mérd meg az oldalakat.", "Szorozd össze őket."] } },
];

export type FingerprintRun = { fingerprint: string; prompts: string[]; stations: string[]; maps: Array<{ visuals?: unknown }>; gates: Record<string, unknown>; logs: string[];
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
      else if (station === "3") json = teaching;
      else if (station === "4") json = { patches: "nem érvényes ábrafolt" };
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
      return { meta: { id: "m1", title: "Terület", subject: fixture.subject, classroom: fixture.classroom, sourceText: `${TRANSCRIPT}\n\n${SECOND}`, visuals: scenario === "map" ? storedVisuals : saved?.visuals ?? [] },
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
  const input = scenario === "map" ? { files: [], mapId: "m1", ownerId: "u1" } : { files: FINGERPRINT_FILES, ownerId: "u1", instruction: "Rövid, áttekinthető tananyag legyen." };
  await engine.runSingleLesson(input as never, deps as never);
  // A párhuzamos (friss) hívások sorrendje nem rögzített: a lenyomat a kérések RENDEZETT sokasága.
  const sorted = [...prompts].sort();
  const telemetry = ((steps.at(-1)?.output as { telemetry?: Record<string, unknown> } | undefined)?.telemetry) ?? {};
  const gates = (telemetry.gates as Record<string, unknown> | undefined) ?? {};
  return { fingerprint: createHash("sha256").update(JSON.stringify(sorted)).digest("hex"), prompts: sorted, stations, maps, gates, logs, telemetry, published, lesson };
}

// Parancssori mód: a megadott mappa (pl. a főág kicsomagolt `server` + `shared` fája) motorjának lenyomatai.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(process.argv[2] ?? ".");
  const load = (p: string) => import(pathToFileURL(resolve(root, p)).href);
  const engine = await load("server/studio/single-run/engine.ts") as Engine;
  const { LessonConversation } = await load("server/studio/single-run/conversation.ts") as { LessonConversation: ConversationCtor };
  const { singleRunMapHash } = await load("server/studio/single-run/live.ts") as { singleRunMapHash(files: unknown, title?: string): string };
  for (const scenario of ["source", "map"] as const) {
    const run = await productionPromptRun(engine, LessonConversation, scenario);
    console.log(`${scenario}: ${run.fingerprint} (${run.prompts.length} kérés; állomások: ${[...new Set(run.stations)].join(",")})`);
  }
  console.log(`mapHash: ${singleRunMapHash(FINGERPRINT_FILES, "Terület")}`);
  process.exit(0);
}

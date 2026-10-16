import test from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { LessonConversation, type ModelClient, type Turn } from "../server/studio/single-run/conversation";
import { runSingleLesson, SingleRunError, singleRunSystemPrompt, type SingleRunDeps, type SingleRunMap } from "../server/studio/single-run/engine";
import type { PipelineStore, JobPatch } from "../server/studio/pipeline-store";
import type { MapConcept } from "../server/studio/coverage";

/* docs/specs/2026-10-16-egy-futas.md (B, S3): egy modell, egy beszélgetés — forrás → tudásbank → terv → tananyag → ábra → bank → lektor →
   végellenőrzés → közzététel; a determinisztikus ellenőrzés a beszélgetésben megy vissza; más modell nem hívódik. */

const fixture = standardFusionFixture();
const concepts: MapConcept[] = [{ localId: "area", examWeight: "core", term: "terület", definition: "A síkidom által lefedett rész nagysága." }];
const TRANSCRIPT = "A téglalap területe az oldalak szorzata. A terület mértékegysége a négyzetcentiméter.";
const outline = { sections: [{ heading: fixture.sections[0].heading, conceptIds: ["area"], plannedBlocks: ["explain", "example", "animate", "recap"], animationSuggestions: [] }], misconceptions: [] };

function lastUserText(turns: Turn[]): string {
  const last = turns.at(-1)!;
  return last.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
}

function scriptedClient(overrides: { outline?: Array<unknown>; lektor?: Array<unknown> } = {}): ModelClient & { calls: string[] } {
  const calls: string[] = [];
  const outlines = [...(overrides.outline ?? [])];
  const lektors = [...(overrides.lektor ?? [])];
  const { experience: _bank, ...teaching } = fixture;
  return {
    model: "claude-opus-5-5", calls,
    async complete(_system, turns) {
      const t = lastUserText(turns);
      const station = /(\d)\. ÁLLOMÁS/.exec(t)?.[1] ?? (/A PROGRAM ELLENŐRZÉSE \((.+?)\)/.exec(t)?.[1] ?? "?");
      calls.push(station);
      let json: unknown;
      if (station === "1") json = { title: "Terület", subject: fixture.subject, classroom: fixture.classroom, transcript: TRANSCRIPT,
        concepts: [{ id: "area", term: "terület", definition: "A síkidom által lefedett rész nagysága.", quote: "A téglalap területe az oldalak szorzata.", type: "concept", examWeight: "core", relatedIds: [] }] };
      else if (station === "2" || station === "tananyagterv") json = outlines.length ? outlines.shift() : outline;
      else if (station === "3") json = teaching;
      else if (station === "4") json = { patches: "nem érvényes ábrafolt" };
      else if (station === "5") json = structuredClone(fixture.experience);
      else if (station === "6" || station === "lektorálás") json = lektors.length ? lektors.shift() : { solutions: [], notes: [], reviewedAll: true };
      else json = {};
      return { text: JSON.stringify(json), model: "claude-opus-5-5", truncated: false };
    },
  };
}

function memoryStore() {
  const steps: JobPatch[] = [];
  let published = 0;
  const lessons = new Map<string, unknown>();
  const store = {
    async loadMap(id: string) { return id === "m1" ? { meta: { id: "m1", title: "Terület", subject: fixture.subject, classroom: fixture.classroom }, concepts } : null; },
    async createJob() { return "job1"; },
    async saveStep(_id: string, patch: JobPatch) { steps.push(structuredClone(patch)); },
    async upsertLesson(_lessonId: string | null, _mapId: string, json: unknown) { lessons.set("lesson1", json); return "lesson1"; },
    async publishLesson() { published++; return { htmlFileId: "html1", exportedQuizItems: 3 }; },
    async loadJob() { return null; }, async loadBlockerNotes() { return []; }, async saveNotes() {},
  } as unknown as PipelineStore;
  return { store, steps, lessons, published: () => published };
}

function deps(client: ModelClient, mem: ReturnType<typeof memoryStore>, maps: SingleRunMap[] = []): SingleRunDeps {
  return {
    conversation: new LessonConversation(singleRunSystemPrompt(), client, null),
    store: mem.store,
    async saveMap(map) { maps.push(map); return "m1"; },
  };
}

test("teljes futás egy beszélgetésben: forrás → … → közzététel, egyetlen modellel", async () => {
  const client = scriptedClient();
  const mem = memoryStore();
  const maps: SingleRunMap[] = [];
  const result = await runSingleLesson({ files: [{ name: "forras.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(client, mem, maps));
  assert.equal(result.htmlFileId, "html1");
  assert.equal(mem.published(), 1, "egyszer publikál");
  assert.equal(result.model, "claude-opus-5-5");
  assert.equal(maps[0].concepts[0].verbatimOk, true, "az idézet az átiraton mérve");
  // A pipeline sorrendje: 1 → 2 → 3 → 4 → 5 (fejezetenként) → 6.
  const order = client.calls.filter((c, i, a) => i === 0 || c !== a[i - 1]);
  assert.deepEqual(order, ["1", "2", "3", "4", "5", "6"], JSON.stringify(client.calls));
  const stepsSeen = mem.steps.map((s) => s.step).filter((s, i, a) => s && s !== a[i - 1]);
  assert.deepEqual(stepsSeen, ["pedagogue", "author", "animator", "lektor", "done"]);
  const last = mem.steps.at(-1)!.output as { singleRun: { conversation: { turns: unknown[]; model: string } } };
  assert.ok(last.singleRun.conversation.turns.length >= 12, "a teljes beszélgetés mentve (folytatáshoz)");
});

test("a determinisztikus ellenőrzés ugyanabban a beszélgetésben megy vissza, és a modell ott javít", async () => {
  const client = scriptedClient({ outline: [{ sections: [] }] });
  const mem = memoryStore();
  const result = await runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(client, mem));
  assert.equal(result.htmlFileId, "html1");
  assert.ok(client.calls.includes("tananyagterv"), "javító forduló a tananyagterv hibáira");
});

test("3 javító forduló után is hibás állomás → megáll pontos okkal (nincs közzététel)", async () => {
  const bad = { sections: [] };
  const client = scriptedClient({ outline: [bad, bad, bad, bad] });
  const mem = memoryStore();
  await assert.rejects(runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(client, mem)),
    (e: unknown) => e instanceof SingleRunError && e.station === "tananyagterv");
  assert.equal(mem.published(), 0);
  const last = mem.steps.at(-1)!;
  assert.equal(last.step, "error"); assert.equal(last.status, "error");
  assert.match(String(last.error), /tananyagterv/);
  assert.ok((last.output as { singleRun?: unknown }).singleRun, "a beszélgetés (piszkozat) a hibás jobon is megmarad");
});

test("a lektor tanítási tényhibája a második körben is → megáll (tényhiba nem publikálható)", async () => {
  const note = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections.0.blocks.0", message: "Tényhiba a tanításban." };
  const client = scriptedClient({ lektor: [{ solutions: [], notes: [note], reviewedAll: true }, { solutions: [], notes: [note], reviewedAll: true }] });
  const mem = memoryStore();
  await assert.rejects(runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(client, mem)),
    (e: unknown) => e instanceof SingleRunError && e.station === "lektorálás");
  assert.equal(mem.published(), 0);
});

// Review #260
test("megoldáseltérés blokkoló jegyzet nélkül → javító forduló a lektornak (nem minősül tisztának)", async () => {
  const contradictory = { solutions: [{ task: "1. feladat", own: "12", lesson: "10", match: false }], notes: [], reviewedAll: true };
  const client = scriptedClient({ lektor: [contradictory] });
  const mem = memoryStore();
  const result = await runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(client, mem));
  assert.equal(result.htmlFileId, "html1");
  assert.ok(client.calls.includes("lektorálás"), "az önellentmondó jelentés javító fordulóba megy: " + JSON.stringify(client.calls));
});

test("az utolsó javító kör bankváltozását egy ellenőrző kör újralektorálja; ott blokkoló → megáll, nincs közzététel", async () => {
  const bankNote = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.sections.0.tasks.0", message: "Hibás válaszkulcs." };
  const report = { solutions: [], notes: [bankNote], reviewedAll: true };
  const stopped = scriptedClient({ lektor: [report, report, report] });
  const mem = memoryStore();
  await assert.rejects(runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(stopped, mem)),
    (e: unknown) => e instanceof SingleRunError && e.station === "lektorálás");
  assert.equal(mem.published(), 0);
  assert.equal(stopped.calls.filter((c) => c === "6").length, 3, "2 javító + 1 ellenőrző lektori kör");

  const verified = scriptedClient({ lektor: [report, report] });
  const mem2 = memoryStore();
  const result = await runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(verified, mem2));
  assert.equal(result.htmlFileId, "html1");
  assert.equal(verified.calls.filter((c) => c === "6").length, 3, "a tiszta ellenőrző kör után publikál");
});

/** A forgatókönyves kliens egyes válaszainak felülírása (a többi állomás változatlan). */
function withOverride(base: ModelClient & { calls: string[] }, override: (station: string, turns: Turn[]) => string | null): ModelClient & { calls: string[] } {
  return { ...base, async complete(system, turns) {
    const t = lastUserText(turns);
    const station = /(\d)\. ÁLLOMÁS/.exec(t)?.[1] ?? (/A PROGRAM ELLENŐRZÉSE \((.+?)\)/.exec(t)?.[1] ?? "?");
    const replaced = override(station, turns);
    if (replaced !== null) { base.calls.push(station); return { text: replaced, model: base.model, truncated: false }; }
    return base.complete(system, turns);
  } };
}

test("review #260: több forrásfájlnál fájlonkénti átirat és valódi sourceFile kell; hiányánál javító forduló, a fogalom a saját fájljára mutat", async () => {
  const files = [{ name: "a.txt", kind: "text" as const, content: "A téglalap területe az oldalak szorzata." }, { name: "b.txt", kind: "text" as const, content: "A terület mértékegysége a négyzetcentiméter." }];
  const concept = { id: "area", term: "terület", definition: "A síkidom által lefedett rész nagysága.", quote: "A terület mértékegysége a négyzetcentiméter.", type: "concept", examWeight: "core", relatedIds: [] };
  const base = { title: "Terület", subject: fixture.subject, classroom: fixture.classroom, transcript: TRANSCRIPT, concepts: [concept] };
  const replies = [base, { ...base, fileTranscripts: [{ name: "a.txt", text: files[0].content }, { name: "b.txt", text: files[1].content }], concepts: [{ ...concept, sourceFile: "b.txt" }] }];
  const client = withOverride(scriptedClient(), (station) => (station === "1" || station === "forrás és tudásbank" ? JSON.stringify(replies.shift()) : null));
  const maps: SingleRunMap[] = [];
  const result = await runSingleLesson({ files, ownerId: "u1" }, deps(client, memoryStore(), maps));
  assert.equal(result.htmlFileId, "html1");
  assert.deepEqual(client.calls.slice(0, 2), ["1", "forrás és tudásbank"], "a hiányzó fájlonkénti átirat javító fordulót kap");
  assert.equal(maps[0].concepts[0].sourceFile, "b.txt");
  assert.equal(maps[0].fileTranscripts["a.txt"], files[0].content);
});

test("review #260: a nem JSON bankválasz a banképítő javító körébe megy (nem állítja le a gyártást)", async () => {
  let bankCalls = 0;
  const client = withOverride(scriptedClient(), (station) => (station === "5" && bankCalls++ === 0 ? "ez nem JSON" : null));
  const result = await runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(client, memoryStore()));
  assert.equal(result.htmlFileId, "html1");
  assert.ok(bankCalls >= 2, "a hibás válasz után új bankkísérlet jött");
});

test("S4b: a szókeret túllépése minőségi jelzés (length_over_budget) a jobon, a gyártás nem áll meg", async () => {
  const long = withOverride(scriptedClient(), (station) => {
    if (station !== "3") return null;
    const { experience: _bank, ...teaching } = structuredClone(fixture);
    const explain = teaching.sections[0].blocks.find((b) => b.kind === "explain") as { text: string };
    explain.text = `${explain.text} ${"A terület a síkidom által lefedett rész nagysága. ".repeat(60)}`.trim(); // ~480 szó, a 4000 karakteres mezőkorláton belül
    return JSON.stringify(teaching);
  });
  const mem = memoryStore();
  const result = await runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(long, mem));
  assert.equal(result.htmlFileId, "html1", "a jelzés nem állítja meg a gyártást");
  const notes = (mem.steps.at(-1)!.output as { qualityNotes?: Array<{ reason: string }> }).qualityNotes ?? [];
  assert.deepEqual(notes.map((n) => n.reason), ["length_over_budget"]);
});

test("S4b: a forrás hamis egyenlősége determinisztikusan helyesbítve (térkép + a tananyagterv kérése), a helyes sor érintetlen", async () => {
  const transcript = "Kivonás: -5-(+8)=+3 és -5-(-8)=+3 a füzetben.";
  const read = { title: "Kivonás", subject: fixture.subject, classroom: fixture.classroom, transcript,
    concepts: [
      { id: "area", term: "kivonás", definition: "A tanuló megoldása.", quote: "-5-(+8)=+3", type: "concept", examWeight: "core", relatedIds: [] },
      { id: "ok", term: "ellentett", definition: "Helyes sor.", quote: "-5-(-8)=+3", type: "concept", examWeight: "supporting", relatedIds: [] },
    ] };
  let plannerRequest = "";
  const client = withOverride(scriptedClient(), (station, turns) => {
    if (station === "1") return JSON.stringify(read);
    if (station === "2") plannerRequest = lastUserText(turns);
    return null;
  });
  const maps: SingleRunMap[] = [];
  const mem = memoryStore();
  await runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: transcript }], ownerId: "u1" }, deps(client, mem, maps)).catch(() => undefined);
  const [fixed, untouched] = maps[0].concepts;
  assert.equal(maps[0].corrections.length, 1, "csak a hamis sor");
  assert.notEqual(fixed.definition, "A tanuló megoldása.", "a hamis egyenlőség definíciója helyesbítve");
  assert.ok(fixed.correction, "a helyesbítés kódja a térképre kerül");
  assert.equal(untouched.definition, "Helyes sor.");
  assert.equal(untouched.correction, undefined);
  assert.match(plannerRequest, /-13/, "a helyesbítés (helyes érték) a tananyagterv kérésébe is bekerül");
});

test("S4b: a válaszkulcs-teszt és a kvíz vak előszűrője ugyanabban a beszélgetésben fut; a vak ítélet a kód döntésével jut a bankba", async () => {
  const labels: string[] = [];
  const logs: string[] = [];
  const client = withOverride(scriptedClient(), (_station, turns) => {
    const t = lastUserText(turns);
    if (/VÁLASZKULCS-TESZTEK/.test(t)) { labels.push("answer-key"); return JSON.stringify({ items: [] }); }
    if (/KVÍZ VAK ELLENŐRZÉSE/.test(t)) {
      labels.push("quiz-blind");
      assert.doesNotMatch(t, /correctIndex/, "a vak ellenőr a kulcsot nem kapja meg");
      const ids = [...t.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
      const options = [...t.matchAll(/"options":\[([^\]]*)\]/g)].map((m) => m[1].split(",").length);
      // Minden kérdésnél MINDEN opció igaz (kétértelmű) → a kód (choiceVerdictProblem) minden tételt elutasít.
      return JSON.stringify({ choices: ids.map((id, i) => ({ id, truths: Array.from({ length: options[i] }, () => true) })) });
    }
    return null;
  });
  const result = await runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" },
    { ...deps(client, memoryStore()), log: (m) => logs.push(m) });
  assert.equal(result.htmlFileId, "html1");
  assert.ok(labels.includes("answer-key"), "a válaszkulcs-teszt a beszélgetésben fut (a fixtúrában nyílt feladatok vannak)");
  assert.ok(labels.includes("quiz-blind"), "a kvíz vak előszűrője a beszélgetésben fut: " + JSON.stringify(labels));
  assert.ok(logs.some((m) => /quiz-blind: .*vak előszűrő szerint/.test(m)), "a vak ítélet a banképítő döntésébe jut: " + JSON.stringify(logs.filter((m) => /quiz|kvíz/i.test(m))));
});

test("S4b: az évfolyam a forrásból jön — hiányzó vagy érvénytelen classroom nincs alapértékkel pótolva, javító fordulót kap", async () => {
  const noGrade = { title: "Terület", subject: fixture.subject, transcript: TRANSCRIPT,
    concepts: [{ id: "area", term: "terület", definition: "x", quote: "A téglalap területe az oldalak szorzata.", type: "concept", examWeight: "core", relatedIds: [] }] };
  const fixed = { ...noGrade, classroom: fixture.classroom };
  const requests: string[] = [];
  const client = withOverride(scriptedClient(), (station, turns) => {
    if (station === "1") return JSON.stringify(noGrade);
    if (station === "forrás és tudásbank") { requests.push(lastUserText(turns)); return JSON.stringify(fixed); }
    return null;
  });
  const maps: SingleRunMap[] = [];
  await runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(client, memoryStore(), maps));
  assert.match(requests[0] ?? "", /A classroom 0 és 12 közötti egész legyen\./, "a hiányzó évfolyam a modellhez megy vissza");
  assert.equal(maps[0].classroom, fixture.classroom, "csak a forrásból megállapított évfolyam kerül a térképre");
});

// Review #261
test("review #261: szöveges forrásnál a VALÓDI szöveg a mérce — a modell átiratából kitalált idézet javító fordulót kap", async () => {
  const invented = { title: "Terület", subject: fixture.subject, classroom: fixture.classroom, transcript: "Kitalált átirat: a terület mindig piros.",
    concepts: [{ id: "area", term: "terület", definition: "x", quote: "a terület mindig piros", type: "concept", examWeight: "core", relatedIds: [] }] };
  const correct = { ...invented, transcript: TRANSCRIPT, concepts: [{ ...invented.concepts[0], quote: "A téglalap területe az oldalak szorzata." }] };
  const client = withOverride(scriptedClient(), (station) => (station === "1" ? JSON.stringify(invented) : station === "forrás és tudásbank" ? JSON.stringify(correct) : null));
  const maps: SingleRunMap[] = [];
  await runSingleLesson({ files: [{ name: "f.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(client, memoryStore(), maps));
  assert.ok(client.calls.includes("forrás és tudásbank"), "a valódi szövegben nem szereplő idézet javító fordulót kapott");
  assert.equal(maps[0].transcript, TRANSCRIPT, "a mentett átirat a valódi forrásszöveg");
});

test("review #261: a különálló kinyerés lenyomata egyértelmű (a fájlhatár nem csúszhat el)", async () => {
  const { singleRunMapHash } = await import("../server/studio/single-run/live");
  const one = singleRunMapHash([{ name: "a.txt", kind: "text", content: "first\nb.txt\ntext\nsecond" }]);
  const two = singleRunMapHash([{ name: "a.txt", kind: "text", content: "first" }, { name: "b.txt", kind: "text", content: "second" }]);
  assert.notEqual(one, two);
});

test("review #261: a jóváhagyott vázlat kötelező tervként kerül a tanári kérésbe", async () => {
  const { approvedOutlineInstruction } = await import("../server/studio/lesson-pipeline-routes");
  const text = approvedOutlineInstruction({ sections: [{ heading: "B fejezet", conceptIds: ["c2"] }, { heading: "A fejezet", conceptIds: ["c1", "c3"] }] });
  assert.match(text, /JÓVÁHAGYOTT TANULÁSI TERV — kötelező/);
  assert.match(text, /1\. B fejezet — fogalmak: c2\n2\. A fejezet — fogalmak: c1, c3/);
});

test("a rendszerprompt ép: a pontozó szabálya egy darabban, szó szerint; nincs egybetűs (szétszórt) sor", async () => {
  const { OPEN_ANSWER_RULES_HU } = await import("../shared/lesson-experience-score");
  const system = singleRunSystemPrompt();
  assert.ok(system.includes(OPEN_ANSWER_RULES_HU), "a pontozó szabálya szó szerint, egy darabban");
  const singleCharLines = system.split("\n").filter((l) => l.trim().length === 1);
  assert.deepEqual(singleCharLines, [], "nincs betűnként szétszórt szöveg a rendszerpromptban");
});

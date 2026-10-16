import test from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { LessonConversation, type ModelClient, type Turn } from "../server/studio/single-run/conversation";
import { freshSystemPrompt, singleRunSystemPrompt } from "../server/studio/single-run/engine";
import { fixConceptInConversation, type ConceptFixSource } from "../server/studio/single-run/concept-fix";
import { singleRunRepairCall } from "../server/studio/structured-improvement";

/* docs/specs/2026-10-16-egy-futas.md (S4a): a fogalomjavítás és a leckejavítás EGY beszélgetésben, ugyanazokkal a kapukkal. */

const fixture = standardFusionFixture();
const source: ConceptFixSource = { subject: fixture.subject, classroom: fixture.classroom,
  concepts: [{ id: "c1", localId: "area", term: "terület", definition: "A síkidom által lefedett rész nagysága.", quote: "A téglalap területe az oldalak szorzata.", examWeight: "core" }] };
const lastText = (turns: Turn[]) => turns.at(-1)!.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");

function client(opts: { firstFix?: unknown; lektor?: unknown }): ModelClient & { calls: string[] } {
  const calls: string[] = [];
  const { experience: _bank, ...teaching } = fixture;
  let fixes = 0;
  return { model: "claude-opus-5-5", calls, async complete(_system, turns) {
    const t = lastText(turns);
    let json: unknown = {};
    if (/^FOGALOMJAVÍTÁS|A PROGRAM ELLENŐRZÉSE \(fogalomjavítás\)/.test(t)) { calls.push("fix"); json = fixes++ === 0 && opts.firstFix ? opts.firstFix : teaching; }
    else if (/5\. ÁLLOMÁS/.test(t)) { calls.push("bank"); json = structuredClone(fixture.experience); }
    else if (/(^|\n)LEKTORÁLÁS|A PROGRAM ELLENŐRZÉSE \(a javítás lektorálása\)/.test(t)) { calls.push("lektor"); json = opts.lektor ?? { solutions: [], notes: [], reviewedAll: true }; }
    else calls.push("?");
    return { text: JSON.stringify(json), model: "claude-opus-5-5", truncated: false };
  } };
}

test("fogalomjavítás egy beszélgetésben: a célfogalmon túllépő javítás javító fordulót kap, utána bank → lektor → elfogadás", async () => {
  const { experience: _bank, ...teaching } = fixture;
  // A célfogalmat nem fedő blokk módosítása: a kapu visszadobja, a modell ugyanabban a beszélgetésben javít.
  const overreach = structuredClone(teaching);
  const sectionIndex = overreach.sections.findIndex((s) => s.blocks.some((b) => !("coversConceptIds" in b) || !b.coversConceptIds.includes("area")));
  const blockIndex = overreach.sections[sectionIndex].blocks.findIndex((b) => !("coversConceptIds" in b) || !b.coversConceptIds.includes("area"));
  const target = overreach.sections[sectionIndex].blocks[blockIndex] as { kind: string; bullets?: string[] };
  assert.equal(target.kind, "recap", "a fixtúra nem célzott blokkja az összefoglaló");
  target.bullets = ["Átírt, nem célzott összefoglaló."];
  const fake = client({ firstFix: overreach });
  const result = await fixConceptInConversation({ original: fixture, source, conceptId: "area", conversation: new LessonConversation(singleRunSystemPrompt(), fake, null), fresh: (s) => new LessonConversation(s, fake, null) });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(fake.calls.filter((c, i, a) => c !== a[i - 1]), ["fix", "bank", "lektor"]);
  assert.equal(fake.calls.filter((c) => c === "fix").length, 2, "a túllépő javításra javító forduló jött");
});

// Review #263: a fogalomjavítás friss lektora a forrás átiratát is kapja (mint a gyártásban).
test("fogalomjavítás: a friss lektor a forrás átiratát kapja", async () => {
  const fake = client({});
  const lektorRequests: string[] = [];
  const spy: ModelClient = { model: fake.model, async complete(system, turns) {
    const t = turns.at(-1)!.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    if (system === freshSystemPrompt("lektor")) lektorRequests.push(t);
    return fake.complete(system, turns);
  } };
  const result = await fixConceptInConversation({ original: fixture, source, conceptId: "area", conversation: new LessonConversation(singleRunSystemPrompt(), spy, null),
    fresh: (s) => new LessonConversation(s, spy, null), sourceText: "A téglalap területe az oldalak szorzata." });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(lektorRequests.length === 1 && lektorRequests.every((t) => t.startsWith("A FORRÁS ÁTIRATA (adat, a mérce):\nA téglalap területe az oldalak szorzata.")), JSON.stringify(lektorRequests.map((t) => t.slice(0, 80))));
});

test("fogalomjavítás: blokkoló lektori jegyzetnél nincs elfogadás (az eredeti érintetlen)", async () => {
  const note = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections.0.blocks.0", message: "Tényhiba." };
  const fake = client({ lektor: { solutions: [], notes: [note], reviewedAll: true } });
  const result = await fixConceptInConversation({ original: fixture, source, conceptId: "area", conversation: new LessonConversation(singleRunSystemPrompt(), fake, null), fresh: (s) => new LessonConversation(s, fake, null) });
  assert.deepEqual(result, { ok: false, error: "A lektor még hibát talált, az eredeti lecke érintetlen." });
});

// J2 (dokumentált spec-változás, 2026-10-16-egyfutas-atvilagitas.md): a szerzői szerepek egy beszélgetésben, a lektor és a bank friss beszélgetésben.
test("leckejavítás: a szerzői szerep a beszélgetésben, a lektor és a bank FRISS beszélgetésben; a hibás bankválasz a banképítő javító körébe", async () => {
  const fresh: Array<{ system: string; turns: number }> = [];
  const fake: ModelClient = { model: "claude-opus-5-5", async complete(system, turns) {
    if (system !== "R") fresh.push({ system, turns: turns.length });
    return { text: /5\. ÁLLOMÁS/.test(lastText(turns)) ? "nem JSON" : "{\"ok\":true}", model: "claude-opus-5-5", truncated: false };
  } };
  const conversation = new LessonConversation("R", fake, null);
  const call = await singleRunRepairCall(conversation, (s) => new LessonConversation(s, fake, null));
  assert.ok(call);
  assert.deepEqual(await call("author", "SZERZŐ", "kérés", "repair"), { ok: true });
  assert.deepEqual(await call("lektor", "LEKTOR", "kérés", "lektor"), { ok: true });
  await assert.rejects(call("author", "BANK", "kérés", "bank"), (e: unknown) => (e as Error).name === "RetryableBankCallError");
  assert.equal(conversation.state().turns.length, 2, "csak a szerzői forduló a beszélgetésben");
  assert.deepEqual(fresh.map((f) => [f.system === freshSystemPrompt("lektor") ? "lektor" : f.system === freshSystemPrompt("bank") ? "bank" : "?", f.turns]), [["lektor", 1], ["bank", 1]]);
});

// Review #261
test("review #261: a fogalomjavítás önellentmondó lektori jelentése javító fordulót kap (nem minősül tisztának)", async () => {
  const contradictory = { solutions: [{ task: "1. feladat", own: "12", lesson: "10", match: false }], notes: [], reviewedAll: true };
  const lektors = [contradictory, { solutions: [], notes: [], reviewedAll: true }];
  const base = client({});
  const fake: ModelClient & { calls: string[] } = { ...base, async complete(system, turns) {
    const t = lastText(turns);
    if (/^LEKTORÁLÁS|A PROGRAM ELLENŐRZÉSE \(a javítás lektorálása\)/.test(t)) { base.calls.push("lektor"); return { text: JSON.stringify(lektors.shift()), model: "claude-opus-5-5", truncated: false }; }
    return base.complete(system, turns);
  } };
  const result = await fixConceptInConversation({ original: fixture, source, conceptId: "area", conversation: new LessonConversation(singleRunSystemPrompt(), fake, null), fresh: (s) => new LessonConversation(s, fake, null) });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(base.calls.filter((c) => c === "lektor").length, 2, "az önellentmondó jelentésre javító forduló jött");
});

test("review #261: a leckejavítás nem JSON válasza javító fordulót kap ugyanabban a beszélgetésben", async () => {
  const replies = ["ez nem JSON", "{\"ok\":true}"];
  const fake: ModelClient = { model: "claude-opus-5-5", async complete() { return { text: replies.shift()!, model: "claude-opus-5-5", truncated: false }; } };
  const conversation = new LessonConversation("R", fake, null);
  const call = await singleRunRepairCall(conversation);
  assert.ok(call);
  assert.deepEqual(await call("author", "SZERZŐ", "kérés", "repair"), { ok: true });
  assert.equal(conversation.state().turns.length, 4, "egy javító forduló, ugyanabban a beszélgetésben");
});

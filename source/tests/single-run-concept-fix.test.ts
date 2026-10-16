import test from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { LessonConversation, type ModelClient, type Turn } from "../server/studio/single-run/conversation";
import { singleRunSystemPrompt } from "../server/studio/single-run/engine";
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
    else if (/^LEKTORÁLÁS|A PROGRAM ELLENŐRZÉSE \(a javítás lektorálása\)/.test(t)) { calls.push("lektor"); json = opts.lektor ?? { solutions: [], notes: [], reviewedAll: true }; }
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
  const result = await fixConceptInConversation({ original: fixture, source, conceptId: "area", conversation: new LessonConversation(singleRunSystemPrompt(), fake, null) });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(fake.calls.filter((c, i, a) => c !== a[i - 1]), ["fix", "bank", "lektor"]);
  assert.equal(fake.calls.filter((c) => c === "fix").length, 2, "a túllépő javításra javító forduló jött");
});

test("fogalomjavítás: blokkoló lektori jegyzetnél nincs elfogadás (az eredeti érintetlen)", async () => {
  const note = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections.0.blocks.0", message: "Tényhiba." };
  const fake = client({ lektor: { solutions: [], notes: [note], reviewedAll: true } });
  const result = await fixConceptInConversation({ original: fixture, source, conceptId: "area", conversation: new LessonConversation(singleRunSystemPrompt(), fake, null) });
  assert.deepEqual(result, { ok: false, error: "A lektor még hibát talált, az eredeti lecke érintetlen." });
});

test("leckejavítás: minden szerep ugyanabba a beszélgetésbe megy; a hibás bankválasz a banképítő javító körébe", async () => {
  const seen: string[] = [];
  const fake: ModelClient = { model: "claude-opus-5-5", async complete(_s, turns) {
    const t = lastText(turns); seen.push(t.slice(0, 40));
    return { text: /5\. ÁLLOMÁS/.test(t) ? "nem JSON" : "{\"ok\":true}", model: "claude-opus-5-5", truncated: false };
  } };
  const conversation = new LessonConversation("R", fake, null);
  const call = await singleRunRepairCall(conversation);
  assert.ok(call);
  assert.deepEqual(await call("author", "SZERZŐ", "kérés", "repair"), { ok: true });
  assert.deepEqual(await call("lektor", "LEKTOR", "kérés", "lektor"), { ok: true });
  await assert.rejects(call("author", "BANK", "kérés", "bank"), (e: unknown) => (e as Error).name === "RetryableBankCallError");
  assert.equal(conversation.state().turns.length, 6, "három forduló, egyetlen beszélgetésben");
});

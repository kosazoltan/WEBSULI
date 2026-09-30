import { test } from "node:test";
import assert from "node:assert/strict";
import { limitAcceptance } from "../server/studio/limit-policy";
import { checkCoverageGate } from "../server/studio/coverage";
import { buildStaleJudgePrompt, parseStaleVerdicts, REPAIR_SKILL, repairChecklistTail, staleFormCandidates, staleFormProblems } from "../server/studio/repair-skill";
import { buildStructuredImprovement } from "../server/studio/structured-improvement";
import { callStepModel, stablePrefixChars } from "../server/studio/run-step";
import { ClaudeProvider } from "../server/ai/ClaudeProvider";
import { maxOutputForModel } from "../server/ai/models";
import { filesForQuoteRepair } from "../server/studio/run-extraction";
import { VISUAL_PARAMS_CONTRACT } from "../shared/lesson-visual-params";
import { ROLE_SKILLS } from "../server/studio/role-skills";
import { SUPPORT_SKILLS } from "../server/studio/support-skills";
import type { AIMessage, ChatCallOptions, IAIProvider } from "../server/ai/AIProvider";
import { lessonSchema, type Lesson } from "../shared/lesson-schema";
import { fusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U6): C15/H42, C16/H43, C11, C10, C7, B1/B2 skillek. */

const lessonWith = (blocks: unknown[][]): Lesson => ({
  title: "T", subject: "matematika", classroom: 6, mapId: "m", sourceOnly: true, misconceptions: [],
  sections: blocks.map((b, i) => ({ heading: `F${i}`, probaEnabled: false, blocks: b })),
} as unknown as Lesson);

test("C15/H42: a blokk MINDEN címkéje megalapozatlan → a blokk kivétele, a fedettség a kivétel UTÁN; üres fejezet → nem publikálható", () => {
  const concepts = [{ localId: "c1", examWeight: "core" as const, term: "háromszög területe" }, { localId: "c2", examWeight: "core" as const, term: "kerület" }];
  const lesson = lessonWith([[
    { kind: "explain", text: "A háromszög területe az alap és a magasság szorzatának fele. A kerület az oldalak összege.", depth: "core", readAloud: true, coversConceptIds: ["c1", "c2"] },
    { kind: "recap", bullets: ["Összefoglaló."] },
  ], [
    { kind: "explain", text: "A kerület az oldalak hosszának összege.", depth: "core", readAloud: true, coversConceptIds: ["c2"] },
    { kind: "explain", text: "Egy kitalált mondat, amely egyik fogalmat sem tanítja.", depth: "core", readAloud: true, coversConceptIds: ["c1"] },
  ]]);
  const gate = checkCoverageGate(lesson, concepts);
  assert.equal(gate.ungrounded.length, 1, "a 2. fejezet második blokkjának egyetlen címkéje megalapozatlan");
  const accepted = limitAcceptance(lesson, concepts, gate);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.removedBlocks, ["sections[1].blocks[1]"]);
  assert.equal(accepted.lesson.sections[1].blocks.length, 1);
  assert.equal(lessonSchema.safeParse(accepted.lesson).success, true, "a kivétel utáni jelölt sémahelyes");
  assert.equal(accepted.core, 1);
  // a fejezet egyetlen tanító blokkja megalapozatlan → a kivétel üres fejezetet hagyna
  const lonely = lessonWith([[{ kind: "explain", text: "Kitalált.", depth: "core", readAloud: true, coversConceptIds: ["c2"] }], [
    { kind: "explain", text: "A háromszög területe az alap és a magasság szorzatának fele.", depth: "core", readAloud: true, coversConceptIds: ["c1"] },
  ]]);
  const refused = limitAcceptance(lonely, concepts, checkCoverageGate(lonely, concepts));
  assert.equal(refused.ok, false);
  assert.match(refused.reason!, /1\. fejezet minden blokkja megalapozatlan/);
});

test("C16/H43: tiszta régi alak determinisztikus hiba (ragozva is); összetett régi alak csak JELÖLT — a „Föld” más értelemben nem hiba", () => {
  const pure = [{ localId: "c1", term: "terület", basis: "owner" as const, reason: "", from: { term: "terlet" } }];
  const compound = [{ localId: "c2", term: "Hold változása", basis: "transcription" as const, reason: "", from: { term: "föld-változása" } }];
  const lesson = lessonWith([[
    { kind: "explain", text: "A Föld körül kering a Hold. A földrajz órán is tanultuk. Nem a Föld változása, hanem a Hold változása adja a naptárt.", depth: "core", readAloud: true, coversConceptIds: ["c2"] },
    { kind: "explain", text: "A föld-változása alapján készítettek naptárt.", depth: "core", readAloud: true, coversConceptIds: ["c2"] },
  ]]);
  assert.deepEqual(staleFormProblems(lesson, compound), [], "összetett alak: a puszta szóelőfordulás nem determinisztikus hiba");
  const candidates = staleFormCandidates(lesson, compound);
  assert.deepEqual(candidates.map((c) => c.sentence), ["Nem a Föld változása, hanem a Hold változása adja a naptárt.", "A föld-változása alapján készítettek naptárt."], "csak a kulcsszóval együtt álló mondat jelölt; a „Föld körül”/„földrajz” nem");
  const inflected = lessonWith([[{ kind: "explain", text: "A terletet kiszámoljuk.", depth: "core", readAloud: true, coversConceptIds: ["c1"] }]]);
  assert.equal(staleFormProblems(inflected, pure).length, 1, "tiszta (nem létező) régi alak ragozva is hiba");
  const judge = buildStaleJudgePrompt(candidates);
  assert.match(judge.system, /A puszta szóelőfordulás nem hiba/);
  const verdicts = parseStaleVerdicts({ items: [{ id: candidates[0].id, verdict: "nem", reason: "a helyes alakot tanítja" }, { id: candidates[1].id, verdict: "igen", reason: "a régi állítás" }] }, candidates);
  assert.deepEqual(verdicts.map((v) => v.verdict), ["nem", "igen"]);
  assert.equal(parseStaleVerdicts({ items: [] }, candidates)[0].verdict, "bizonytalan", "hiányzó ítélet → eldöntetlen, nem „nem”");
  assert.match(REPAIR_SKILL, /régi szó MÁS értelemben megengedett/);
  assert.match(repairChecklistTail(pure), /A helyesbített régi állítás SEHOL nem maradhat[\s\S]*„terlet”/);
});

test("C16: a javító út a jelöltet a javító-lektorral dönteti el — „igen” javító kört indít, „nem” átmegy, a hívás hibája figyelmeztetés", async () => {
  const original = fusionFixture(); const e = standardFusionFixture().experience!;
  const source = { subject: original.subject, classroom: original.classroom, concepts: [{ localId: "area", term: "hármoszög területe", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] }; // a térkép a RÉGI alakkal (a helyesbítés erre vonatkozik)
  const withSentence = (text: string) => { const l = structuredClone(original); l.sections.at(-1)!.blocks.push({ kind: "recap", bullets: [text] }); return l; };
  const run = async (judgeReply: (n: number) => unknown) => {
    let authors = 0, judges = 0;
    const result = await buildStructuredImprovement(original, source, async (step, system, _user, role) => {
      if (step === "pedagogue") return { corrections: [{ localId: "area", term: "háromszög területe", basis: "owner", reason: "átírás", from: { term: "hármoszög területe" } }] };
      if (step === "lektor" && /RÉGI ÁLLÍTÁS ELLENŐRZÉSE/.test(system)) return judgeReply(judges++);
      if (step === "lektor") return { notes: [] };
      if (role === "bank") return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
      authors++;
      return authors === 1 ? withSentence("A hármoszög területe az alap és a magasság szorzatának fele.") : withSentence("A háromszög területe az alap és a magasság szorzatának fele.");
    }, "Nem hármoszög területe, hanem háromszög területe."); // owner-alap: a hozzáadott szó a tanár kérésében áll
    return { authors, judges, result };
  };
  const asserted = await run(() => ({ items: [{ id: "stale-0", verdict: "igen", reason: "régi állítás" }] }));
  assert.equal(asserted.authors, 2, "„igen” → javító kör");
  assert.equal(asserted.judges, 1, "a javított mondatban már nincs jelölt");
  const denied = await run(() => ({ items: [{ id: "stale-0", verdict: "nem", reason: "más értelem" }] }));
  assert.equal(denied.authors, 1, "„nem” → átmegy, nincs javító kör");
  const failed = await run(() => { throw new Error("szolgáltatói hiba"); });
  assert.equal(failed.authors, 1, "a hívás hibája nem blokkol");
  assert.equal((failed.result as { staleWarnings?: unknown[] }).staleWarnings?.length, 1, "…hanem figyelmeztetés");
});

test("C11: hosszkorlát → EGYSZER nagyobb keret a modell plafonjáig; ismeretlen plafonnál a régi hiba", async () => {
  const budgets: Array<number | undefined> = [];
  const provider = (model: string): IAIProvider => ({
    name: "stub", model, maxOutputTokens: 24_000, isAvailable: async () => true,
    async chat(_m: AIMessage[], _s?: AbortSignal, options?: ChatCallOptions) {
      budgets.push(options?.maxTokens);
      return budgets.length === 1 ? { content: '{"a":', finishReason: "length" } : { content: '{"ok":true}', finishReason: "stop" };
    },
    async *streamChat() { yield { type: "done" as const }; },
  });
  const result = await callStepModel(provider("gpt-6-luna"), { step: "author", role: "author", model: "gpt-6-luna", system: "S", user: "U" });
  assert.deepEqual(result.json, { ok: true });
  assert.deepEqual(budgets, [undefined, 48_000], "egyszer, a kétszeres keret (≤ 128 000 plafon)");
  budgets.length = 0;
  await assert.rejects(callStepModel(provider("ismeretlen-modell"), { step: "author", role: "author", model: "ismeretlen-modell", system: "S", user: "U" }), /hosszkorlát/);
  assert.equal(budgets.length, 1, "ismeretlen plafon: nincs újrapróba");
  assert.equal(maxOutputForModel("openai/gpt-5.6-terra"), 128_000);
  assert.equal(maxOutputForModel("gpt-5.6-terra"), 128_000);
  assert.equal(maxOutputForModel("anthropic/claude-opus-5.5"), maxOutputForModel("claude-opus-5-5"));
  assert.equal(maxOutputForModel("qwen/qwen3-vl-32b-instruct"), 32_768);
});

test("C10: a stabil előtag (skill-blokk vége) jelölve; az Anthropic-kérés a előtagot cache_control-lal küldi, a gyorsítótár-tokenek naplózhatók", async () => {
  const system = "=== SZAKASZ-SKILL: author (v1) ===\nSkill szöveg\n=== SKILL VÉGE ===\n\nVáltozó lecke-adat";
  assert.equal(system.slice(0, stablePrefixChars(system)).endsWith("=== SKILL VÉGE ==="), true);
  assert.equal(stablePrefixChars("nincs skill"), 0);
  const seen: unknown[] = [];
  const provider: IAIProvider = { name: "stub", model: "m", isAvailable: async () => true,
    async chat(_m: AIMessage[], _s?: AbortSignal, options?: ChatCallOptions) { seen.push(options?.cachePrefixChars); return { content: "{}" }; },
    async *streamChat() { yield { type: "done" as const }; } };
  await callStepModel(provider, { step: "author", role: "author", model: "m", system, user: "U" });
  assert.equal(seen[0], stablePrefixChars(system));
  const claude = new ClaudeProvider({ apiKey: "test-placeholder", model: "claude-opus-5-5", maxTokens: 16_000 });
  let body: Record<string, unknown> = {};
  (claude as unknown as { client: unknown }).client = { messages: { create: async (b: Record<string, unknown>) => { body = b; return { content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 900, cache_creation_input_tokens: 40 } }; } } };
  const response = await claude.chat([{ role: "system", content: system }, { role: "user", content: "U" }], undefined, { cachePrefixChars: stablePrefixChars(system), maxTokens: 32_000 });
  const blocks = body.system as Array<{ text: string; cache_control?: unknown }>;
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].cache_control, { type: "ephemeral" });
  assert.equal(blocks[0].text + blocks[1].text, system);
  assert.equal(body.max_tokens, 32_000, "a hívásonkénti keret felülírja a beállítottat");
  assert.deepEqual(response.usage, { promptTokens: 950, completionTokens: 5, totalTokens: 955, cachedTokens: 900, cacheWriteTokens: 40 });
  assert.equal(claude.maxOutputTokens, 16_000);
});

test("C7: a quote-javítókör csak a hibás fogalmak saját forrásfájlját kapja", () => {
  const files = [{ name: "a.pdf" }, { name: "b.jpg" }, { name: "c.txt" }];
  assert.deepEqual(filesForQuoteRepair(files, [{ sourceRef: { file: "b.jpg" } }]).map((f) => f.name), ["b.jpg"]);
  assert.deepEqual(filesForQuoteRepair(files, [{ sourceRef: { file: "ismeretlen" } }]).map((f) => f.name), ["a.pdf", "b.jpg", "c.txt"], "azonosítatlan hivatkozás → minden fájl");
});

test("B1/B2 (H14): az ábra-szerződés 800×520-at mond, a skill legfeljebb 2 ábrát; az OCR a program oldalcímkéjét; külön webes kivonatoló skill", () => {
  assert.match(VISUAL_PARAMS_CONTRACT, /viewBox=\\"0 0 800 520\\"/);
  assert.doesNotMatch(VISUAL_PARAMS_CONTRACT, /0 0 400 260/);
  assert.match(VISUAL_PARAMS_CONTRACT, /font-size ≥ 32 a viewBox 800 szélességénél/);
  assert.match(ROLE_SKILLS.animator, /legfeljebb 2 \(inkább egy jó\)/);
  assert.match(ROLE_SKILLS.animator, /≥ 10 rajzelem/);
  assert.match(ROLE_SKILLS.animator, /szövegdobozos folyamatábrát pótol/);
  assert.match(ROLE_SKILLS.ocr, /„\[N\. oldal\]" címke/);
  assert.ok("web-extract" in SUPPORT_SKILLS);
  assert.doesNotMatch(SUPPORT_SKILLS["web-research"], /quote/, "a gyűjtő skill nem kivonatol");
  assert.match(SUPPORT_SKILLS["web-extract"], /karakterre ellenőrzi/);
});

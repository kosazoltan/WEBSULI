import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInventory, buildInstructionPointsPrompt, gapPoints, inventoryConcepts, ownerInventoryOf, parseInstructionPointCandidates,
  pointId, requestFrames, teachablePoints, type PointCandidate,
} from "../server/studio/instruction-points";
import { buildInstructionCheckPrompt, instructionCheckHash, parseInventoryCheck, sectionBodyText } from "../server/studio/instruction-check";
import { buildAuthorPrompt, buildPedagoguePrompt, outlineSchema } from "../server/studio/step-io";
import { OWNER_INSTRUCTION_FRAME, OWNER_INSTRUCTION_MAX, normalizeOwnerInstruction, ownerInstructionPromptBlock } from "../shared/owner-instruction";
import { lessonSchema, type Lesson } from "../shared/lesson-schema";
import { SUPPORT_SKILLS } from "../server/studio/support-skills";
import { PROMPT_ROLES } from "../shared/instruction-bundles/roles";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U3, C14, H7/H34/H47/H50): a tanári kérés pontjegyzéke a tervezés előtt. */

/** A VALÓDI Egyiptom-kérés (studio_jobs d76548dd / 5ca6ab42, 2026-09-30) — a korpusz 16 pontos mérésének alapja. */
const EGYPT_REQUEST = "5. osztályos történelem-lecke: Az ókori Egyiptom. Ezeket mind tanítsd: a Nílus és áradásai, a termékeny iszap, az öntözéses földművelés és a csatornák; Egyiptom a Nílus ajándéka; Alsó- és Felső-Egyiptom egyesítése, a fáraó hatalma (isteni uralkodó); a társadalom: fáraó, papok és hivatalnokok (írnokok), katonák, parasztok és kézművesek, rabszolgák; a vallás: sokistenhit, a túlvilágba vetett hit, a múmiák készítése; a piramisok mint a fáraók sírjai, a gízai piramisok; a hieroglif írás és a papirusz; a naptár és az időmérés. A gyereknek szóló szövegben ne hivatkozz a forrásra: közvetlenül, érthetően tanítsd a tartalmat, a miérteket röviden elmagyarázva.";
/** Forrás-kivonat (teszt-fixture): 13 pontot betűhíven kimond, a papiruszt és az időmérést nem; a társadalomhoz csak a témát érinti. */
const EGYPT_SOURCE = "A Nílus minden évben megáradt, és termékeny iszapot terített a földekre. Az emberek csatornákat ástak, így öntözéses földművelést folytattak. Hérodotosz szerint Egyiptom a Nílus ajándéka. Ménész fáraó egyesítette Alsó- és Felső-Egyiptomot. A fáraót isteni uralkodónak tartották. A szabad parasztok dolgoznak a földeken. Az egyiptomiak sok istent tiszteltek. Hittek a túlvilági életben, ezért a halottakat bebalzsamozták, így készültek a múmiák. A piramisok a fáraók sírjai voltak; a leghíresebbek a gízai piramisok. Az egyiptomiak hieroglifákkal írtak. Az év kezdetét a Nílus áradásához kötötték, így naptárt készítettek.";

/** A 16 pont (a d76548dd futás ellenőrző-listája) a kérés betűhű részleteivel és a forrás idézeteivel. */
const EGYPT_POINTS: Array<[text: string, span: string, quote: string, supports?: "yes" | "no"]> = [
  ["A Nílus és áradásai", "a Nílus és áradásai", "A Nílus minden évben megáradt"],
  ["A termékeny iszap", "a termékeny iszap", "termékeny iszapot terített a földekre"],
  ["Az öntözéses földművelés és a csatornák", "az öntözéses földművelés és a csatornák", "csatornákat ástak, így öntözéses földművelést folytattak"],
  ["Egyiptom a Nílus ajándéka", "Egyiptom a Nílus ajándéka", "Egyiptom a Nílus ajándéka"],
  ["Alsó- és Felső-Egyiptom egyesítése", "Alsó- és Felső-Egyiptom egyesítése", "Ménész fáraó egyesítette Alsó- és Felső-Egyiptomot"],
  ["A fáraó hatalma: isteni uralkodó", "a fáraó hatalma (isteni uralkodó)", "A fáraót isteni uralkodónak tartották"],
  // H34 regresszió (d76548dd `instructionConcepts`): a téma érintése nem igazolja a társadalom csoportjainak felsorolását.
  ["A társadalom csoportjai: fáraó, papok és hivatalnokok (írnokok), katonák, parasztok és kézművesek, rabszolgák", "a társadalom: fáraó, papok és hivatalnokok (írnokok), katonák, parasztok és kézművesek, rabszolgák", "A szabad parasztok dolgoznak a földeken", "no"],
  ["A vallás: sokistenhit", "sokistenhit", "Az egyiptomiak sok istent tiszteltek"],
  ["A túlvilágba vetett hit", "a túlvilágba vetett hit", "Hittek a túlvilági életben"],
  ["A múmiák készítése", "a múmiák készítése", "a halottakat bebalzsamozták, így készültek a múmiák"],
  ["A piramisok mint a fáraók sírjai", "a piramisok mint a fáraók sírjai", "A piramisok a fáraók sírjai voltak"],
  ["A gízai piramisok", "a gízai piramisok", "a leghíresebbek a gízai piramisok"],
  ["A hieroglif írás", "a hieroglif írás", "Az egyiptomiak hieroglifákkal írtak"],
  ["A papirusz", "a papirusz", ""],
  ["Az egyiptomi naptár", "a naptár", "így naptárt készítettek"],
  ["Az időmérés", "az időmérés", ""],
];
const candidate = ([text, span, quote, supports]: (typeof EGYPT_POINTS)[number]): PointCandidate => ({ text, requestSpan: span, kind: "teach", ...(quote ? { sourceQuote: quote, supports: supports ?? "yes" } : {}) });

test("H47/H50: a kérés teljes szövege tárolódik; a kereten túli rész JELÖLT feldolgozatlan pont, nem néma vágás", () => {
  const long = `Tanítsd ezt: ${"alma ".repeat(9000)}`;
  assert.ok(long.length > OWNER_INSTRUCTION_FRAME && long.length < OWNER_INSTRUCTION_MAX);
  assert.equal(normalizeOwnerInstruction(long)!.length, long.trim().length, "nincs 2000 karakteres néma vágás (csak a szélek trimmelve)");
  const frames = requestFrames(long);
  assert.equal(frames.truncated, true); assert.equal(frames.processed.length, OWNER_INSTRUCTION_FRAME);
  const inventory = buildInventory([[{ text: "Alma", requestSpan: "alma", kind: "teach", sourceQuote: "az alma a leggyakoribb gyümölcs", supports: "yes" }]], long, "Az alma a leggyakoribb gyümölcs a kertben.");
  assert.equal(inventory.truncated, true);
  const unprocessed = inventory.points.find((p) => p.processing === "unprocessed")!;
  assert.match(unprocessed.text, /feldolgozatlan része \(\d+ karakter/);
  assert.equal(unprocessed.content, "undecidable");
  assert.ok(gapPoints(inventory).some((g) => g.id === "pt-unprocessed"));
  const block = ownerInstructionPromptBlock(long, ownerInventoryOf(inventory)).join("\n");
  assert.match(block, /a kérés további \d+ karaktere a kereten túl/);
  assert.match(block, /FELDOLGOZATLAN \(kereten túl\)/);
  assert.match(buildInstructionPointsPrompt(long, "x", { title: "T", subject: "s", classroom: 5 }, 1).user, /requestTruncated/);
});

test("C14: jelölt csak betűhű requestSpan-nel marad; a kizárt tartalom kiesik; azonos span eltérő értelmezéssel többértelmű", () => {
  const request = "Tanítsd a piramisokat és a fáraókat, de a múmiákat ne tanítsd. Rövid mondatokban írj.";
  const raw = parseInstructionPointCandidates({ points: [
    { text: "A piramisok", requestSpan: "a piramisokat", kind: "teach" },
    { text: "A szfinx", requestSpan: "a szfinxet", kind: "teach" },
    { text: "Rövid mondatok", requestSpan: "Rövid mondatokban írj", kind: "style" },
    { text: "", requestSpan: "a fáraókat" },
  ] }, request);
  assert.deepEqual(raw.map((c) => [c.text, c.kind]), [["A piramisok", "teach"], ["Rövid mondatok", "style"]], "nem betűhű span és üres szöveg kiesik; a style megmarad jelöltként");
  const pass2 = parseInstructionPointCandidates({ points: [
    { text: "A múmiák készítése", requestSpan: "a múmiákat", kind: "teach", sourceQuote: "a halottakat bebalzsamozták, így készültek a múmiák", supports: "yes" },
    { text: "A múmiákat nem kell tanítani", requestSpan: "a múmiákat ne tanítsd", kind: "exclude" },
    { text: "A fáraók", requestSpan: "a fáraókat", kind: "teach", sourceQuote: "A fáraót isteni uralkodónak tartották", supports: "yes" },
    { text: "A sírépítés technikája", requestSpan: "a piramisokat", kind: "teach", sourceQuote: "A piramisok a fáraók sírjai voltak", supports: "yes" },
  ] }, request);
  const inventory = buildInventory([raw, pass2], request, EGYPT_SOURCE);
  assert.deepEqual(inventory.excluded, ["A múmiákat nem kell tanítani", "A múmiák készítése"], "a kizárás maga és a kizárt többletpont is a jegyzékben (review #161)");
  // Review #161 (P1): a betűhű idézet supports ítélet nélkül NEM igazol — eldöntetlen, nem tanítható
  const noVerdict = buildInventory([[{ text: "A fáraók", requestSpan: "a fáraókat", kind: "teach", sourceQuote: "A fáraót isteni uralkodónak tartották" }]], request, EGYPT_SOURCE);
  assert.equal(noVerdict.points[0].content, "undecidable");
  assert.match(noVerdict.points[0].reason!, /nem adott alátámasztási ítéletet/);
  assert.deepEqual(teachablePoints(noVerdict), []);
  assert.deepEqual(buildInventory([[{ text: "Csak kizárás", requestSpan: "a múmiákat ne tanítsd", kind: "exclude" }]], request, EGYPT_SOURCE).excluded, ["Csak kizárás"], "kizárás átfedő tanítandó jelölt nélkül is megmarad");
  assert.ok(!inventory.points.some((p) => /múmi/i.test(p.text)));
  assert.equal(inventory.points.find((p) => p.text === "A fáraók")?.content, "pending");
  const piramis = inventory.points.find((p) => p.id === pointId("a piramisokat"))!;
  assert.equal(piramis.content, "ambiguous", "ugyanaz a span két, egymást nem tartalmazó értelmezéssel");
  assert.match(piramis.reason!, /két kivonat másképp értelmezi/);
  assert.deepEqual(gapPoints(inventory).map((g) => g.id), [piramis.id]);
});

test("Egyiptom-korpusz (16 pont, valódi kérés): két kivonat uniója, forrás-igazolás külön ellenőrzéssel, hiányok a tanárnak", () => {
  const pass1 = EGYPT_POINTS.slice(0, 15).map(candidate); // az első kivonat az időmérést kihagyta
  const pass2 = [...EGYPT_POINTS.slice(1).map(candidate), { text: "Ne hivatkozz a forrásra", requestSpan: "ne hivatkozz a forrásra", kind: "style" as const },
    { ...candidate(EGYPT_POINTS[0]), text: "A Nílus és áradásai (évente)" }]; // ugyanaz a pont bővebb megfogalmazással (tartalmazás → nem többértelmű)
  const inventory = buildInventory([pass1, pass2], EGYPT_REQUEST, EGYPT_SOURCE);
  assert.equal(inventory.truncated, false);
  assert.equal(inventory.points.length, 16, "az unió a 16 pont — egyik kivonat sem teljes önmagában");
  const byText = new Map(inventory.points.map((p) => [p.text, p]));
  assert.equal(teachablePoints(inventory).length, 13);
  const gaps = gapPoints(inventory);
  assert.deepEqual(gaps.map((g) => g.point), ["A társadalom csoportjai: fáraó, papok és hivatalnokok (írnokok), katonák, parasztok és kézművesek, rabszolgák", "A papirusz", "Az időmérés"]);
  assert.equal(byText.get("A társadalom csoportjai: fáraó, papok és hivatalnokok (írnokok), katonák, parasztok és kézművesek, rabszolgák")!.supports, "no", "H34: a témát érintő idézet nem igazol");
  assert.match(byText.get("A papirusz")!.reason!, /nincs betűhű forrás-idézet/);
  assert.equal(byText.get("Az egyiptomi naptár")!.content, "pending");
  assert.equal(inventory.points[0].text, "A Nílus és áradásai", "a kérés sorrendje");
  for (const p of inventory.points) assert.match(p.id, /^pt-[0-9a-f]{8}$/);
  const concepts = inventoryConcepts(inventory);
  assert.equal(concepts.length, 13);
  assert.ok(concepts.every((c) => /^instr-[0-9a-f]{8}$/.test(c.localId) && c.quote && c.examWeight === "supporting"));
  const block = ownerInstructionPromptBlock(EGYPT_REQUEST, ownerInventoryOf(inventory)).join("\n");
  assert.match(block, /PONTJEGYZÉKE/);
  assert.ok(block.includes(`${byText.get("A papirusz")!.id} [NINCS A FORRÁSBAN`));
  assert.ok(block.includes(`${byText.get("A gízai piramisok")!.id} [IGAZOLT`));
  // forrás nélkül minden pont eldönthetetlen, okkal
  const blind = buildInventory([pass1], EGYPT_REQUEST, null);
  assert.ok(blind.points.every((p) => p.content === "undecidable" && /nincs forrásszöveg/.test(p.reason!)));
});

const lesson = {
  title: "Mezopotámia", subject: "történelem", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [],
  sections: [
    { heading: "Babilon városa Kr. e. 2500 körül", probaEnabled: false, blocks: [
      { kind: "explain", text: "**Babilon** a Folyóköz déli részén épült.", depth: "core", readAloud: true, coversConceptIds: ["c1"] },
    ] },
    { heading: "A zikkurat", probaEnabled: false, blocks: [
      { kind: "explain", text: "A zikkurat lépcsős toronytemplom, a tetején a szentély.", depth: "core", readAloud: true, coversConceptIds: ["c2"] },
    ] },
  ],
} as unknown as Lesson;
const request = "Taníts Babilon alapításáról Kr. e. 2500 körül, a zikkuratról és az Istár-kapuról.";
const inventory = buildInventory([[
  { text: "Babilon Kr. e. 2500 körül jött létre", requestSpan: "Babilon alapításáról Kr. e. 2500 körül", kind: "teach", sourceQuote: "Babilon Kr. e. 2500 körül jött létre a Folyóközben.", supports: "yes" },
  { text: "A zikkurat lépcsős toronytemplom", requestSpan: "a zikkuratról", kind: "teach", sourceQuote: "A zikkurat lépcsős toronytemplom volt.", supports: "yes" },
  { text: "Az Istár-kapu", requestSpan: "az Istár-kapuról", kind: "teach", sourceQuote: "Az Istár-kapu Babilon díszkapuja volt.", supports: "yes" },
]], request, "Babilon Kr. e. 2500 körül jött létre a Folyóközben. A zikkurat lépcsős toronytemplom volt. Az Istár-kapu Babilon díszkapuja volt.");
const [babilon, zikkurat, istar] = inventory.points;

test("C14 4. pont: azonosítónként mért ítélet — a cím nem bizonyíték, más fejezet szövege sem; a nem jelentett id részleges jelentés", () => {
  assert.equal(sectionBodyText(lesson, 0).includes("Babilon városa Kr. e. 2500 körül"), false, "a törzsszövegben nincs a cím");
  const check = parseInventoryCheck({ points: [
    { id: babilon.id, taught: true, section: 0, evidence: "Babilon városa Kr. e. 2500 körül" },      // csak a CÍM mondja → nem tanítja
    { id: zikkurat.id, taught: true, section: 0, evidence: "A zikkurat lépcsős toronytemplom" },       // másik fejezet szövege → nem tanítja
    { id: "pt-idegen", taught: true, section: 1, evidence: "A zikkurat lépcsős toronytemplom" },      // jegyzéken kívüli id → figyelmen kívül
  ] }, lesson, null, inventory);
  assert.equal(check.complete, false);
  assert.deepEqual(check.missingIds, [istar.id]);
  assert.deepEqual(check.points.map((p) => [p.id, p.taught, p.undecidable ?? false]), [[babilon.id, false, false], [zikkurat.id, false, false], [istar.id, false, true]]);
  assert.equal(check.points[2].sourceQuote, istar.sourceQuote, "a jegyzék forrás-idézete a nem jelentett ponton is megmarad (kiegészítő fogalomhoz)");
  const ok = parseInventoryCheck({ points: [
    { id: babilon.id, taught: false, section: 0, evidence: "" },
    { id: zikkurat.id, taught: true, section: 1, evidence: "A zikkurat lépcsős toronytemplom, a tetején a szentély." },
    { id: istar.id, taught: false, section: null, evidence: "" },
  ] }, lesson, null, inventory);
  assert.equal(ok.complete, true);
  assert.deepEqual(ok.points.map((p) => p.taught), [false, true, false]);
  assert.throws(() => parseInventoryCheck({ points: [] }, lesson, null, inventory), /üres pontlistát adott, pedig a jegyzékben 3 igazolt pont van/, "H34: üres lista kérés-pontok mellett hiba");
  assert.throws(() => parseInventoryCheck({ notes: [] }, lesson, null, inventory), /nem a kért alakú/);
  const prompt = buildInstructionCheckPrompt(request, lesson, null, inventory);
  assert.ok(prompt.user.includes(`"id":"${babilon.id}"`)); assert.match(prompt.user, /Minden points-azonosítóról pontosan egy ítélet/);
  assert.match(buildInstructionCheckPrompt(request, lesson, null).user, /Nincs pontjegyzék/, "régi futás: id nélküli alak");
  assert.notEqual(instructionCheckHash(request, lesson, null, inventory.hash), instructionCheckHash(request, lesson, null), "ellenőrzés-kulcs: a jegyzék hash-e része");
});

test("B4/B1: a tervező fejezethez rendeli az igazolt pontokat (instructionPointIds), a szerző fejezetenként kapja őket; jegyzék nélkül a régi alak", () => {
  const map = { subject: "történelem", classroom: 5, concepts: [{ localId: "c1", examWeight: "core" as const }, { localId: "c2", examWeight: "core" as const }] };
  const owner = { instruction: request, inventory: ownerInventoryOf(inventory) };
  const prompt = buildPedagoguePrompt(map, undefined, owner);
  assert.match(prompt, /PONTJEGYZÉK → FEJEZET/);
  assert.match(prompt, /"animationSuggestions": string\[\], "instructionPointIds": string\[\] \}\]/);
  assert.ok(prompt.includes(`${zikkurat.id} [IGAZOLT`));
  assert.match(buildPedagoguePrompt(map, undefined, { instruction: request }), /"sections": \[\{ "heading": string, "conceptIds": string\[\], "plannedBlocks": string\[\], "animationSuggestions": string\[\] \}\]/, "jegyzék nélkül a régi kimeneti alak");
  const outline = { sections: [{ heading: "Babilon", conceptIds: ["c1"], plannedBlocks: ["explain"], animationSuggestions: [], instructionPointIds: [babilon.id, istar.id] }, { heading: "A zikkurat", conceptIds: ["c2"], plannedBlocks: ["explain"], animationSuggestions: [], instructionPointIds: [zikkurat.id] }], misconceptions: [] };
  const parsed = outlineSchema.safeParse(outline);
  assert.equal(parsed.success, true, JSON.stringify(parsed.success ? [] : parsed.error.issues));
  const author = buildAuthorPrompt(parsed.success ? parsed.data.sections : [], map, [], undefined, owner);
  assert.match(author, /TANÁRI PONTOK FEJEZETENKÉNT/);
  assert.ok(author.includes(`- [0] Babilon: ${babilon.id} — Babilon Kr. e. 2500 körül jött létre — forrás: „Babilon Kr. e. 2500 körül jött létre a Folyóközben.”`));
  assert.ok(author.includes(`- [1] A zikkurat: ${zikkurat.id}`));
  assert.doesNotMatch(buildAuthorPrompt(parsed.success ? parsed.data.sections : [], map, [], undefined, { instruction: request }), /TANÁRI PONTOK FEJEZETENKÉNT/);
});

test("gaps: a séma fogadja, a régi lecke változatlan; skillek és szerep bekötve", () => {
  const fixture = standardFusionFixture();
  const withGaps = lessonSchema.safeParse({ ...fixture, gaps: [{ id: "pt-1", point: "A papirusz", reason: "nincs a forrásban" }] });
  assert.equal(withGaps.success, true);
  assert.equal(lessonSchema.safeParse(fixture).success, true);
  assert.ok((PROMPT_ROLES as readonly string[]).includes("instruction-points"));
  for (const must of ["requestSpan", "\"exclude\"", "supports", "témát érinti"]) assert.ok(SUPPORT_SKILLS["instruction-points"].includes(must), must);
  for (const must of ["PONTJEGYZÉKÉHEZ", "nem a címében", "MINDEN kapott id-hoz pontosan egy elem", "más fejezet szövege bizonyítékként"]) assert.ok(SUPPORT_SKILLS["instruction-checker"].includes(must), must);
  assert.ok(SUPPORT_SKILLS["instruction-points"].length < 2800 && SUPPORT_SKILLS["instruction-checker"].length < 2800);
});

test("élő mérés ba8e35bb: az átfogalmazás nem többértelmű; a rövid, teljes forrássor igazol; ellenőrizhetetlen idézetnél program-indok", () => {
  const request = "a társadalom: fáraó, papok és hivatalnokok (írnokok), katonák; a vallás: sokistenhit, a túlvilágba vetett hit; a hieroglif írás és a papirusz; a piramisokat";
  const source = ["Egyiptom", "- a papok a templomokban szolgáltak, ők a társadalom fontos csoportja", "- több istenben hittek, a sokistenhit jellemezte őket", "- I. Egyiptomi írás = hieroglifák", "- papiruszra írtak", "- A piramisok a fáraók sírjai voltak"].join("\n");
  const pass1 = [
    { text: "A papok a társadalom egyik csoportja.", requestSpan: "papok", kind: "teach" as const, sourceQuote: "a papok a templomokban szolgáltak, ők a társadalom fontos csoportja", supports: "yes" as const },
    { text: "Az egyiptomiak sokistenhitűek voltak.", requestSpan: "sokistenhit", kind: "teach" as const, sourceQuote: "több istenben hittek, a sokistenhit jellemezte őket", supports: "yes" as const },
    { text: "Papiruszra írtak.", requestSpan: "a papirusz", kind: "teach" as const, sourceQuote: "papiruszra írtak", supports: "yes" as const, reason: "A forrás kimondja." },
    { text: "A piramisok", requestSpan: "a piramisokat", kind: "teach" as const },
  ];
  const pass2 = [
    { text: "a társadalom csoportja: papok", requestSpan: "papok", kind: "teach" as const },
    { text: "Az egyiptomiak több istenben hittek", requestSpan: "sokistenhit", kind: "teach" as const },
    { text: "A sírépítés technikája", requestSpan: "a piramisokat", kind: "teach" as const, sourceQuote: "A piramisok a fáraók sírjai voltak", supports: "yes" as const },
    { text: "A hieroglifákat papiruszra írták", requestSpan: "a hieroglif írás", kind: "teach" as const, sourceQuote: "papiruszra", supports: "yes" as const, reason: "A forrás kimondja." },
  ];
  const inventory = buildInventory([pass1, pass2], request, source);
  const by = (span: string) => inventory.points.find((p) => p.id === pointId(span))!;
  assert.equal(by("papok").content, "pending", "átfogalmazás, mindkettő a papokról szól");
  assert.equal(by("papok").text, "A papok a társadalom egyik csoportja.", "az igazolt értelmezés szövege");
  assert.equal(by("sokistenhit").content, "pending", "„sokistenhit” / „több istenben hittek”: közös szótő a részlettel");
  assert.equal(by("a papirusz").content, "pending", "16 betűs, de teljes forrássor → igazol");
  assert.equal(by("a piramisokat").content, "ambiguous", "a részlethez nem kötődő átértelmezés továbbra is többértelmű");
  const hiero = by("a hieroglif írás");
  assert.equal(hiero.content, "not_in_source", "a sor RÉSZLETE (nem teljes sor, < 20 betű) nem igazol");
  assert.match(hiero.reason!, /nem igazolható betűhűen/, "nem a modell „kimondja” indoka");
});

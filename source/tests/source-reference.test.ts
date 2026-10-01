import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteSourceReferences, sourceReferenceFindings, stripSourceReferences } from "../server/studio/source-reference";
import type { Lesson } from "../shared/lesson-schema";

/** Spec 2026-09-30 (docs/specs/2026-09-30-nem-elakado-kozzetetel.md, D4) — élő minták a Mezopotámia-futásból. */

const lesson = (texts: { explain: string; feedback: string; sample: string }) => ({
  title: "Mezopotámia", subject: "történelem", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [],
  sections: [{ heading: "Babilon", probaEnabled: false, blocks: [
    { kind: "explain", text: texts.explain, depth: "core", readAloud: true, coversConceptIds: ["c1"] },
    { kind: "animate", animKind: "process", params: { steps: ["a forrás szerint x", "y"] }, caption: "Babilon a forrás szerint", coversConceptIds: ["c1"] },
    { kind: "check", question: "Mi igaz?", options: ["a", "b"], correctIndex: 0, feedbackPerOption: [texts.feedback, "Nem."], coversConceptIds: ["c1"] },
  ] }],
  experience: { methods: [], quiz: [], glossary: [], tasks: [{
    id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mikor jött létre Babilon?", mode: "written", minWords: 6, needsSentence: true,
    required: [["Babilon"], ["Kr. e. 2500"]], bonus: [], sample: texts.sample,
  }] },
}) as unknown as Lesson;

test("a bevezető „a forrás szerint” kikerül, a mondat nagybetűvel indul; az ábra érintetlen", () => {
  const L = lesson({
    explain: "A forrás szerint Babilon a folyóköz fontos városa volt. Istár, a forrás szerint, a szerelem istennője volt.",
    feedback: "Helyes: a forrás szerint Babilon agyagtéglából épült.",
    sample: "Babilon városa Kr. e. 2500 körül jött létre, és a folyóköz egyik fontos városa lett.",
  });
  const { lesson: out, fixed } = stripSourceReferences(L);
  const blocks = out.sections[0].blocks as Array<Record<string, unknown>>;
  assert.equal(blocks[0].text, "Babilon a folyóköz fontos városa volt. Istár, a szerelem istennője volt.");
  assert.deepEqual(blocks[2].feedbackPerOption, ["Helyes: Babilon agyagtéglából épült.", "Nem."]);
  assert.equal(blocks[1].caption, "Babilon a forrás szerint", "az ábra nem gyereknek szóló szövegmező itt");
  assert.equal(fixed, 2);
  assert.deepEqual(sourceReferenceFindings(out), []);
});

test("a nem biztonságos fordulat (szerepel a füzetben) marad, de találatként jelentkezik", () => {
  const L = lesson({ explain: "Babilon városa Kr. e. 2500 körül szerepel a füzetben.", feedback: "Igen.", sample: "Babilon városa Kr. e. 2500 körül jött létre, és a folyóköz egyik fontos városa lett." });
  const { lesson: out } = stripSourceReferences(L);
  assert.equal((out.sections[0].blocks[0] as { text: string }).text, "Babilon városa Kr. e. 2500 körül szerepel a füzetben.");
  assert.deepEqual(sourceReferenceFindings(out).map((f) => f.path), ["sections[0].blocks[0].text"]);
});

test("a feladat változása visszavonva, ha a saját minta utána nem kapna teljes pontot; a rubrika sosem változik", () => {
  const L = lesson({ explain: "x", feedback: "Igen.", sample: "A forrás szerint Babilon Kr. e. 2500 körül." });
  const { lesson: out } = stripSourceReferences(L);
  const task = out.experience!.tasks[0];
  assert.deepEqual(task.required, [["Babilon"], ["Kr. e. 2500"]]);
  // A törölt változat („Babilon Kr. e. 2500 körül.”) túl rövid a 6 szavas minimumhoz → az eredeti tétel marad.
  assert.equal(task.sample, "A forrás szerint Babilon Kr. e. 2500 körül.");
});

test("a földrajzi forrás (a Duna forrása) nem hivatkozás; a „füzetben” és „a forrásban” igen", () => {
  const L = lesson({ explain: "A Duna forrása a Fekete-erdőben van. A tankönyv szerint fontos.", feedback: "A forrásban tanított érték.", sample: "Babilon városa Kr. e. 2500 körül jött létre, és a folyóköz egyik fontos városa lett." });
  const found = sourceReferenceFindings(L).map((f) => f.path);
  assert.deepEqual(found, ["sections[0].blocks[0].text", "sections[0].blocks[2].feedbackPerOption[0]"]);
  const { lesson: out } = stripSourceReferences(L);
  assert.equal((out.sections[0].blocks[0] as { text: string }).text, "A Duna forrása a Fekete-erdőben van. Fontos.");
});

test("rewriteSourceReferences: csak ellenőrzött átírás (forrás-szó nélkül, azonos számokkal) kerül be", async () => {
  const L = lesson({ explain: "A forrás Istárt a szerelem istenének nevezi.", feedback: "Helyes: a forrás 282 paragrafust említ.", sample: "Babilon városa Kr. e. 2500 körül jött létre, és a folyóköz egyik fontos városa lett." });
  let seenSystem = "";
  const { lesson: out, rewritten, rejected } = await rewriteSourceReferences(L, async (system, user) => {
    seenSystem = system;
    const items = (JSON.parse(user) as { items: Array<{ path: string }> }).items;
    assert.deepEqual(items.map((i) => i.path), ["sections[0].blocks[0].text", "sections[0].blocks[2].feedbackPerOption[0]"]);
    return { items: [
      { path: "sections[0].blocks[0].text", text: "Istár a szerelem istennője volt." },
      { path: "sections[0].blocks[2].feedbackPerOption[0]", text: "Helyes: a törvényoszlop 300 paragrafusból állt." },
    ] };
  });
  assert.match(seenSystem, /SKILL/);
  assert.equal((out.sections[0].blocks[0] as { text: string }).text, "Istár a szerelem istennője volt.");
  assert.equal((out.sections[0].blocks[2] as { feedbackPerOption: string[] }).feedbackPerOption[0], "Helyes: a forrás 282 paragrafust említ.", "megváltozott szám → elutasítva");
  assert.deepEqual([rewritten, rejected], [1, 1]);
  assert.equal((L.sections[0].blocks[0] as { text: string }).text, "A forrás Istárt a szerelem istenének nevezi.", "az eredeti érintetlen");
});

test("review #151 (P2): „A tananyag szerint” és a nagybetűs „A Forrás szerint” is felismert és törölt", () => {
  const L = lesson({ explain: "A tananyag szerint Babilon fontos város volt. A Forrás szerint agyagtéglából épült.", feedback: "Igen.", sample: "Babilon városa Kr. e. 2500 körül jött létre, és a folyóköz egyik fontos városa lett." });
  assert.equal(sourceReferenceFindings(L).length, 1);
  const { lesson: out } = stripSourceReferences(L);
  assert.equal((out.sections[0].blocks[0] as { text: string }).text, "Babilon fontos város volt. Agyagtéglából épült.");
});

test("élő mérés ba8e35bb: a modell által ki nem jelentett tétel EGYSZER célzottan újra megy; a maradék „nem jelentett” szám", async () => {
  const L = lesson({ explain: "A forrás Istárt a szerelem istenének nevezi.", feedback: "Helyes: a tananyag szerint Babilon nagy város volt.", sample: "Babilon városa Kr. e. 2500 körül jött létre, és a folyóköz egyik fontos városa lett." });
  const asked: string[][] = [];
  const result = await rewriteSourceReferences(L, async (_system, user) => {
    const items = (JSON.parse(user) as { items: Array<{ path: string }> }).items.map((i) => i.path);
    asked.push(items);
    // 1. válasz: csak az első tétel; 2. válasz: a kimaradt
    return asked.length === 1
      ? { items: [{ path: "sections[0].blocks[0].text", text: "Istár a szerelem istennője volt." }] }
      : { items: [{ path: "sections[0].blocks[2].feedbackPerOption[0]", text: "Helyes: Babilon nagy város volt." }] };
  });
  assert.deepEqual(asked, [["sections[0].blocks[0].text", "sections[0].blocks[2].feedbackPerOption[0]"], ["sections[0].blocks[2].feedbackPerOption[0]"]], "a második kérés csak a kimaradt tételt kapja");
  assert.deepEqual([result.rewritten, result.rejected, result.unreported], [2, 0, 0]);
  assert.equal(sourceReferenceFindings(result.lesson).length, 0);
  let calls = 0;
  const silent = await rewriteSourceReferences(L, async () => { calls++; return { items: [] }; });
  assert.equal(calls, 2, "legfeljebb egy újrakérés");
  assert.deepEqual([silent.rewritten, silent.rejected, silent.unreported], [0, 0, 2]);
});

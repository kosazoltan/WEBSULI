import test from "node:test";
import assert from "node:assert/strict";
import { dropUnknownBlocks, lessonSchema } from "../shared/lesson-schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** V-kompat (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): a régi kliens tűri az újabb blokkfajtákat. */
type RawLesson = { sections: Array<{ blocks: Array<Record<string, unknown>> }> };
const conceptOf = (l: RawLesson) => (l.sections[0].blocks.find((b) => Array.isArray(b.coversConceptIds) && (b.coversConceptIds as unknown[]).length)!.coversConceptIds as string[]).slice(0, 1);

test("ismeretlen kind, tryKind és animKind kimarad; az ismert blokkok sorrendje változatlan; a lecke érvényes", () => {
  const l = structuredClone(fusionFixture()) as unknown as RawLesson;
  const concept = conceptOf(l);
  const known = l.sections[0].blocks.map((b) => b.kind);
  l.sections[0].blocks.splice(1, 0, { kind: "flipCard", front: "x", back: "y", coversConceptIds: concept });
  l.sections[0].blocks.push({ kind: "try", tryKind: "numberLine", spec: {}, coversConceptIds: concept });
  l.sections[0].blocks.push({ kind: "animate", animKind: "holoDeck", params: {}, caption: "Új ábra.", coversConceptIds: concept });
  assert.equal(lessonSchema.safeParse(l).success, false, "szűrés nélkül sérült");
  const out = dropUnknownBlocks(l) as RawLesson;
  assert.deepEqual(out.sections[0].blocks.map((b) => b.kind), known);
  assert.equal(lessonSchema.safeParse(out).success, true);
});

test("ha egy fejezet minden blokkja ismeretlen, a fejezet megmarad (az indexek nem csúsznak) egy frissítésre kérő magyarázattal", () => {
  const l = structuredClone(fusionFixture()) as unknown as RawLesson & { sections: Array<{ title?: string }> };
  const concept = conceptOf(l);
  // A minta egyfejezetes: a második fejezet az első másolata, csupa ismeretlen blokkal.
  l.sections.push({ ...structuredClone(l.sections[0]), title: "Új fajtájú fejezet" });
  const count = l.sections.length;
  const title = l.sections[1].title;
  l.sections[1].blocks = [{ kind: "flipCard", coversConceptIds: concept }, { kind: "try", tryKind: "estimate", spec: {}, coversConceptIds: concept }];
  const out = dropUnknownBlocks(l) as RawLesson & { sections: Array<{ title?: string }> };
  assert.equal(out.sections.length, count);
  assert.equal(out.sections[1].title, title);
  assert.equal(out.sections[1].blocks.length, 1);
  assert.equal(out.sections[1].blocks[0].kind, "explain");
  assert.match(String(out.sections[1].blocks[0].text), /frissítsd az oldalt/i);
  assert.deepEqual(out.sections[1].blocks[0].coversConceptIds, concept);
  assert.equal(lessonSchema.safeParse(out).success, true);
});

test("nem lecke-alakú bemenet változatlan; ismert leckén nincs változás", () => {
  assert.equal(dropUnknownBlocks(null), null);
  assert.equal(dropUnknownBlocks("x"), "x");
  const l = fusionFixture();
  assert.deepEqual(dropUnknownBlocks(l), l);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  outlineSchema,
  lektorReportSchema,
  outlineCoversMap,
  lessonIdsSubsetOfMap,
  buildPedagoguePrompt,
  buildAuthorPrompt,
  buildLektorPrompt,
  D1_RULE_TEXT,
} from "../server/studio/step-io";
import type { MapConcept } from "../server/studio/coverage";
import type { LessonOutline, OutlineSection } from "../server/studio/step-io";
import type { Lesson } from "../shared/lesson-schema";

/**
 * LS-2c — the missing half of the pipeline.
 *
 * The state machine (pipeline.ts), the coverage gate and the lektor classifier shipped
 * in LS-2b, but the steps that actually spend model calls — pedagogue, author, lektor —
 * were never wired to a provider. These tests pin the pure layer first: the schemas a
 * model's JSON must fit, the outline coverage rule, the id-subset rule, and the prompt
 * builders including the D1 wording that must appear verbatim.
 */

const MAP: MapConcept[] = [
  { localId: "c1", examWeight: "core" },
  { localId: "c2", examWeight: "core" },
  { localId: "s1", examWeight: "supporting" },
  { localId: "s2", examWeight: "supporting" },
  { localId: "s3", examWeight: "supporting" },
  { localId: "s4", examWeight: "supporting" },
  { localId: "s5", examWeight: "supporting" },
  { localId: "s6", examWeight: "supporting" },
  { localId: "s7", examWeight: "supporting" },
  { localId: "s8", examWeight: "supporting" },
  { localId: "s9", examWeight: "supporting" },
  { localId: "s10", examWeight: "supporting" },
];

const GOOD_OUTLINE: LessonOutline = {
  sections: [
    { heading: "Fogalmak", conceptIds: ["c1", "c2"], plannedBlocks: ["explain", "check", "recap"], animationSuggestions: [] },
    {
      heading: "Kiegészítés",
      conceptIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"],
      plannedBlocks: ["example", "check", "recap"],
      animationSuggestions: [],
    },
  ],
  misconceptions: [],
};

test("OutlineSchema: a jó vázlat érvényes", () => {
  const parsed = outlineSchema.safeParse(GOOD_OUTLINE);
  assert.equal(parsed.success, true);
});

test("OutlineSchema: üres conceptIds nem fogadható el", () => {
  const parsed = outlineSchema.safeParse({
    sections: [{ heading: "X", conceptIds: [], plannedBlocks: ["explain"] }],
  });
  assert.equal(parsed.success, false);
});

test("outlineCoversMap: core 100% + supporting 100% → ok", () => {
  const out = outlineCoversMap(GOOD_OUTLINE.sections, MAP);
  assert.equal(out.ok, true);
  assert.deepEqual(out.missingCore, []);
  assert.deepEqual(out.unknownIds, []);
});

test("outlineCoversMap: hiányzó core elutasítás, megnevezve", () => {
  const sections: OutlineSection[] = [{ heading: "Fél", conceptIds: ["c1"], plannedBlocks: ["explain"], animationSuggestions: [] }];
  const out = outlineCoversMap(sections, MAP);
  assert.equal(out.ok, false);
  assert.deepEqual(out.missingCore, ["c2"]);
});

test("outlineCoversMap: 90% alatti supporting elutasítás", () => {
  const sections: OutlineSection[] = [
    { heading: "Core", conceptIds: ["c1", "c2"], plannedBlocks: ["explain"], animationSuggestions: [] },
    // 10 supporting-ból 8 = 80% → rejected (a küszöb 90).
    {
      heading: "Supporting",
      conceptIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"],
      plannedBlocks: ["explain"],
      animationSuggestions: [],
    },
  ];
  const out = outlineCoversMap(sections, MAP);
  assert.equal(out.ok, false);
});

test("outlineCoversMap: ismeretlen fogalom-azonosító elutasítás", () => {
  const sections: OutlineSection[] = [
    { heading: "Core", conceptIds: ["c1", "c2", "szellem"], plannedBlocks: ["explain"], animationSuggestions: [] },
  ];
  const out = outlineCoversMap(sections, MAP);
  assert.equal(out.ok, false);
  assert.deepEqual(out.unknownIds, ["szellem"]);
});

test("lessonIdsSubsetOfMap: kitalált azonosítót megnevez", () => {
  const lesson = {
    title: "T",
    subject: "s",
    classroom: 4,
    mapId: "m",
    misconceptions: [],
    sourceOnly: true as const,
    sections: [
      {
        heading: "H",
        probaEnabled: true,
        blocks: [
          {
            kind: "explain" as const,
            text: "x",
            depth: "core" as const,
            readAloud: true,
            coversConceptIds: ["c1", "kitalalt-id"],
          },
        ],
      },
    ],
  } satisfies Lesson;

  assert.deepEqual(lessonIdsSubsetOfMap(lesson, MAP), ["kitalalt-id"]);
  assert.deepEqual(
    lessonIdsSubsetOfMap({ ...lesson, sections: [{ ...lesson.sections[0], blocks: [{ ...lesson.sections[0].blocks[0], coversConceptIds: ["c1"] }] }] }, MAP),
    [],
  );
});

test("lektorReportSchema: a jegyzet-kindek és a D1-kivétel", () => {
  const parsed = lektorReportSchema.safeParse({
    notes: [
      { kind: "source_conflict", subkind: "book_probably_wrong", message: "A könyv téved." },
      { kind: "coverage_gap", subkind: "core", message: "c1 nincs lefedve." },
    ],
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.notes.length, 2);

  const bad = lektorReportSchema.safeParse({ notes: [{ kind: "nem_letezo" }] });
  assert.equal(bad.success, false);
});

test("buildPedagoguePrompt: a térkép teljes JSON-ja benne, magyarul", () => {
  const prompt = buildPedagoguePrompt({ title: "T", subject: "biológia", classroom: 7, concepts: MAP });

  for (const id of ["c1", "s10"]) {
    assert.ok(prompt.includes(id), `${id} nincs a promptban`);
  }
  assert.ok(prompt.includes("biológia"));
  assert.ok(prompt.includes("7"));
});

// #179 — measured live (run c6843493, 2026-09-05): after #178 added MapConcept.id (the
// km_concepts UUID) the prompts serialised the whole concept object, the model started
// using the UUIDs as conceptIds, and coverage dropped to 0%. Prompts speak localId only.
test("a promptok NEM tartalmazzák a fogalom DB-azonosítóját (UUID) — csak a localId-t (#179)", () => {
  const withIds = MAP.map((c, i) => ({ ...c, id: `db-uuid-${i}-ne-lasd` }));
  const pedagogue = buildPedagoguePrompt({ title: "T", subject: "biológia", classroom: 7, concepts: withIds });
  const author = buildAuthorPrompt(GOOD_OUTLINE.sections, { subject: "biológia", classroom: 7, concepts: withIds }, []);
  const lektor = buildLektorPrompt(
    {
      title: "T", subject: "s", classroom: 4, mapId: "m", misconceptions: [], sourceOnly: true as const,
      sections: [{ heading: "H", probaEnabled: true, blocks: [{ kind: "explain" as const, text: "x", depth: "core" as const, readAloud: true, coversConceptIds: ["c1"] }] }],
    } satisfies Lesson,
    { subject: "biológia", classroom: 7, concepts: withIds },
  );
  for (const [name, p] of [["pedagogue", pedagogue], ["author", author], ["lektor", lektor]] as const) {
    assert.ok(!p.includes("db-uuid-"), `${name} prompt kiszivárogtatja a DB-azonosítót`);
    assert.ok(p.includes("c1"), `${name} prompt a localId-t használja`);
  }
});

test("buildAuthorPrompt: D1 szó szerint, concept id-k visszhangozva", () => {
  const prompt = buildAuthorPrompt(GOOD_OUTLINE.sections, { subject: "biológia", classroom: 7, concepts: MAP }, []);

  assert.ok(prompt.includes(D1_RULE_TEXT), "a D1 szabály szó szerinti szövege kötelező");
  for (const id of ["c1", "c2", "s10"]) {
    assert.ok(prompt.includes(id), `${id} id nem szerepel a szerzői promptban`);
  }
});

test("buildAuthorPrompt: a book_probably_wrong jegyzet SOHA nem jut el a szerzőhöz", () => {
  const blockerNotes = [
    { kind: "source_conflict", subkind: "not_in_map", message: "A c1 állítás nincs a térképen." },
    {
      kind: "source_conflict",
      subkind: "book_probably_wrong",
      message: "A könyv elavult adatot közöl a térképen.",
    },
  ];

  const prompt = buildAuthorPrompt(
    GOOD_OUTLINE.sections,
    { subject: "biológia", classroom: 7, concepts: MAP },
    blockerNotes as never,
  );

  assert.ok(prompt.includes("A c1 állítás nincs a térképen."), "a blokkoló jegyzet megy a szerzőnek");
  assert.ok(
    !prompt.includes("elavult adatot"),
    "a book_probably_wrong üzenete az adminé — a szerző soha nem láthatja (D1)",
  );
});

test("buildLektorPrompt: D1 szó szerint, a lecke JSON-ja és a térkép benne", () => {
  const lesson = {
    title: "T",
    subject: "s",
    classroom: 4,
    mapId: "m",
    misconceptions: [],
    sourceOnly: true as const,
    sections: [
      {
        heading: "H",
        probaEnabled: true,
        blocks: [
          {
            kind: "explain" as const,
            text: "x",
            depth: "core" as const,
            readAloud: true,
            coversConceptIds: ["c1", "kitalalt-id"],
          },
        ],
      },
    ],
  } satisfies Lesson;

  const prompt = buildLektorPrompt(lesson, { subject: "biológia", classroom: 7, concepts: MAP });

  assert.ok(prompt.includes(D1_RULE_TEXT), "a D1 szabály szó szerinti szövege a lektor promptjában is kötelező");
  assert.ok(prompt.includes("kitalalt-id"), "a lecke tartalma (a vizsgálandó szöveg) benne van");
  assert.ok(prompt.includes("book_probably_wrong"), "a lektor megkapja a D1-kivétel eszközét");
  // #177: a recap blokknak séma szerint NINCS coversConceptIds — a lektor nem jelentheti hibának.
  assert.match(prompt, /recap[^\n]*coversConceptIds[^\n]*(never|not)/i, "a recap-kivétel a lektor promptjában");
  assert.ok(prompt.includes("biológia"), "a térkép metaadata benne van");
});

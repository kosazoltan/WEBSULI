import { test } from "node:test";
import assert from "node:assert/strict";
import { designLessonVisuals, designerVisuals } from "../server/studio/visual-designer";
import { weakVisuals } from "../server/studio/visual-quality";
import type { Lesson } from "../shared/lesson-schema";

/** Spec 2026-09-30 (docs/specs/2026-09-30-abratervezo-3d.md): fejezetenkénti ábratervező. */

const section = (heading: string, text: string, id: string) => ({
  heading, probaEnabled: true,
  blocks: [{ kind: "explain", text, depth: "core", readAloud: true, coversConceptIds: [id] }],
});
const lesson = {
  title: "Mezopotámia", subject: "történelem", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [],
  sections: [
    section("A folyóköz", "Mezopotámia a Tigris és az Eufrátesz közötti folyóköz.", "c1"),
    section("A zikkurat", "A zikkurat lépcsős toronytemplom, a tetején szentély.", "c2"),
    section("Időrend", "Kr. e. 3100 táján írás, Kr. e. 2500 körül Babilon.", "c3"),
  ],
} as unknown as Lesson;
const concepts = [
  { localId: "c1", term: "folyóköz", examWeight: "core" },
  { localId: "c2", term: "zikkurat", examWeight: "core" },
  { localId: "c3", term: "Babilon", examWeight: "core" },
] as never;

const scene = { after: 0, animKind: "scene3d", caption: "A zikkurat lépcsős toronytemplom.", coversConceptIds: ["c2"], params: {
  objects: [{ shape: "stairs", at: [0, 0, 0], size: [6, 4, 6], steps: 4, color: "#d98c4a", label: "zikkurat" }, { shape: "box", at: [0, 4, 0], size: [1, 1, 1], color: "#f1e3c6", label: "szentély" }],
} };
const timeline = { after: 0, animKind: "timeline", caption: "Babilon az időrendben.", coversConceptIds: ["c3"], params: { events: ["Kr. e. 3100: írás", "Kr. e. 2500: Babilon"] } };
const river = { after: 0, animKind: "scene3d", caption: "A folyóköz a két folyó között.", coversConceptIds: ["c1"], params: {
  objects: [{ shape: "river", at: [0, 0, 0], points: [[-4, -4], [-3, 4]], color: "#3b82c4", label: "Tigris" }, { shape: "river", at: [0, 0, 0], points: [[4, -4], [3, 4]], color: "#3b82c4", label: "Eufrátesz" }],
} };
const good: Record<number, unknown> = { 0: river, 1: scene, 2: timeline };
const systemFor = (i: number) => `system ${i}`;

test("fejezetenként egy hívás; a folt minden fejezet ábráját tartalmazza, a párhuzamosság korlátozott", async () => {
  let active = 0, peak = 0;
  const calls: number[] = [];
  const result = await designLessonVisuals(lesson, concepts, {
    systemFor, concurrency: 2,
    call: async (_s, _u, i) => {
      calls.push(i); active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { json: { visuals: [good[i]] }, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } };
    },
  });
  assert.deepEqual(calls.sort(), [0, 1, 2]);
  assert.ok(peak <= 2);
  assert.deepEqual(result.designed, [0, 1, 2]);
  assert.deepEqual(result.lesson.sections.map((s) => s.blocks.map((b) => b.kind)), [["explain", "animate"], ["explain", "animate"], ["explain", "animate"]]);
  assert.deepEqual([result.failed, result.retried, result.rejected], [[], [], []]);
  assert.equal(result.usage.completionTokens, 60);
});

test("elutasított ábra: pontosan egy célzott újrakérés annál a fejezetnél, az okkal; a jobbik marad", async () => {
  const users: Array<[number, string]> = [];
  const invented = { ...scene, params: { objects: [{ shape: "box", at: [0, 0, 0], size: [1, 1, 1], color: "#ffffff", label: "piramis" }] } };
  const result = await designLessonVisuals(lesson, concepts, {
    systemFor,
    call: async (_s, user, i, attempt) => {
      users.push([i, user]);
      return { json: { visuals: [i === 1 && attempt === 0 ? invented : good[i]] } };
    },
  });
  assert.deepEqual(users.filter(([i]) => i === 1).length, 2);
  assert.deepEqual(users.filter(([i]) => i !== 1).length, 2);
  assert.match(users.find(([i, u]) => i === 1 && /nem fogadta el/.test(u))![1], /piramis/);
  assert.deepEqual(result.retried, [1]);
  assert.deepEqual(result.rejected, []);
  const animate = result.lesson.sections[1].blocks.filter((b) => b.kind === "animate") as unknown as Array<{ params: { objects: unknown[] } }>;
  assert.equal(animate.length, 1);
  assert.equal(animate[0].params.objects.length, 2);
});

test("egy fejezet hívása hibázik: a többi ábra megmarad, a hibás fejezet a failed listában", async () => {
  const result = await designLessonVisuals(lesson, concepts, {
    systemFor,
    call: async (_s, _u, i) => { if (i === 0) throw new Error("timeout"); return { json: { visuals: [good[i]] } }; },
  });
  assert.deepEqual(result.failed, [0]);
  assert.deepEqual(result.designed, [1, 2]);
  assert.equal(result.lesson.sections[0], lesson.sections[0]);
});

test("üres visuals: elfogadott döntés, nincs újrakérés; a {sections} és a teljes lecke alak is olvasható", async () => {
  let count = 0;
  const result = await designLessonVisuals(lesson, concepts, { systemFor, sections: [2], call: async () => { count++; return { json: { visuals: [] } }; } });
  assert.equal(count, 1);
  assert.deepEqual(result.designed, []);
  assert.deepEqual(designerVisuals({ sections: [{ index: 2, visuals: [timeline] }] }, 2), [timeline]);
  assert.equal(designerVisuals({ foo: 1 }, 0), null);
  const full = { sections: [lesson.sections[0], { ...lesson.sections[1], blocks: [...lesson.sections[1].blocks, { kind: "animate", ...scene, after: undefined }] }] };
  const fromFull = designerVisuals(full, 1, lesson.sections[1]) as Array<{ after: number; animKind: string }>;
  assert.deepEqual(fromFull.map((v) => [v.after, v.animKind]), [[0, "scene3d"]]);
});

test("kevés rajzelemű illusztráció gyenge (sparse)", () => {
  const svg = '<svg viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg"><rect x="40" y="100" width="300" height="100" fill="#d97706"/><rect x="100" y="60" width="200" height="40" fill="#f59e0b"/><text x="200" y="40" text-anchor="middle" font-size="25" fill="#0f172a">zikkurat</text></svg>';
  const withSparse = { ...lesson, sections: [{ ...lesson.sections[1], blocks: [...lesson.sections[1].blocks, { kind: "animate", animKind: "illustration", params: { svg }, caption: "zikkurat", coversConceptIds: ["c2"] }] }] } as unknown as Lesson;
  const weak = weakVisuals(withSparse);
  assert.equal(weak.length, 1);
  assert.equal(weak[0].kind, "sparse");
});

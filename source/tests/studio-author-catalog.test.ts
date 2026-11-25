import assert from "node:assert/strict";
import test from "node:test";

import { AUTHOR_BLOCK_CATALOG, buildAnimatorPrompt, buildAuthorPrompt, buildSchemaRetryUser, buildSectionDesignerPrompt } from "../server/studio/step-io";
import { ANIM_KINDS, BLOCK_KINDS, PROMPT_ANIM_KINDS } from "../shared/lesson-schema";

/**
 * #167 — az author élesben érvénytelen blokk-kindeket adott (mérve:
 * "Invalid discriminator value" mind a 8 blokkra), mert a prompt csak
 * '"blocks": [...]'-t mutatott, a hat érvényes kindet nem sorolta fel.
 */

const SECTIONS = [{ heading: "H", conceptIds: ["c1"], blocks: [] }] as never[];
const MAP = { meta: { title: "T", subject: "s", classroom: 4 }, concepts: [] } as never;

/**
 * Dokumentált spec-változás (2026-11-18, tananyaggyártás minősége S2a, független review B1): a prompt felsorolása eddig az
 * `ANIM_KINDS` tükre volt. Az új `table` / `ruleBox` / `compareCards` fajta paraméter-alakja az S3a-ig nincs a promptban, ezért a
 * felsorolás mostantól a kifejezett HIRDETETT lista (`PROMPT_ANIM_KINDS`). Az eredeti szándék (a szerző minden általa használható
 * fajtát lásson) megmarad és szigorodik: a hirdetett lista pontosan a régi 16, része az `ANIM_KINDS`-nek, a különbség pedig
 * pontosan a még nem hirdetett új fajták — az S3a-ban a hirdetés bekapcsolása így tudatos, tesztelt lépés.
 */
const ADVERTISED = ["numberLine", "fraction", "timeline", "geometry", "process", "map", "wordBuilder", "sentenceParts", "triangleArea", "decisionStory",
  "cycle", "labeledShape", "barChart", "venn", "illustration", "scene3d"];
// S2b-1 (docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md): a döntési fa és a képes kártyák is az S3a-ig nem hirdetett fajták.
// D1H: a `sourceImage`-et SOHA nem hirdetjük — a kivágott képet a program tölti.
const NOT_YET_ADVERTISED = ["table", "ruleBox", "compareCards", "decisionTree", "pictureCards", "sourceImage"];

test("az author és javító prompt a HIRDETETT animációtípusokat közli (a paraméter-alak nélküli új fajtákat nem)", () => {
  assert.deepEqual([...PROMPT_ANIM_KINDS], ADVERTISED);
  for (const prompt of [buildAuthorPrompt(SECTIONS as never, MAP, []), buildSchemaRetryUser('Invalid animKind')]) {
    const animate = prompt.split('\n').find(line => line.includes('"kind": "animate"')) ?? '';
    const enumeration = animate.match(/"animKind": (.*?), "params"/)?.[1] ?? '';
    assert.deepEqual(enumeration.split('|').map(value => JSON.parse(value)), ADVERTISED);
  }
});

test("a hirdetett lista része a runtime fajtáinak; a különbség pontosan a még nem hirdetett új fajták", () => {
  for (const kind of PROMPT_ANIM_KINDS) assert.ok((ANIM_KINDS as readonly string[]).includes(kind), `${kind} a runtime-ban is létezik`);
  assert.deepEqual(ANIM_KINDS.filter((kind) => !(PROMPT_ANIM_KINDS as readonly string[]).includes(kind)), NOT_YET_ADVERTISED);
  // Minden hirdetett fajtának megvan az útmutatása; a nem hirdetett új fajták SEHOL nem szerepelnek a gyártó promptjaiban.
  const lesson = { title: "T", subject: "angol", classroom: 6, mapId: "m", sourceOnly: true, misconceptions: [],
    sections: [{ heading: "H", probaEnabled: false, blocks: [{ kind: "explain", depth: "core", readAloud: false, coversConceptIds: ["c1"], text: "x" }] }] } as never;
  const map = { title: "T", subject: "angol", classroom: 6, concepts: [{ localId: "c1", term: "many", definition: "d", quote: "q" }] } as never;
  const prompts = { catalog: String(AUTHOR_BLOCK_CATALOG), author: buildAuthorPrompt(SECTIONS as never, MAP, []), animator: buildAnimatorPrompt(lesson, map), designer: buildSectionDesignerPrompt(lesson, 0, map) };
  for (const [name, prompt] of Object.entries(prompts)) {
    for (const kind of NOT_YET_ADVERTISED) assert.ok(!new RegExp(`\\b${kind}\\b`).test(prompt), `${name}: a(z) ${kind} az S3a előtt nincs a promptban`);
  }
  for (const name of ["animator", "designer"] as const) assert.ok(prompts[name].includes(`animKind is one of: ${ADVERTISED.join(", ")}.`), `${name}: a hirdetett lista`);
});

test("az author-prompt katalógusa MIND a hat blokk-kindet felsorolja mezőkkel", () => {
  for (const kind of BLOCK_KINDS) {
    assert.ok(AUTHOR_BLOCK_CATALOG.includes(`"${kind}"`), `hiányzó kind a katalógusból: ${kind}`);
  }
  const prompt = buildAuthorPrompt(SECTIONS as never, MAP, []);
  for (const kind of BLOCK_KINDS) {
    assert.ok(prompt.includes(`"${kind}"`), `hiányzó kind a promptból: ${kind}`);
  }
  assert.ok(prompt.includes("feedbackPerOption"), "a check kötelező mezője szerepel");
  assert.ok(prompt.includes("animKind"), "az animate kötelező mezője szerepel");
});

test("séma-hiba utáni retry-üzenet: tartalmazza a zod-hibákat és a katalógust", () => {
  const msg = buildSchemaRetryUser("sections.0.blocks.0.kind: Invalid discriminator value");
  assert.ok(msg.includes("Invalid discriminator value"), "a konkrét hibák visszamennek");
  assert.ok(msg.includes('"explain"'), "a katalógus is visszamegy");
  assert.ok(msg.toLowerCase().includes("csak json"), "json-only kényszer");
});

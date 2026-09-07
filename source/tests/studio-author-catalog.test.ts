import assert from "node:assert/strict";
import test from "node:test";

import { AUTHOR_BLOCK_CATALOG, buildAuthorPrompt, buildSchemaRetryUser } from "../server/studio/step-io";
import { ANIM_KINDS, BLOCK_KINDS } from "../shared/lesson-schema";

/**
 * #167 — az author élesben érvénytelen blokk-kindeket adott (mérve:
 * "Invalid discriminator value" mind a 8 blokkra), mert a prompt csak
 * '"blocks": [...]'-t mutatott, a hat érvényes kindet nem sorolta fel.
 */

const SECTIONS = [{ heading: "H", conceptIds: ["c1"], blocks: [] }] as never[];
const MAP = { meta: { title: "T", subject: "s", classroom: 4 }, concepts: [] } as never;

test("az author és javító prompt a runtime összes animációtípusát közli", () => {
  for (const prompt of [buildAuthorPrompt(SECTIONS as never, MAP, []), buildSchemaRetryUser('Invalid animKind')]) {
    const animate = prompt.split('\n').find(line => line.includes('"kind": "animate"')) ?? '';
    const enumeration = animate.match(/"animKind": (.*?), "params"/)?.[1] ?? '';
    assert.deepEqual(enumeration.split('|').map(value => JSON.parse(value)), [...ANIM_KINDS]);
  }
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

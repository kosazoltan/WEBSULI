import assert from "node:assert/strict";
import test from "node:test";

import { blockCraftSubjectFromTopic } from "../client/src/lib/blockCraftSubjects";

test("blockCraftSubjectFromTopic: ismert topicok", () => {
  assert.equal(blockCraftSubjectFromTopic("math"), "math");
  assert.equal(blockCraftSubjectFromTopic("nature"), "nature");
  assert.equal(blockCraftSubjectFromTopic("english"), "english");
  assert.equal(blockCraftSubjectFromTopic("hungarian"), "hungarian");
});

test("blockCraftSubjectFromTopic: ismeretlen / üres → english fallback", () => {
  assert.equal(blockCraftSubjectFromTopic(""), "english");
  assert.equal(blockCraftSubjectFromTopic(undefined), "english");
  assert.equal(blockCraftSubjectFromTopic("history"), "english");
});

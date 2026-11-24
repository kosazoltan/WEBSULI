import { test } from "node:test";
import assert from "node:assert/strict";
import { isTwoPartExperience, resultCombinedEmailEnabled } from "../server/lesson-result-combine";

// U4b: az összevont eredménylevél kapcsolója — az U4b–U4d alatt alapból KI (élesben is), csak az explicit „on” kapcsol be; az U4e élesít.
test("RESULT_COMBINED_EMAIL: csak az explicit on kapcsol be; élesben is KI alapból", () => {
  assert.equal(resultCombinedEmailEnabled({}), false);
  assert.equal(resultCombinedEmailEnabled({ NODE_ENV: "production" }), false);
  assert.equal(resultCombinedEmailEnabled({ RESULT_COMBINED_EMAIL: "on" }), true);
  assert.equal(resultCombinedEmailEnabled({ RESULT_COMBINED_EMAIL: " ON " }), true);
  assert.equal(resultCombinedEmailEnabled({ RESULT_COMBINED_EMAIL: "off", NODE_ENV: "production" }), false);
});

test("E1: csak a mindkét részt tartalmazó tapasztalat kétrészes (hiányos / régi adatnál a régi egyrészes út)", () => {
  assert.equal(isTwoPartExperience(undefined), false);
  assert.equal(isTwoPartExperience({ tasks: [], quiz: [1, 2] }), false);
  assert.equal(isTwoPartExperience({ tasks: [1], quiz: [] }), false);
  assert.equal(isTwoPartExperience({ tasks: [1], quiz: [1, 2] }), true);
});

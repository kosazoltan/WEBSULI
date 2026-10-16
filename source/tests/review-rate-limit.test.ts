import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REVIEW_RATE_LIMIT } from "../server/rewards/review-router";

// Review #268: egy iskolai NAT mögött a közös IP-keret (100 írás / 15 perc) két tanuló 75 kártyás ismétlésénél elfogyna.
test("az ismétlés kimarad a közös /api/lessons IP-keretből, és tanulónkénti keretet kap", () => {
  const index = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
  const block = index.slice(index.indexOf('app.use("/api/lessons", (req, res, next) => {'));
  const skip = block.indexOf('if (req.path.startsWith("/review/")) return next();');
  assert.ok(skip > 0 && skip < block.indexOf("return publicWriteLimiter(req, res, next);"), "a kihagyás a közös keret előtt áll");
  assert.equal(REVIEW_RATE_LIMIT.max, 600);
  assert.equal(REVIEW_RATE_LIMIT.windowMs, 15 * 60 * 1000);
});

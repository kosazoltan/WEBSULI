import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Request, Response } from "express";
import { REVIEW_RATE_LIMIT } from "../server/rewards/review-router";
import { lessonsWriteGate } from "../server/lesson-result-limits";

// Review #268: egy iskolai NAT mögött a közös IP-keret (100 írás / 15 perc) két tanuló 75 kártyás ismétlésénél elfogyna.
// Spec-változás 2026-11-21 (PR #510, R46): a /api/lessons kihagyásai a `lessonsWriteGate`-be kerültek (server/lesson-result-limits.ts);
// a régi, index.ts-szöveget kereső őr helyett a kapu VISELKEDÉSÉT mérjük, és azt, hogy az index.ts ezt a kaput szereli fel.
test("az ismétlés kimarad a közös /api/lessons IP-keretből, és tanulónkénti keretet kap", () => {
  const index = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(index, /app\.use\("\/api\/lessons", lessonsWriteGate\(publicWriteLimiter\)\);/, "a közös keret a lessonsWriteGate-en át fut");

  let limited = 0;
  let passed = 0;
  const gate = lessonsWriteGate((_req, _res, next) => { limited += 1; next(); });
  const run = (method: string, path: string) => gate({ method, path } as Request, {} as Response, () => { passed += 1; });

  run("POST", "/review/abc/answer");
  assert.equal(limited, 0, "az ismétlés POST-ja nem éri el a közös keretet");
  assert.equal(passed, 1);
  run("POST", "/some-lesson/progress");
  assert.equal(limited, 1, "más /api/lessons írás továbbra is a közös keretre fut");
  assert.equal(passed, 2);

  assert.equal(REVIEW_RATE_LIMIT.max, 600);
  assert.equal(REVIEW_RATE_LIMIT.windowMs, 15 * 60 * 1000);
});

import assert from "node:assert/strict";
import test from "node:test";

import { animatorOutcome } from "../server/studio/step-io";

/**
 * #169 — élesben az animator szerződéssértése (átírt nem-animate blokkok)
 * bedöntötte a TELJES gyártást. Az animáció kozmetika: sértésnél/hibás
 * alaknál az EREDETI lecke megy tovább a lektorra, a futás nem hal meg.
 */

const ORIGINAL = { title: "L" } as never;
const ANIMATED = { title: "L+anim" } as never;

test("érvényes animált lecke: azt visszük tovább", () => {
  const out = animatorOutcome(ORIGINAL, { ok: true, lesson: ANIMATED });
  assert.deepEqual(out, { lesson: ANIMATED, fellBack: false, reason: null });
});

test("szerződéssértés: fallback az eredetire, okkal — nem halál", () => {
  const out = animatorOutcome(ORIGINAL, { ok: false, reason: "nem-animate blokkok megváltoztak" });
  assert.equal(out.lesson, ORIGINAL);
  assert.equal(out.fellBack, true);
  assert.ok(out.reason?.includes("megváltoztak"));
});

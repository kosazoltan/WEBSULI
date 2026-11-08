import { test } from "node:test";
import assert from "node:assert/strict";
import { COVER_PLAN_MAX_TOKENS, makeCover } from "../server/lesson-covers";
import { logger } from "../server/lib/logger";

// Spec 2026-11-08-borito-blokkcimkek: a képterv néma bukása naplózott, a válaszkeret nem csonkol.
test("a képterv válaszkerete legalább 1200 token", () => {
  assert.ok(COVER_PLAN_MAX_TOKENS >= 1200);
});

test("ha a képtervből nem olvasható ki jelenet, a makeCover figyelmeztet és null-t ad (nincs képhívás)", async () => {
  const warnings: string[] = [];
  const original = logger.warn;
  let images = 0;
  logger.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
  try {
    const made = await makeCover({ title: "Harasztok", subject: "biologia", classroom: 9, headings: ["A harasztok"], text: "…" }, {
      chat: async () => "nem JSON",
      image: async () => { images++; return { bytes: Buffer.from(""), mime: "image/jpeg" }; },
    });
    assert.equal(made, null);
    assert.equal(images, 0);
    assert.ok(warnings.some(w => w.includes("nem adott használható jelenetet")), warnings.join("\n"));
  } finally {
    logger.warn = original;
  }
});

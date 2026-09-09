import assert from "node:assert/strict";
import test from "node:test";

import { insertHtmlFileSchema } from "../shared/schema";

test("insertHtmlFileSchema elfogadja a lesson contentType-ot", () => {
  const r = insertHtmlFileSchema.safeParse({
    title: "Kör - 7. osztály",
    content: "<html></html>",
    classroom: 7,
    contentType: "lesson",
  });
  assert.equal(r.success, true);
});

test("insertHtmlFileSchema elutasítja az ismeretlen contentType-ot", () => {
  const r = insertHtmlFileSchema.safeParse({
    title: "X",
    content: "<p>a</p>",
    contentType: "video",
  });
  assert.equal(r.success, false);
});

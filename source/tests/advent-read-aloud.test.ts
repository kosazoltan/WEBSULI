import assert from "node:assert/strict";
import test from "node:test";
import { adventReadAloudText, adventReadAloudVisible } from "../shared/advent/read-aloud";

// A-5 (#153): elsős felolvasás az adventi kérdésnézetben.
test("a felolvasó gomb csak 1. évfolyamon, hangképes eszközön és csökkentett mozgás nélkül látszik", () => {
  const ok = { supported: true, reducedMotion: false };
  assert.equal(adventReadAloudVisible(1, ok), true);
  for (const grade of [2, 4, 12, null]) assert.equal(adventReadAloudVisible(grade, ok), false, `évfolyam: ${grade}`);
  assert.equal(adventReadAloudVisible(1, { supported: false, reducedMotion: false }), false, "hang nélküli eszköz");
  assert.equal(adventReadAloudVisible(1, { supported: true, reducedMotion: true }), false, "csökkentett mozgás");
});

test("a felolvasott szöveg a kérdés, majd a négy válasz a gombok sorrendjében, sorszámmal", () => {
  const text = adventReadAloudText({ prompt: "Hány gyertya van az adventi koszorún?", options: ["Kettő", "Hat", "Tíz", "Négy!"] });
  assert.equal(text, "Hány gyertya van az adventi koszorún? A válaszok: 1. Kettő. 2. Hat. 3. Tíz. 4. Négy.");
});

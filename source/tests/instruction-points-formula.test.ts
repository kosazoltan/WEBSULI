import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInventory, formulaLineKey, type PointCandidate } from "../server/studio/instruction-points";

/* Spec 2026-10-04-tanari-pont-keplet-idezet — mért: job 49657518 (map 64f93bca), a tanár 3 pontja „not_in_source” lett, mert
 * a betűhű képlet-sor („-5-(-8)=+3”) a 20/8 karakteres alsó határ alatt maradt → a kapu „0 pont”-ot mért. */
const SOURCE = "Negatív számok\nkivonása\n\n9-(+6)=+3 ✓\n9-(-6)=+3\n-8-6=-14 ✓\n-8-(+6)=-2\n-8-(-6)=-14\n-2-8=-+6\n-2-(-8)=+10\n-2-(+8)=+6\n5+(+8)=+13\n-5+(-8)=-13 ✓\n-5-(+8)=+3 ✓\n-5-(-8)=+3\n\n-5   -2   0   1   3";
const REQUEST = "A példákban való hibákat ne javítsd azt a tanuló követte el ehhez hasonló feladatsorokat készíts meg megoldási magyarázatokkal majd ugyanúgy a gyakorló feladatokat és állítsd elő";
const point = (requestSpan: string, sourceQuote: string): PointCandidate => ({ text: `pont: ${requestSpan}`, requestSpan, kind: "teach", sourceQuote, supports: "yes" });

test("a forrás teljes képlet-sora betűhű idézet: a tanár pontja igazolt (pending), nem „not_in_source”", () => {
  const inv = buildInventory([[point("ehhez hasonló feladatsorokat készíts meg", "-5-(-8)=+3"), point("majd ugyanúgy a gyakorló feladatokat", "-2-(-8)=+10"), point("megoldási magyarázatokkal", "-5-(+8)=+3 ✓")]], REQUEST, SOURCE);
  assert.deepEqual(inv.points.map((p) => p.content), ["pending", "pending", "pending"], JSON.stringify(inv.points.map((p) => p.reason)));
});

test("review #185: a pontjegyzék verziója emelve (a mentett v2-es, hibás jegyzék újraszámolódik)", () => {
  const inv = buildInventory([[point("ehhez hasonló feladatsorokat készíts meg", "-5-(-8)=+3")]], REQUEST, SOURCE);
  assert.equal(inv.version, "v3-inventory");
});

test("szigor marad: előjel-eltérés, töredék és nem létező sor nem igazol", () => {
  const inv = buildInventory([[point("ehhez hasonló feladatsorokat készíts meg", "5-(-8)=+3"), point("majd ugyanúgy a gyakorló feladatokat", "-5-(-8)"), point("megoldási magyarázatokkal", "-5-(-8)=13")]], REQUEST, SOURCE);
  assert.deepEqual(inv.points.map((p) => p.content), ["not_in_source", "not_in_source", "not_in_source"]);
});

test("formulaLineKey: képlet-sor kulcsa (mínuszjel nem felsorolásjel), szöveges sor nem képlet", () => {
  assert.equal(formulaLineKey("-5-(-8)=+3"), "-5-(-8)=+3");
  assert.equal(formulaLineKey(" −5 − (−8) = +3 ✓"), "-5-(-8)=+3");
  assert.equal(formulaLineKey("-5   -2   0   1   3"), null, "nincs „=”");
  assert.equal(formulaLineKey("Negatív számok"), null);
  assert.equal(formulaLineKey("x = 5 + 3"), null, "betűt tartalmaz");
  // review #185: pipa és záró írásjel vegyes sorrendben
  assert.equal(formulaLineKey("1+1=2 ✓."), "1+1=2");
  assert.equal(formulaLineKey("1+1=2. ✓"), "1+1=2");
});

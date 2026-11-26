import { test } from "node:test";
import assert from "node:assert/strict";

test("TG-P2a: a pontozási / időkeret-fogalom adminisztratív, a tanított példa és a vegyes sor nem", async () => {
  const { adminConceptProblem } = await import("../shared/source-teaching-scope");
  const c = (id: string, term: string, quote: string, definition = "—") => ({ id, term, definition, quote });
  assert.match(adminConceptProblem(c("c1", "pontozás", "A feladat helyes megoldásáért összesen 2 pont jár."))!, /^c1: /);
  assert.ok(adminConceptProblem(c("c2", "munkaidő", "A feladatlap megoldására 45 perc áll rendelkezésre.")));
  assert.ok(adminConceptProblem(c("c3", "részpontszám", "Minden helyes szóért 1 pont adható.")));
  assert.equal(adminConceptProblem(c("c4", "elválasztás", "Elfogadható: osz-tály — 1 pont")), null, "vegyes sor: a példa tanítható");
  assert.equal(adminConceptProblem(c("c5", "szótagolás", "a szótagolás szabálya szerint választunk el")), null);
  assert.equal(adminConceptProblem(c("c6", "pont (geometria)", "Két pont meghatároz egy egyenest.")), null, "a geometriai pont nem pontozás");
  assert.equal(adminConceptProblem(c("c7", "képlet", "2 H2 + O2 = 2 H2O, a reakcióért 2 pont jár.")), null, "a képlet tanított tartalom");
});

test("TG-P2a: a forrásállomás a pontozási fogalmat javító fordulóra küldi, és a kérés tartalmazza a szabályt", async () => {
  const { readFileSync } = await import("node:fs");
  const engine = readFileSync(new URL("../server/studio/single-run/engine.ts", import.meta.url), "utf8");
  const station = engine.slice(engine.indexOf("export async function readSourceStation("), engine.indexOf("export type SingleRunInput"));
  assert.match(station, /SOURCE_SCOPE_RULE/, "a kérésben a szabály");
  assert.match(station, /adminConceptProblem\(/, "a validátorban az ellenőrzés");
  const { SOURCE_SCOPE_RULE } = await import("../shared/practice-rules");
  assert.match(SOURCE_SCOPE_RULE, /pontérték/);
  assert.match(SOURCE_SCOPE_RULE, /vegyes sor/);
});

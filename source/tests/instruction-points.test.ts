import { test } from "node:test";
import assert from "node:assert/strict";
import { lessonSchema } from "../shared/lesson-schema";
import { SUPPORT_SKILLS } from "../server/studio/support-skills";
import { PROMPT_ROLES } from "../shared/instruction-bundles/roles";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { OWNER_INSTRUCTION_FRAME, OWNER_INSTRUCTION_MAX, normalizeOwnerInstruction } from "../shared/owner-instruction";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U3, C14, H7/H34/H47/H50): a tanári kérés pontjegyzéke a tervezés előtt. */

test("gaps: a séma fogadja, a régi lecke változatlan; skillek és szerep bekötve", () => {
  const fixture = standardFusionFixture();
  const withGaps = lessonSchema.safeParse({ ...fixture, gaps: [{ id: "pt-1", point: "A papirusz", reason: "nincs a forrásban" }] });
  assert.equal(withGaps.success, true);
  assert.equal(lessonSchema.safeParse(fixture).success, true);
  assert.ok((PROMPT_ROLES as readonly string[]).includes("instruction-points"));
  for (const must of ["requestSpan", "\"exclude\"", "supports", "témát érinti"]) assert.ok(SUPPORT_SKILLS["instruction-points"].includes(must), must);
  for (const must of ["PONTJEGYZÉKÉHEZ", "nem a címében", "MINDEN kapott id-hoz pontosan egy elem", "más fejezet szövege bizonyítékként"]) assert.ok(SUPPORT_SKILLS["instruction-checker"].includes(must), must);
  assert.ok(SUPPORT_SKILLS["instruction-points"].length < 2800 && SUPPORT_SKILLS["instruction-checker"].length < 2800);
});

// S4b (docs/specs/2026-10-16-egy-futas.md): a régi lépésgép törölt moduljaira épülő esetből a MEGMARADÓ modulok állításai, szó szerint.
test("H47/H50: a kérés teljes szövege tárolódik — nincs 2000 karakteres néma vágás", () => {
  const long = `Tanítsd ezt: ${"alma ".repeat(9000)}`;
  assert.ok(long.length > OWNER_INSTRUCTION_FRAME && long.length < OWNER_INSTRUCTION_MAX);
  assert.equal(normalizeOwnerInstruction(long)!.length, long.trim().length, "nincs 2000 karakteres néma vágás (csak a szélek trimmelve)");
});

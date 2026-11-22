import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { experienceFingerprint, newExperienceRound, roundIdOf } from "../client/src/lesson-runtime/useExperienceRound";
import { roundClaimSchema } from "../shared/lesson-result-email";

/**
 * #510 vak kör 13 L1 (hibaosztály: rövid, ütközhető körazonosító). Az eddigi azonosító a kérdéssor + kezdési idő 32 bites
 * ujjlenyomata volt: két külön tanuló köre azonos azonosítót kaphatott, és a szerver a második végleges eredményét ismétlésként
 * nyelte el. Az új kör a létrehozásakor egyszer generált, nagy entrópiájú kulcsot kap; a régi, tárolt kör (kulcs nélkül) a régi
 * azonosítóját tartja meg, hogy a már elküldött körből ne legyen újraküldés.
 */

test("új kör: nagy entrópiájú, tárolt kulcs; két külön kör azonos kérdéssorral és kezdéssel is eltérő azonosítót kap", () => {
  const a = newExperienceRound(["q1", "q2"]);
  const b = newExperienceRound(["q1", "q2"]);
  assert.match(a.roundKey ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(roundIdOf(a), roundIdOf(b));
  assert.equal(roundIdOf(a), `round-${a.roundKey}`);
  assert.equal(roundIdOf({ ...a, startedAt: 123 }), roundIdOf(a), "a kezdés rögzítése nem változtatja meg a kör azonosítóját");
});

test("régi (kulcs nélküli) tárolt kör: a régi azonosító marad — nincs újraküldés", () => {
  const legacy = { ids: ["q1", "q2"], startedAt: 1788582780000 };
  assert.equal(roundIdOf(legacy), `round-${experienceFingerprint({ ids: legacy.ids, startedAt: legacy.startedAt })}`);
});

test("az új azonosító átmegy a szerver roundId-mintáján", () => {
  const id = roundIdOf(newExperienceRound(["q1"]));
  const parsed = roundClaimSchema.safeParse({ kind: "quiz", roundId: id, claim: true });
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
});

test("a beküldő minden úton a közös roundIdOf-ot használja (nincs helyi ujjlenyomat-számítás)", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "client", "src", "lesson-runtime", "resultReport.ts"), "utf8");
  assert.equal(/round-\$\{experienceFingerprint/.test(src), false, "a resultReport ne számolja maga az azonosítót");
  assert.ok((src.match(/roundIdOf\(/g) ?? []).length >= 3);
});

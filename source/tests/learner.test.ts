import { test } from "node:test";
import assert from "node:assert/strict";
import { LEARNER_NAME_MAX, MOTIVATION_LINES, motivationFor, newestMaterials, normalizeLearnerName } from "../client/src/lib/learner";

// Spec: docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md

test("név: szóközök összevonva, üres → null, legfeljebb 40 karakter", () => {
  assert.equal(normalizeLearnerName("  Kiss   Bence "), "Kiss Bence");
  assert.equal(normalizeLearnerName("   "), null);
  assert.equal(normalizeLearnerName(undefined), null);
  const long = normalizeLearnerName("a".repeat(60))!;
  assert.equal(long.length, LEARNER_NAME_MAX);
});

test("lelkesítő mondat: egy napon belül azonos, a készletből való", () => {
  const morning = motivationFor("Bence", new Date(2026, 9, 18, 8));
  assert.equal(motivationFor("Bence", new Date(2026, 9, 18, 21)), morning);
  assert.ok((MOTIVATION_LINES as readonly string[]).includes(morning));
  const week = new Set(Array.from({ length: 8 }, (_, i) => motivationFor("Bence", new Date(2026, 9, 18 + i))));
  assert.ok(week.size > 1, "napról napra változik");
});

test("legújabb anyagok: az évfolyamról, újak előnyben, tartalék az összesre", () => {
  const now = new Date("2026-10-18T10:00:00Z");
  const f = (id: string, classroom: number, daysAgo: number) => ({ id, classroom, createdAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() });
  const files = [f("o5", 5, 200), f("n5a", 5, 2), f("n5b", 5, 10), f("n5c", 5, 20), f("n5d", 5, 25), f("n8", 8, 1)];
  const five = newestMaterials(files, 5, now);
  assert.deepEqual(five.files.map(x => x.id), ["n5a", "n5b", "n5c"]);
  assert.ok(five.files.every(five.isNew));
  assert.deepEqual(newestMaterials(files, null, now).files.map(x => x.id), ["n8", "n5a", "n5b"], "évfolyam nélkül mindből");
  assert.deepEqual(newestMaterials(files, 3, now).files.map(x => x.id), ["n8", "n5a", "n5b"], "üres évfolyamon mindből");
  const old = [f("a", 6, 100), f("b", 6, 50)];
  const r = newestMaterials(old, 6, now);
  assert.deepEqual(r.files.map(x => x.id), ["b", "a"], "30 napon belüli híján a legfrissebbek");
  assert.equal(r.isNew(r.files[0]), false);
});

test("review #289: fióknál a kézi felülírás nyer, fiók nélkül a tárolt név; a tartalékág jelzi, hogy nem az évfolyamról jön", async () => {
  const { resolveLearnerName } = await import("../client/src/lib/learner");
  assert.equal(resolveLearnerName({ id: "u1", firstName: "Anna" }, "Bence", null), "Anna", "fióknév az elsődleges");
  assert.equal(resolveLearnerName({ id: "u1", firstName: "Anna" }, "Bence", "Panni"), "Panni", "kézi felülírás nyer");
  assert.equal(resolveLearnerName({ id: "u1", firstName: "  " }, "Bence", null), "Bence", "üres fióknévnél a tárolt");
  assert.equal(resolveLearnerName(null, "Bence", "Panni"), "Bence", "fiók nélkül a felülírás nem számít");
  const now = new Date("2026-10-18T10:00:00Z");
  const files = [{ id: "a", classroom: 5, createdAt: now.toISOString() }];
  assert.equal(newestMaterials(files, 5, now).fromGrade, true);
  assert.equal(newestMaterials(files, 3, now).fromGrade, false);
  assert.equal(newestMaterials(files, null, now).fromGrade, false);
});

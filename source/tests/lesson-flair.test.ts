import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LESSON_FLAIRS, VISUAL_WORLD_IDS, designFromInstruction, pickLessonFlair, visualWorld } from "../shared/lesson-visuals";
import { EXPERIENCE_THEMES, experienceSchema } from "../shared/lesson-experience";
import { buildStructuredImprovement } from "../server/studio/structured-improvement";
import { fusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/** Spec 2026-09-24 (docs/specs/2026-09-24-lesson-flair-princess.md). */

test("EARS 1: a princess világ a világok, a témák és a CSS között szinkronban, és minden különlegességnek van CSS-e", () => {
  assert.ok((VISUAL_WORLD_IDS as readonly string[]).includes("princess"));
  assert.ok((EXPERIENCE_THEMES as readonly string[]).includes("princess"));
  const css = fs.readFileSync(path.resolve("client/src/lesson-runtime/lesson-experience.css"), "utf8");
  for (const flair of LESSON_FLAIRS) assert.ok(css.includes(`[data-flair~="${flair}"]`), flair);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*lesson-twinkle/, "animáció csak mozgáscsökkentés nélkül");
  assert.equal(visualWorld("princess")?.emojis.length, 8);
});

test("EARS 2: leckénként determinisztikus, leckék között eltérő, ismétlés nélküli különlegességek", () => {
  const a = pickLessonFlair("Történelem:Az időszámítás");
  assert.deepEqual(a, pickLessonFlair("Történelem:Az időszámítás"));
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  const distinct = new Set(["Matek:Törtek", "Biológia:Sejt", "Magyar:Mese", "Földrajz:Víz", "Történelem:Kódex", "Angol:Colours"].map((s) => pickLessonFlair(s).join()));
  assert.ok(distinct.size >= 3, `a leckék ne legyenek egyformák (${distinct.size} különböző)`);
});

test("EARS 3: a tanár kérése választ világot és effekteket; semleges kérésnél nincs design-változás", () => {
  const d = designFromInstruction("Legyen fiatalos, rózsaszín, 5-ös kislánynak figyelemfelhívó, effektekkel.", "seed");
  assert.equal(d?.world, "princess");
  for (const f of ["sparkles", "shimmer-keys", "pop-correct"] as const) assert.ok(d?.flair?.includes(f), f);
  assert.ok((d?.flair?.length ?? 0) <= 4);
  assert.equal(designFromInstruction("Rövidítsd le a tananyagot."), undefined);
  assert.equal(designFromInstruction(undefined), undefined);
});

test("EARS 4: a javító út a kért világot és különlegességeket adja a jelöltnek; a séma elfogadja", async () => {
  const original = fusionFixture(); const e = standardFusionFixture().experience!;
  let authorCalls = 0; let authorSystem = ""; let authorUser = "";
  const result = await buildStructuredImprovement(original, { subject: original.subject, classroom: original.classroom, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] },
    async (step, system, user) => {
      if (step === "pedagogue") return { corrections: [] };
      if (step === "lektor") return { notes: [] };
      if (authorCalls++ === 0) { authorSystem = system; authorUser = user; return original; }
      return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
    }, "Rózsaszín, kislánynak szóló, csillogó effektekkel.");
  assert.equal(result.candidate.experience?.theme, "princess");
  assert.ok(result.candidate.experience?.flair?.includes("sparkles"));
  assert.match(authorUser, /Hercegnő-kastély/);
  assert.match(authorSystem, /TANANYAGJAVÍTÓ SKILL/);
  assert.doesNotThrow(() => experienceSchema.parse(result.candidate.experience));
  assert.throws(() => experienceSchema.parse({ ...result.candidate.experience, flair: ["kitalált"] }), "a modell nem írhat kitalált effektet");
});

test("javítás: a térképre közben felvett kötelező fogalom engedélyezett és néven nevezett (mért 2026-09-24)", async () => {
  const original = fusionFixture(); const e = standardFusionFixture().experience!;
  const source = { subject: original.subject, classroom: original.classroom, concepts: [
    { localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const },
    { localId: "c29", term: "írott emlékek", definition: "Írásban fennmaradt források.", examWeight: "core" as const },
    { localId: "cx", term: "mellékes", definition: "Nem kötelező.", examWeight: "extra" as const },
  ] };
  let system = ""; let user = "";
  await assert.rejects(buildStructuredImprovement(original, source, async (step, s, u) => {
    if (step === "pedagogue") return { corrections: [] };
    if (step === "lektor") return { notes: [] };
    if (!system) { system = s; user = u; }
    return original;
  }, "Egészítsd ki az írott emlékekkel."));
  assert.match(system, /c29/, "a szerző engedélyezett azonosítói között az új fogalom");
  assert.match(user, /Új fogalmak a térképen[^\n]*c29 „írott emlékek”/);
  assert.doesNotMatch(user, /cx „mellékes”/, "az extra fogalom nem kötelező");
  void e;
});

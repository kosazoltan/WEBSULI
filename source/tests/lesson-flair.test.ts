import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { VISUAL_WORLD_IDS, designFromInstruction, visualWorld } from "../shared/lesson-visuals";
import { EXPERIENCE_THEMES, experienceSchema } from "../shared/lesson-experience";
import { buildStructuredImprovement } from "../server/studio/structured-improvement";
import { fusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/** Spec 2026-09-24 (docs/specs/2026-09-24-lesson-flair-princess.md); a flair kivezetése dokumentált spec-változás:
 * docs/specs/2026-10-18-arculati-bank-s4.md (a gyártás nem ad flair-t, a lejátszó nem rendereli, a régi adat olvasható). */

test("EARS 1: a princess világ a világok és a témák között szinkronban; a kivezetett flair-nek nincs CSS-e (S4)", () => {
  assert.ok((VISUAL_WORLD_IDS as readonly string[]).includes("princess"));
  assert.ok((EXPERIENCE_THEMES as readonly string[]).includes("princess"));
  const css = fs.readFileSync(path.resolve("client/src/lesson-runtime/lesson-experience.css"), "utf8");
  assert.doesNotMatch(css, /\[data-flair~=/, "a halott [data-flair] szabályok kikerültek");
  assert.match(css, /@keyframes lesson-pop/, "a helyes-válasz animáció (lesson-theme.css) megmaradt");
  assert.equal(visualWorld("princess")?.emojis.length, 8);
});

// Websuli Design (dokumentált spec-változás, docs/specs/2026-10-16-websuli-design.md): unisex — a nemi szavak nem választanak világot.
test("EARS 3: a tanár kérése nemi szavakból NEM választ világot (unisex); effekt-kérés sem ad flair-t (S4); semleges kérésnél nincs változás", () => {
  const d = designFromInstruction("Legyen fiatalos, rózsaszín, 5-ös kislánynak figyelemfelhívó, effektekkel.", "seed");
  assert.equal(d, undefined, "sem világ, sem flair");
  for (const gendered of ["rózsaszín legyen", "kislánynak szóljon", "hercegnős téma", "lányos legyen", "pink színű"]) assert.equal(designFromInstruction(gendered), undefined, gendered);
  assert.deepEqual(designFromInstruction("Legyen varázsvilág témájú."), { world: "magic" });
  assert.equal(designFromInstruction("Rövidítsd le a tananyagot."), undefined);
  assert.equal(designFromInstruction(undefined), undefined);
});

test("EARS 4: a javító út nemi kérésre nem ad hercegnő-világot (a szerző promptjába sem kerül); a séma elfogadja", async () => {
  const original = fusionFixture(); const e = standardFusionFixture().experience!;
  let authorCalls = 0; let authorSystem = ""; let authorUser = "";
  const result = await buildStructuredImprovement(original, { subject: original.subject, classroom: original.classroom, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] },
    async (step, system, user) => {
      if (step === "pedagogue") return { corrections: [] };
      if (step === "lektor") return { notes: [] };
      if (authorCalls++ === 0) { authorSystem = system; authorUser = user; return original; }
      return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
    }, "Rózsaszín, kislánynak szóló, csillogó effektekkel.");
  assert.notEqual(result.candidate.experience?.theme, "princess");
  assert.equal(result.candidate.experience?.flair, undefined, "S4: a javított lecke sem kap flair-t");
  // A tanár saját kérése szó szerint átmegy; a PROGRAM nem tesz hozzá hercegnő-világot.
  assert.doesNotMatch(authorUser, /Hercegnő-kastély|princess/);
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

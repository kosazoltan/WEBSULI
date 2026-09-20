import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { VISUAL_WORLDS, VISUAL_WORLD_IDS, pickVisualWorld, visualWorld, splitEmphasis, stripEmphasis, harmoniseSectionEmojis } from "../shared/lesson-visuals";
import { EXPERIENCE_THEMES, experienceSchema } from "../shared/lesson-experience";
import { outlineSchema, buildPedagoguePrompt, buildAuthorPrompt, buildLektorPrompt } from "../server/studio/step-io";
import { lessonSchema } from "../shared/lesson-schema";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-20 — színes, figyelemfelkeltő tananyag: vizuális világ a tervező fázisból. */

test("nyolc világ, mind téma is; a paletta a CSS-ben is megvan; véletlen húzás változatos", () => {
  assert.equal(VISUAL_WORLDS.length, 8);
  for (const w of VISUAL_WORLDS) {
    assert.ok((EXPERIENCE_THEMES as readonly string[]).includes(w.id), `${w.id} téma is`);
    assert.ok(w.emojis.length >= 6 && w.name && w.mood);
  }
  const css = fs.readFileSync(path.resolve("client/src/lesson-runtime/lesson-experience.css"), "utf8");
  for (const w of VISUAL_WORLDS) {
    const rule = css.split("\n").find((l) => l.includes(`[data-experience="${w.id}"]`) && l.includes("--lesson-bg"));
    assert.ok(rule, `${w.id}: CSS-szabály`);
    assert.ok(rule!.includes(`--lesson-accent: ${w.palette.accent}`), `${w.id}: akcent egyezik`);
    assert.ok(rule!.includes(`--lesson-key: ${w.palette.key}`), `${w.id}: kiemelés-szín egyezik`);
  }
  assert.ok(css.includes(".lesson-key") && css.includes('[data-depth="why"]') && css.includes(".lesson-section-emoji"));
  const picks = new Set(Array.from({ length: 40 }, (_, i) => pickVisualWorld(i).id));
  assert.ok(picks.size >= 4, `változatos: ${[...picks].join(",")}`);
  assert.ok((VISUAL_WORLD_IDS as readonly string[]).includes(pickVisualWorld().id), "seed nélkül is érvényes világ");
  assert.notEqual(pickVisualWorld(3, "candy").id, "candy");
  assert.equal(visualWorld("nincs"), undefined);
});

test("világváltásnál a javasolt világ emojijai a választott világ készletére cserélődnek, a témához illő saját emoji marad", () => {
  const dojo = visualWorld("dojo")!, meadow = visualWorld("meadow")!;
  const sections = [{ emoji: "🥷" }, { emoji: "🌊" }, { emoji: "⚔️" }, {}, { emoji: "🥋" }];
  const out = harmoniseSectionEmojis(sections, meadow, dojo);
  assert.deepEqual(out.map((s) => s.emoji), [meadow.emojis[0], "🌊", meadow.emojis[1], undefined, meadow.emojis[2]]);
  assert.deepEqual(harmoniseSectionEmojis(sections, dojo, dojo).map((s) => s.emoji), sections.map((s) => s.emoji), "azonos világ: változatlan");
  assert.deepEqual(harmoniseSectionEmojis(sections, meadow).map((s) => s.emoji), sections.map((s) => s.emoji), "javaslat nélkül változatlan");
});

test("**kiemelés** felbontása és eltávolítása (felolvasás)", () => {
  assert.deepEqual(splitEmphasis("A **szorzás** előbb, mint az **összeadás**."), [
    { text: "A ", key: false }, { text: "szorzás", key: true }, { text: " előbb, mint az ", key: false }, { text: "összeadás", key: true }, { text: ".", key: false },
  ]);
  assert.deepEqual(splitEmphasis("nincs jelölés"), [{ text: "nincs jelölés", key: false }]);
  assert.deepEqual(splitEmphasis("páratlan ** jel"), [{ text: "páratlan ** jel", key: false }], "hibás jelölés sima szöveg marad");
  assert.equal(stripEmphasis("A **szorzás** előbb."), "A szorzás előbb.");
});

test("a vázlat elfogadja az emoji-t, a kulcskifejezéseket és a világot; a tervező promptja kimondja őket", () => {
  const parsed = outlineSchema.safeParse({ sections: [{ heading: "A", emoji: "🚀", keyPhrases: ["szorzás elsőbbsége", "x".repeat(60), "a", "b", "c"], conceptIds: ["c1"], plannedBlocks: ["explain"], animationSuggestions: [] }], misconceptions: [], visual: { world: "space" } });
  assert.ok(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues));
  assert.equal(parsed.data.sections[0].keyPhrases?.length, 4, "legfeljebb 4");
  assert.equal(parsed.data.sections[0].keyPhrases?.[1].length, 40, "40 karakterre vágva");
  assert.equal(parsed.data.visual?.world, "space");
  assert.equal(outlineSchema.safeParse({ sections: [{ heading: "A", conceptIds: ["c1"], plannedBlocks: ["explain"] }], visual: { world: "nincs" } }).success, false);
  const world = visualWorld("dojo")!;
  const prompt = buildPedagoguePrompt({ title: "T", subject: "matematika", classroom: 3, concepts: [] }, world);
  assert.match(prompt, /SZÍNES, FIGYELEMFELKELTŐ TANANYAG/);
  assert.match(prompt, /Javasolt vizuális világ: dojo/);
  assert.match(prompt, /"emoji": string, "keyPhrases": string\[\]/);
  assert.match(prompt, /"visual": \{ "world": string \}/);
  assert.doesNotMatch(buildPedagoguePrompt({ title: "T", subject: "m", classroom: 3, concepts: [] }), /SZÍNES/, "világ nélkül a régi prompt");
});

test("a szerző kiemelési szabályt kap a kulcskifejezésekhez; a lektor tudja, hogy a ** jelölés", () => {
  const author = buildAuthorPrompt([{ heading: "A", conceptIds: ["c1"], plannedBlocks: ["explain"], animationSuggestions: [], keyPhrases: ["szorzás elsőbbsége"] }], { title: "T", subject: "m", classroom: 3, concepts: [] }, []);
  assert.match(author, /KIEMELÉS: a vázlat fejezetenkénti `keyPhrases`/);
  assert.match(author, /1: szorzás elsőbbsége/);
  const lektor = buildLektorPrompt(standardFusionFixture(), { title: "T", subject: "m", classroom: 3, concepts: [] });
  assert.match(lektor, /`\*\*…\*\*` jelölés kiemelés/);
});

test("a Lesson séma elfogadja a fejezet-emoji-t; a bank témája lehet bármelyik világ", () => {
  const lesson = standardFusionFixture();
  const withEmoji = lessonSchema.safeParse({ ...lesson, sections: lesson.sections.map((s) => ({ ...s, emoji: "🦋" })) });
  assert.ok(withEmoji.success);
  assert.ok(experienceSchema.safeParse({ ...lesson.experience, theme: "meadow" }).success);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { tolerantLessonInput, experienceSchema } from "../shared/lesson-experience";
import { lessonSchema } from "../shared/lesson-schema";
import { newerBuildAvailable } from "../client/src/lib/app-version";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/** Spec 2026-09-24 (docs/specs/2026-09-24-lesson-version-skew.md) — mérve: régi fül, új `princess` téma. */

test("EARS 1: ismeretlen (újabb) téma és különlegesség nem teszi olvashatatlanná a leckét", () => {
  const lesson = standardFusionFixture();
  const future = { ...lesson, experience: { ...lesson.experience!, theme: "jovobeli-tema", flair: ["sparkles", "jovobeli-effekt"] } };
  assert.equal(lessonSchema.safeParse(future).success, false, "szigorú séma: íráskor elutasít");
  const read = lessonSchema.safeParse(tolerantLessonInput(future));
  assert.ok(read.success, "olvasáskor megjelenik");
  assert.equal(read.data!.experience!.theme, "ocean");
  assert.deepEqual(read.data!.experience!.flair, ["sparkles"]);
  const known = { ...lesson, experience: { ...lesson.experience!, theme: "princess", flair: ["pop-correct"] } };
  assert.deepEqual(tolerantLessonInput(known), known, "ismert értékek változatlanok");
  assert.doesNotThrow(() => experienceSchema.parse((tolerantLessonInput(known) as typeof known).experience));
  assert.equal(tolerantLessonInput(null), null);
});

test("EARS 2: újabb build felismerése az index.html alapján", () => {
  const html = '<script type="module" src="/assets/main-NEW123.js"></script>';
  assert.equal(newerBuildAvailable(html, ["https://websuli.vip/assets/main-OLD999.js"]), true);
  assert.equal(newerBuildAvailable(html, ["https://websuli.vip/assets/main-NEW123.js"]), false);
  assert.equal(newerBuildAvailable("<html></html>", ["https://websuli.vip/assets/main-OLD999.js"]), false);
  assert.equal(newerBuildAvailable(html, []), false);
});

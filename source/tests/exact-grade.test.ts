import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Tulajdonosi kérés 2026-10-18 (docs/specs/2026-10-18-pontos-evfolyam.md): a fejlécek a pontos évfolyamot írják, a sáv
// tartományát (pl. „5–6.”) nem.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a lecke sávfejléce és az admin arculat-összefoglaló a pontos évfolyamot írja", () => {
  // SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-tananyag-programozas-felirat.md): a lecke fejléce a közös
  // `lessonHeaderGradeLabel(lesson.classroom, …)`-t használja (programozási kategóriánál „Programozás”); 1–12-re a pontos évfolyamot
  // adja — ezt a tests/classrooms.test.ts egységtesztje bizonyítja. A sávtartomány-tilalom változatlan.
  const patterns: Record<string, RegExp> = {
    "client/src/lesson-runtime/LessonRuntime.tsx": /lessonHeaderGradeLabel\(lesson\.classroom,/,
    "client/src/components/studio/LessonArtSummary.tsx": /getClassroomLabel\((lesson|data)\.classroom\)/,
  };
  for (const [file, pattern] of Object.entries(patterns)) {
    const src = read(file);
    assert.doesNotMatch(src, /\.grades\}/, `${file}: nincs sávtartomány-felirat`);
    assert.match(src, pattern, `${file}: pontos évfolyam`);
  }
});

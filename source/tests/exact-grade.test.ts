import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Tulajdonosi kérés 2026-10-18 (docs/specs/2026-10-18-pontos-evfolyam.md): a fejlécek a pontos évfolyamot írják, a sáv
// tartományát (pl. „5–6.”) nem.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a lecke sávfejléce és az admin arculat-összefoglaló a pontos évfolyamot írja", () => {
  for (const file of ["client/src/lesson-runtime/LessonRuntime.tsx", "client/src/components/studio/LessonArtSummary.tsx"]) {
    const src = read(file);
    assert.doesNotMatch(src, /\.grades\}/, `${file}: nincs sávtartomány-felirat`);
    assert.match(src, /getClassroomLabel\((lesson|data)\.classroom\)/, `${file}: pontos évfolyam`);
  }
});

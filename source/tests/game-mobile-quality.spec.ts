import { devices, test } from "@playwright/test";

import { CASE as blockCraft } from "./game-mobile-cases/block-craft-quiz";
import { CASE as brainRot } from "./game-mobile-cases/brain-rot-steal";
import { CASE as spaceAsteroid } from "./game-mobile-cases/space-asteroid-quiz";
import { CASE as speedQuiz } from "./game-mobile-cases/speed-quiz-math";
import { CASE as tornado } from "./game-mobile-cases/tornado-hunter-200";
import { CASE as tsunami } from "./game-mobile-cases/tsunami-english";
import { CASE as wordLadder } from "./game-mobile-cases/word-ladder-hu-en";
import { defineGameMobileQuality } from "./support/game-mobile-quality";

test.use({ serviceWorkers: "block" });

/**
 * S2 — a hét játék mobil-minősége (terv M1–M11) érintős Pixel 7 profilban, 360×640, 390×844 és 844×390
 * nézetben. Baseline esetnél csak az alap-ellenőrzés fut; a játékszelet (S6–S12) a saját esetfájlját
 * állítja "full"-ra. A `devices` szétterítése csak fájlszinten megengedett (games-touch-controls.spec.ts minta).
 */
test.use({ ...devices["Pixel 7"] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
    localStorage.setItem("websuli.spaceQuiz.grade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") {
      data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    }
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p.includes("leaderboard") || p.includes("/api/game/score")) data = { ok: true };
    await route.fulfill({ json: data });
  });
});

for (const c of [speedQuiz, wordLadder, blockCraft, tsunami, brainRot, spaceAsteroid, tornado]) {
  defineGameMobileQuality(c);
}

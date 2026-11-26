import { expect, test } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** V5b (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): a boss-kérdés kiemelt fejléccel jelenik meg. */
test.use({ serviceWorkers: "block" });

test("a boss: true jelölésű kérdés „Főellenség-kérdés” fejlécet és jelölőt kap", async ({ page }) => {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<Record<string, unknown>> }> };
  const ids = (lesson.sections[0].blocks.find((b) => Array.isArray(b.coversConceptIds))!.coversConceptIds as string[]).slice(0, 1);
  lesson.sections[0].blocks.push({ kind: "check", question: "Melyik igaz?", options: ["Ez", "Az"], correctIndex: 0, feedbackPerOption: ["Jó.", "Nem."], coversConceptIds: ids, boss: true });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/boss-fixture") return route.fulfill({ json: { id: "boss-fixture", title: "Lecke", contentType: "lesson", classroom: 6 } });
    if (path === "/api/lessons/by-file/boss-fixture") return route.fulfill({ json: { lessonId: "lesson-boss", version: 1, lesson } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto("/preview/boss-fixture");
  const boss = page.locator('[data-block="check"][data-boss="true"]');
  await expect(boss).toHaveCount(1);
  await expect(boss).toContainText("Főellenség-kérdés");
});

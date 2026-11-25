import { expect, test } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** V-kompat (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): újabb blokkfajta → a lecke megjelenik, az ismeretlen blokk kimarad. */
test.use({ serviceWorkers: "block" });

test("új kind és új tryKind a leckében: a lecke nem sérült, az ismert blokk látszik, az ismeretlen nem", async ({ page }) => {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<{ coversConceptIds?: string[] }> }> };
  const concept = lesson.sections[0].blocks.find(b => b.coversConceptIds?.length)!.coversConceptIds!.slice(0, 1);
  lesson.sections[0].blocks.unshift({ kind: "flipCard", front: "ISMERETLEN-KARTYA", back: "x", coversConceptIds: concept } as never);
  lesson.sections[0].blocks.push({ kind: "try", tryKind: "numberLine", spec: { prompt: "ISMERETLEN-FELADAT" }, coversConceptIds: concept } as never);
  lesson.sections[0].blocks.push({ kind: "explain", text: "Ez az ismert blokk látszik.", depth: "core", readAloud: false, coversConceptIds: concept } as never);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/kompat-fixture") return route.fulfill({ json: { id: "kompat-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/kompat-fixture") return route.fulfill({ json: { lessonId: "lesson-kompat", version: 1, lesson } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto("/preview/kompat-fixture");
  await expect(page.getByText("Ez az ismert blokk látszik.")).toBeVisible();
  await expect(page.getByText(/sérült|nem sikerült betölteni/i)).toHaveCount(0);
  await expect(page.getByText("ISMERETLEN-KARTYA")).toHaveCount(0);
  await expect(page.getByText("ISMERETLEN-FELADAT")).toHaveCount(0);
  // Review #598: az ismeretlen blokk helyén frissítésre kérő magyarázat áll (a blokkindexek nem csúsznak el).
  await expect(page.getByText(/újabb változatával készült/).first()).toBeVisible();
});

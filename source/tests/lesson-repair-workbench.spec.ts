import { test, expect, type Page } from "@playwright/test";

// Spec: docs/specs/2026-10-19-javito-valaszto-mobil.md — a Tananyagjavító választója valós renderben (mobil + asztal).
test.use({ serviceWorkers: "block" });

const files = [
  { id: "old-en", title: "4. Osztály all about me english", contentType: "html", classroom: 4 },
  { id: "old-env", title: "4 osztályos környezetismeret Budapest, barangolás, Alföld", contentType: "html", classroom: 4 },
  { id: "new-en", title: "Week 6 – angol szókincs és olvasás 4. osztály: honnan való a feladat, és mi a témája?", contentType: "lesson", classroom: 4 },
  { id: "pdf", title: "4. osztály angol PDF", contentType: "pdf", classroom: 4 },
];

async function mock(page: Page, onApply: (id: string) => void) {
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/html-files") return route.fulfill({ json: files });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "probe" } });
    if (path === "/api/studio/skills/tananyag-javito/roles") return route.fulfill({ json: { roles: [{ role: "repair", version: "1", text: "x".repeat(4000) }] } });
    if (path === "/api/studio/skills/tananyag-javito") return route.fulfill({ json: { snapshot: { version: "v1", rules: [] } } });
    if (path === "/api/admin/improve-material/old-en" && req.method() === "POST") return route.fulfill({ json: { jobId: "job-1" } });
    if (path === "/api/admin/improve-material/status/job-1") return route.fulfill({ json: { status: "completed", improvedFile: { id: "imp-1" } } });
    if (path === "/api/admin/improved-files/imp-1") return route.fulfill({ json: { content: "<!doctype html><html><body>javított</body></html>", status: "pending" } });
    if (path === "/api/admin/improved-files/imp-1/apply") { onApply("imp-1"); return route.fulfill({ json: { success: true } }); }
    return route.fulfill({ json: [] });
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`a régi HTML-anyag a „4 osztályos angol” keresésre választható és javítható ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let applied = "";
    await mock(page, (id) => { applied = id; });
    await page.goto("/__repair-workbench-probe");
    await page.getByTestId("lesson-repair-search").fill("4 osztályos angol");
    const options = page.getByRole("option");
    await expect(options).toHaveCount(2);
    await expect(page.getByTestId("lesson-repair-option-old-en")).toContainText("Régi HTML · 4. osztály");
    await expect(page.getByTestId("lesson-repair-option-new-en")).toContainText("Lecke");
    await expect(page.getByTestId("lesson-repair-option-pdf")).toHaveCount(0);
    await expect(page.getByTestId("lesson-repair-option-old-env")).toHaveCount(0);

    // A választó a tudás-kártya előtt van: mobilon a keresőmező a lap tetején, nem a hosszú skill-lista alatt.
    const searchTop = await page.getByTestId("lesson-repair-search").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const skillsTop = await page.getByTestId("repair-skill-repair").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(searchTop).toBeLessThan(skillsTop);

    await page.getByTestId("lesson-repair-option-old-en").click();
    const step2 = page.locator("#lesson-repair-step2");
    await expect(step2).toBeVisible();
    await expect(step2).toBeInViewport();
    await page.getByTestId("lesson-repair-instruction").fill("Javítsd az elírásokat.");
    await page.getByTestId("lesson-repair-start").click();
    const apply = page.getByTestId("lesson-repair-apply");
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect.poll(() => applied).toBe("imp-1");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("lecke-jelöltnél az értelmezhetetlen tartalom mellett az „Alkalmazás” tiltott marad", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, () => undefined);
  await page.route("**/api/admin/improve-material/new-en", (route) => route.fulfill({ json: { jobId: "job-1" } }));
  await page.goto("/__repair-workbench-probe");
  await page.getByTestId("lesson-repair-search").fill("week");
  await page.getByTestId("lesson-repair-option-new-en").click();
  await page.getByTestId("lesson-repair-instruction").fill("Rövidítsd.");
  await page.getByTestId("lesson-repair-start").click();
  await expect(page.getByTestId("lesson-repair-ready")).toBeVisible();
  await expect(page.getByTestId("lesson-repair-apply")).toBeDisabled();
});

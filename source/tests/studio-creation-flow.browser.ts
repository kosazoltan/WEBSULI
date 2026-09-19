import { expect, test } from "@playwright/test";
import { workflowDefinition } from "../shared/lesson-workflow";

for (const width of [320, 1440]) {
  test(`accepted resume refreshes a stopped job and follows its new failure ${width}`, async ({ page }) => {
    let state = "error", error = "Korábbi bankhiba", posts = 0, reads = 0;
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      sessionStorage.setItem("websuli.studio.jobId", "resume-test");
      sessionStorage.setItem("websuli.studio.oneStepRunId", "upload-resume-test");
    });
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/studio/lessons/one-step/upload-resume-test") return route.fulfill({ json: { phase: state === "running" ? "animator" : "error", detail: null, error, mapId: null, lessonId: null } });
      if (path === "/api/studio/jobs/resume-test/resume") {
        posts++; state = "running"; error = "";
        return route.fulfill({ status: 202, json: { jobId: "resume-test" } });
      }
      if (path === "/api/studio/jobs/resume-test") {
        reads++;
        return route.fulfill({ json: { job: { id: "resume-test", step: state === "running" ? "animator" : "error", status: state, round: 1, error }, produced: { approvedOutline: true, lessonId: null } } });
      }
      if (path === "/api/studio/workflows/resume-test") return route.fulfill({ json: { run: { id: "resume-test", definition: workflowDefinition("studio"), state, error, revision: 1, createdAt: Date.now(), updatedAt: Date.now(), visits: [] } } });
      return route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/__studio-panel-probe");
    const monitor = page.getByTestId("job-monitor");
    await expect(monitor).toContainText("Korábbi bankhiba");
    const initialReads = reads;
    await monitor.getByRole("button", { name: "Újra", exact: true }).click();
    await expect(monitor).toContainText("Dolgozik…");
    await expect(monitor).not.toContainText("Korábbi bankhiba");
    const progress = page.getByTestId("creation-progress");
    await expect(progress).not.toContainText("Korábbi bankhiba");
    await expect(progress.locator("[aria-current='step']")).toHaveText(/Tananyag készítése/);
    expect(reads).toBeGreaterThan(initialReads);
    state = "error"; error = "Új szolgáltatói hiba";
    await expect(monitor).toContainText(error, { timeout: 8000 });
    await expect(progress).toContainText(error, { timeout: 8000 });
    await expect(monitor.getByRole("button", { name: "Újra", exact: true })).toBeEnabled();
    expect(posts).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/studio-resume-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

// Actual upload UI and polling; mocked transport, no production writes or paid AI.
for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
  test(`three stages retain progress, diagnostics and errors ${width}x${height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    let mapsRead = 0;
    let state = { phase: "ocr", detail: "Kép átírása: 3/10", error: null as string | null };
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/studio/maps") { mapsRead++; return route.fulfill({ json: { maps: [] } }); }
      if (url.pathname === "/api/studio/lessons/one-step" && route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        expect(body.files).toHaveLength(1);
        expect(body.classroom).toBeUndefined();
        return route.fulfill({ status: 202, json: { runId: "browser-proof" } });
      }
      if (url.pathname === "/api/studio/lessons/one-step/browser-proof") return route.fulfill({ json: state });
      return route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width, height });
    await page.goto("/__studio-panel-probe");
    await expect(page.getByTestId("source-upload-form")).toBeVisible();
    expect(mapsRead, "the collapsed ledger should not fetch its list").toBe(0);
    await page.getByTestId("extract-file-input").setInputFiles({ name: "terület.txt", mimeType: "text/plain", buffer: Buffer.from("A háromszög területe az alap és a magasság szorzatának fele.") });
    await page.getByTestId("one-step-submit").click();
    const progress = page.getByTestId("creation-progress");
    await expect(progress.getByRole("listitem")).toHaveCount(3);
    await expect(progress.getByRole("status")).toHaveText("Kép átírása: 3/10");
    await expect(progress.getByTestId("creation-progress-details")).not.toHaveAttribute("open", "");
    state = { phase: "animator", detail: "A tanítás és a feladatbank összeállítása.", error: null };
    await expect(progress.locator("[aria-current='step']")).toHaveText(/Tananyag készítése/, { timeout: 8000 });
    await progress.locator("summary").click();
    await expect(progress.locator("details p")).toHaveText("Animációk");
    await progress.locator("summary").click();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const item of await progress.getByRole("listitem").all()) {
      expect(await item.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    await page.screenshot({ path: `test-results/studio-three-stages-${width}x${height}.png`, fullPage: true });
    state = { phase: "parked", detail: "A magasság értéke nem olvasható. Ellenőrizd a forrásoldalt.", error: null };
    await expect(progress.getByRole("alert")).toHaveText(state.detail, { timeout: 8000 });
    await expect(progress.locator("[data-state='done']")).toHaveCount(0);
    await page.getByTestId("studio-advanced-toggle").click();
    await expect(page.getByTestId("studio-advanced-body")).toBeVisible();
    expect(mapsRead).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

import { expect, test, type Page } from "@playwright/test";
import { workflowDefinition, type WorkflowView } from "../shared/lesson-workflow";

/**
 * Spec docs/specs/2026-10-19-okositas-fazisjelzo.md — az okosítás állandóan látható fázissora valós renderben: a futó rekord
 * fázisai (újratöltés után is, a rekord azonosítójából), ragadósan görgetés közben; a hibás sor kinyitható megállási lépéssel.
 */
test.use({ serviceWorkers: "block" });
const now = Date.now();
const run = (id: string, state: WorkflowView["state"], visits: WorkflowView["visits"], error?: string): WorkflowView =>
  ({ id, definition: workflowDefinition("html"), state, createdAt: now - 6 * 60_000, updatedAt: now, visits, revision: 3, ...(error ? { error } : {}) }) as WorkflowView;
const running = run("imp-run", "running", [
  { step: "source", attempt: 1, startedAt: now - 360_000, finishedAt: now - 350_000, state: "done", cacheHits: 0 },
  { step: "author", attempt: 1, startedAt: now - 350_000, finishedAt: now - 60_000, state: "done", cacheHits: 0 },
  { step: "gate", attempt: 1, startedAt: now - 60_000, state: "running", cacheHits: 0 },
]);
const failed = run("imp-err", "error", [
  { step: "source", attempt: 1, startedAt: now - 900_000, finishedAt: now - 890_000, state: "done", cacheHits: 0 },
  { step: "author", attempt: 1, startedAt: now - 890_000, finishedAt: now - 500_000, state: "done", cacheHits: 0 },
  { step: "gate", attempt: 1, startedAt: now - 500_000, finishedAt: now - 490_000, state: "error", error: "t09: a saját mintaválasz nem kap teljes pontot.", cacheHits: 0 },
], "A javított tananyag nem ment át a záró ellenőrzésen: t09: a saját mintaválasz nem kap teljes pontot.");
const iso = new Date(now).toISOString();
const imp = (id: string, status: string, notes: string | null) => ({ id, originalFileId: "f1", title: id === "imp-run" ? "Who's vs Whose" : "Week 6 – angol", description: null, classroom: 4,
  status, improvementPrompt: "x", improvementNotes: notes, createdAt: iso, appliedAt: null, originalFile: { id: "f1", title: "Eredeti" }, createdBy: "admin-fixture" });

async function mock(page: Page) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: { id: "admin-fixture", isAdmin: true, firstName: "Admin" } });
    if (path === "/api/config") return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } });
    if (path === "/api/html-files") return route.fulfill({ json: [{ id: "f1", title: "Eredeti", contentType: "html", classroom: 4, createdAt: iso }] });
    // Review #323: a másik admin futó rekordja nem kap fázissávot (a naplója nem olvasható).
    if (path === "/api/admin/improved-files") return route.fulfill({ json: [imp("imp-run", "processing", null), imp("imp-err", "error", failed.error!), { ...imp("imp-other", "processing", null), createdBy: "masik-admin" }] });
    // Review #336: a kapun bukott jelölt diagnosztikai tartalma (csak megtekinthető).
    if (path === "/api/admin/improved-files/imp-err") return route.fulfill({ json: { ...imp("imp-err", "error", failed.error!), content: "<!DOCTYPE html><html><body>bukott jelölt</body></html>", contentType: "html" } });
    if (path === "/api/studio/workflows/imp-run") return route.fulfill({ json: { run: running } });
    if (path === "/api/studio/workflows/imp-err") return route.fulfill({ json: { run: failed } });
    if (path === "/api/studio/workflows") return route.fulfill({ json: { runs: [] } });
    return route.fulfill({ json: [] });
  });
}

for (const vp of [{ width: 393, height: 780 }, { width: 835, height: 810 }]) {
  test(`${vp.width}: a futó okosítás fázissora látszik (rekordból), ragadós, nem lóg ki; a hibás sor megállási lépése kinyitható`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize(vp);
    await page.goto("/admin?tab=improve-materials");
    const bars = page.getByTestId("improver-phase-bars");
    const bar = bars.getByTestId("phase-bar").first();
    await expect(bar).toHaveAttribute("data-run-state", "running");
    await expect(bar.locator("li")).toHaveCount(5);
    await expect(bars.getByTestId("phase-bar")).toHaveCount(1);
    await expect(bar.locator('li[data-step="source"]')).toHaveAttribute("data-state", "done");
    await expect(bar.locator('li[data-step="gate"]')).toHaveAttribute("data-state", "running");
    await expect(bar.locator('li[data-step="save"]')).toHaveAttribute("data-state", "pending");
    await expect(bar.getByTestId("phase-bar-current")).toContainText("3/5.");
    // Ragadós: görgetés után is a nézet tetején.
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" as ScrollBehavior }));
    const box = await bars.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeLessThan(vp.height / 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/phase-bar/running-${vp.width}.png` });
    // Hibás sor: kinyitva a megállás lépése és a teljes üzenet.
    const err = page.getByTestId("improver-error-imp-err");
    await err.locator("summary").first().click();
    await expect(err.getByTestId("phase-bar")).toHaveAttribute("data-run-state", "error");
    await expect(err.locator('li[data-step="gate"]')).toHaveAttribute("data-state", "error");
    await expect(err).toContainText("t09: a saját mintaválasz nem kap teljes pontot.");
    await page.screenshot({ path: `test-results/phase-bar/error-${vp.width}.png`, fullPage: true });
    // Review #336: a bukott jelölt csak olvasható előnézetben nyílik, „Alkalmaz” gomb nélkül.
    await err.getByTestId("improver-error-preview-imp-err").click();
    await expect(page.getByTestId("improver-preview-failed-note")).toBeVisible();
    await expect(page.getByTestId("improver-preview-apply")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const note = page.getByTestId("improver-preview-failed-note");
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeInViewport();
    await page.screenshot({ path: `test-results/phase-bar/failed-preview-${vp.width}.png` });
  });
}

test("Tananyagjavító: a futó javítás fázissora a lap tetején ragad a teljes görgetés alatt (review #323)", async ({ page }) => {
  const repairRun = { ...run("job-r", "running", [{ step: "source", attempt: 1, startedAt: now - 60_000, state: "running", cacheHits: 0 }]), definition: workflowDefinition("repair") } as WorkflowView;
  await page.route("**/api/**", (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: { id: "admin-fixture", isAdmin: true, firstName: "Admin" } });
    if (path === "/api/config") return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "probe" } });
    if (path === "/api/html-files") return route.fulfill({ json: [{ id: "les-1", title: "Kéttagú kifejezések négyzete", contentType: "lesson", classroom: 9, createdAt: iso }] });
    if (path === "/api/studio/skills/tananyag-javito") return route.fulfill({ json: { snapshot: { version: "v1", rules: [] } } });
    if (path === "/api/studio/skills/tananyag-javito/roles") return route.fulfill({ json: { roles: Array.from({ length: 8 }, (_, i) => ({ role: `szerep-${i}`, version: "1", text: "Szabály. ".repeat(200) })) } });
    if (path === "/api/admin/improve-material/les-1" && req.method() === "POST") return route.fulfill({ json: { jobId: "job-r" } });
    if (path === "/api/admin/improve-material/status/job-r") return route.fulfill({ json: { status: "processing", elapsed: 60 } });
    if (path === "/api/studio/workflows/job-r") return route.fulfill({ json: { run: repairRun } });
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 393, height: 780 });
  await page.goto("/admin?tab=lesson-repair");
  await page.getByTestId("lesson-repair-option-les-1").click();
  await page.getByTestId("lesson-repair-instruction").fill("Javítsd az elírásokat.");
  await page.getByTestId("lesson-repair-start").click();
  const slot = page.getByTestId("lesson-repair-phase-slot");
  await expect(slot.getByTestId("phase-bar")).toHaveAttribute("data-run-state", "running");
  await expect(slot.locator("li")).toHaveCount(7);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" as ScrollBehavior }));
  const box = await slot.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeLessThan(200);
  await page.screenshot({ path: "test-results/phase-bar/repair-scrolled-393.png" });
});

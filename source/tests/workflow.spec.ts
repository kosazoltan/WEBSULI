import { test, expect } from "@playwright/test";
import { workflowDefinition, WORKFLOW_MODES, type WorkflowView } from "../shared/lesson-workflow";

const runs: WorkflowView[] = WORKFLOW_MODES.map((mode, index) => ({
  id: `workflow-${mode}`, definition: workflowDefinition(mode), state: mode === "html" || mode === "repair" ? "ready" : mode === "web" ? "error" : "done",
  createdAt: 1700000000000 + index * 1000, updatedAt: 1700000001000, revision: 7,
  visits: workflowDefinition(mode).steps.slice(0, mode === "web" ? 2 : undefined).map((step, n) => ({ step: step.id, attempt: 1, startedAt: 1700000000000, finishedAt: 1700000001000, state: mode === "web" && n === 1 ? "error" : "done", cacheHits: 0, tokensOut: n === 1 ? 234 : undefined })),
  error: mode === "web" ? "A kérdésbank nem teljes. A hiányzó megoldásokat javítani kell, a tananyag még nincs közzétéve." : undefined,
  result: mode === "web" ? undefined : { kind: mode === "html" || mode === "repair" ? "candidate" : "material", id: `saved-${mode}` },
}));
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    if (path === "/api/studio/workflows") data = { runs };
    if (path.startsWith("/api/studio/workflows/")) data = { run: runs.find(r => r.id === path.split("/").at(-1)) ?? null };
    await route.fulfill({ json: data });
  });
});
for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1440, 900]]) {
  test(`mind a hét valódi admin diagram kezelhető ${width}x${height}`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.setViewportSize({ width, height });
    await page.goto("/admin?tab=workflows");
    const history = page.getByTestId("workflow-history");
    await expect(history).toBeVisible();
    for (const run of runs) {
      await page.getByRole("combobox", { name: "Futás kiválasztása" }).selectOption(run.id);
      const graph = page.getByTestId("workflow-graph");
      await expect(graph.getByRole("heading", { name: run.definition.label, exact: true })).toBeVisible();
      await expect(graph.locator("[data-step]")).toHaveCount(run.definition.steps.length);
      const second = graph.locator("[data-step]").nth(1);
      await second.click(); await expect(second).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("workflow-step-details")).toContainText("234");
      const contrast = await page.getByTestId("workflow-step-details").evaluate(el => {
        const color = (css: string) => css.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        const luminance = (css: string) => { const [r, g, b] = color(css); return .2126 * r + .7152 * g + .0722 * b; };
        const style = getComputedStyle(el); const a = luminance(style.color); const b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      if (run.state === "error") {
        await expect(graph.getByRole("alert")).toContainText("nincs közzétéve");
        await expect(graph.getByRole("link", { name: "Tananyag megnyitása" })).toHaveCount(0);
        await expect(graph.locator('[data-step="publish"]')).toContainText("Még nem indult");
      }
      if (run.state === "ready") await expect(graph.getByRole("status")).toContainText("alkalmazásra vár");
      expect(await graph.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const cardBounds = await graph.locator("[data-step]").evaluateAll(cards => cards.map(c => { const b = c.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, overflow: c.scrollWidth > c.clientWidth + 1 }; }));
      expect(cardBounds.every(b => !b.overflow)).toBe(true);
      expect(cardBounds.every((a, i) => cardBounds.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top))).toBe(true);
    }
    await page.getByRole("combobox", { name: "Futás kiválasztása" }).selectOption("workflow-web");
    await page.screenshot({ path: `test-results/workflow-${width}.png`, fullPage: true });
    await page.reload();
    await expect(page.getByTestId("workflow-history")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("mobil menüből is elérhető a futásnapló", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Anyagok menü megnyitása" }).click();
  await page.getByTestId("sheet-tab-workflows").click();
  await expect(page.getByTestId("workflow-history")).toBeVisible();
});

test("megszakadt lépés nem látszik folyamatban, a további lépések nem készültek el", async ({ page }) => {
  const run: WorkflowView = { ...runs.find(r => r.id === "workflow-web")!, state: "interrupted", error: undefined,
    visits: [{ step: "generate", state: "running", startedAt: 1700000000000, attempt: 1, cacheHits: 0 }] };
  await page.route("**/api/studio/workflows*", route => route.fulfill({ json: { runs: [run] } }));
  await page.route("**/api/studio/workflows/*", route => route.fulfill({ json: { run } }));
  await page.goto("/admin?tab=workflows");
  await expect(page.getByTestId("workflow-step-details")).toContainText("befejezési idő nem ismert");
  await expect(page.getByTestId("workflow-step-details")).not.toContainText("Folyamatban");
  await expect(page.locator('[data-step="publish"]')).toContainText("Még nem indult");
});

test("a régi AI menü is a közös feltöltéses és internetes készítőre vezet", async ({ page }) => {
  await page.goto("/admin?tab=enhanced");
  await expect(page.getByRole("button", { name: "Internetes keresés", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fájlok kiválasztása" })).toBeVisible();
});

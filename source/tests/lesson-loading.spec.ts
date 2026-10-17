import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Lecke megnyitása (docs/specs/2026-10-17-lecke-betoltes.md) — valódi render a Preview oldalon, késleltetett API-val:
 * egyetlen, sávszínű töltőképernyő; a lecke kérése párhuzamos; az admin-javítópanel betöltés közben nem látszik;
 * a tárolt arculat az adatbázis-végpontról jön, hibánál katalógus-tartalékkal.
 */
test.use({ serviceWorkers: "block" });
const webp = readFileSync(new URL("../client/public/design/studio/hero-studio.webp", import.meta.url));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mockApi(page: Page, opts: { admin?: boolean; lesson?: Record<string, unknown>; assets?: "ok" | "fail" } = {}) {
  const t0 = Date.now();
  const timeline: Record<string, number> = {};
  const lesson = { ...compactFusionFixture(), classroom: 7, ...(opts.lesson ?? {}) };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return opts.admin ? route.fulfill({ json: { id: "admin-fixture", isAdmin: true, firstName: "Admin" } }) : route.fulfill({ status: 401, json: { message: "Anonymous" } });
    if (path === "/api/config") { await sleep(900); return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } }); }
    if (path === "/api/html-files/load-fixture") { timeline.material = Date.now() - t0; await sleep(700); timeline.materialDone = Date.now() - t0; return route.fulfill({ json: { id: "load-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } }); }
    if (path === "/api/lessons/by-file/load-fixture") { timeline.lesson = Date.now() - t0; await sleep(900); return route.fulfill({ json: { lessonId: "load-lesson", version: 1, lesson } }); }
    if (path.startsWith("/api/design-assets/")) {
      (timeline.assets ??= 0); timeline.assets++;
      return opts.assets === "fail" ? route.fulfill({ status: 500, body: "" }) : route.fulfill({ status: 200, contentType: "image/webp", body: webp });
    }
    // Ismeretlen útvonal: üres válasz (a 401 admin módban kijelentkeztető újratöltést indítana — AuthStatus).
    return route.fulfill({ json: [] });
  });
  return timeline;
}

test("egyetlen, sávszínű töltőképernyő; a lecke kérése nem vár az anyagra; a javítópanel csak betöltés után, csukva", async ({ page }) => {
  const timeline = await mockApi(page, { admin: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/load-fixture");
  const loading = page.getByTestId("lesson-loading");
  await expect(loading).toBeVisible();
  // Betöltés közben a javítópanel nem látszik (ez tűnt „újragenerálásnak”), és nincs második, más szövegű töltőképernyő.
  await expect(page.getByTestId("lesson-repair-panel")).toHaveCount(0);
  await expect(page.getByText("Betöltés…", { exact: true })).toHaveCount(0);
  await expect(page.locator(".lesson-hero h1").first()).toBeVisible({ timeout: 15000 });
  await expect(loading).toHaveCount(0);
  // A sáv (6–8. = studio) a töltőképernyőn már ismert volt: a fejléc színe a lecke témájáé.
  expect(await page.locator("[data-ws-theme]").first().getAttribute("data-ws-theme")).toBe("studio");
  // Párhuzamos: a lecke kérése még az anyag válasza előtt indult.
  expect(timeline.lesson).toBeLessThan(timeline.materialDone);
  const panel = page.getByTestId("lesson-repair-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("lesson-repair-open")).toBeVisible();
  await expect(page.getByText("A lecke és a gyakorlóbankok újragyártódnak", { exact: false })).toHaveCount(0);
  await page.getByTestId("lesson-repair-open").click();
  await expect(page.getByText("A lecke és a gyakorlóbankok újragyártódnak", { exact: false })).toBeVisible();
});

test("a töltőképernyő háttere a sáv felülete (ismert évfolyamnál), nem fehér", async ({ page }) => {
  await mockApi(page);
  await page.goto("/preview/load-fixture");
  const loading = page.getByTestId("lesson-loading");
  await expect(loading).toBeVisible();
  expect(await loading.getAttribute("data-ws-loading")).toMatch(/^(studio|neutral)$/);
  await expect(page.locator(".lesson-hero h1").first()).toBeVisible({ timeout: 15000 });
});

test("tárolt arculat: a hős az adatbázis-végpontról jön, újraszámolás nélkül; hibánál a katalógusképre vált", async ({ page }) => {
  const stored = { art: { subjectIcon: "icon-matematika-studio", picture: "hero-studio" } };
  const ok = await mockApi(page, { lesson: stored });
  await page.goto("/preview/load-fixture");
  const figure = page.locator(".ws-art");
  await expect(figure).toHaveAttribute("data-art-source", "db");
  await expect(figure.locator("img").first()).toHaveAttribute("src", "/api/design-assets/hero-studio");
  await expect(page.locator(".lesson-chip .ws-subject-ico")).toHaveAttribute("src", "/api/design-assets/icon-matematika-studio");
  expect(ok.assets).toBeGreaterThanOrEqual(2);

  await page.unrouteAll({ behavior: "wait" });
  await mockApi(page, { lesson: stored, assets: "fail" });
  await page.goto("/preview/load-fixture");
  const img = page.locator(".ws-art img").first();
  await expect(img).toHaveAttribute("src", "/design/studio/hero-studio.webp");
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
});

import { test, expect } from "@playwright/test";

// docs/specs/2026-10-16-egy-futas-vegrehajtas.md (S3 — review #260, 2. kör): egyfutásos módban a térképről indítás és a hibás job
// folytatása futást (`runId`) ad; a felület a futást követi, és a futás jobját mutatja, amint létrejött.
test.use({ serviceWorkers: "block" });

test("térképről indítás → futáskövetés → job-monitor; a hibás job folytatása az új futásra vált", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const polls: Record<string, number> = {};
  let resumed = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    if (path === "/api/csrf-token") data = { csrfToken: "test" };
    if (path === "/api/studio/maps") data = { maps: [{ id: "map-1", title: "A víz körforgása", subject: "Természettudomány", classroom: 5, status: "approved" }] };
    if (path === "/api/studio/lessons/from-map/map-1") return route.fulfill({ status: 202, json: { runId: "run-1" } });
    if (path.startsWith("/api/studio/lessons/one-step/")) {
      const run = path.split("/").pop()!;
      polls[run] = (polls[run] ?? 0) + 1;
      const job = run === "run-1" ? "job-1" : "job-2";
      data = polls[run] < 2 ? { phase: "extract", jobId: null, error: null } : { phase: "pedagogue", jobId: job, error: null };
    }
    if (path === "/api/studio/jobs/job-1") data = { job: { id: "job-1", step: "error", status: "error", round: 0, error: "lektorálás: tényhiba maradt." }, produced: {} };
    if (path === "/api/studio/jobs/job-2") data = { job: { id: "job-2", step: "pedagogue", status: "running", round: 0, error: null }, produced: {} };
    if (path === "/api/studio/jobs/job-1/resume") { resumed++; return route.fulfill({ status: 202, json: { jobId: "job-1", runId: "run-2", remanufactured: true } }); }
    await route.fulfill({ json: data });
  });
  for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    for (const key of Object.keys(polls)) delete polls[key];
    await page.setViewportSize(size);
    await page.goto("/admin?tab=knowledge-maps");
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const advanced = page.getByTestId("studio-advanced-body");
    await expect(advanced).toBeVisible();
    await advanced.getByTestId("lesson-map-select").click();
    await page.getByRole("option", { name: /A víz körforgása/ }).click();
    await advanced.getByTestId("start-lesson").click();
    await expect(page.getByTestId("following-run")).toBeVisible();
    // A futás jobja megjelent → a monitor a jobot mutatja (hibás állapot, folytatás gombbal).
    const monitor = page.getByTestId("job-monitor");
    await expect(monitor).toContainText("lektorálás: tényhiba maradt.", { timeout: 15_000 });
    await expect(page.getByTestId("following-run")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath(`single-run-follow-${size.width}.png`), fullPage: true });
    // A folytatás új futást ad: a felület arra vált, és az új job monitorát mutatja (a régi hibát már nem).
    await monitor.getByRole("button", { name: "Újra" }).click();
    await expect(monitor).not.toContainText("lektorálás: tényhiba maradt.", { timeout: 15_000 });
    await expect(page.getByTestId("job-monitor")).toBeVisible({ timeout: 15_000 });
    expect(polls["run-2"] ?? 0).toBeGreaterThanOrEqual(2);
  }
  expect(resumed).toBe(2);
  expect(errors).toEqual([]);
});

test("S4a: a tervre váró régi job jóváhagyása egyfutásos újragyártást indít, és a felület az új futást követi", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  let approved = 0;
  const outline = { sections: [{ heading: "A víz útja", conceptIds: ["parolgas"], plannedBlocks: ["explain", "recap"], animationSuggestions: [] }], misconceptions: [] };
  await page.addInitScript(() => { try { sessionStorage.setItem("websuli.studio.jobId", "job-wait"); } catch { /* tároló nélkül is fut */ } });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    if (path === "/api/csrf-token") data = { csrfToken: "test" };
    if (path === "/api/studio/maps") data = { maps: [{ id: "map-1", title: "A víz körforgása", subject: "Természettudomány", classroom: 5, status: "approved" }] };
    if (path === "/api/studio/maps/map-1") data = { map: { id: "map-1" }, concepts: [{ localId: "parolgas", term: "párolgás", examWeight: "core" }] };
    if (path === "/api/studio/jobs/job-wait") data = { job: { id: "job-wait", step: "author", status: "ok", round: 0, error: null }, produced: { outline, approvedOutline: false } };
    if (path === "/api/studio/jobs/job-wait/approve-outline") { approved++; return route.fulfill({ status: 202, json: { jobId: "job-wait", runId: "run-3", remanufactured: true } }); }
    if (path === "/api/studio/lessons/one-step/run-3") data = { phase: "pedagogue", jobId: "job-new", error: null };
    if (path === "/api/studio/jobs/job-new") data = { job: { id: "job-new", step: "author", status: "running", round: 0, error: null }, produced: {} };
    await route.fulfill({ json: data });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin?tab=knowledge-maps");
  const advanced = page.getByTestId("studio-advanced-body");
  await advanced.getByTestId("lesson-map-select").click();
  await page.getByRole("option", { name: /A víz körforgása/ }).click();
  await expect(page.getByTestId("outline-review")).toBeVisible();
  await page.getByTestId("approve-outline").click();
  // A régi (tervre váró) job helyett az új futás jobja látszik; a tervnézet eltűnik (az új job még nem ad vázlatot).
  await expect(page.getByTestId("outline-review")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("job-monitor")).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => sessionStorage.getItem("websuli.studio.jobId"))).toBe("job-new");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: test.info().outputPath("single-run-approve-follow-390.png"), fullPage: true });
  expect(approved).toBe(1);
  expect(errors).toEqual([]);
});

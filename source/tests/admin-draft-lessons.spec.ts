import { test, expect } from "@playwright/test";

// docs/specs/2026-10-15-admin-tananyag-draft.md (tulajdonosi kérés): a megszakadt gyártás piszkozata az adminfelületen „Tananyag draft”
// jelzéssel látszik, és onnan folytatható. A nyilvános lista (html-files) mockja üres: a piszkozat NEM onnan jön.
test.use({ serviceWorkers: "block" });

const drafts = [
  { jobId: "job-stopped", title: "Virágos növények — a gyümölcsök és a beporzás hosszú címmel, amely tördelődik", subject: "Természetismeret", classroom: 5,
    draft: { teachingSections: 9, savedBankPackets: 4 }, running: false, updatedAt: "2026-10-15T18:00:00.000Z",
    error: "A szerver újraindult a lecke-készítés közben — indítsd újra a lépést az „Újra” gombbal.", resumable: true, stoppedAt: "animator",
    nextRecovery: { strategy: "restart", reason: "a megszakadt lépés folytatódik a mentett részekből" } },
  { jobId: "job-running", title: "Mezopotámia", subject: "Történelem", classroom: 5, draft: { teachingSections: 6, savedBankPackets: 1 },
    running: true, error: null, updatedAt: "2026-10-15T18:10:00.000Z", resumable: false },
];

test("a megszakadt piszkozat „Tananyag draft” jelzéssel látszik és egyetlen kéréssel folytatható", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  let resumed = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/studio/jobs/job-stopped/resume") { resumed++; await new Promise(r => setTimeout(r, 200)); return route.fulfill({ status: 202, json: { jobId: "job-stopped" } }); }
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    if (path === "/api/studio/drafts") data = { drafts };
    if (path === "/api/csrf-token") data = { csrfToken: "test" };
    await route.fulfill({ json: data });
  });
  await page.goto("/admin");
  const block = page.getByTestId("draft-lessons");
  await expect(block).toBeVisible();
  await expect(block.getByTestId("draft-badge")).toHaveCount(2);
  await expect(page.getByTestId("draft-item-job-stopped")).toContainText("Mentett: 9 fejezetnyi tananyag, 4 kész gyakorlócsomag.");
  await expect(page.getByTestId("draft-item-job-stopped")).toContainText("Megállt: a szerver újraindult a gyártás közben.");
  await expect(page.getByTestId("draft-item-job-running").getByTestId("draft-running")).toBeVisible();
  await expect(page.getByTestId("draft-item-job-running").getByRole("button")).toHaveCount(0);
  for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const button = page.getByTestId("draft-resume-job-stopped");
    await expect(button).toBeVisible();
    expect(await button.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await block.screenshot({ path: `tests/screenshots/admin-drafts-${size.width}.png` });
  }
  await page.getByTestId("draft-resume-job-stopped").dblclick();
  await expect.poll(() => resumed).toBe(1);
  await page.waitForTimeout(400);
  expect(resumed).toBe(1);
  expect(errors).toEqual([]);
});

test("piszkozat nélkül a blokk nem jelenik meg", async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    if (path === "/api/studio/drafts") data = { drafts: [] };
    await route.fulfill({ json: data });
  });
  await page.goto("/admin");
  await expect(page.getByTestId("button-toggle-view")).toBeVisible();
  await expect(page.getByTestId("draft-lessons")).toHaveCount(0);
});

// Review #251 (P2): ha a következő fok a teljes újragyártás, a gomb nem ígér „folytatást”, és megerősítést kér.
test("teljes újragyártásnál külön felirat és megerősítés, utána egyetlen kérés", async ({ page }) => {
  let resumed = 0;
  const remake = { ...drafts[0], jobId: "job-remake", nextRecovery: { strategy: "remanufacture", reason: "teljes újragyártás ugyanabból a forrásból" } };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/studio/jobs/job-remake/resume") { resumed++; return route.fulfill({ status: 202, json: { jobId: "new-job", remanufactured: true } }); }
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    if (path === "/api/studio/drafts") data = { drafts: [remake] };
    if (path === "/api/csrf-token") data = { csrfToken: "test" };
    await route.fulfill({ json: data });
  });
  await page.goto("/admin");
  await expect(page.getByTestId("draft-resume-job-remake")).toHaveCount(0);
  await page.getByTestId("draft-remake-job-remake").click();
  expect(resumed, "az első kattintás csak megerősítést kér").toBe(0);
  await expect(page.getByTestId("draft-remake-confirm-job-remake")).toContainText("teljes, új gyártás indul");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByTestId("draft-remake-yes-job-remake").dblclick();
  await expect.poll(() => resumed).toBe(1);
  await page.waitForTimeout(300);
  expect(resumed).toBe(1);
});

// CI-hiba (#251, workflow.spec mobilmenü): a minden végpontra `[]`-t adó mock mellett a `data.drafts.some` kivételt dobott → újrarenderelési
// hurok, a menügomb „detached”. A váratlan alakú válasz nem törheti el az admin oldalt.
test("váratlan alakú piszkozat-válasz mellett az admin oldal stabil (nincs kivétel, a mobilmenü kattintható)", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path === "/api/auth/user" ? { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] } : [] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Anyagok menü megnyitása" }).click({ timeout: 10_000 });
  await expect(page.getByTestId("draft-lessons")).toHaveCount(0);
  expect(errors).toEqual([]);
});

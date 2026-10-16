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
    // Dokumentált szerződésváltozás (docs/specs/2026-10-16-draft-kezeles.md, D3): az újragyártás saját végponton fut (nem a resume-on át).
    if (path === "/api/studio/drafts/job-remake/remake") { resumed++; return route.fulfill({ status: 202, json: { jobId: "new-job" } }); }
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
  await expect(page.getByTestId("draft-confirm-remake-job-remake")).toContainText("teljes, új gyártás indul");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByTestId("draft-confirm-yes-remake-job-remake").dblclick();
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

// docs/specs/2026-10-16-draft-kezeles.md (tulajdonosi jelzés): minden piszkozat törölhető, mindig van továbblépés, a futó gyártás haladása látszik.
test("törlés megerősítéssel, gazdátlan újragyártás, kötegelt törlés és futó gyártás szakaszjelzővel", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const list = [
    { jobId: "job-run", title: "Újragyártott lecke", subject: "Matematika", classroom: 6, draft: null, running: true, error: null, updatedAt: "2026-10-16T05:00:00.000Z",
      step: "animator", ownerless: false, hasPublished: false, resumable: false,
      progress: { detail: "Gyakorlóbank: 2/5 fejezet kész — a 3. készül…", elapsedSec: 1080, sinceUpdateSec: 75, alive: true } },
    { ...drafts[0], jobId: "job-dup", step: "error", ownerless: false, hasPublished: true, resumable: false, stoppedAt: "gate",
      error: "Hibás banktétel maradt a limiten — nem publikálható.", nextRecovery: { strategy: "ask-owner", reason: "tulajdonosi döntés kell" } },
    { ...drafts[0], jobId: "job-orphan", step: "error", ownerless: true, hasPublished: false, resumable: false, error: "Ismeretlen hiba.", nextRecovery: undefined },
  ];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && path.startsWith("/api/studio/drafts/")) { calls.push(path); bodies.push(route.request().postDataJSON()); return route.fulfill({ json: path.endsWith("discard-published") ? { discarded: 1 } : { discarded: true } }); }
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    // Review #255: a szerver összesítése (total, redundant) — a lista csonkolhat, a darabszám nem.
    if (path === "/api/studio/drafts") data = { drafts: list, total: 5, redundant: 1 };
    if (path === "/api/csrf-token") data = { csrfToken: "test" };
    await route.fulfill({ json: data });
  });
  await page.goto("/admin");
  await expect(page.getByTestId("draft-hidden")).toContainText("További 2");
  // Futó gyártás: a szakaszjelző a „Tananyag készítése” szakaszt aktívnak mutatja, gomb nincs.
  const runItem = page.getByTestId("draft-item-job-run");
  await expect(runItem.getByTestId("draft-running")).toBeVisible();
  await expect(runItem.getByTestId("creation-progress").locator("li").nth(1)).toHaveAttribute("data-state", "active");
  // Spec 2026-10-16-gyartas-haladas: a futó tétel a bank haladását, az eltelt időt és a háttérfolyamat élő voltát mutatja.
  await expect(runItem.getByTestId("creation-progress")).toContainText("Gyakorlóbank: 2/5 fejezet kész — a 3. készül…");
  await expect(runItem.getByTestId("creation-progress-timing")).toHaveText("Eltelt idő: 18 perc · utolsó jelzés: 1 perce · a háttérfolyamat él");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(runItem.getByTestId("creation-progress-timing")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await runItem.screenshot({ path: test.info().outputPath("draft-running-progress-390.png") });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(runItem.getByRole("button", { name: /Folytatás|Újragyártás|Törlés/ })).toHaveCount(0);
  // Kész párral rendelkező és gazdátlan: jelvény + mindig van továbblépés (itt újragyártás) és törlés.
  await expect(page.getByTestId("draft-item-job-dup").getByTestId("draft-has-published")).toBeVisible();
  await expect(page.getByTestId("draft-item-job-dup").getByTestId("creation-progress").locator("li").nth(2)).toHaveAttribute("data-state", "error");
  await expect(page.getByTestId("draft-item-job-orphan").getByTestId("draft-ownerless")).toBeVisible();
  for (const id of ["job-dup", "job-orphan"]) {
    await expect(page.getByTestId(`draft-remake-${id}`)).toBeVisible();
    await expect(page.getByTestId(`draft-discard-${id}`)).toBeVisible();
  }
  // Törlés: az első kattintás csak megerősítést kér; utána dupla kattintásra is egyetlen kérés.
  await page.getByTestId("draft-discard-job-orphan").click();
  expect(calls).toEqual([]);
  await expect(page.getByTestId("draft-confirm-discard-job-orphan")).toContainText("visszaállítható");
  for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByTestId("draft-lessons").screenshot({ path: `tests/screenshots/admin-drafts-manage-${size.width}.png` });
  }
  await page.getByTestId("draft-confirm-yes-discard-job-orphan").dblclick();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toBe("/api/studio/drafts/job-orphan/discard");
  // Kötegelt törlés: csak a kész párral rendelkezők száma (1), megerősítéssel.
  await page.getByTestId("draft-discard-published").click();
  await page.getByTestId("draft-confirm-yes-discard-published-all").click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]).toBe("/api/studio/drafts/discard-published");
  expect(bodies[1], "a megerősített darabszám a kéréssel megy (szerveroldali ellenőrzés)").toEqual({ expected: 1 });
  expect(errors).toEqual([]);
});

// docs/specs/2026-10-16-ujragyartas-jovahagyas.md (J2/J3, mért hiba: 3 újragyártás author/ok-ban, láthatatlanul).
test("a tanulási terv jóváhagyására váró job látszik, és egyetlen kéréssel folytatható", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const calls: string[] = [];
  const waiting = { jobId: "job-wait", title: "Újragyártott lecke", subject: "Matematika", classroom: 6, draft: null, running: false, error: null,
    updatedAt: "2026-10-16T08:02:46.000Z", step: "author", ownerless: false, hasPublished: false, awaitingApproval: true, resumable: false };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && path.startsWith("/api/studio/drafts/")) { calls.push(path); return route.fulfill({ status: 202, json: { jobId: "job-wait" } }); }
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    if (path === "/api/studio/drafts") data = { drafts: [waiting], total: 1, redundant: 0 };
    if (path === "/api/csrf-token") data = { csrfToken: "test" };
    await route.fulfill({ json: data });
  });
  await page.goto("/admin");
  const item = page.getByTestId("draft-item-job-wait");
  await expect(item.getByTestId("draft-badge")).toHaveText("A tanulási terv jóváhagyására vár");
  await expect(item.getByTestId("draft-awaiting-approval")).toBeVisible();
  // K4: a tervre váró tétel NEM fut — nincs aktív (forgó) szakasz.
  await expect(item.getByTestId("creation-progress").locator('li[data-state="active"]')).toHaveCount(0);
  // Review #257 (P2): a lenyitott részletek sem állítják, hogy fut — a várakozás saját szövegével.
  await expect(item.getByTestId("creation-progress-details")).toContainText("döntésre vár");
  await expect(item.getByTestId("draft-discard-job-wait")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByTestId("draft-continue-job-wait").dblclick();
  await expect.poll(() => calls.length).toBe(1);
  await page.waitForTimeout(300);
  expect(calls).toEqual(["/api/studio/drafts/job-wait/continue"]);
  expect(errors).toEqual([]);
});

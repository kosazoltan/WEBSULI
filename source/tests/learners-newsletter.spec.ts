import { test, expect } from "@playwright/test";

// Spec: docs/specs/2026-10-19-mai-felfedezes-hirlevel.md (S1) — a „Tanulók” fül érdeklődés-szerkesztője valós renderben.
// A service worker (#207) a regisztrálása után a kéréseket a page.route elfogója mellett vinné el — itt nem kell.
test.use({ serviceWorkers: "block" });

const learner = (interests: string[], newsletter: boolean) => [
  { id: "l1", name: "Teszt Tanuló", grade: 5, emails: 1, pairLink: "https://example.test/?t=x", interests, newsletter,
    report: { lastActive: null, activeDays7: 0, views7: 0, results: [] } },
];

for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
  test(`érdeklődés és hírlevél-kapcsoló mentése ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let server = learner(["történelem"], false);
    let patched: unknown = null;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/admin/learners", (route) => route.fulfill({ json: server }));
    await page.route("**/api/csrf-token", (route) => route.fulfill({ json: { csrfToken: "probe" } }));
    await page.route("**/api/admin/learners/l1", async (route) => {
      patched = route.request().postDataJSON();
      await held; // a válasz visszatartva: mentés közben a szerkesztő tiltott
      server = learner(["történelem", "repülők"], true);
      await route.fulfill({ json: { interests: ["történelem", "repülők"], newsletter: true } });
    });
    await page.goto("/__learners-panel-probe");
    const box = page.getByTestId("learner-newsletter-l1");
    await expect(box).toBeVisible();
    const input = box.getByRole("textbox");
    await expect(input).toHaveValue("történelem");
    await input.fill("történelem, repülők");
    await box.getByRole("switch").click();
    await box.getByRole("button", { name: "Mentés" }).click();
    await expect.poll(() => patched).toEqual({ interests: ["történelem", "repülők"], newsletter: true });
    await expect(input).toBeDisabled();
    await expect(box.getByRole("switch")).toBeDisabled();
    release();
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue("történelem, repülők");
    // Review #312: egy másik admin módosítása → „Frissítés” → a szerkesztő a szerver új értékét mutatja.
    server = learner(["motorok"], false);
    await page.getByRole("button", { name: "Frissítés" }).click();
    await expect(page.getByTestId("learner-newsletter-l1").getByRole("textbox")).toHaveValue("motorok");
    await expect(page.getByTestId("learner-newsletter-l1").getByRole("switch")).not.toBeChecked();
    // Nincs vízszintes kilógás és levágott szerkesztő.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const b = await page.getByTestId("learner-newsletter-l1").boundingBox();
    expect(b && b.x >= 0 && b.x + b.width <= viewport.width).toBeTruthy();
    await page.screenshot({ path: `test-results/learners-newsletter-${viewport.width}.png`, fullPage: true });
  });
}

// Spec 2026-10-21-tanulo-parositas (review #362): a „Párosító QR-kód” gomb valós renderben — betöltött kép, nincs kilógás; új link
// (visszavonás után) a régi kódot lecseréli.
for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
  test(`párosító QR-kód megjelenik és frissül ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let server = learner([], false);
    await page.route("**/api/admin/learners", (route) => route.fulfill({ json: server }));
    await page.route("**/api/csrf-token", (route) => route.fulfill({ json: { csrfToken: "probe" } }));
    await page.goto("/__learners-panel-probe");
    const button = page.getByRole("button", { name: "Párosító QR-kód" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const img = page.getByTestId("pair-qr").getByRole("img", { name: "Teszt Tanuló párosító QR-kódja" });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    const first = await img.getAttribute("src");
    expect(first).toMatch(/^data:image\/png;base64,/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const b = await page.getByTestId("pair-qr").boundingBox();
    expect(b && b.x >= 0 && b.x + b.width <= viewport.width).toBeTruthy();
    await page.screenshot({ path: `test-results/learners-pair-qr-${viewport.width}.png`, fullPage: true });
    // Új párosító link (pl. visszavonás után) → a nyitott QR-kód az új linket kódolja.
    server = learner([], false).map((l) => ({ ...l, pairLink: "https://example.test/?t=uj" }));
    await page.getByRole("button", { name: "Frissítés" }).click();
    await expect.poll(() => img.getAttribute("src")).not.toBe(first);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await button.click();
    await expect(page.getByTestId("pair-qr")).toHaveCount(0);
  });
}

// Spec 2026-10-21-tanulo-parositas („Kiegészítés”): „Párosítási útmutató küldése” — megerősítés után küld, az eredmény a toastban.
test("párosítási útmutató küldése megerősítéssel", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let posted = 0;
  await page.route("**/api/admin/learners", (route) => route.fulfill({ json: learner([], false) }));
  await page.route("**/api/csrf-token", (route) => route.fulfill({ json: { csrfToken: "probe" } }));
  await page.route("**/api/admin/learners/pairing-guide", (route) => { posted++; return route.fulfill({ json: { children: 6, parents: 2, failed: 0 } }); });
  await page.goto("/__learners-panel-probe");
  const button = page.getByTestId("learners-pairing-guide");
  page.once("dialog", (d) => void d.dismiss());
  await button.click();
  expect(posted).toBe(0);
  page.once("dialog", (d) => void d.accept());
  await button.click();
  await expect(page.getByText("6 gyereklevél, 2 szülőlevél.").first()).toBeVisible();
  expect(posted).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/learners-pairing-guide-375.png", fullPage: true });
});

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

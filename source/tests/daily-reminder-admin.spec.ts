import { expect, test } from "@playwright/test";

// Spec: docs/specs/2026-10-18-napi-emlekezteto.md — tanulónév a címzetteknél és a „Mai emlékeztetők” előnézet (valós render).
test.use({ serviceWorkers: "block" });

const EMAILS = [
  { id: "e1", email: "tanulo@example.test", classrooms: [5], addedBy: "a", isActive: true, studentName: "Próba Léna Szonja", createdAt: "2025-10-26T16:00:00Z" },
  { id: "e2", email: "szulo@example.test", classrooms: [4, 5], addedBy: "a", isActive: true, studentName: null, createdAt: "2025-10-26T16:00:00Z" },
];
const PREVIEW = { day: "2026-10-19", schoolDay: true, items: [
  { email: "tanulo@example.test", studentName: "Próba Léna Szonja", grade: 5, materialId: "m1", title: "Törtek összeadása — egy nagyon hosszú tananyagcím, amely két sorba is tördelődhet", topic: "Matematika 5.: Törtek", url: "https://websuli.vip/preview/m1" },
] };

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`tanulónév szerkesztése és a mai emlékeztetők előnézete ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    let patched: unknown = null; let ran = 0; let tested = 0;
    await page.route("**/api/**", async route => {
      const req = route.request(); const path = new URL(req.url()).pathname;
      if (path === "/api/auth/user") return route.fulfill({ json: { id: "fixture", isAdmin: true, firstName: "Teszt" } });
      if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
      if (path === "/api/admin/extra-emails") return route.fulfill({ json: EMAILS });
      if (path === "/api/admin/daily-reminders/preview") return route.fulfill({ json: PREVIEW });
      if (path === "/api/admin/daily-reminders/test" && req.method() === "POST") { tested++; return route.fulfill({ json: { ok: true, studentName: "Próba Léna Szonja", title: "Törtek" } }); }
      if (path === "/api/admin/daily-reminders/run" && req.method() === "POST") { ran++; return route.fulfill({ json: { day: "2026-10-19", sent: 1, failed: 0, duplicate: 0 } }); }
      if (path === "/api/extra-emails/e2/student" && req.method() === "PATCH") { patched = req.postDataJSON(); return route.fulfill({ json: { ...EMAILS[1], studentName: "Új Név" } }); }
      return route.fulfill({ json: [] });
    });
    await page.goto("/admin?tab=emails");
    await expect(page.getByTestId("student-name-e1")).toHaveText("Próba Léna Szonja");
    await expect(page.getByTestId("extra-email-e2")).toContainText("Nincs tanulónév");
    await page.getByTestId("button-edit-student-name-e2").click();
    await page.getByTestId("input-student-name-e2").fill("  Új   Név ");
    await page.getByTestId("button-save-student-name-e2").click();
    await expect.poll(() => patched).toEqual({ studentName: "Új   Név" });

    const card = page.getByTestId("daily-reminder-card");
    await card.scrollIntoViewIfNeeded();
    await expect(card).toContainText("tanítási nap");
    await expect(page.getByTestId("daily-reminder-preview")).toContainText("Próba Léna Szonja");
    await expect(page.getByTestId("daily-reminder-preview")).toContainText("5. osztály");
    await page.getByTestId("button-daily-reminder-test").click();
    await expect.poll(() => tested).toBe(1);
    await expect(page.getByText("Próbalevél elküldve a címedre").first()).toBeVisible();
    await page.getByTestId("button-daily-reminder-run").click();
    await page.getByTestId("button-daily-reminder-confirm").click();
    await expect.poll(() => ran).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "nincs vízszintes túlcsordulás").toBeLessThanOrEqual(0);
    await card.screenshot({ path: test.info().outputPath(`daily-reminder-${viewport.width}.png`) });
    expect(errors).toEqual([]);
  });
}

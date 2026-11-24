import { expect, test } from "@playwright/test";

/**
 * #1986 E7 (docs/specs/2026-11-24-gimi-felveteli-csoport.md): az admin Tanulók fülén a „Csoport-hozzárendelések” kártya felvesz,
 * listáz és töröl. A címek szintetikusak (a repó nyilvános).
 */
test.use({ serviceWorkers: "block", viewport: { width: 1366, height: 900 } });

test("admin: Csoport-hozzárendelések — felvétel (POST) és törlés (DELETE)", async ({ page }) => {
  let rows: Array<{ track: string; emailKey: string }> = [];
  const writes: Array<{ method: string; body: unknown }> = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/admin/track-assignments") {
      if (req.method() === "GET") return route.fulfill({ json: rows });
      const body = req.postDataJSON() as { track: string; email?: string; emailKey?: string };
      writes.push({ method: req.method(), body });
      if (req.method() === "POST") { rows = [{ track: body.track, emailKey: "kisdiak@gmail.com" }]; return route.fulfill({ json: rows[0] }); }
      rows = []; return route.fulfill({ json: { deleted: 1 } });
    }
    if (req.method() !== "GET") return route.fulfill({ json: { ok: true } });
    if (path === "/api/auth/user") return route.fulfill({ json: { id: "admin-fixture", isAdmin: true, firstName: "Kósa", email: "admin@example.test" } });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "probe" } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin?tab=learners");
  const card = page.getByTestId("track-assignments-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("track-assign-empty")).toBeVisible();
  await card.getByTestId("input-track-assign-email").fill("Kis.Diak+2@gmail.com");
  await card.getByTestId("button-track-assign-add").click();
  await expect(card.getByTestId("track-assign-row")).toHaveCount(1);
  await expect(card.getByTestId("track-assign-row")).toContainText("kisdiak@gmail.com");
  await card.getByTestId("button-track-assign-remove").click();
  await expect(card.getByTestId("track-assign-empty")).toBeVisible();
  expect(writes).toEqual([
    { method: "POST", body: { track: "gimi6", email: "Kis.Diak+2@gmail.com" } },
    { method: "DELETE", body: { track: "gimi6", emailKey: "kisdiak@gmail.com" } },
  ]);
});

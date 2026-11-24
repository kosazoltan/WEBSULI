import { expect, test } from "@playwright/test";

/**
 * #1986 (docs/specs/2026-11-24-gimi-felveteli-csoport.md E3): az admin a fájlszerkesztőben a „6-osztályos gimnáziumi felvételi”
 * csoportba teszi az anyagot — a mentés a PUT …/tracks végpontra megy, a többi mező (változatlan) nem küldődik.
 */
test.use({ serviceWorkers: "block", viewport: { width: 1366, height: 900 } });

test("admin: a fájlszerkesztő csoport-jelölője a PUT /tracks végpontra ment", async ({ page }) => {
  const now = new Date().toISOString();
  const files = [{ id: "f-6", userId: null, title: "6. osztály — Törtek", content: "", description: null, classroom: 6, tracks: [], contentType: "html", createdAt: now }];
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() !== "GET") { calls.push({ method: req.method(), path, body: req.postDataJSON() }); return route.fulfill({ json: { ok: true } }); }
    if (path === "/api/auth/user") return route.fulfill({ json: { id: "admin-fixture", isAdmin: true, firstName: "Kósa", email: "admin@example.test" } });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "probe" } });
    if (path === "/api/html-files") return route.fulfill({ json: files });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin?tab=files");
  await page.getByTestId("button-edit-file").first().click();
  const box = page.getByTestId("checkbox-edit-track-gimi6");
  await expect(box).toBeVisible();
  await expect(box).not.toBeChecked();
  await expect(page.getByTestId("button-save-edit")).toBeDisabled();
  await box.click();
  await expect(page.getByTestId("button-save-edit")).toBeEnabled();
  await page.getByTestId("button-save-edit").click();
  // csak a fájl-írások számítanak (a kártyák kedvelés-ellenőrző POST-ja független háttérhívás)
  const writes = () => calls.filter((c) => c.path.startsWith("/api/html-files/"));
  await expect.poll(() => writes().length).toBeGreaterThan(0);
  expect(writes()).toEqual([{ method: "PUT", path: "/api/html-files/f-6/tracks", body: { tracks: ["gimi6"] } }]);
});

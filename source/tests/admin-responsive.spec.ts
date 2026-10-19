import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { DEVICES, mockAdmin, overflowX, reachableProblem, unreachable } from "./admin-responsive-helpers";

/**
 * Adminfelületek reszponzivitás-revíziója (docs/specs/2026-10-19-admin-reszponzivitas.md): valódi render a Honor Magic V6 külső
 * és széthajtott belső kijelzőjén. Minden látható gomb a látótérbe görgethető, teljesen látszik, és nem takarja az alsó menü
 * (elementFromPoint); nincs vízszintes kilógás. Az adat a hálózaton ál-adat (bejelentkezés nélkül, admin szereppel).
 */
test.use({ serviceWorkers: "block" });

const TABS = ["files", "lesson-studio", "workflows", "lesson-repair", "improve-materials", "improvement-backups", "pdf-upload", "tags", "learners", "backup", "database"] as const;

for (const d of DEVICES) {
  test(`${d.name}: minden tananyaggyártási fül — minden gomb elérhető, nincs kilógás`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mockAdmin(page);
    await page.setViewportSize({ width: d.width, height: d.height });
    const report: Record<string, unknown> = {};
    for (const tab of TABS) {
      await page.goto(`/admin?tab=${tab}`);
      await expect(page.getByTestId("admin-panel")).toBeVisible();
      await page.waitForTimeout(800);
      const problems = await unreachable(page);
      const ovx = await overflowX(page);
      report[tab] = { problems, ovx };
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
      await page.screenshot({ path: `test-results/admin-responsive/${d.name}-${tab}.png` });
    }
    fs.writeFileSync(`test-results/admin-responsive/${d.name}.json`, JSON.stringify(report, null, 1));
    const bad = Object.entries(report).filter(([, v]) => (v as { problems: string[]; ovx: number }).problems.length || (v as { ovx: number }).ovx > 1);
    expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
  });
}

// A tulajdonos jelzése: „A sima HTML-feltöltés gomb lecsúszik, amikor betöltöm az anyagot.” — a billentyűzetes nézetben is.
for (const d of [...DEVICES, { name: "magicv6-kulso-billentyuzet", width: 393, height: 450 }]) {
  test(`${d.name}: HTML-feltöltés betöltött nagy fájllal — a „Feltöltés” és a „Mégse” elérhető, a feltöltés elindul`, async ({ page }) => {
    await mockAdmin(page);
    let posted = false;
    await page.route("**/api/html-files", (route) => {
      if (route.request().method() === "POST") { posted = true; return route.fulfill({ status: 201, json: { id: "uj", title: "Próba" } }); }
      return route.fallback();
    });
    await page.setViewportSize({ width: d.width, height: d.height });
    await page.goto("/admin?tab=files");
    await page.getByTestId("button-upload-html").locator("visible=true").first().click();
    await page.getByTestId("input-title").fill("Próba anyag");
    const big = `<!doctype html><html lang="hu"><body>${"<p>Tananyag sor — ő ű á é.</p>\n".repeat(9000)}</body></html>`;
    await page.locator("#file-input").setInputFiles({ name: "proba.html", mimeType: "text/html", buffer: Buffer.from(big) });
    await expect(page.getByTestId("input-content")).not.toHaveValue("");
    for (const sel of ['[data-testid="button-submit-upload"]', '[data-testid="button-cancel-upload-bottom"]']) {
      expect(await reachableProblem(page, sel), `${d.name} ${sel}`).toBeNull();
    }
    await page.screenshot({ path: `test-results/admin-responsive/${d.name}-upload-loaded.png` });
    await page.getByTestId("button-submit-upload").click();
    await expect.poll(() => posted).toBe(true);
  });
}

for (const d of DEVICES) {
  test(`${d.name}: Tananyagjavító — választás után a „Javítás indítása” elérhető; fájlszerkesztő „Mentés” elérhető`, async ({ page }) => {
    await mockAdmin(page);
    await page.setViewportSize({ width: d.width, height: d.height });
    await page.goto("/admin?tab=lesson-repair");
    await page.getByTestId("lesson-repair-option-f-lesson").click();
    await page.getByTestId("lesson-repair-instruction").fill("Javítsd az elírásokat.");
    expect(await reachableProblem(page, '[data-testid="lesson-repair-start"]'), d.name).toBeNull();
    await page.screenshot({ path: `test-results/admin-responsive/${d.name}-repair.png` });

    await page.goto("/admin?tab=files");
    await page.getByTestId("button-edit-file").first().click();
    // Változtatás nélkül a „Mentés” tiltott — a valós használatban előbb módosul a cím.
    await page.getByTestId("input-edit-title").fill("Új cím");
    expect(await reachableProblem(page, '[data-testid="button-save-edit"]'), d.name).toBeNull();
    await page.screenshot({ path: `test-results/admin-responsive/${d.name}-edit.png` });
  });
}

test("felugró ablak: a kijelzőnél magasabb tartalom belül görget, az alsó gomb elérhető (közös ablakalap)", async ({ page }) => {
  await mockAdmin(page);
  await page.setViewportSize({ width: 393, height: 450 });
  await page.goto("/admin?tab=files");
  await page.getByTestId("button-send-email").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(450 + 1);
  const last = dialog.locator("button:visible").last();
  await last.scrollIntoViewIfNeeded();
  const lb = await last.boundingBox();
  expect(lb!.y + lb!.height).toBeLessThanOrEqual(450 + 1);
  await page.screenshot({ path: "test-results/admin-responsive/dialog-450.png" });
});

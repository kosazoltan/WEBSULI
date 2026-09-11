import { expect, test, type Page } from "@playwright/test";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";

test.use({ serviceWorkers: "block" });
const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és a területképlet.", subject: "Matematika", experience: compactFusionFixture().experience };
const html = `<!DOCTYPE html><html lang="hu"><body><h1>Árvíztűrő tananyag</h1><script type="application/json" id="websuli-lesson-data">${JSON.stringify(data)}</script></body></html>`;
const sources = [{ url: "https://www.oktatas.hu/", title: "Ellenőrzött forrás" }];
const id = "c34b1bd5-c8ac-48f6-b602-75f4f548b305";
const job = { id, state: "running", message: "Készíts tananyagot", title: "Angol gyakorlás", stage: "Források feldolgozása…", content: "Források megvannak. Készül a tananyag:", sources, createdAt: Date.now() };
const done = { ...job, state: "done", html, classroom: 7, materialId: "saved-web-lesson" };
async function open(page: Page) {
  await page.route("**/api/csrf-token", r => r.fulfill({ json: { csrfToken: "test" } }));
  await page.route("**/api/studio/maps", r => r.fulfill({ json: { maps: [] } }));
  await page.goto("/__studio-panel-probe");
  await page.getByTestId("studio-mode-web").click();
}
async function send(page: Page, message = "Keress és készíts angol gyakorló tananyagot") {
  const box = page.getByPlaceholder("Pl.: Keress tananyagot 5. osztályos törtekhez, és készítsd el");
  await box.fill(message); await box.press("Enter");
}
test("sikertelen készítés után tartós hiba látható minden képernyőn", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: { ...job, state: "error", error: "Nem készült tananyag: JSON-bank experience.tasks hibás." } }));
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-error")).toContainText("Nem készült tananyag");
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  await expect(page.getByTestId("web-research-sources")).toContainText("Ellenőrzött forrás");
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.getByTestId("web-research-error").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("web-research-error")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.getByTestId("web-research-error").evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await page.screenshot({ path: `tests/screenshots/web-research-error-${viewport.width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
test("a szerver ment, a kliens a tartalom évfolyamát és a mentett új anyagot mutatja", async ({ page }) => {
  let reads = 0; let clientWrites = 0;
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: ++reads === 1 ? done : { ...job, state: "error", error: "Második készítés hibás" } }));
  await page.route("**/api/html-files", r => { clientWrites++; return r.fulfill({ status: 500 }); });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-open-saved")).toHaveAttribute("href", "/preview/saved-web-lesson");
  await expect(page.getByTestId("web-research-classroom")).toContainText("7.");
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  await send(page, "Másik témából új tananyagot kérek");
  await expect(page.getByTestId("web-research-error")).toBeVisible();
  await expect(page.getByTestId("web-research-open-saved")).toHaveCount(0);
  await expect(page.getByTestId("web-research-preview")).toHaveCount(0);
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  expect(clientWrites).toBe(0);
});
test("mentési hiba után a szerveren megmaradt jelölt menthető új AI nélkül", async ({ page }) => {
  let generations = 0; let publications = 0;
  await page.route("**/api/studio/web-research/jobs", r => { generations++; return r.fulfill({ status: 202, json: job }); });
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: { ...done, state: "ready", materialId: undefined, error: "Mentés átmenetileg nem elérhető" } }));
  await page.route("**/api/studio/web-research/jobs/*/publish", r => { publications++; return r.fulfill({ json: done }); });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-error")).toContainText("Mentés átmenetileg");
  await expect(page.getByTestId("web-research-preview")).toBeVisible();
  await page.getByTestId("web-research-save").click();
  await expect(page.getByTestId("web-research-open-saved")).toHaveAttribute("href", "/preview/saved-web-lesson");
  await expect(page.getByTestId("web-research-error")).toHaveCount(0);
  expect(generations).toBe(0); expect(publications).toBe(1);
});
test("újratöltés után ugyanazt a futást követi, átmeneti hálózati hiba nem indít újat", async ({ page }) => {
  let startedId = ""; let generations = 0; let ready = false; let failRead = false;
  await page.route("**/api/studio/web-research/jobs", r => { generations++; startedId = r.request().postDataJSON().id; return r.fulfill({ status: 202, json: { ...job, id: startedId } }); });
  const ids: string[] = [];
  await page.route("**/api/studio/web-research/jobs/*", r => {
    ids.push(r.request().url().split("/").pop()!);
    if (!startedId) return r.fulfill({ status: 404, json: {} });
    if (failRead) { failRead = false; return r.abort(); }
    return r.fulfill({ json: { ...(ready ? done : job), id: startedId } });
  });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-status")).toContainText("Források feldolgozása");
  await page.reload(); await page.getByTestId("studio-mode-web").click();
  await expect(page.getByTestId("web-research-status")).toContainText("Források feldolgozása");
  failRead = true;
  await expect(page.getByTestId("web-research-status")).toContainText("újracsatlakozás", { timeout: 8000 });
  ready = true;
  await expect(page.getByTestId("web-research-open-saved")).toBeVisible({ timeout: 8000 });
  expect(generations).toBe(1); expect(new Set(ids)).toEqual(new Set([startedId]));
});
test("a futás közben a mentési cím nem változhat, az indítás bemenete rögzített", async ({ page }) => {
  let request: Record<string, unknown> | undefined; let ready = false;
  await page.route("**/api/studio/web-research/jobs", r => { request = r.request().postDataJSON(); return r.fulfill({ status: 202, json: job }); });
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill(request ? { json: ready ? done : job } : { status: 404, json: {} }));
  await open(page); await page.getByTestId("web-research-title").fill("A választott cím"); await send(page);
  await expect(page.getByTestId("web-research-title")).toBeDisabled();
  await expect(page.getByTestId("web-research-classroom")).toBeDisabled();
  await expect(page.getByTestId("web-research-status")).toContainText("Források feldolgozása");
  expect(request!.title).toBe("A választott cím");
  ready = true;
  await expect(page.getByTestId("web-research-open-saved")).toBeVisible();
  await expect(page.getByTestId("web-research-title")).toBeEnabled();
});

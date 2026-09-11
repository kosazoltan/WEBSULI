import { expect, test, type Page } from "@playwright/test";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";

test.use({ serviceWorkers: "block" });
const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és a területképlet.", subject: "Matematika", experience: compactFusionFixture().experience };
const html = `<!DOCTYPE html><html lang="hu"><body><h1>Árvíztűrő tananyag</h1><script type="application/json" id="websuli-lesson-data">${JSON.stringify(data)}</script></body></html>`;
const sources = [{ url: "https://www.oktatas.hu/", title: "Ellenőrzött forrás" }];
const sse = (events: unknown[]) => events.map(e => `data: ${JSON.stringify(e)}\n\n`).join("");
const summary = { type: "content_delta", content: "Források megvannak. Készül a tananyag:" };
const complete = { type: "complete" };
const artifact = { type: "html_generated", html, sources };
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
test("csak összefoglaló után tartós hiba látható minden képernyőn", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/studio/web-research/chat", r => r.fulfill({ contentType: "text/event-stream", body: sse([summary, { type: "sources", sources }, complete]) }));
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-error")).toContainText("nem készült tananyag");
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
test("a teljes jelölt automatikusan mentődik; a besorolás a tartalomé, új kérés nem menti a régit", async ({ page }) => {
  const writes: Record<string, unknown>[] = [];
  let run = 0;
  await page.route("**/api/studio/web-research/chat", r => r.fulfill({ contentType: "text/event-stream", body: sse(++run === 1 ? [summary, artifact, complete] : [summary, complete]) }));
  await page.route("**/api/html-files", r => { writes.push(r.request().postDataJSON()); return r.fulfill({ status: 201, json: { id: "saved-web-lesson" } }); });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-open-saved")).toHaveAttribute("href", "/preview/saved-web-lesson");
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  expect(writes).toHaveLength(1); expect(writes[0].classroom).toBe(7); expect(writes[0].content).toBe(html);
  await send(page, "Másik témából új tananyagot kérek");
  await expect(page.getByTestId("web-research-error")).toBeVisible();
  await expect(page.getByTestId("web-research-open-saved")).toHaveCount(0);
  await expect(page.getByTestId("web-research-preview")).toHaveCount(0);
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  expect(writes).toHaveLength(1);
});
test("mentési hiba után a jelölt megmarad és újrapróbálható; nem kell újra generálni", async ({ page }) => {
  let writes = 0; let generations = 0;
  await page.route("**/api/studio/web-research/chat", r => { generations++; return r.fulfill({ contentType: "text/event-stream", body: sse([artifact, complete]) }); });
  await page.route("**/api/html-files", r => r.fulfill(++writes === 1 ? { status: 503, json: { message: "Mentés átmenetileg nem elérhető" } } : { status: 201, json: { id: "retried-lesson" } }));
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-error")).toContainText("Mentés átmenetileg");
  await expect(page.getByTestId("web-research-preview")).toBeVisible();
  await page.getByTestId("web-research-save").click();
  await expect(page.getByTestId("web-research-open-saved")).toHaveAttribute("href", "/preview/retried-lesson");
  await expect(page.getByTestId("web-research-error")).toHaveCount(0);
  expect(generations).toBe(1); expect(writes).toBe(2);
});
test("megszakadt streamből még a megérkezett HTML sem mentődik automatikusan", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/studio/web-research/chat", r => r.fulfill({ contentType: "text/event-stream", body: sse([summary, artifact]) }));
  await page.route("**/api/html-files", r => { writes++; return r.fulfill({ json: { id: "unexpected" } }); });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-error")).toContainText("megszakadt");
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  expect(writes).toBe(0);
});

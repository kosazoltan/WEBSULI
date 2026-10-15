import { test, expect, type Page } from "@playwright/test";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";
import { withLessonTypography } from "../shared/lesson-typography";

/* Tételgyár T7.2 (docs/specs/2026-10-15-tetelgyar-t7-dontobiro-vegrehajtas.md): kiértékelés után a döntőbíró a nem teljes pontos választ
   átnézi; az emelt ítélet a kártyán és az összesítésben látszik; a kérés csak a forrást, a feladat-azonosítót és a választ viszi. */

const OWN_WORDS = "Ezt a saját szavaimmal írom le, a lényeget értem.";
type Sent = { source: unknown; taskId: string; answer: string } & Record<string, unknown>;

async function mockArbiter(page: Page, sent: Sent[]) {
  await page.route("**/api/lessons/arbiter", async (route) => {
    const body = route.request().postDataJSON() as Sent;
    sent.push(body);
    await new Promise((r) => setTimeout(r, 300));
    return route.fulfill({ json: { state: "ok", score: 1, reason: "Jól elmagyaráztad a saját szavaiddal.", source: "döntőbíró" } });
  });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const [width, height] of [[390, 844], [1366, 900]]) {
  test(`Studio-lecke: a döntőbíró emeli a saját szavas választ (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const sent: Sent[] = [];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config") return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } });
      if (path === "/api/html-files/arbiter-fixture") return route.fulfill({ json: { id: "arbiter-fixture", title: "Háromszög", contentType: "lesson" } });
      if (path === "/api/lessons/by-file/arbiter-fixture") return route.fulfill({ json: { lessonId: "arbiter-lesson", version: 1, lesson: compactFusionFixture() } });
      return route.fulfill({ status: 401, json: { message: "Anonymous fixture" } });
    });
    await mockArbiter(page, sent);
    await page.goto("/preview/arbiter-fixture");
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    const panel = page.getByRole("tabpanel", { name: "Feladatok", exact: true });
    await expect(panel).toContainText("A nem teljes pontos válaszokat egy mesterséges intelligencia is átnézi.");
    const first = panel.locator("[data-task-id]").first();
    await first.locator("textarea").fill(OWN_WORDS);
    // Review #242 (P1): több függő válasznál sincs duplikált kérés (az ítéletek egymás után érkeznek).
    await panel.locator("[data-task-id]").nth(1).locator("textarea").fill(`${OWN_WORDS} Második válasz.`);
    await panel.locator("[data-task-id]").nth(2).locator("textarea").fill(`${OWN_WORDS} Harmadik válasz.`);
    await panel.getByRole("button", { name: "Feladatok kiértékelése", exact: true }).click();
    const close = page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true });
    if (await close.isVisible().catch(() => false)) await close.click();
    await expect(first.getByTestId("arbiter-note")).toHaveText("A döntőbíró elfogadta a saját megfogalmazásodat.");
    await expect(first.locator(".fusion-verdict")).toHaveAttribute("data-state", "ok");
    await expect(first.locator(".fusion-verdict strong")).toContainText("Elfogadva · 1 pont");
    await expect(panel.locator(".fusion-result")).toContainText("3 / ");
    await expect(panel.getByTestId("arbiter-note")).toHaveCount(3);
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((x) => x.taskId)).size).toBe(3);
    expect(sent.find((x) => x.answer === OWN_WORDS)).toEqual({ source: { kind: "lesson", htmlFileId: "arbiter-fixture" }, taskId: await first.getAttribute("data-task-id"), answer: OWN_WORDS });
    await noOverflow(page);
    const box = await first.getByTestId("arbiter-note").boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/arbiter-studio-${width}.png` });
    // Újratöltés után a mentett ítélet marad (nincs új kérés).
    await page.reload();
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: "Feladatok", exact: true }).locator("[data-task-id]").first().getByTestId("arbiter-note")).toBeVisible();
    expect(sent).toHaveLength(3);
  });

  test(`HTML-lecke (/dev/:id): a döntőbíró emeli a saját szavas választ (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const sent: Sent[] = [];
    await mockArbiter(page, sent);
    const lesson = compactFusionFixture();
    const data = { classroom: 7, classroomEvidence: "A háromszög területének kiszámítása az alap és magasság alapján.", subject: "matematika", experience: lesson.experience };
    const html = withLessonTypography(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}</style></head><body><section data-lesson-panel="tasks"></section><section data-lesson-panel="quiz"></section><script type="application/json" id="websuli-lesson-data">${JSON.stringify(data)}</script></body></html>`);
    await page.route("**/dev/arbiter-html", (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto("/dev/arbiter-html");
    const tasks = page.getByRole("region", { name: "Pontozott szöveges feladatok" });
    await expect(tasks).toContainText("a nem teljes pontos válaszokat egy mesterséges intelligencia is átnézi");
    const taskId = (await tasks.locator("textarea").first().getAttribute("aria-label"))!;
    await tasks.locator("textarea").first().fill(OWN_WORDS);
    await tasks.getByRole("button", { name: "Kiértékelés", exact: true }).click();
    await tasks.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
    await expect(tasks.locator("article").first().getByTestId("arbiter-note")).toHaveText("A döntőbíró elfogadta a saját megfogalmazásodat.");
    await expect(tasks.getByRole("status").filter({ hasText: "pont ·" })).toContainText("1 / 5 pont");
    expect(sent).toHaveLength(1);
    expect(sent[0].source).toEqual({ kind: "html", materialId: "arbiter-html" });
    expect(lesson.experience!.tasks.find((t) => t.id === sent[0].taskId)?.q).toBe(taskId);
    expect(Object.keys(sent[0]).sort()).toEqual(["answer", "source", "taskId"]);
    await noOverflow(page);
    await page.screenshot({ path: `test-results/arbiter-html-${width}.png` });
  });
}

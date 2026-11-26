import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { buildWordSearch } from "../shared/word-grid";

/** V5a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): szókereső és keresztrejtvény — billentyűzet, állapot-visszaállás. */
test.use({ serviceWorkers: "block" });
const WORDS = ["alma", "körte", "szilva"];

async function mount(page: Page) {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<{ coversConceptIds?: string[] }> }> };
  const concept = lesson.sections[0].blocks.find(b => b.coversConceptIds?.length)!.coversConceptIds!.slice(0, 1);
  lesson.sections[0].blocks.unshift({ kind: "try", tryKind: "crossword", spec: { entries: [{ answer: "alma", clue: "Piros gyümölcs" }, { answer: "körte", clue: "Sárga gyümölcs" }, { answer: "meggy", clue: "Savanyú gyümölcs" }] }, coversConceptIds: concept } as never);
  lesson.sections[0].blocks.unshift({ kind: "try", tryKind: "wordSearch", spec: { words: WORDS }, coversConceptIds: concept } as never);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/grid-fixture") return route.fulfill({ json: { id: "grid-fixture", title: "Lecke", contentType: "lesson", classroom: 5 } });
    if (path === "/api/lessons/by-file/grid-fixture") return route.fulfill({ json: { lessonId: "lesson-grid", version: 1, lesson } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto("/preview/grid-fixture");
}

test("szókereső: kezdő- és zárócella billentyűzettel → a szó megtalálva; keresztrejtvény: beírás → helyes; újratöltés után visszaáll", async ({ page }) => {
  await mount(page);
  const ws = page.locator('[data-try="wordSearch"]');
  const grid = buildWordSearch(WORDS);
  const alma = grid.placements.find((p) => p.word === "alma")!;
  const end = { row: alma.row + alma.dr * 3, col: alma.col + alma.dc * 3 };
  await ws.getByRole("gridcell", { name: new RegExp(`^${alma.row + 1}\\. sor, ${alma.col + 1}\\. oszlop`) }).focus();
  await page.keyboard.press("Enter");
  await ws.getByRole("gridcell", { name: new RegExp(`^${end.row + 1}\\. sor, ${end.col + 1}\\. oszlop`) }).focus();
  await page.keyboard.press("Enter");
  await expect(ws.getByTestId("found-words")).toContainText("alma");

  const cw = page.locator('[data-try="crossword"]');
  await cw.getByRole("textbox", { name: /Piros gyümölcs/ }).fill("ALMA");
  await cw.getByRole("textbox", { name: /Sárga gyümölcs/ }).fill("körte");
  await cw.getByTestId("try-check").focus();
  await page.keyboard.press("Enter");
  await expect(cw.getByTestId("try-verdict")).toContainText("Részben");

  await page.reload();
  await expect(page.locator('[data-try="wordSearch"]').getByTestId("found-words")).toContainText("alma");
  await expect(page.locator('[data-try="crossword"]').getByRole("textbox", { name: /Piros gyümölcs/ })).toHaveValue("ALMA");
  await expect(page.locator('[data-try="crossword"]').getByTestId("try-verdict")).toContainText("Részben");
});
async function mountBlocks(page: Page, blocks: Array<Record<string, unknown>>) {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<{ coversConceptIds?: string[] }> }> };
  const concept = lesson.sections[0].blocks.find(b => b.coversConceptIds?.length)!.coversConceptIds!.slice(0, 1);
  for (const b of [...blocks].reverse()) lesson.sections[0].blocks.unshift({ ...b, coversConceptIds: concept } as never);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/grid-fixture-2") return route.fulfill({ json: { id: "grid-fixture-2", title: "Lecke", contentType: "lesson", classroom: 5 } });
    if (path === "/api/lessons/by-file/grid-fixture-2") return route.fulfill({ json: { lessonId: "lesson-grid-2", version: 1, lesson } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto("/preview/grid-fixture-2");
}

test("review #616: két keresztrejtvény — a második meghatározására kattintva a második rejtvény mezője kap fókuszt (egyedi azonosítók)", async ({ page }) => {
  await mountBlocks(page, [
    { kind: "try", tryKind: "crossword", spec: { entries: [{ answer: "alma", clue: "Első piros gyümölcs" }, { answer: "körte", clue: "Első sárga gyümölcs" }, { answer: "meggy", clue: "Első savanyú gyümölcs" }] } },
    { kind: "try", tryKind: "crossword", spec: { entries: [{ answer: "alma", clue: "Második piros gyümölcs" }, { answer: "körte", clue: "Második sárga gyümölcs" }, { answer: "meggy", clue: "Második savanyú gyümölcs" }] } },
  ]);
  const second = page.locator('[data-try="crossword"]').nth(1);
  await second.getByText(/Második piros gyümölcs/).click();
  await expect(second.getByRole("textbox", { name: /Második piros gyümölcs/ })).toBeFocused();
});

test("review #616: 360 px-en a legnagyobb szókereső és a 15 betűs keresztrejtvény cellái a blokkon belül, átfedés nélkül", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const words = ["klorofill", "sejtfal", "gyökérzet", "levélzöld", "párologtatás", "napfény", "széndioxid", "keményítő", "virágpor", "sztómanyílás"];
  await mountBlocks(page, [
    { kind: "try", tryKind: "wordSearch", spec: { words } },
    { kind: "try", tryKind: "crossword", spec: { entries: [{ answer: "fényvisszaverés", clue: "Tükör jelensége" }, { answer: "fény", clue: "Világosság" }, { answer: "visz", clue: "Szállít" }] } },
  ]);
  for (const kind of ["wordSearch", "crossword"]) {
    const block = page.locator(`[data-try="${kind}"]`);
    await expect(block).toBeVisible();
    const boxes = await block.locator(kind === "wordSearch" ? '[role="gridcell"]' : "div[aria-hidden] > div").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom }; }));
    expect(boxes.length).toBeGreaterThan(0);
    const outer = (await block.boundingBox())!;
    for (const c of boxes) {
      expect(c.x).toBeGreaterThanOrEqual(outer.x - 0.5);
      expect(c.r).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = Math.min(a.r, b.r) - Math.max(a.x, b.x) > 0.5 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 0.5;
      expect(overlap, `${kind}: ${i} és ${j} cella átfed`).toBe(false);
    }
  }
});

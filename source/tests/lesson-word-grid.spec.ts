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

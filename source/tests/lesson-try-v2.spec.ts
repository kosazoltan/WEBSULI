import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** V2a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): öt új feladatfajta — billentyűzettel kezelhető, visszajelzés, visszaállás. */
test.use({ serviceWorkers: "block" });

async function mount(page: Page) {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<{ coversConceptIds?: string[] }> }> };
  const concept = lesson.sections[0].blocks.find(b => b.coversConceptIds?.length)!.coversConceptIds!.slice(0, 1);
  const add = (tryKind: string, spec: unknown) => lesson.sections[0].blocks.unshift({ kind: "try", tryKind, spec, coversConceptIds: concept } as never);
  add("estimate", { prompt: "Hány méter magas a torony?", min: 0, max: 1000, step: 10, answer: 400, unit: "m" });
  add("numberLine", { prompt: "Hol van a 7?", min: 0, max: 10, step: 1, target: 7, tolerance: 0.5 });
  add("categorize", { categories: ["emlős", "madár"], items: [{ text: "kutya", category: "emlős" }, { text: "veréb", category: "madár" }, { text: "bálna", category: "emlős" }] });
  add("highlight", { prompt: "Jelöld ki a határozókat!", text: "A macska gyorsan fut.", targets: ["gyorsan"] });
  add("trueFalseSeries", { statements: [{ text: "A víz 100 fokon forr.", answer: true }, { text: "A jég meleg.", answer: false }] });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/try2-fixture") return route.fulfill({ json: { id: "try2-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/try2-fixture") return route.fulfill({ json: { lessonId: "lesson-try2", version: 1, lesson } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto("/preview/try2-fixture");
}

const press = async (page: Page, key: string, times = 1) => { for (let i = 0; i < times; i++) await page.keyboard.press(key); };

test("mind az öt új feladat billentyűzettel megoldható, a visszajelzés megjelenik, és újratöltés után visszaáll", async ({ page }) => {
  await mount(page);
  const block = (kind: string) => page.locator(`[data-try="${kind}"]`);
  const check = async (kind: string) => { await block(kind).getByTestId("try-check").focus(); await page.keyboard.press("Enter"); };

  // Igaz/hamis sorozat: a választógombok fókuszálhatók, Enterrel jelölhetők.
  await block("trueFalseSeries").getByRole("radio", { name: "Igaz" }).first().focus();
  await page.keyboard.press("Enter");
  await block("trueFalseSeries").getByRole("radio", { name: "Hamis" }).nth(1).focus();
  await page.keyboard.press("Enter");
  await check("trueFalseSeries");
  await expect(block("trueFalseSeries").getByTestId("try-verdict")).toContainText("Helyes");

  // Szókiemelés: a szó gomb, Enterrel kijelölve.
  await block("highlight").getByRole("button", { name: "gyorsan" }).focus();
  await page.keyboard.press("Enter");
  await expect(block("highlight").getByRole("button", { name: "gyorsan" })).toHaveAttribute("aria-pressed", "true");
  await check("highlight");
  await expect(block("highlight").getByTestId("try-verdict")).toContainText("Helyes");

  // Kategorizálás: elemenként választógomb-csoport — egy elem rossz → részleges.
  for (const [item, cat] of [["kutya", "emlős"], ["veréb", "madár"], ["bálna", "madár"]] as const) {
    await block("categorize").getByRole("radiogroup", { name: item }).getByRole("radio", { name: cat }).focus();
    await page.keyboard.press("Enter");
  }
  await check("categorize");
  await expect(block("categorize").getByTestId("try-verdict")).toContainText("Részben");

  // Számegyenes: csúszka nyilakkal (5 → 7).
  await block("numberLine").getByRole("slider").focus();
  await press(page, "ArrowRight", 2);
  await expect(block("numberLine").getByRole("slider")).toHaveValue("7");
  await check("numberLine");
  await expect(block("numberLine").getByTestId("try-verdict")).toContainText("Helyes");

  // Becslés: csúszka (500 → 400).
  await block("estimate").getByRole("slider").focus();
  await press(page, "ArrowLeft", 10);
  await check("estimate");
  await expect(block("estimate").getByTestId("try-verdict")).toContainText("Helyes");

  // Újratöltés: a válaszok és az ítéletek visszaállnak.
  await page.reload();
  await expect(block("trueFalseSeries").getByTestId("try-verdict")).toContainText("Helyes");
  await expect(block("highlight").getByRole("button", { name: "gyorsan" })).toHaveAttribute("aria-pressed", "true");
  await expect(block("categorize").getByTestId("try-verdict")).toContainText("Részben");
  await expect(block("numberLine").getByRole("slider")).toHaveValue("7");
  await expect(block("estimate").getByTestId("try-verdict")).toContainText("Helyes");
});

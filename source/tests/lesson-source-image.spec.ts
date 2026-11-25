import { expect, test } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** D1H-1 (docs/specs/2026-11-25-d1h-kivagott-kep.md): a lecke a kivágott forrásképet alt-szöveggel és forrásmegjelöléssel mutatja. */
test.use({ serviceWorkers: "block" });
const ID = "c".repeat(64);
// Review #594: valódi, dekódolható 4×3-as PNG (sharp-pal készítve).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4IScHRww4OQD1xwwx6wqgCwAAAABJRU5ErkJggg==", "base64");

test("a sourceImage blokk: kép a végpontról, alt, felirat és kattintható forrásmegjelölés", async ({ page }) => {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<{ coversConceptIds?: string[] }> }> };
  const concept = lesson.sections[0].blocks.find(b => b.coversConceptIds?.length)!.coversConceptIds!.slice(0, 1);
  // Ismeretlen azonosítójú kép (404): az ábra nem marad törött képként a leckében.
  lesson.sections[0].blocks.push({ kind: "animate", animKind: "sourceImage", caption: "Hiányzó kép felirata.", coversConceptIds: concept,
    params: { imageId: "d".repeat(64), alt: "Hiányzó", credit: "x" } } as never);
  lesson.sections[0].blocks.push({ kind: "animate", animKind: "sourceImage", caption: "A vulkán keresztmetszete a forrásban.", coversConceptIds: concept,
    params: { imageId: ID, alt: "Rétegvulkán keresztmetszete", credit: "nkp.hu — Földrajz 7.", sourceUrl: "https://www.nkp.hu/foldrajz" } } as never);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/source-images/${ID}`) return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    if (path.startsWith("/api/source-images/")) return route.fulfill({ status: 404, json: {} });
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/img-fixture") return route.fulfill({ json: { id: "img-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/img-fixture") return route.fulfill({ json: { lessonId: "lesson-img", version: 1, lesson } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto("/preview/img-fixture");
  const figure = page.locator('[data-anim="sourceImage"]').filter({ hasText: "A vulkán keresztmetszete" });
  await figure.scrollIntoViewIfNeeded();
  const img = figure.locator("img");
  await expect(img).toHaveAttribute("alt", "Rétegvulkán keresztmetszete");
  await expect(img).toHaveAttribute("src", `/api/source-images/${ID}`);
  // Review #594: a kép ténylegesen betöltődött és dekódolódott (nem csak az attribútumok léteznek).
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(4);
  await expect(figure).toContainText("A vulkán keresztmetszete a forrásban.");
  const credit = figure.getByRole("link", { name: /nkp\.hu — Földrajz 7\./ });
  await expect(credit).toHaveAttribute("href", "https://www.nkp.hu/foldrajz");
  await expect(credit).toHaveAttribute("rel", /noopener/);
  // Review #594: a betölthetetlen képpel a TELJES blokk (fejléccel együtt) eltűnik.
  await expect(page.locator(`[data-source-image="${"d".repeat(64)}"]`)).toHaveCount(0);
  await expect(page.getByText("Hiányzó kép felirata.")).toHaveCount(0);
  await expect(page.locator(`[data-source-image="${ID}"]`)).toHaveCount(1);
});

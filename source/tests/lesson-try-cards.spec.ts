import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** V3a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): kártyák — akadálymentes név, billentyűzet, állapot-visszaállás. */
test.use({ serviceWorkers: "block" });

async function mount(page: Page) {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<{ coversConceptIds?: string[] }> }> };
  const concept = lesson.sections[0].blocks.find(b => b.coversConceptIds?.length)!.coversConceptIds!.slice(0, 1);
  const add = (tryKind: string, spec: unknown) => lesson.sections[0].blocks.unshift({ kind: "try", tryKind, spec, coversConceptIds: concept } as never);
  add("flashcards", { cards: [{ front: "kutya", back: "dog" }, { front: "macska", back: "cat" }] });
  add("decision", { situation: "Esik az eső, túrázni indulnál.", options: [{ text: "Esőkabátot viszek", consequence: "Száraz maradsz.", best: true }, { text: "Póló elég", consequence: "Megázol.", best: false }] });
  add("didYouKnow", { fact: "A méhek táncolva mutatják az irányt." });
  add("stepReveal", { title: "Így oldd meg", steps: ["Írd fel az adatokat.", "Válaszd ki a képletet.", "Számolj."] });
  add("flipCard", { front: "Mi a fotoszintézis?", back: "A növény fényből cukrot készít." });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/cards-fixture") return route.fulfill({ json: { id: "cards-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/cards-fixture") return route.fulfill({ json: { lessonId: "lesson-cards", version: 1, lesson } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto("/preview/cards-fixture");
}

test("fordítókártya, lépésenkénti felfedés, döntés és villámkártya: akadálymentes név, billentyűzet, újranyitáskor visszaáll", async ({ page }) => {
  await mount(page);
  const block = (kind: string) => page.locator(`[data-try="${kind}"]`);

  // Fordítókártya: nevesített csoport; Enterre megfordul.
  await expect(block("flipCard")).toHaveRole("group");
  await expect(block("flipCard")).toHaveAccessibleName(/Fordítókártya: Mi a fotoszintézis\?/);
  await block("flipCard").getByRole("button", { name: /Fordítsd meg/ }).focus();
  await page.keyboard.press("Enter");
  await expect(block("flipCard")).toContainText("A növény fényből cukrot készít.");

  // Lépésenkénti felfedés: két lépés felfedve.
  await expect(block("stepReveal")).toHaveAccessibleName(/Így oldd meg/);
  const next = block("stepReveal").getByRole("button", { name: /Következő lépés/ });
  await next.focus(); await page.keyboard.press("Enter");
  await expect(block("stepReveal")).toContainText("Válaszd ki a képletet.");
  await expect(block("stepReveal")).not.toContainText("Számolj.");

  // Tudtad?: nevesített kártya, a tény látszik.
  await expect(block("didYouKnow")).toHaveRole("note");
  await expect(block("didYouKnow")).toHaveAccessibleName(/Tudtad\?/);
  await expect(block("didYouKnow")).toContainText("A méhek táncolva");

  // Döntés: választás után a következmény és az ítélet.
  await block("decision").getByRole("radio", { name: "Esőkabátot viszek" }).focus();
  await page.keyboard.press("Enter");
  await expect(block("decision")).toContainText("Száraz maradsz.");
  await expect(block("decision").getByTestId("try-verdict")).toContainText("Helyes");

  // Villámkártya: megfordít, továbblép.
  await block("flashcards").getByRole("button", { name: /Fordítsd meg/ }).focus();
  await page.keyboard.press("Enter");
  await expect(block("flashcards")).toContainText("dog");
  await block("flashcards").getByRole("button", { name: /Következő kártya/ }).focus();
  await page.keyboard.press("Enter");
  await expect(block("flashcards")).toContainText("macska");

  await page.reload();
  await expect(block("flipCard")).toContainText("A növény fényből cukrot készít.");
  await expect(block("stepReveal")).toContainText("Válaszd ki a képletet.");
  await expect(block("stepReveal")).not.toContainText("Számolj.");
  await expect(block("decision")).toContainText("Száraz maradsz.");
  await expect(block("flashcards")).toContainText("macska");
});

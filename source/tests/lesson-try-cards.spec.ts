import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** V3a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): kártyák — akadálymentes név, billentyűzet, állapot-visszaállás. */
test.use({ serviceWorkers: "block" });

async function mount(page: Page, classroom = 7) {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<{ coversConceptIds?: string[] }> }> };
  const concept = lesson.sections[0].blocks.find(b => b.coversConceptIds?.length)!.coversConceptIds!.slice(0, 1);
  (lesson as { classroom?: number }).classroom = classroom;
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
    if (path === "/api/html-files/cards-fixture") return route.fulfill({ json: { id: "cards-fixture", title: "Lecke", contentType: "lesson", classroom } });
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
test("döntés: valódi rádiócsoport — egy Tab-megálló, a nyilak léptetnek és választanak (review #609)", async ({ page }) => {
  await mount(page);
  const decision = page.locator('[data-try="decision"]');
  const radios = decision.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.nth(0)).toHaveAttribute("tabindex", "0");
  await expect(radios.nth(1)).toHaveAttribute("tabindex", "-1");
  await radios.nth(0).focus();
  await page.keyboard.press("ArrowDown");
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(decision).toContainText("Megázol.");
  await expect(radios.nth(1)).toHaveAttribute("tabindex", "0");
  await expect(radios.nth(0)).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowUp");
  await expect(radios.nth(0)).toBeFocused();
  await expect(decision).toContainText("Száraz maradsz.");
});
test("review #619: billentyűzetes fókusz — az utolsó lépés felfedése után az Újrakezdés, a döntés Újra gombja után a rádiócsoport kapja a fókuszt", async ({ page }) => {
  await mount(page);
  const steps = page.locator('[data-try="stepReveal"]');
  const next = steps.getByRole("button", { name: /Következő lépés/ });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(steps).toContainText("Számolj.");
  await expect(steps.getByRole("button", { name: "Újrakezdés" })).toBeFocused();

  const decision = page.locator('[data-try="decision"]');
  await decision.getByRole("radio").first().focus();
  await page.keyboard.press("Enter");
  await expect(decision).toContainText("Száraz maradsz.");
  await decision.getByRole("button", { name: "Újra" }).focus();
  await page.keyboard.press("Enter");
  await expect(decision).not.toContainText("Száraz maradsz.");
  await expect(decision.getByRole("radio").first()).toBeFocused();
});

test("review #619: a „Tudtad?” kártya szövege a 11–12. évfolyam sötét témájában is olvasható (kontraszt ≥ 4,5)", async ({ page }) => {
  await mount(page, 12);
  const fact = page.locator('[data-try="didYouKnow"] p').nth(1);
  await expect(fact).toContainText("A méhek");
  const ratio = await fact.evaluate((el) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
    const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    let bgEl: Element | null = el; let bg = [255, 255, 255];
    while (bgEl) { const c = rgb(getComputedStyle(bgEl).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) { bg = c; break; } bgEl = bgEl.parentElement; }
    const fg = rgb(getComputedStyle(el).color);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

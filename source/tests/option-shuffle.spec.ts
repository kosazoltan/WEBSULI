import { expect, test, type Locator } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { balancedLayouts, choiceSeed } from "../shared/option-order";

/**
 * docs/specs/2026-11-02-valasz-keveres.md — a feleletválasztós válaszok a kiegyensúlyozott, kevert sorrendben jelennek meg
 * (valódi render), a betűjel a megjelenített pozíciót követi, a jó/rossz ítélet a tárolt `correctIndex` szerint helyes, és
 * újratöltés után ugyanaz a sorrend.
 */
test.use({ serviceWorkers: "block" });

const storedIndexOf = async (button: Locator) => Number((await button.getAttribute("data-testid"))!.replace("check-option-", ""));

test("Tananyag-ellenőrző: a DOM-sorrend a lecke kiegyensúlyozott elrendezése, a helyes válasz a tárolt index szerint", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe");
  const block = page.locator('[data-block="check"]').first();
  await expect(block).toBeVisible();
  const buttons = block.locator('[data-testid^="check-option-"]');
  const count = await buttons.count();
  const shown: number[] = [];
  const keys: string[] = [];
  const texts: string[] = [];
  for (let p = 0; p < count; p++) {
    shown.push(await storedIndexOf(buttons.nth(p)));
    keys.push((await buttons.nth(p).locator(".lesson-option-key").innerText()).trim());
    texts.push((await buttons.nth(p).innerText()).replace(/^[A-H]\s*/, "").trim());
  }
  expect([...shown].sort()).toEqual(Array.from({ length: count }, (_, i) => i));
  expect(keys).toEqual("ABCDEFGH".slice(0, count).split(""));
  // A probe-lecke egyetlen ellenőrzője: a 0. tárolt opció a helyes (tests/websuli.spec.ts LS-2).
  const options = shown.map((_, p) => texts[shown.indexOf(p)]);
  const question = (await block.locator("p.font-medium").innerText()).trim();
  expect(shown).toEqual(balancedLayouts([{ question, options, correctIndex: 0 }]).get(choiceSeed(question, options)));
  await page.getByTestId("check-option-0").click();
  await expect(page.getByTestId("check-option-0")).toHaveAttribute("data-state", "right");
  await page.reload();
  const again: number[] = [];
  for (let p = 0; p < count; p++) again.push(await storedIndexOf(page.locator('[data-block="check"]').first().locator('[data-testid^="check-option-"]').nth(p)));
  expect(again).toEqual(shown);
});

test("Kvíz: a kör kérdései kiegyensúlyozott elrendezésben, betűjel a pozíció szerint, ítélet a tárolt index szerint", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/__lesson-runtime-probe?fusion=1");
  await page.getByRole("tab", { name: /Kvíz/ }).click();
  const sections = page.locator(".fusion-panel-quiz section.fusion-quiz");
  await expect(sections.first()).toBeVisible();
  const bank = fusionFixture().experience!.quiz;
  const ids = await sections.evaluateAll(els => els.map(el => el.getAttribute("data-quiz-id")!));
  const round = ids.map(id => bank.find(q => q.id === id)!);
  const layouts = balancedLayouts(round);
  const positions = new Map<number, number>();
  for (const [n, q] of round.entries()) {
    const expected = layouts.get(choiceSeed(q.question, q.options))!;
    const buttons = sections.nth(n).locator("button.lesson-option");
    const domTexts = await buttons.evaluateAll(els => els.map(el => el.lastChild?.textContent ?? ""));
    expect(domTexts).toEqual(expected.map(i => q.options[i]));
    expect(await buttons.locator(".lesson-option-key").allInnerTexts()).toEqual("ABCD".slice(0, q.options.length).split(""));
    const at = expected.indexOf(q.correctIndex);
    positions.set(at, (positions.get(at) ?? 0) + 1);
  }
  const counts = [...positions.values()];
  expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  // A helyes opció (tárolt correctIndex) a megjelenített helyén „right” ítéletet kap.
  const first = round[0];
  const firstAt = layouts.get(choiceSeed(first.question, first.options))!.indexOf(first.correctIndex);
  await sections.nth(0).locator("button.lesson-option").nth(firstAt).click();
  await expect(sections.nth(0).locator("button.lesson-option").nth(firstAt)).toHaveAttribute("data-state", "right");
  for (const size of [{ width: 360, height: 740 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await sections.nth(0).screenshot({ path: `tests/screenshots/option-shuffle-quiz-${size.width}.png` });
  }
  expect(errors).toEqual([]);
});

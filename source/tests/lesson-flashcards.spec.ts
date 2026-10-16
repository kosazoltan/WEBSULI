import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { lessonFlashcards } from "../shared/lesson-flashcards";

/**
 * Websuli Design §3/§6/§7/§8 (docs/specs/2026-10-16-websuli-ismetles.md) — a memóriakártya-ismétlés VALÓDI renderben:
 * egér, érintés (kattintás) és billentyűzet; vendégként helyi tárolás szerverkérés nélkül; bejelentkezve a „Mentve” csak sikeres
 * szerverválasz után, hibánál újrapróbálás; mind az öt témában kilógás nélkül, olvasható méretben. Képernyőkép a test-results alá.
 */
// A szolgáltatásmunkás a page.route-ot megkerülné (a többi API-mockos spec mintájára).
test.use({ serviceWorkers: "block" });

const cards = lessonFlashcards(fusionFixture());
const [first, second] = cards;

async function openReview(page: Page, query: string) {
  await page.goto(`/__lesson-runtime-probe?fusion=1&${query}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("tab")).toHaveCount(5);
  await page.getByRole("tab", { name: "Ismétlés", exact: true }).click();
  return page.getByRole("button", { name: /Válasz (megjelenítése|visszafordítása)/ });
}

test("vendég: kattintás, Enter és Space fordít; az értékelés továbblép, helyben megmarad, és nincs szerverkérés", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", r => { if (r.url().includes("/api/lessons/review")) calls.push(r.url()); });
  await page.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { localStorage.clear(); sessionStorage.setItem("seeded", "1"); } });
  const card = await openReview(page, "classroom=7");
  await expect(page.getByText("Vendégként gyakorolsz: az ismétlés csak ezen az eszközön, ebben a böngészőben marad meg.")).toBeVisible();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await expect(card).toContainText(first.front);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(card).toHaveAccessibleName("Válasz visszafordítása");
  await expect(card).toContainText(first.back);
  await card.focus(); await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Már tudom" }).click();
  await expect(page.getByRole("status").filter({ hasText: "már tudod" })).toContainText("Következő ismétlés:");
  await expect(card).toContainText(second.front);
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Még gyakorlom" }).click();
  await expect(page.getByRole("status").filter({ hasText: "10 perc múlva" })).toBeVisible();
  await expect(page.getByText(`2 / ${cards.length} kártya mára kész`)).toBeVisible();
  // Újratöltés után a helyi állapot megmarad (ugyanabban a böngészőben).
  await openReview(page, "classroom=7");
  await expect(page.getByText(`2 / ${cards.length} kártya mára kész`)).toBeVisible();
  expect(calls).toEqual([]);
  // Review #269: a vendégállapot a stabil leckekulcs alatt él (nem az experience-lenyomat alatt), kártyaazonosítónként.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("websuli:review:guest:probe-lesson") ?? "{}"));
  expect(Object.keys(stored).sort()).toEqual([first.id, second.id].sort());
});

test("bejelentkezve: a „Mentve” csak sikeres válasz után; hibánál a kártya nem lép tovább, és újrapróbálható", async ({ page }) => {
  const posts: unknown[] = [];
  let fail = true;
  let release: () => void = () => {};
  await page.route("**/api/auth/user", r => r.fulfill({ json: { id: "tanulo-1" } }));
  await page.route("**/api/lessons/review/practice-probe", r => r.fulfill({ json: { states: {} } }));
  await page.route("**/api/lessons/review/practice-probe/rate", async r => {
    posts.push(r.request().postDataJSON());
    if (fail) return r.fulfill({ status: 500, json: { message: "Most nem sikerült menteni." } });
    await new Promise<void>(resolve => { release = resolve; });
    return r.fulfill({ json: { cardId: first.id, state: { intervalDays: 1, repetitions: 1, dueAt: "2026-10-18T10:00:00.000Z" } } });
  });
  const card = await openReview(page, "practice=1&classroom=9");
  await expect(page.getByText("Mentett ismétlés")).toBeVisible();
  await expect(page.getByText(/Vendégként gyakorolsz/)).toHaveCount(0);
  await page.getByRole("button", { name: "Már tudom" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nem sikerült menteni" })).toBeVisible();
  await expect(page.getByText("Mentve.")).toHaveCount(0);
  await expect(card).toContainText(first.front);
  // Review #269: hiba után csak az újrapróbálás küldhet (az értékelőgombok új azonosítóval kétszer léptetnének).
  await expect(page.getByRole("button", { name: "Már tudom" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Még gyakorlom" })).toBeDisabled();
  fail = false;
  await page.getByRole("button", { name: "Újrapróbálás" }).click();
  // Mentés közben a gombok tiltva, „Mentve” még nincs.
  await expect(page.getByRole("button", { name: "Már tudom" })).toBeDisabled();
  await expect(page.getByText(/Mentve\./)).toHaveCount(0);
  release();
  await expect(page.getByRole("status").filter({ hasText: "Mentve." })).toContainText("2026. október 18.");
  await expect(card).toContainText(second.front);
  // Review #268: az újrapróbálás ugyanazt a requestId-t küldi (a szerver nem lépteti kétszer).
  const [a, b] = posts as Array<{ cardId: string; rating: string; requestId: string }>;
  expect(a).toEqual({ cardId: first.id, rating: "known", requestId: expect.stringMatching(/^[A-Za-z0-9-]{8,64}$/) });
  expect(b).toEqual(a);
});

test("bejelentkezve: ha mentés közben lejár a bejelentkezés (401), vendég módra vált, és ezt kiírja", async ({ page }) => {
  await page.route("**/api/auth/user", r => r.fulfill({ json: { id: "tanulo-1" } }));
  await page.route("**/api/lessons/review/practice-probe", r => r.fulfill({ json: { states: {} } }));
  await page.route("**/api/lessons/review/practice-probe/rate", r => r.fulfill({ status: 401, json: { message: "A mentett ismétléshez jelentkezz be." } }));
  await openReview(page, "practice=1&classroom=7");
  await expect(page.getByText("Mentett ismétlés")).toBeVisible();
  await page.getByRole("button", { name: "Már tudom" }).click();
  await expect(page.getByText("Lejárt a bejelentkezésed, ez az értékelés nem mentődött.")).toBeVisible();
  await expect(page.getByText("Helyi ismétlés")).toBeVisible();
  await expect(page.getByText(/Mentve\./)).toHaveCount(0);
});

test("bejelentkezve: ha a lecke időközben frissült (409), nincs újrapróbálás, hanem újratöltésre kér", async ({ page }) => {
  await page.route("**/api/auth/user", r => r.fulfill({ json: { id: "tanulo-1" } }));
  await page.route("**/api/lessons/review/practice-probe", r => r.fulfill({ json: { states: {} } }));
  await page.route("**/api/lessons/review/practice-probe/rate", r => r.fulfill({ status: 409, json: { message: "A lecke időközben frissült. Töltsd újra az oldalt!" } }));
  const card = await openReview(page, "practice=1&classroom=7");
  await page.getByRole("button", { name: "Még gyakorlom" }).click();
  await expect(page.getByRole("status").filter({ hasText: "A lecke időközben frissült" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Újrapróbálás" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Már tudom" })).toBeDisabled();
  await expect(card).toContainText(first.front);
});

const THEMES = [[1, "explorer", 22], [4, "adventure", 19], [7, "studio", 17], [9, "laboratory", 16], [11, "future", 16]] as const;
for (const [classroom, id, minPx] of THEMES) {
  test(`${classroom}. évfolyam (${id}): a kártya olvasható, a fülek és a gombok kilógás nélkül, kontrasztosan`, async ({ page }) => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => localStorage.clear());
      await openReview(page, `classroom=${classroom}`);
      const sizes = await page.evaluate(() => ({
        text: parseFloat(getComputedStyle(document.querySelector(".ws-flash-text")!).fontSize),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tabs: [...document.querySelectorAll(".fusion-tabs button")].map(b => b.scrollWidth - b.clientWidth),
        label: parseFloat(getComputedStyle(document.querySelector(".ws-flash small")!).fontSize),
      }));
      expect(sizes.text).toBeGreaterThanOrEqual(Math.max(24, minPx));
      expect(sizes.label).toBeGreaterThanOrEqual(13);
      expect(sizes.overflow).toBeLessThanOrEqual(1);
      expect(Math.max(...sizes.tabs)).toBeLessThanOrEqual(1);
      for (const sel of [".ws-review .fusion-primary", ".ws-review .lesson-outline-btn", ".ws-flash"]) {
        const ratio = await page.locator(sel).first().evaluate(el => {
          const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          const lum = ([r, g, b]: number[]) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
          let bgEl: Element | null = el; let bg = "rgba(0, 0, 0, 0)";
          // A kártya háttere átmenet: a sötétebbik végpontját (a halvány tónust) mérjük; különben az első tömör háttér felfelé.
          const st = getComputedStyle(el);
          const grad = st.backgroundImage.match(/rgba?\([^)]+\)/g);
          if (grad) bg = grad[grad.length - 1];
          else while (bgEl && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(bgEl).backgroundColor; bgEl = bgEl.parentElement; }
          const [a, b] = [lum(rgb(st.color)), lum(rgb(bg))];
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
        expect(ratio, `${id} ${sel} @${width}`).toBeGreaterThanOrEqual(4.5);
      }
      await page.screenshot({ path: `test-results/websuli-design/review-${id}-${width}.png` });
    }
  });
}

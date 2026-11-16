import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";

import { CASE as blockCraft } from "./game-mobile-cases/block-craft-quiz";
import { CASE as brainRot } from "./game-mobile-cases/brain-rot-steal";
import { CASE as spaceAsteroid } from "./game-mobile-cases/space-asteroid-quiz";
import { CASE as speedQuiz } from "./game-mobile-cases/speed-quiz-math";
import { CASE as tornado } from "./game-mobile-cases/tornado-hunter-200";
import { CASE as tsunami } from "./game-mobile-cases/tsunami-english";
import { CASE as wordLadder } from "./game-mobile-cases/word-ladder-hu-en";
import { MOBILE_VIEWPORTS, measureOverflow, type GameMobileCase } from "./support/game-mobile-quality";

test.use({ serviceWorkers: "block" });

/**
 * S13 — a játéklista (`/games`) és a főoldali gyakorló kártyák (`#gyakorlo-jatekok`) mobil minősége érintős Pixel 7
 * profilban, 360×640, 390×844 és 844×390 nézetben (terv M1 / M2 / M3 / M8; végrehajtás S13/2):
 *  - nincs vízszintes oldalgörgetés;
 *  - a lista minden koppintási célja ≥ 48 px (a szövegközi hivatkozás kivétel — a lista ilyet nem tartalmaz);
 *  - minden látható szöveg ≥ 12 px, a kártyacím ≥ 16 px, a leírás ≥ 14 px;
 *  - mind a 7 játék kártyájáról legfeljebb két koppintás a játék indításáig (kártya → kezdőképernyő).
 * A mérés a lista gyökerére szűkül (a főoldal többi része nem e szelet hatóköre).
 */
test.use({ ...devices["Pixel 7"] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
    localStorage.setItem("websuli.spaceQuiz.grade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

/** Képernyőkép (JPEG 70) a `GAME_MOBILE_SHOT_DIR` mappába, ha meg van adva (K.4; a közös mérő mintája). */
async function lobbyShot(page: Page, name: string): Promise<void> {
  const dir = process.env.GAME_MOBILE_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  // CSS-pixeles kép: a Pixel 7 2,6-os pixelsűrűségén a teljes felbontású JPEG túllépné a K.4 150 KB-os keretét.
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70, scale: "css" });
}

type Scoped = { small: Array<{ label: string; w: number; h: number }>; fonts: Array<{ text: string; px: number }>; titles: number[]; descs: number[] };

async function measureScoped(page: Page, root: string, min = 48): Promise<Scoped> {
  return page.evaluate(
    ({ sel, limit }) => {
      const scope = document.querySelector(sel);
      if (!scope) throw new Error(`nincs ${sel}`);
      const small: Scoped["small"] = [];
      for (const el of Array.from(scope.querySelectorAll<HTMLElement>('button, a[href], [role="button"], input, select, summary'))) {
        if (el.closest('[aria-hidden="true"]') || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.width < limit || r.height < limit) {
          small.push({ label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 50), w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
      const fonts: Scoped["fonts"] = [];
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent || "").trim();
        const parent = n.parentElement;
        if (!text || !parent || parent.closest('[aria-hidden="true"]')) continue;
        const r = parent.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const px = parseFloat(getComputedStyle(parent).fontSize);
        if (px < 12) fonts.push({ text: text.slice(0, 50), px });
      }
      const size = (q: string) => Array.from(scope.querySelectorAll<HTMLElement>(q)).map((e) => parseFloat(getComputedStyle(e).fontSize));
      return { small, fonts, titles: size(".game-card .game-title"), descs: size(".game-card .game-desc") };
    },
    { sel: root, limit: min },
  );
}

/** A 7 játék belépő útvonala (`path`), indítógombja és játszható jele: a közös esetfájlokból (egy igazságforrás). */
const ENTRIES: GameMobileCase[] = [tsunami, wordLadder, blockCraft, speedQuiz, brainRot, spaceAsteroid, tornado];

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("játéklista: nincs oldalgörgetés, célok ≥ 48 px, szöveg ≥ 12 px, cím ≥ 16 px, leírás ≥ 14 px", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/games");
      await expect(page.getByTestId("games-lobby")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('[data-testid="games-lobby"] .game-card')).toHaveCount(7);
      expect((await measureOverflow(page)).x, "vízszintes oldalgörgetés").toBeLessThanOrEqual(2);
      const m = await measureScoped(page, "main.games-lobby");
      expect(m.small, "M2 kis koppintási cél").toEqual([]);
      expect(m.fonts, "M3 12 px alatti szöveg").toEqual([]);
      expect(m.titles.length).toBe(7);
      expect(Math.min(...m.titles), "kártyacím").toBeGreaterThanOrEqual(16);
      expect(Math.min(...m.descs), "kártyaleírás").toBeGreaterThanOrEqual(14);
      expect(errors, "pageerror").toEqual([]);
      await lobbyShot(page, `games-lobby-${viewport.width}x${viewport.height}.jpg`);
    });

    test("főoldali kártyák: nincs oldalgörgetés, célok ≥ 48 px, szöveg ≥ 12 px, cím ≥ 16 px, leírás ≥ 14 px", async ({ page }) => {
      await page.goto("/");
      const section = page.locator("#gyakorlo-jatekok");
      await expect(section).toBeVisible({ timeout: 20_000 });
      await section.scrollIntoViewIfNeeded();
      expect((await measureOverflow(page)).x, "vízszintes oldalgörgetés").toBeLessThanOrEqual(2);
      const m = await measureScoped(page, "#gyakorlo-jatekok");
      expect(m.small, "M2 kis koppintási cél").toEqual([]);
      expect(m.fonts, "M3 12 px alatti szöveg").toEqual([]);
      expect(m.titles.length).toBe(7);
      expect(Math.min(...m.titles), "kártyacím").toBeGreaterThanOrEqual(16);
      expect(Math.min(...m.descs), "kártyaleírás").toBeGreaterThanOrEqual(14);
      await page.locator("#gyakorlo-jatekok .grid").scrollIntoViewIfNeeded();
      await lobbyShot(page, `home-cards-${viewport.width}x${viewport.height}.jpg`);
    });
  });
}

test.describe("390x844 M8", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const c of ENTRIES) {
    for (const from of ["/games", "/"] as const) {
      test(`M8 ${from} → ${c.path}: a kártyáról egy koppintás a kezdőképernyő, kettő a játék`, async ({ page }) => {
        await page.goto(from);
        const scope = from === "/games" ? page.getByTestId("games-lobby") : page.locator("#gyakorlo-jatekok");
        await expect(scope).toBeVisible({ timeout: 20_000 });
        // 1. koppintás: a kártya (vagy a Szökőár nehézség-linkje) → a játék kezdőképernyője
        await scope.locator(`a[href="${c.path}"]`).first().tap();
        const start = c.startTestId ? page.getByTestId(c.startTestId).first() : page.getByRole("button", { name: c.startName! }).first();
        await expect(start).toBeVisible({ timeout: 20_000 });
        // 2. koppintás: indítás → játszható állapot. Csak „full” esetnél mérhető: a még át nem írt (baseline) játéknak
        // nincs közös játszható jele — a játékszelet a saját esetfájlja „full”-ra állításával kapcsolja be.
        if (c.status !== "full") return;
        await start.tap();
        await c.playReady(page);
      });
    }
  }
});

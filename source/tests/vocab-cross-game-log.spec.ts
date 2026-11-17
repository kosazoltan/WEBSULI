import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

/**
 * S13 / C12 (terv A5, valódi böngészőben): a szóbank „látott” naplója (`websuli.vocabSeen.v1`) KÉT KÜLÖNBÖZŐ játék
 * között közös. Az A játékban (Szólétra) kérdezett szóbank-bejegyzést a B játék (Szökőár, angol kvíz) nem kérdezi
 * újra: B csak új bejegyzéseket ad a naplóhoz, A bejegyzéseinek időbélyege nem változik (újrakérdezéskor a napló
 * frissítené). A kézi válaszok (`ext:` kulcsok) kimaradnak az összevetésből: azokat a kézi kérdés naplózza.
 */

type Log = Record<string, number>;
type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

async function stubApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p === "/api/games/score") data = { ok: true };
    await route.fulfill({ json: data });
  });
}

async function enLog(page: Page): Promise<Log> {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem("websuli.vocabSeen.v1");
      const all = raw ? (JSON.parse(raw) as { langs?: { en?: Record<string, number> } }) : {};
      const en = all.langs?.en ?? {};
      return Object.fromEntries(Object.entries(en).filter(([k]) => !k.startsWith("ext:")));
    } catch {
      return {};
    }
  });
}

test("A5 két játék között: a Szólétrában látott szó a Szökőárban nem jön újra, a napló közös", async ({ page }) => {
  test.setTimeout(120_000);
  await stubApi(page);

  // --- A játék: Szólétra (HU↔EN), néhány helyes válasz ---
  await page.goto("/games/word-ladder-hu-en");
  await page.getByTestId("wl-start").click();
  // 6 helyes válasz: a létra 8 fokos, a 8. a futás végét (eredményképernyő) hozná.
  for (let i = 0; i < 6; i++) {
    const right = page.locator('[data-testid^="wl-option-"][data-correct="true"]').first();
    await expect(right).toBeEnabled({ timeout: 15_000 });
    const prompt = await page.getByTestId("wl-prompt").innerText();
    await right.click();
    // a helyes válasz kártyája magától zárul; a következő kérdés más szövegű
    await expect(page.getByTestId("wl-prompt")).not.toHaveText(prompt, { timeout: 10_000 });
  }
  const afterA = await enLog(page);
  expect(Object.keys(afterA).length, "a Szólétra nem naplózott szóbank-bejegyzést").toBeGreaterThan(0);

  // --- B játék: Szökőár, ugyanabban a böngészőben (közös localStorage) ---
  await page.goto("/games/tsunami-english?difficulty=easy");
  await page.getByTestId("button-tsunami-start").click();
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function");
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ phase: "quiz" }));
    const right = page.locator('[data-testid="ts-quiz"] [data-correct="true"]').first();
    await expect(right).toBeVisible({ timeout: 10_000 });
    const asked = await page.locator('[data-testid="ts-quiz"] p').first().innerText();
    await right.click();
    // a kvíz bezárul — vagy a játék maga hoz egy újat (a Szökőár futás közben is kérdez): a kérdés szövege más.
    // #58 (2. kör): az állapotot EGY lap-hívás olvassa. Korábban `count()` után egy automatikusan VÁRAKOZÓ `innerText()`
    // jött: ha a kvíz épp a kettő között zárult (a helyes válasz után 420 ms-mal), az `innerText()` a KÖVETKEZŐ kvízre
    // várt (a Szökőár ~9,5 mp-enként kérdez), és a poll 10 s után az utolsó „ugyanaz” értékkel bukott — a CI-ben a
    // kvíz addigra bezárult, a válasz beszámított (run 43907199578, 43916330845, 43934797679).
    await expect
      .poll(
        () =>
          page.evaluate((prev) => {
            const q = document.querySelector('[data-testid="ts-quiz"]');
            if (!q) return "zárva";
            return (q.querySelector("p") as HTMLElement | null)?.innerText === prev ? "ugyanaz" : "új";
          }, asked),
        { timeout: 10_000 },
      )
      .not.toBe("ugyanaz");
    const dismiss = page.getByTestId("quiz-feedback-dismiss");
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  }
  const afterB = await enLog(page);

  // B új bejegyzéseket adott (a szóbank tényleg kérdezett), és A egyetlen bejegyzését sem kérdezte újra
  const added = Object.keys(afterB).filter((k) => !(k in afterA));
  expect(added.length, "a Szökőár nem kérdezett a szóbankból").toBeGreaterThan(0);
  const reAsked = Object.keys(afterA).filter((k) => afterB[k] !== afterA[k]);
  expect(reAsked, "a B játék újrakérdezte az A játékban látott szót").toEqual([]);
});

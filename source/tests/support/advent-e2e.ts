import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";

import { GRADE_QUIZ_ITEMS } from "../../client/src/data/gradeQuizBank/index";
import { CHRISTMAS_ITEMS } from "../../shared/advent/christmasBank/index";

/**
 * Adventi naptár — közös böngészőteszt-segédek (docs/specs/2026-11-18-adventi-naptar.md 16.5).
 * Az e2e-szerveren a naptár CSAK az `X-Advent-Test-Now` fejléccel él; a kliens órája (a főoldali kártya helyfoglalása) a
 * Playwright órájával áll ugyanarra a pillanatra — a kliensben nincs külön tesztág.
 */
export const DEVICE_KEY = "websuli.advent.device";

const proxied = new WeakSet<BrowserContext>();

/**
 * Az e2e-szerver éles módban fut, ezért a munkamenet-süti Secure: a proxy mögötti https-t az `X-Forwarded-Proto` fejléc jelzi
 * (mint a többi munkamenetes böngészőtesztben) — enélkül a vendég nem kap munkamenetet, és a CSRF-token érvénytelen. A fejléc
 * CSAK az API-kérésekre kerül rá (a lap és a statikus fájlok kérése változatlan).
 */
async function proxyApi(context: BrowserContext): Promise<void> {
  if (proxied.has(context)) return;
  proxied.add(context);
  await context.route("**/api/**", (route) => route.fallback({ headers: proxyHeaders(route.request().headers()) }));
}

/**
 * A tesztkérés fejlécei „https-proxy mögött”: a szerver az Origin fejlécet a (proxy szerinti) https-hez méri — mint a
 * `jm0-game-score-privacy.spec.ts` és az `admin-allowlist.spec.ts`, az origin is https. Csak a TESZT kérésein él; a szerver és a
 * kliens kódja nem ismeri.
 */
export function proxyHeaders(original: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...original, "x-forwarded-proto": "https" };
  if (headers.origin?.startsWith("http://")) headers.origin = `https://${headers.origin.slice("http://".length)}`;
  return headers;
}

/** A szerver és a böngésző órája ugyanarra az időpontra (ISO, UTC). */
export async function setAdventTime(page: Page, iso: string): Promise<void> {
  await proxyApi(page.context());
  await page.context().setExtraHTTPHeaders({ "X-Advent-Test-Now": iso });
  await page.clock.setFixedTime(new Date(iso));
}

/** Tesztidő nélkül (e2e-módban ez a „naptár kikapcsolva” állapot); a böngésző órája marad, ahol volt. */
export async function clearAdventTime(page: Page): Promise<void> {
  await page.context().setExtraHTTPHeaders({});
}

/**
 * A véges (megnyíló, felragyogó) animációk végének megvárása, legfeljebb 2 mp-ig: a méret-mérés és a képernyőkép a kész
 * állapotot nézze, ne a 300 ms-os megnyílás közbeni (kicsinyített, áttűnő) képkockát.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.race([
    Promise.allSettled(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished)),
    new Promise((done) => setTimeout(done, 2000)),
  ]));
}

/** Képernyőkép a tulajdonosnak: az `ADVENT_SHOT_DIR` mappába (ha meg van adva), teljes nézet. */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.ADVENT_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await settle(page);
  const size = page.viewportSize();
  await page.screenshot({ path: join(dir, `${name}-${size?.width ?? 0}x${size?.height ?? 0}.png`) });
}

const ALL = [...CHRISTMAS_ITEMS, ...GRADE_QUIZ_ITEMS];

/** A megnyitott kérdés helyes (vagy egy hibás) válaszának gombja — a teszt a bankból tudja, a kliens nem. */
export async function pickOption(page: Page, right: boolean): Promise<void> {
  const prompt = (await page.getByTestId("advent-question").innerText()).trim();
  const texts = await page.locator('[data-testid^="advent-option-"]').allInnerTexts();
  const options = texts.map((t) => t.trim());
  const item = ALL.find((q) => q.prompt === prompt && options.includes(q.options[q.correctIndex]!));
  if (!item) throw new Error(`a kérdés nincs a bankban: ${prompt}`);
  const correct = options.indexOf(item.options[item.correctIndex]!);
  await page.getByTestId(`advent-option-${right ? correct : (correct + 1) % 4}`).tap();
  await expect(page.getByTestId("advent-next")).toBeVisible();
}

/** Egy ablak megnyitása és megválaszolása a felületen, majd „Tovább”. */
export async function playDoor(page: Page, day: number, right: boolean): Promise<void> {
  await page.getByTestId(`advent-door-${day}`).tap();
  await expect(page.getByTestId("advent-question")).toBeVisible();
  await pickOption(page, right);
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
}

type Json = Record<string, unknown>;

/**
 * Gyors előkészítés a szerveren át (a lap munkamenetével és eszközazonosítójával): évfolyam, majd a megadott napok
 * megválaszolása — `wrong` napokon minden próbával hibásan. A felület ezután a kész állapotból indul.
 */
export async function seedProgress(page: Page, iso: string, opts: { grade: number; days: number[]; wrong?: number[]; attempts?: number }): Promise<void> {
  // A kérések a LAPBÓL mennek (a böngésző sütijével és a környezet fejléceivel), így ugyanaz a munkamenet és eszköz játszik.
  await setAdventTime(page, iso);
  const post = (path: string, data: Json) => page.evaluate(async ({ path, data, key }) => {
    const device = window.localStorage.getItem(key);
    if (!device) throw new Error("nincs eszközazonosító — előbb nyisd meg az oldalt");
    const w = window as unknown as { __adventCsrf?: string };
    w.__adventCsrf ??= ((await (await fetch("/api/csrf-token", { credentials: "include" })).json()) as { csrfToken: string }).csrfToken;
    const res = await fetch(`/api/advent${path}`, {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": w.__adventCsrf },
      body: JSON.stringify({ device, ...data }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path}: ${res.status} ${text.slice(0, 160)}`);
    return JSON.parse(text) as Record<string, unknown>;
  }, { path, data, key: DEVICE_KEY });
  await post("/grade", { grade: opts.grade });
  for (const day of opts.days) {
    const isWrong = opts.wrong?.includes(day) ?? false;
    for (let attempt = 0; attempt < (isWrong ? opts.attempts ?? 1 : 1); attempt++) {
      const opened = (await post(`/doors/${day}/open`, {})) as { question: { id: string; options: string[] } };
      const item = ALL.find((q) => q.id === opened.question.id)!;
      const correct = opened.question.options.indexOf(item.options[item.correctIndex]!);
      await post(`/doors/${day}/answer`, { questionId: opened.question.id, pick: isWrong ? (correct + 1) % 4 : correct });
    }
  }
}

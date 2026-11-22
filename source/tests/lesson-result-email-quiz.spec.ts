import { expect, test, type Page } from "@playwright/test";
import express from "express";
import rateLimit from "express-rate-limit";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Spec 2026-11-17-eredmeny-email-kviz — valódi render, vendég tanuló: a helyi kvíz eredménye akkor is elmegy, ha a tanuló minden
 * kérdésre válaszolt, de a „Kvíz kiértékelése” gombot nem nyomta meg (a kvíz kérdésenként azonnal visszajelez). Körönként egyszer;
 * a hiányos, le nem zárt kör nem megy el. (A gombos út régi tesztje: lesson-result-email.spec.ts.)
 */
test.use({ serviceWorkers: "block" });

async function mock(page: Page) {
  const posts: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-q/results" && req.method() === "POST") { posts.push(req.postDataJSON()); return route.fulfill({ status: 202, json: { queued: true } }); }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test", resultApi: 2 } });
    if (path === "/api/html-files/quiz-fixture") return route.fulfill({ json: { id: "quiz-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/quiz-fixture") return route.fulfill({ json: { lessonId: "lesson-q", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  return posts;
}

const quizPosts = (posts: Array<Record<string, unknown>>) => posts.filter(p => p.kind === "quiz");

test("minden kérdés megválaszolva: a kvíz a lezáró gomb nélkül, pontosan egyszer megy el", async ({ page }) => {
  const posts = await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  for (let i = 0; i < 24; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(1500);
  expect(quizPosts(posts), "hiányos, le nem zárt kör nem megy el").toHaveLength(0);

  await quiz.nth(24).locator("button.lesson-option").first().click();
  await expect.poll(() => quizPosts(posts).length).toBe(1);
  const sent = quizPosts(posts)[0];
  expect(sent.roundId).toMatch(/^round-[a-z0-9]+$/);
  const picks = sent.picks as Record<string, number>;
  expect(Object.keys(picks)).toHaveLength(25);
  expect(Object.values(picks).every(pick => Number.isInteger(pick) && pick >= 0), "minden kérdésre valódi válasz").toBe(true);
  expect(sent).not.toHaveProperty("score");
  // A lezáró gomb még látszik (a kör nincs lezárva); megnyomása nem küld újra.
  await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
  await expect(page.locator(".fusion-panel-quiz")).toHaveAttribute("data-finished", "true");
  await page.waitForTimeout(1500);
  expect(quizPosts(posts), "a lezárás nem küld másodszor").toHaveLength(1);

  await page.reload();
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await expect(page.locator("[data-quiz-id]")).toHaveCount(25);
  await page.waitForTimeout(1500);
  expect(quizPosts(posts), "újratöltés után nincs újabb beküldés").toHaveLength(1);
});

test("hiányos kör lezárása a kihagyásokkal: egy beküldés, a kihagyott kérdés -1", async ({ page }) => {
  const posts = await mock(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
  await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
  await expect.poll(() => quizPosts(posts).length).toBe(1);
  const picks = Object.values(quizPosts(posts)[0].picks as Record<string, number>);
  expect(picks).toHaveLength(25);
  expect(picks.filter(pick => pick === -1)).toHaveLength(22);
  await page.waitForTimeout(1500);
  expect(quizPosts(posts)).toHaveLength(1);
});

/** S1b: a lap háttérbe kerülésének utánzása (a telefonon megbízható esemény a `visibilitychange`). */
/**
 * Tulajdonosi döntés (2026-11-21, „Szűkítés: tartós sor külön”): a böngészős TARTÓS kimenő sor kapcsoló mögött, alapból KI. A tartós sor
 * tesztjei BE kapcsolóval futnak (az e2e-build futásidejű horga: `window.__websuliResultOutbox`); a többi teszt az éles, KI állást méri.
 */
async function enableOutbox(page: Page) {
  await page.addInitScript(() => { (window as unknown as { __websuliResultOutbox: boolean }).__websuliResultOutbox = true; });
}
async function hide(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
}

test("S1b: félbehagyott kvíz — háttérbe kerüléskor pillanatkép megy; válasz nélkül vagy változatlan állapotnál nem; a teljes kör végleges beküldés", async ({ page }) => {
  const posts = await mock(page);
  const partials = () => quizPosts(posts).filter(p => p.partial === true);
  const answered = (p: Record<string, unknown>) => Object.values(p.picks as Record<string, number>).filter(pick => pick >= 0).length;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  await hide(page);
  await page.waitForTimeout(800);
  expect(quizPosts(posts), "válasz nélkül nincs pillanatkép").toHaveLength(0);

  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800); // a CSRF-token előzetes lekérése
  await hide(page);
  await expect.poll(() => partials().length).toBe(1);
  expect(answered(partials()[0])).toBe(3);
  expect(Object.keys(partials()[0].picks as object)).toHaveLength(25);
  expect(partials()[0].roundId).toMatch(/^round-[a-z0-9]+$/);
  expect(typeof partials()[0].startedAt).toBe("number");
  // Review B1: a pillanatkép ugyanazzal az ujjlenyomattal megy, mint (később) a végleges beküldés.
  expect(typeof partials()[0].fingerprint, "a pillanatkép ujjlenyomattal megy").toBe("string");
  expect(partials()[0]).not.toHaveProperty("score");

  await hide(page);
  await page.waitForTimeout(800);
  expect(partials(), "változatlan állapotnál nincs újabb pillanatkép").toHaveLength(1);

  for (let i = 3; i < 5; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await hide(page);
  await expect.poll(() => partials().length).toBe(2);
  expect(answered(partials()[1])).toBe(5);

  // A kör befejezése: a végleges beküldés `partial` nélkül megy; utána a háttérbe kerülés már nem küld pillanatképet.
  for (let i = 5; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => quizPosts(posts).filter(p => p.partial !== true).length).toBe(1);
  expect(quizPosts(posts).find(p => p.partial !== true)!.fingerprint, "azonos azonosító a két úton").toBe(partials()[0].fingerprint);
  await hide(page);
  await page.waitForTimeout(800);
  expect(partials()).toHaveLength(2);
  expect(quizPosts(posts)).toHaveLength(3);
});

/* PR #510 (Codex + Vercel): alkalmazáson belüli elhagyás, új kör, sikertelen pillanatkép. */
async function mockWith(page: Page, options: { failPartials?: number } = {}) {
  const posts: Array<{ lesson: string; body: Record<string, unknown> }> = [];
  let failures = options.failPartials ?? 0;
  const file = (id: string, title: string) => ({ id, title, contentType: "lesson", classroom: 7 });
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const result = path.match(/^\/api\/lessons\/(lesson-q2?)\/results$/);
    if (result && req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      if (body.partial === true && failures > 0) { failures--; return route.fulfill({ status: 503, json: { message: "átmeneti hiba" } }); }
      posts.push({ lesson: result[1], body });
      return route.fulfill({ status: 202, json: { queued: true } });
    }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test", resultApi: 2 } });
    if (path === "/api/html-files") return route.fulfill({ json: [file("quiz-fixture", "Első lecke"), file("quiz-fixture-2", "Második lecke")] });
    if (path === "/api/html-files/quiz-fixture") return route.fulfill({ json: file("quiz-fixture", "Első lecke") });
    if (path === "/api/html-files/quiz-fixture-2") return route.fulfill({ json: file("quiz-fixture-2", "Második lecke") });
    if (path === "/api/lessons/by-file/quiz-fixture") return route.fulfill({ json: { lessonId: "lesson-q", version: 1, lesson: fusionFixture() } });
    if (path === "/api/lessons/by-file/quiz-fixture-2") return route.fulfill({ json: { lessonId: "lesson-q2", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  return posts;
}
const partialsOf = (posts: Array<{ lesson: string; body: Record<string, unknown> }>) => posts.filter(p => p.body.kind === "quiz" && p.body.partial === true);
const answeredIn = (body: Record<string, unknown>) => Object.values(body.picks as Record<string, number>).filter(pick => pick >= 0).length;
async function openQuiz(page: Page, id = "quiz-fixture") {
  await page.goto(`/preview/${id}`);
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  return quiz;
}

test("PR #510: a leckéből a „Vissza” gombbal kilépve (útvonalváltás, nincs pagehide) is megy pillanatkép", async ({ page }) => {
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 2; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800); // a CSRF-token előzetes lekérése
  expect(partialsOf(posts)).toHaveLength(0);
  await page.getByTestId("button-back").click();
  await expect.poll(() => partialsOf(posts).length).toBe(1);
  expect(partialsOf(posts)[0].lesson).toBe("lesson-q");
  expect(answeredIn(partialsOf(posts)[0].body)).toBe(2);
});

test("PR #510: a „Következő” tananyagra váltva az ELHAGYOTT lecke köréről megy pillanatkép (nem az újéról)", async ({ page }) => {
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await page.getByTestId("lesson-switcher").getByRole("button").nth(1).click();
  await expect(page).toHaveURL(/\/preview\/quiz-fixture-2$/);
  await expect.poll(() => partialsOf(posts).length).toBe(1);
  expect(partialsOf(posts)[0].lesson, "az elhagyott lecke azonosítójával").toBe("lesson-q");
  expect(answeredIn(partialsOf(posts)[0].body)).toBe(3);
  await page.waitForTimeout(800);
  expect(partialsOf(posts), "az új lecke üres köréről nem megy pillanatkép").toHaveLength(1);
});

test("PR #510: új kör ugyanabban a nézetben — az új kör ELSŐ válasza is megy (a régi kör számlálója nem nyomja el)", async ({ page }) => {
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 5; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await hide(page);
  await expect.poll(() => partialsOf(posts).length).toBe(1);
  expect(answeredIn(partialsOf(posts)[0].body)).toBe(5);
  await page.getByRole("button", { name: "Új kvíz" }).click();
  await page.getByRole("button", { name: "Új kör indítása", exact: true }).click();
  await expect(page.locator('[data-quiz-id] button.lesson-option[aria-pressed="true"]')).toHaveCount(0);
  await page.locator("[data-quiz-id]").first().locator("button.lesson-option").first().click();
  await hide(page);
  await expect.poll(() => partialsOf(posts).length).toBe(2);
  expect(answeredIn(partialsOf(posts)[1].body), "az új kör egyetlen válasza").toBe(1);
  expect(partialsOf(posts)[1].body.roundId).not.toBe(partialsOf(posts)[0].body.roundId);
});

test("PR #510: a sikertelen pillanatkép (503) nem rögzül elküldöttként — a következő háttérbe kerülés újraküldi; siker után nem megy újra", async ({ page }) => {
  const posts = await mockWith(page, { failPartials: 1 });
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 2; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await hide(page); // az első kérés 503-at kap
  await page.waitForTimeout(800);
  expect(partialsOf(posts), "az elutasított kérés nem számít").toHaveLength(0);
  await hide(page); // változatlan állapot — de az előző nem ment át, ezért újra megy
  await expect.poll(() => partialsOf(posts).length).toBe(1);
  expect(answeredIn(partialsOf(posts)[0].body)).toBe(2);
  await page.waitForTimeout(500);
  await hide(page);
  await page.waitForTimeout(800);
  expect(partialsOf(posts), "az elfogadott állapot nem megy újra").toHaveLength(1);
});

/* Vak ellenőrzés (2026-11-18), terv R2–R4, R8 + S6: korhatár az utolsó válaszhoz, kör-csere, lejárt token, keepalive, viselkedést mérő őrök. */
const DAY_MS = 86_400_000;
/** A tárolt kvízkör átírása a böngészőben (a kör kulcsa `…:quiz`) — a régi kezdetű / régi válaszú kör utánzása; utána újratöltés kell. */
async function patchStoredQuizRound(page: Page, patch: { startedAt?: number; lastAnsweredAt?: number | null; answerFirst?: number }) {
  const changed = await page.evaluate(p => {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.endsWith(":quiz")) continue;
      const round = JSON.parse(localStorage.getItem(key)!);
      if (!Array.isArray(round?.ids)) continue;
      if (p.startedAt !== undefined) round.startedAt = p.startedAt;
      // A régi válaszok közvetlenül a tárolóba kerülnek: a lap memóriájában így nincs friss válasz, amelyről az újratöltés jogos pillanatképet küldene.
      for (const id of (round.ids as string[]).slice(0, p.answerFirst ?? 0)) round.picks = { ...round.picks, [id]: 0 };
      if (p.lastAnsweredAt === null) delete round.lastAnsweredAt; else if (p.lastAnsweredAt !== undefined) round.lastAnsweredAt = p.lastAnsweredAt;
      localStorage.setItem(key, JSON.stringify(round));
      count++;
    }
    return count;
  }, patch);
  expect(changed, "pontosan egy tárolt kvízkör").toBe(1);
}
const finalsOf = (posts: Array<{ lesson: string; body: Record<string, unknown> }>) => posts.filter(p => p.body.kind === "quiz" && p.body.partial !== true);

test("R2 / K2: a 8 napja megnyitott, MA megválaszolt kör elmegy — a korhatár az utolsó válaszhoz mér (S1a alapeset régi fülnyitással)", async ({ page }) => {
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuiz(page); // a „Kvíz” fül megnyitása rögzíti a kör kezdetét
  const oldStart = Date.now() - 8 * DAY_MS;
  await patchStoredQuizRound(page, { startedAt: oldStart });
  const quiz = await openQuiz(page); // újratöltés: a tárolt, 8 napja kezdett kör
  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await hide(page);
  await expect.poll(() => partialsOf(posts).length, { message: "a ma adott válaszokról megy pillanatkép" }).toBe(1);
  expect(partialsOf(posts)[0].body.startedAt, "a kör valódi (régi) kezdete megy").toBe(oldStart);
  expect(Date.now() - (partialsOf(posts)[0].body.lastAnsweredAt as number)).toBeLessThan(60_000);
  for (let i = 3; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => finalsOf(posts).length, { message: "a ma befejezett kör végleges beküldése megy" }).toBe(1);
  expect(finalsOf(posts)[0].body.startedAt).toBe(oldStart);
  expect(Object.values(finalsOf(posts)[0].body.picks as Record<string, number>).every(pick => pick >= 0)).toBe(true);
});

test("R2 / E12: az a le nem zárt kör, amelynek az UTOLSÓ válasza 8 napos, új válasz nélkül nem megy el; egy új válasz után megy", async ({ page }) => {
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuiz(page); // a kör létrejön a tárolóban (válasz nélkül)
  const old = Date.now() - 8 * DAY_MS;
  // 8 napja kezdett kör, két 8 napos válasszal — mintha a tanuló akkor hagyta volna félbe.
  await patchStoredQuizRound(page, { startedAt: old - 60_000, lastAnsweredAt: old, answerFirst: 2 });
  await openQuiz(page);
  await expect(page.locator('[data-quiz-id] button.lesson-option[aria-pressed="true"]')).toHaveCount(2);
  await page.waitForTimeout(800);
  await hide(page);
  await page.waitForTimeout(800);
  expect(posts.filter(p => p.body.kind === "quiz"), "a régi, új válasz nélküli kör nem megy el").toHaveLength(0);
  // Régebbi tárolt kör (még nincs `lastAnsweredAt` mezője): a kezdés számít — az sem megy.
  await patchStoredQuizRound(page, { lastAnsweredAt: null });
  await openQuiz(page);
  await page.waitForTimeout(800);
  await hide(page);
  await page.waitForTimeout(800);
  expect(posts.filter(p => p.body.kind === "quiz")).toHaveLength(0);
  // Egy MAI válasz után a kör megy.
  await page.locator("[data-quiz-id]").nth(2).locator("button.lesson-option").first().click();
  await page.waitForTimeout(300);
  await hide(page);
  await expect.poll(() => partialsOf(posts).length).toBe(1);
  expect(answeredIn(partialsOf(posts)[0].body)).toBe(3);
});

test("R3 / K3: „Új kvíz” a kör közepén, a lap elrejtése NÉLKÜL — az elhagyott körről megy pillanatkép, mielőtt az állapot törlődik", async ({ page }) => {
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 4; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800); // a CSRF-token előzetes lekérése; a lap végig előtérben marad
  expect(partialsOf(posts)).toHaveLength(0);
  await page.getByRole("button", { name: "Új kvíz" }).click();
  await page.getByRole("button", { name: "Új kör indítása", exact: true }).click();
  await expect(page.locator('[data-quiz-id] button.lesson-option[aria-pressed="true"]')).toHaveCount(0);
  await expect.poll(() => partialsOf(posts).length, { message: "az elhagyott körről pillanatkép megy" }).toBe(1);
  expect(answeredIn(partialsOf(posts)[0].body), "az elhagyott kör négy válasza").toBe(4);
  const abandoned = partialsOf(posts)[0].body.roundId;
  // Az új kör első válasza a SAJÁT körazonosítójával megy; az elhagyott körről nem megy második.
  await page.locator("[data-quiz-id]").first().locator("button.lesson-option").first().click();
  await page.waitForTimeout(300);
  await hide(page);
  await expect.poll(() => partialsOf(posts).length).toBe(2);
  expect(partialsOf(posts)[1].body.roundId).not.toBe(abandoned);
  expect(answeredIn(partialsOf(posts)[1].body)).toBe(1);
  await page.waitForTimeout(800);
  expect(partialsOf(posts)).toHaveLength(2);
});

test("R3: a LEZÁRT kör cseréje nem küld pillanatképet (a végleges eredmény már elment)", async ({ page }) => {
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
  await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
  await expect.poll(() => finalsOf(posts).length).toBe(1);
  await page.getByRole("button", { name: "Új kvíz" }).click();
  await page.getByRole("button", { name: "Új kör indítása", exact: true }).click();
  await expect(page.locator('[data-quiz-id] button.lesson-option[aria-pressed="true"]')).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(partialsOf(posts)).toHaveLength(0);
  expect(finalsOf(posts)).toHaveLength(1);
});

/** R4: munkamenethez kötött CSRF-token utánzása — a szerver csak az ÉRVÉNYES tokent fogadja el, a többire 403. */
async function mockCsrf(page: Page) {
  const state = { valid: "token-1", tokenStatus: 200, tokenCalls: 0, signal: true, rejected: [] as string[], accepted: [] as Array<{ token: string; body: Record<string, unknown> }> };
  await mockWith(page);
  await page.route("**/api/csrf-token", route => { state.tokenCalls++; return state.tokenStatus === 200 ? route.fulfill({ json: state.signal ? { csrfToken: state.valid, resultApi: 2 } : { csrfToken: state.valid } }) : route.fulfill({ status: state.tokenStatus, json: { message: "hiba" } }); });
  await page.route("**/api/lessons/lesson-q/results", route => {
    const token = route.request().headers()["x-csrf-token"] ?? "";
    if (route.request().method() !== "POST" || token !== state.valid) { state.rejected.push(token); return route.fulfill({ status: 403, json: { message: "invalid csrf token" } }); }
    state.accepted.push({ token, body: route.request().postDataJSON() as Record<string, unknown> });
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  return state;
}

test("R4 / K4: lejárt munkamenet — a pillanatkép 403 után új tokent kér és EGYSZER ismétel; az elfogadott állapot nem megy újra", async ({ page }) => {
  const csrf = await mockCsrf(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 2; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800); // a (még érvényes) token előtöltődik
  expect(csrf.tokenCalls).toBeGreaterThan(0);
  csrf.valid = "token-2"; // a munkamenet lejárt / kicserélődött: a gyorsítótárazott token már érvénytelen
  await hide(page);
  await expect.poll(() => csrf.accepted.length, { message: "az új tokennel megismételt pillanatkép átment" }).toBe(1);
  expect(csrf.rejected, "az első kísérlet a régi tokennel ment").toEqual(["token-1"]);
  expect(csrf.accepted[0].token).toBe("token-2");
  expect(csrf.accepted[0].body.partial).toBe(true);
  await hide(page);
  await page.waitForTimeout(800);
  expect(csrf.accepted, "az elfogadott állapot nem megy újra").toHaveLength(1);
  expect(csrf.rejected).toHaveLength(1);
  // A következő pillanatkép már elsőre az új tokennel megy.
  await quiz.nth(2).locator("button.lesson-option").first().click();
  await hide(page);
  await expect.poll(() => csrf.accepted.length).toBe(2);
  expect(csrf.rejected).toHaveLength(1);
});

test("R4 / K4: ha 403 után az új token sem kérhető le, semmi nem rögzül és a régi tokennel nincs újabb kísérlet — a következő betöltéskor a tárolt kör friss tokennel elmegy", async ({ page }) => {
  const csrf = await mockCsrf(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 2; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  csrf.valid = "token-2";
  csrf.tokenStatus = 500; // a tokenkérés is bukik (pl. a lap bezárása miatt nincs rá mód)
  await hide(page);
  await page.waitForTimeout(800);
  expect(csrf.accepted).toHaveLength(0);
  expect(csrf.rejected).toEqual(["token-1"]);
  await hide(page); // a régi token már nincs gyorsítótárban; új nincs → nem megy kérés érvénytelen tokennel
  await page.waitForTimeout(800);
  expect(csrf.accepted).toHaveLength(0);
  expect(csrf.rejected, "a régi tokennel nem próbálkozik újra").toEqual(["token-1"]);
  // Újratöltés (a következő betöltés): a tárolt kör friss tokennel megy.
  csrf.tokenStatus = 200;
  await openQuiz(page);
  await expect(page.locator('[data-quiz-id] button.lesson-option[aria-pressed="true"]')).toHaveCount(2);
  await page.waitForTimeout(800);
  await hide(page);
  await expect.poll(() => csrf.accepted.length).toBe(1);
  expect(csrf.accepted[0].token).toBe("token-2");
  expect(answeredIn(csrf.accepted[0].body)).toBe(2);
});

test("R4 + S6: token nélkül a pillanatkép nem megy el; újratöltés nélkül is helyreáll — a következő háttérbe kerülés új tokent kér és küld", async ({ page }) => {
  const csrf = await mockCsrf(page);
  await page.setViewportSize({ width: 390, height: 844 });
  csrf.tokenStatus = 500; // az előtöltés bukik
  const quiz = await openQuiz(page);
  for (let i = 0; i < 2; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await hide(page);
  await page.waitForTimeout(800);
  expect(csrf.accepted).toHaveLength(0);
  expect(csrf.rejected, "token nélkül nem megy kérés").toHaveLength(0);
  csrf.tokenStatus = 200;
  await hide(page);
  await expect.poll(() => csrf.accepted.length, { message: "a helyreállt tokenkérés után a pillanatkép elmegy" }).toBe(1);
  expect(answeredIn(csrf.accepted[0].body)).toBe(2);
});

type SeenResult = { keepalive: boolean; method: string; kind: string; partial: boolean; csrf: boolean };
/** A `/results` kérések megfigyelése a lapon belül: `keepalive`, mód, CSRF-fejléc, és hogy `sendBeacon` nem megy. */
async function spyResultRequests(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __results: SeenResult[]; __beacons: number };
    w.__results = []; w.__beacons = 0;
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/\/api\/lessons\/[^/]+\/results$/.test(target)) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { kind?: string; partial?: boolean };
        w.__results.push({ keepalive: init?.keepalive === true, method: init?.method ?? "GET", kind: body.kind ?? "", partial: body.partial === true, csrf: !!new Headers(init?.headers).get("X-CSRF-Token") });
      }
      return original(input, init);
    };
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (target: string | URL, data?: BodyInit | null) => { if (String(target).includes("/results")) w.__beacons++; return beacon(target, data); };
  });
  return () => page.evaluate(() => { const w = window as unknown as { __results: SeenResult[]; __beacons: number }; return { results: w.__results, beacons: w.__beacons }; });
}

test("R8 + S6: a `pagehide` esemény is küld pillanatképet; a pillanatkép és a kvíz végleges kérése keepalive-os, CSRF-fejléces POST (nem GET, nem sendBeacon)", async ({ page }) => {
  const seen = await spyResultRequests(page);
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); }); // a lap elhagyása (`visibilitychange` nélkül)
  await expect.poll(() => partialsOf(posts).length).toBe(1);
  expect(answeredIn(partialsOf(posts)[0].body)).toBe(3);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.includes(":quiz:partial:")).length), { message: "az elfogadott pillanatkép rögzül" }).toBe(1);
  for (let i = 3; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => finalsOf(posts).length).toBe(1);
  const { results, beacons } = await seen();
  expect(beacons, "sendBeacon nem megy (nem tud CSRF-fejlécet küldeni)").toBe(0);
  expect(results.length).toBeGreaterThanOrEqual(2);
  expect(results.every(r => r.method === "POST" && r.csrf), "minden eredménykérés CSRF-fejléces POST").toBe(true);
  expect(results.filter(r => r.partial).every(r => r.keepalive), "a pillanatkép keepalive").toBe(true);
  expect(results.filter(r => r.kind === "quiz" && !r.partial).map(r => r.keepalive), "a kvíz végleges kérése keepalive (a lapbezárás nem szakítja meg)").toEqual([true]);
  // A sikeres végleges beküldés után a kör „részleges” jelzője nem marad a tárolóban.
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.includes(":quiz:partial:")).length)).toBe(0);
});

test("S6: a feladatoknál a teljes kitöltés a „Feladatok kiértékelése” gomb NÉLKÜL nem küld (csak a lezárt kör megy); a gomb után egyszer megy, nem keepalive", async ({ page }) => {
  const seen = await spyResultRequests(page);
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  const answers = page.locator("[data-task-id] textarea");
  await expect(answers).toHaveCount(15);
  for (let i = 0; i < 15; i++) await answers.nth(i).fill(`válasz ${i + 1}`);
  await hide(page);
  await page.waitForTimeout(1500);
  expect(posts.filter(p => p.body.kind === "tasks"), "lezárás nélkül a feladatok nem mennek").toHaveLength(0);
  expect(posts.filter(p => p.body.partial === true), "a feladatoknak nincs pillanatképe").toHaveLength(0);
  await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
  await expect.poll(() => posts.filter(p => p.body.kind === "tasks").length).toBe(1);
  await page.waitForTimeout(1000);
  expect(posts.filter(p => p.body.kind === "tasks")).toHaveLength(1);
  const { results } = await seen();
  expect(results.filter(r => r.kind === "tasks").map(r => r.keepalive), "a feladatok törzse meghaladhatja a keepalive keretét").toEqual([false]);
});

/**
 * Terv R12 (az R10 módosul) — telepítési átmenet: a kliens (Vercel) és a szerver (Render) külön, nem vezérelhető sorrendben települ. A
 * „régi szerver” csonk a főág viselkedését utánozza: a CSRF-token válaszában NINCS `resultApi` jelzés, és a szigorú séma minden ismeretlen
 * mezőt 400-zal utasít el (`partial`, `startedAt`, `lastAnsweredAt`, `clientNow`).
 */
const OLD_FIELDS: Record<string, readonly string[]> = { quiz: ["kind", "roundId", "picks", "fingerprint", "learner"], tasks: ["kind", "roundId", "answers", "fingerprint", "learner"] };
const oldSchemaAccepts = (body: Record<string, unknown>) => Object.keys(body).every(field => (OLD_FIELDS[String(body.kind)] ?? []).includes(field));
async function mockOldServer(page: Page, options: { signal?: boolean } = {}) {
  const state = { rejected: [] as Array<Record<string, unknown>>, accepted: [] as Array<Record<string, unknown>>, all: [] as Array<Record<string, unknown>> };
  await mockWith(page);
  // A jelzés nélküli token: így válaszol a régi szerver. (`signal: true`: új példány adta a tokent, de a kérés egy még régi példányra esik.)
  await page.route("**/api/csrf-token", route => route.fulfill({ json: options.signal ? { csrfToken: "test", resultApi: 2 } : { csrfToken: "test" } }));
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.all.push(body);
    if (!oldSchemaAccepts(body)) { state.rejected.push(body); return route.fulfill({ status: 400, json: { message: "Érvénytelen beküldés." } }); }
    state.accepted.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  return state;
}

test("R12: jelzés nélküli (régi) szerver mellett nincs pillanatkép, a végleges kvíz EGYETLEN, régi alakú kéréssel megy — ismétlés nélkül", async ({ page }) => {
  const old = await mockOldServer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await hide(page);
  await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); });
  await page.waitForTimeout(1000);
  expect(old.all, "jelzés nélkül nem megy pillanatkép (a régi szerver keretét sem fogyasztja)").toHaveLength(0);
  for (let i = 3; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => old.accepted.length, { message: "a végleges kvíz régi alakkal elfogadva" }).toBe(1);
  const accepted = old.accepted[0];
  expect(Object.keys(accepted).sort()).toEqual(expect.arrayContaining(["kind", "picks", "roundId"]));
  for (const field of ["startedAt", "lastAnsweredAt", "clientNow", "partial"]) expect(accepted).not.toHaveProperty(field);
  expect(Object.values(accepted.picks as Record<string, number>).filter(pick => pick >= 0)).toHaveLength(25);
  await page.waitForTimeout(1000);
  expect(old.rejected, "egyetlen elutasított kérés sem volt").toHaveLength(0);
  expect(old.all, "gyerekenként pontosan egy kérés (mint a régi kliensnél)").toHaveLength(1);
  await page.reload();
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await page.waitForTimeout(1200);
  expect(old.all, "a kör elküldöttként rögzült").toHaveLength(1);
});

test("R12: jelzés nélküli (régi) szerver mellett a feladatok végleges kérése is egyetlen, régi alakú kérés", async ({ page }) => {
  const old = await mockOldServer(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  const answers = page.locator("[data-task-id] textarea");
  await expect(answers).toHaveCount(15);
  for (let i = 0; i < 15; i++) await answers.nth(i).fill(`válasz ${i + 1}`);
  await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
  await expect.poll(() => old.accepted.filter(body => body.kind === "tasks").length).toBe(1);
  expect(old.accepted[0]).not.toHaveProperty("startedAt");
  expect(Object.keys(old.accepted[0].answers as object)).toHaveLength(15);
  await page.waitForTimeout(800);
  expect(old.all.filter(body => body.kind === "tasks"), "pontosan egy kérés, elutasítás nélkül").toHaveLength(1);
});

test("R10 (jelzés mellett): ha egy még régi példány 400-at ad, a végleges kvíz egyszer az új mezők nélkül ismétel; a pillanatkép NEM alakul végleges beküldéssé", async ({ page }) => {
  const old = await mockOldServer(page, { signal: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await hide(page);
  await expect.poll(() => old.rejected.length, { message: "a pillanatkép a régi példányhoz ért (és elutasította)" }).toBe(1);
  await page.waitForTimeout(800);
  expect(old.accepted, "a pillanatkép nem ment át végleges (partial nélküli) alakban").toHaveLength(0);
  for (let i = 3; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => old.accepted.length, { message: "a végleges kvíz az új mezők nélkül elfogadva" }).toBe(1);
  for (const field of ["startedAt", "lastAnsweredAt", "clientNow", "partial"]) expect(old.accepted[0]).not.toHaveProperty(field);
  expect(old.rejected.filter(body => body.partial !== true), "a végleges kérés első (új mezős) kísérlete").toHaveLength(1);
  await page.waitForTimeout(1000);
  expect(old.accepted, "pontosan egy végleges kérés ment át").toHaveLength(1);
});

/**
 * R12 / K3: egy osztály (30 gyerek) közös IP mögött, régi szerver. Egy gyerek VALÓDI kliens-kéréseit (háttérbe kerüléssel, lapelhagyással)
 * rögzítjük, és 30 gyerekre visszajátsszuk a főág szigorú sémájának (`origin/main`, `shared/lesson-result-email.ts` `resultRequestSchema`)
 * és 20-as, `skip` nélküli keretének (`server/lesson-result-email.ts` `resultLimiter`) másolatára. Összevetés: a régi kliens gyerekenként
 * egyetlen, régi alakú végleges kérést küldött → 20 eredmény ment át.
 */
const oldId = z.string().min(1).max(80);
const oldRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tasks"), roundId: z.string().regex(/^[a-z0-9-]{4,64}$/), answers: z.record(oldId, z.string().max(4000)), fingerprint: z.string().max(80).optional(), learner: z.string().max(120).optional() }).strict(),
  z.object({ kind: z.literal("quiz"), roundId: z.string().regex(/^[a-z0-9-]{4,64}$/), picks: z.record(oldId, z.number().int().min(-1).max(7)), fingerprint: z.string().max(80).optional(), learner: z.string().max(120).optional() }).strict(),
]);
async function replayOnOldServer(perChild: Array<Array<Record<string, unknown>>>) {
  const app = express();
  app.use(express.json());
  app.post("/api/lessons/:lessonId/results", rateLimit({ keyGenerator: () => "iskolai-ip", windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }),
    (req, res) => { if (!oldRequestSchema.safeParse(req.body).success) return res.status(400).json({ message: "Érvénytelen beküldés." }); return res.status(202).json({ queued: true }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const accepted: number[] = [];
  try {
    for (const requests of perChild) {
      let ok = 0;
      for (const body of requests) if ((await fetch(`${base}/api/lessons/lesson-q/results`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status === 202 && body.partial !== true) ok++;
      accepted.push(ok);
    }
  } finally { server.close(); }
  return accepted;
}

test("R12 / K3: régi szerver + 30 gyerek egy IP-ről — legalább annyi végleges eredmény megy át, mint a régi kliensnél (20), kettős küldés nincs", async ({ page }) => {
  const old = await mockOldServer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 10; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await hide(page); // alkalmazásváltás a kvíz közben
  await page.waitForTimeout(500);
  for (let i = 10; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => old.accepted.length).toBe(1);
  await page.waitForTimeout(800);
  await hide(page);
  await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); });
  await page.waitForTimeout(800);
  const child = old.all;
  expect(child, "egy gyerek valódi kérései: egyetlen, régi alakú végleges kérés").toHaveLength(1);
  const asChild = (n: number) => child.map(body => ({ ...body, roundId: `round-gyerek-${n}` }));
  const newClient = await replayOnOldServer(Array.from({ length: 30 }, (_, n) => asChild(n)));
  const legacy = old.accepted[0];
  const oldClient = await replayOnOldServer(Array.from({ length: 30 }, (_, n) => [{ ...legacy, roundId: `round-gyerek-${n}` }]));
  const delivered = (list: number[]) => list.filter(ok => ok > 0).length;
  expect(delivered(oldClient), "a régi kliens összevetési alapja").toBe(20);
  expect(delivered(newClient), "az új kliens nem rosszabb a régi szerver mellett").toBeGreaterThanOrEqual(delivered(oldClient));
  expect(Math.max(...newClient), "egy gyerektől legfeljebb egy elfogadott végleges kérés").toBeLessThanOrEqual(1);
});

/* Gépi vak ellenőrzés (GPT-6.2 Sol, 2026-11-19), terv R20 / R23. */
test("R20 / L1: az előző kör végleges kérése még függőben van, közben új, teljesen megválaszolt kör → a második kör is beküldődik, gomb nélkül", async ({ page }) => {
  await mockWith(page);
  const finals: Array<Record<string, unknown>> = [];
  let releaseFirst!: () => void;
  const firstHeld = new Promise<void>(resolve => { releaseFirst = resolve; });
  await page.route("**/api/lessons/lesson-q/results", async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial === true) return route.fulfill({ status: 202, json: { queued: true, partial: true } });
    finals.push(body);
    if (finals.length === 1) await firstHeld; // az első kör válasza függőben marad
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => finals.length, { message: "az első kör végleges kérése elindult" }).toBe(1);
  await page.getByRole("button", { name: "Új kvíz" }).click();
  await page.getByRole("button", { name: "Új kör indítása", exact: true }).click();
  await expect(page.locator('[data-quiz-id] button.lesson-option[aria-pressed="true"]')).toHaveCount(0);
  const second = page.locator("[data-quiz-id]");
  for (let i = 0; i < 25; i++) await second.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => finals.length, { message: "a második kör is beküldődött, az első függő kérése mellett" }).toBe(2);
  expect(finals[1].roundId).not.toBe(finals[0].roundId);
  expect(Object.values(finals[1].picks as Record<string, number>).filter(pick => pick >= 0)).toHaveLength(25);
  releaseFirst();
  await page.waitForTimeout(1500);
  expect(finals, "az első válasz felengedése után sincs harmadik (ismételt) kérés").toHaveLength(2);
});

test("R23 / L3: 403 után a frissített token jelzés nélküli (régi példány) → a pillanatkép nem megy újra, és nem rögzül elküldöttként", async ({ page }) => {
  const csrf = await mockCsrf(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 2; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800); // a (jelzéses) token előtöltődik
  csrf.valid = "token-2";
  csrf.signal = false; // a 403 utáni új tokent egy régi példány adja: jelzés nélkül
  await hide(page);
  await expect.poll(() => csrf.rejected.length, { message: "az első pillanatkép a régi tokennel 403-at kapott" }).toBe(1);
  await page.waitForTimeout(1000);
  expect(csrf.accepted, "jelzés nélküli új tokennel nem megy második pillanatkép").toHaveLength(0);
  expect(csrf.rejected, "nincs második (régi szervernek szóló) pillanatkép-kérés").toHaveLength(1);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes(":quiz:partial:")).length), "nem rögzült elküldöttként").toBe(0);
});

/* Gépi vak ellenőrzés, 2. célzott kör (GPT-6.2 Sol, 2026-11-19), terv R24. */
async function answerAll(page: Page) {
  const quiz = await openQuiz(page);
  for (let i = 0; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
}

test("R24 / L1: 429 (Retry-After nélkül) után a végleges beküldés nem ismétlődik azonnal — 3 s alatt egyetlen kérés", async ({ page }) => {
  await mockWith(page);
  const finals: number[] = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial === true) return route.fulfill({ status: 202, json: { queued: true, partial: true } });
    finals.push(Date.now());
    return route.fulfill({ status: 429, json: { message: "Túl sok beküldés." } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await answerAll(page);
  await expect.poll(() => finals.length).toBe(1);
  await page.waitForTimeout(3000);
  expect(finals, "nincs POST-hurok ugyanarra a körre").toHaveLength(1);
});

test("R24 / L1: 429 + Retry-After: 1 → a kör legfeljebb 3 kísérletet kap, a kísérletek között legalább ~1 s", async ({ page }) => {
  await mockWith(page);
  const finals: number[] = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial === true) return route.fulfill({ status: 202, json: { queued: true, partial: true } });
    finals.push(Date.now());
    return route.fulfill({ status: 429, headers: { "Retry-After": "1" }, json: { message: "Túl sok beküldés." } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await answerAll(page);
  await expect.poll(() => finals.length, { timeout: 8000 }).toBe(3);
  await page.waitForTimeout(3000);
  expect(finals, "a felső korlát (3) után nincs több kísérlet").toHaveLength(3);
  for (let i = 1; i < finals.length; i++) expect(finals[i] - finals[i - 1], "a Retry-After idejét megtartja").toBeGreaterThanOrEqual(800);
});

test("R24 / L2: lassú token mellett az utolsó válasz után azonnali dokumentumváltás → a végleges kör a következő oldalbetöltéskor elmegy", async ({ page }) => {
  await enableOutbox(page); // tartós sor (BE)
  await mockWith(page);
  let tokenCalls = 0;
  await page.route("**/api/csrf-token", async route => {
    tokenCalls++;
    if (tokenCalls === 1) { await new Promise(resolve => setTimeout(resolve, 20_000)); try { await route.fulfill({ json: { csrfToken: "test", resultApi: 2 } }); } catch { /* a lap közben elnavigált */ } return; }
    return route.fulfill({ json: { csrfToken: "test", resultApi: 2 } });
  });
  const finals: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial !== true) finals.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await answerAll(page);
  expect(finals, "a lassú token miatt a leckeoldalon még nem ment el").toHaveLength(0);
  await page.goto("/"); // valódi dokumentumváltás: a leckeoldal JavaScriptje leáll
  await expect.poll(() => finals.length, { timeout: 15_000, message: "a következő oldalbetöltés kiküldte a végleges kört" }).toBe(1);
  expect(Object.values(finals[0].picks as Record<string, number>).filter(pick => pick >= 0)).toHaveLength(25);
  await page.waitForTimeout(1500);
  expect(finals, "pontosan egyszer").toHaveLength(1);
});

/* Gépi vak ellenőrzés, 3. célzott kör (GPT-6.2 Sol, 2026-11-19), terv R26 / R28. */
test("R26 / L2: folyamatos 503 mellett a végleges beküldés nem ismétlődik beágyazott ciklusban — 6 s alatt egyetlen POST", async ({ page }) => {
  await mockWith(page);
  const finals: number[] = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial === true) return route.fulfill({ status: 202, json: { queued: true, partial: true } });
    finals.push(Date.now());
    return route.fulfill({ status: 503, json: { message: "átmeneti hiba" } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await answerAll(page);
  await expect.poll(() => finals.length).toBe(1);
  await page.waitForTimeout(6000);
  expect(finals, "a hibavárakozást csak a kimenő sor kezeli (30 s-tól)").toHaveLength(1);
});

test("R28 / L4: olvasható, de nem írható tárolónál (kvóta) a befejezett kör a lapon belül is elmegy", async ({ page }) => {
  await enableOutbox(page); // tartós sor (BE)
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      // R32: a sor bejegyzésenként külön kulcson áll (`websuli:result-outbox:v1:<azonosító>`) — minden sorkulcs írása dob.
      if (key.startsWith("websuli:result-outbox:v1")) throw new DOMException("A tároló megtelt.", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await mockWith(page);
  const finals: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial !== true) finals.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await answerAll(page);
  await expect.poll(() => finals.length, { message: "a memóriabeli sorból elment" }).toBe(1);
  await page.waitForTimeout(1200);
  expect(finals).toHaveLength(1);
});

/* Gépi vak ellenőrzés, 6. kör (GPT-6.2 Sol, 804569c1, 2026-11-20), terv R35 / R37. */
test("R35 / L1: a korábbi dokumentumból címke nélkül maradt kör ugyanabba a leckébe visszatérve sem kapja meg az új munkamenet címkéjét", async ({ page }) => {
  await enableOutbox(page); // tartós sor (BE)
  await mockWith(page);
  let tokenCalls = 0;
  await page.route("**/api/csrf-token", async route => {
    tokenCalls++;
    if (tokenCalls === 1) { await new Promise(resolve => setTimeout(resolve, 20_000)); try { await route.fulfill({ json: { csrfToken: "test", resultApi: 2, resultSubject: "elso-cimke" } }); } catch { /* a lap közben elnavigált */ } return; }
    // Az új dokumentum tokenje is lassú: az induló ürítés a token alatt áll, közben a helyreállított kör újra felvevődik (a hibás kód ekkor
    // az új munkamenet címkéjét adta a régi bejegyzésnek — a 6. kör L1 reprodukciója).
    await new Promise(resolve => setTimeout(resolve, 4000));
    return route.fulfill({ json: { csrfToken: "test", resultApi: 2, resultSubject: "masik-fiok-cimke" } });
  });
  const finals: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial !== true) finals.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await answerAll(page);
  expect(finals, "a lassú token miatt még nem ment el; a sorban címke nélkül áll").toHaveLength(0);
  await openQuiz(page); // új dokumentum, UGYANAZ a lecke: a tárolt teljes kör helyreáll, és más munkamenet tokenje él
  await expect.poll(() => finals.length, { timeout: 15_000 }).toBe(1);
  expect(finals[0].subject, "a régi, címke nélküli eredmény nem kapja meg az új munkamenet címkéjét").toBe("?");
  await page.waitForTimeout(1500);
  expect(finals).toHaveLength(1);
});

test("R37 / L4: a 202-es fejlécek után megakadó választest az időkorláton belül megszakad (a sor nem ragad be)", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { started: 0, aborted: 0 };
    (window as unknown as { __stalled: typeof state }).__stalled = state;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/lessons/lesson-q/results") && init?.method === "POST" && typeof init.body === "string" && !(JSON.parse(init.body) as { partial?: boolean }).partial) {
        state.started++;
        const signal = init.signal;
        const stream = new ReadableStream<Uint8Array>({ start(controller) {
          controller.enqueue(new TextEncoder().encode("{"));
          signal?.addEventListener("abort", () => { state.aborted++; controller.error(new DOMException("aborted", "AbortError")); });
        } });
        return new Response(stream, { status: 202, headers: { "content-type": "application/json" } });
      }
      return originalFetch(input, init);
    };
    // Csak a kérés 60 s-os alap-időkorlátja gyorsul 500 ms-ra (minden más időzítő változatlan).
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => originalSetTimeout(handler, ms === 60_000 ? 500 : ms, ...args)) as typeof window.setTimeout;
  });
  await mockWith(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await answerAll(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __stalled: { started: number } }).__stalled.started)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __stalled: { aborted: number } }).__stalled.aborted), { timeout: 5000, message: "a megakadt törzs olvasását az időkorlát megszakította" }).toBe(1);
});

/* Gépi vak ellenőrzés, 7. kör (GPT-6.2 Sol, 0ec08148, 2026-11-21), terv R39 / R40. */
/** A tartós kimenő sorba egy korábbi munkamenetből maradt végleges bejegyzés (egyszer, az első dokumentum indulása előtt). */
async function seedOutbox(page: Page, entry: { subject: string | null; activityOffsetMs: number }) {
  await page.addInitScript(seed => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    const id = "lesson-q|quiz|round-seeded";
    localStorage.setItem(`websuli:result-outbox:v1:${id}`, JSON.stringify({ id, lessonId: "lesson-q", kind: "quiz", body: { kind: "quiz", roundId: "round-seeded", picks: { q1: 0 } },
      flag: "seed:quiz:sent:round-seeded", partialKey: "seed:quiz:partial:round-seeded", activityAt: Date.now() + seed.activityOffsetMs, subject: seed.subject }));
  }, entry);
}

test("R39 / L1: az ürítés első tokenkérése átmenetileg bukik (502), a következő már MÁSIK fiók tokenje → a régi eredmény nem megy címke nélkül (a sor később, az eredeti címkével küldi)", async ({ page }) => {
  await enableOutbox(page); // tartós sor (BE)
  // Hamis óra: a kimenő sor első (30 s-os) várakozását előretekerjük (a valós idő közben normálisan folyik).
  await page.clock.install();
  await seedOutbox(page, { subject: "anon", activityOffsetMs: 0 });
  await mockWith(page);
  let tokenCalls = 0;
  await page.route("**/api/csrf-token", async route => {
    tokenCalls++;
    if (tokenCalls === 1) { await new Promise(resolve => setTimeout(resolve, 800)); return route.fulfill({ status: 502, body: "Bad Gateway" }); }
    return route.fulfill({ json: { csrfToken: "test", resultApi: 2, resultSubject: "fiok-b" } });
  });
  const finals: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial !== true) finals.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect.poll(() => tokenCalls, { message: "az ürítés tokent kért" }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(2000); // az első (502-es) tokenkérés lezárult
  expect(finals.map(body => body.subject), "a tokenhiba után nem ment el régi alakban (címke nélkül)").toStrictEqual([]);
  await page.clock.fastForward(31_000); // a sor szokott várakozása (30 s) letelik
  await expect.poll(() => finals.length, { timeout: 15_000, message: "a sor a tokenhiba után is kiküldi" }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1500);
  expect(finals.map(body => body.subject), "minden kérés az eredeti (sorba kerüléskori) címkét viszi — címke nélküli régi alak nem megy").toStrictEqual(["anon"]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("websuli:result-outbox:v1:")).length), "elküldve: kikerült a sorból").toBe(0);
});

test("R40 / L2: a tokenre várás közben lejár a bejegyzés (7 nap) → a lejárt eredmény nem megy ki, és kikerül a sorból", async ({ page }) => {
  await enableOutbox(page); // tartós sor (BE)
  await seedOutbox(page, { subject: "anon", activityOffsetMs: -7 * 86_400_000 + 2500 });
  await mockWith(page);
  await page.route("**/api/csrf-token", async route => {
    await new Promise(resolve => setTimeout(resolve, 4000));
    try { await route.fulfill({ json: { csrfToken: "test", resultApi: 2, resultSubject: "anon" } }); } catch { /* a lap közben bezárult */ }
  });
  const finals: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial !== true) finals.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("websuli:result-outbox:v1:")).length), { timeout: 10_000, message: "a lejárt bejegyzés kikerült" }).toBe(0);
  await page.waitForTimeout(1000);
  expect(finals, "a POST pillanatában lejárt bejegyzés nem megy ki").toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("seed:quiz:sent:round-seeded")), "nem jelölődik elküldöttnek").toBeNull();
});

/* Szűkítés (tulajdonosi döntés, 2026-11-21) és gépi vak ellenőrzés, 8. kör (GPT-6.2 Sol, e36518e5), terv R43–R44 + a kapcsoló. */
test("Kapcsoló KI (alap): a tartós sorba nem kerül semmi, induláskor nincs ürítés — a befejezett kör mégis kimegy, pontosan egyszer", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __outboxWrites: string[] };
    w.__outboxWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("websuli:result-outbox:v1")) w.__outboxWrites.push(key);
      return original.call(this, key, value);
    };
  });
  // Egy korábbi (BE állású) buildből maradt bejegyzés: KI állásban az induló ürítés nem nyúl hozzá.
  await seedOutbox(page, { subject: "anon", activityOffsetMs: 0 });
  await mockWith(page);
  const finals: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial !== true) finals.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(2000);
  expect(finals, "induláskor nincs ürítés").toHaveLength(0);
  await answerAll(page);
  await expect.poll(() => finals.length, { message: "a befejezett kör közvetlenül kiment" }).toBe(1);
  expect(finals[0].roundId).not.toBe("round-seeded");
  expect(Object.values(finals[0].picks as Record<string, number>).filter(pick => pick >= 0)).toHaveLength(25);
  await page.waitForTimeout(1500);
  expect(finals, "pontosan egyszer").toHaveLength(1);
  expect(await page.evaluate(() => (window as unknown as { __outboxWrites: string[] }).__outboxWrites), "a tartós sor kulcsára nem ír").toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("websuli:result-outbox:v1:"))), "a korábbi bejegyzés érintetlen (nincs ürítés)")
    .toEqual(["websuli:result-outbox:v1:lesson-q|quiz|round-seeded"]);
});

test("R43 / L1 (KI állás, lapon belüli újrapróba): címke nélkül felvett kör, a tokenkérés bukik, utána MÁSIK fiók tokenje → a kör nem kapja meg az új fiók címkéjét", async ({ page }) => {
  await page.clock.install();
  await mockWith(page);
  let failTokens = true;
  await page.route("**/api/csrf-token", route => (failTokens ? route.fulfill({ status: 502, body: "Bad Gateway" }) : route.fulfill({ json: { csrfToken: "test", resultApi: 2, resultSubject: "fiok-b" } })));
  const finals: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial !== true) finals.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await answerAll(page); // a token előtöltése is bukott: a kör címke nélkül kerül a (memóriabeli) sorba, az első kísérlet tokenhibán áll meg
  await page.waitForTimeout(1500);
  expect(finals, "tokenhiba mellett nem ment el").toHaveLength(0);
  failTokens = false; // közben egy másik fülben B fiók lépett be: a token már az ő munkamenetéé
  await page.clock.fastForward(31_000);
  await expect.poll(() => finals.length, { timeout: 15_000, message: "a lapon belüli újrapróba kiküldte" }).toBe(1);
  expect(finals[0].subject, "a felvételkori kilét ismeretlen: fiók nélküliként megy, nem B nevén").toBe("?");
});

test("R44 / L2: a válasz nélkül függő pillanatkép-kérés határideje után ugyanaz az állapot újra küldhető", async ({ page }) => {
  await page.clock.install();
  const posts = await mockWith(page);
  let held = 0;
  await page.route("**/api/lessons/lesson-q/results", async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial === true && held === 0) { held++; return; } // az első pillanatkép válasz nélkül függ (a kapcsolat nem felel)
    posts.push({ lesson: "lesson-q", body });
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 2; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800); // a CSRF-token előzetes lekérése
  await hide(page);
  await expect.poll(() => held).toBe(1);
  await hide(page);
  await page.waitForTimeout(500);
  expect(partialsOf(posts), "a függő kérés alatt ugyanaz az állapot nem megy újra").toHaveLength(0);
  await page.clock.fastForward(16_000); // a kérés határideje (15 s) letelik
  await page.waitForTimeout(300);
  await hide(page);
  await expect.poll(() => partialsOf(posts).length, { message: "a határidő után ugyanaz az állapot újra elment" }).toBe(1);
  expect(answeredIn(partialsOf(posts)[0].body)).toBe(2);
});

/* Gépi vak ellenőrzés, 9. kör (GPT-6.2 Sol, 87631382, 2026-11-22), terv R47: a kilét a kör első tevékenységekor rögzül. */
const LEARNER_A = "tanulo-aaaa.1.AAAAAAAAAAAAAAAAAAAAAA";
const LEARNER_B = "tanulo-bbbb.1.BBBBBBBBBBBBBBBBBBBBBB";

test("R47 / L1 (KI állás): a kör első tevékenységekor még nincs ismert fiók, az első (sikeres, de késői) tokenválasz már B fiókjáé → a kör nem kapja meg B címkéjét", async ({ page }) => {
  await mockWith(page);
  let tokenCalls = 0;
  await page.route("**/api/csrf-token", async route => {
    tokenCalls++;
    if (tokenCalls === 1) await new Promise(resolve => setTimeout(resolve, 10_000)); // közben egy másik fülben B fiók lépett be
    try { await route.fulfill({ json: { csrfToken: "test", resultApi: 2, resultSubject: "fiok-b" } }); } catch { /* a lap közben bezárult */ }
  });
  const finals: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial !== true) finals.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await answerAll(page);
  await expect.poll(() => finals.length, { timeout: 25_000, message: "a lezárt kör kiment" }).toBe(1);
  expect(finals[0].subject, "a felvételkor ismeretlen kilét nem pótolható a későbbi munkamenetből").toBe("?");
});

test("R47 / L2: nyitva hagyott leckefül, közben újrapárosítás (B tanuló linkje) → A válaszai nem mennek B párosításával (sem a pillanatkép, sem a végleges)", async ({ page }) => {
  await page.addInitScript(token => { if (!sessionStorage.getItem("paired")) { sessionStorage.setItem("paired", "1"); localStorage.setItem("websuli.learnerToken", token); } }, LEARNER_A);
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  await quiz.nth(0).locator("button.lesson-option").first().click(); // A első válasza
  await page.waitForTimeout(800);
  await page.evaluate(token => localStorage.setItem("websuli.learnerToken", token), LEARNER_B); // B párosító linkje egy másik fülben
  await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); });
  await expect.poll(() => partialsOf(posts).length).toBe(1);
  expect(partialsOf(posts)[0].body.learner, "a pillanatkép nem B párosításával megy").toBeUndefined();
  for (let i = 1; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => finalsOf(posts).length).toBe(1);
  expect(finalsOf(posts)[0].body.learner, "a végleges sem B párosításával megy").toBeUndefined();
});

test("R47 / kontroll: változatlan párosítás mellett a pillanatkép és a végleges is a párosított tanulóval megy", async ({ page }) => {
  await page.addInitScript(token => { localStorage.setItem("websuli.learnerToken", token); }, LEARNER_A);
  const posts = await mockWith(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  await quiz.nth(0).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); });
  await expect.poll(() => partialsOf(posts).length).toBe(1);
  expect(partialsOf(posts)[0].body.learner).toBe(LEARNER_A);
  expect(partialsOf(posts)[0].body.subject, "a mock token címke nélküli: ismeretlen fiók").toBe("?");
  for (let i = 1; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => finalsOf(posts).length).toBe(1);
  expect(finalsOf(posts)[0].body.learner).toBe(LEARNER_A);
});

test("R48 / L4: a pillanatkép késői 202-je a véglegesítés után nem írja vissza a részleges jelzőt", async ({ page }) => {
  const posts = await mockWith(page);
  let held: import("@playwright/test").Route | null = null;
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial === true && held === null) { held = route; return; } // az első pillanatkép válasza késik
    posts.push({ lesson: "lesson-q", body });
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  await quiz.nth(0).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await hide(page);
  await expect.poll(() => held !== null).toBe(true);
  for (let i = 1; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => finalsOf(posts).length).toBe(1);
  const partialKeys = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.includes(":quiz:partial:")));
  expect(await partialKeys(), "a végleges siker után nincs részleges jelző").toEqual([]);
  await held!.fulfill({ status: 202, json: { queued: true, partial: true } });
  await page.waitForTimeout(800);
  expect(await partialKeys(), "a késői 202 sem írja vissza").toEqual([]);
});

/* Gépi vak ellenőrzés, 10. kör (GPT-6.2 Sol, 025d3d34, 2026-11-22), terv R49: az eredmény soha nem mehet olyan úton, ahol a szerver a
   rögzítettől eltérő kilétet rendelhet hozzá. */
async function identityMock(page: Page, onFinal: (n: number, body: Record<string, unknown>, state: { subject: string; legacy: boolean }) => Promise<number>) {
  await mockWith(page);
  const state = { subject: "anon", legacy: false };
  await page.route("**/api/csrf-token", route => route.fulfill({ json: state.legacy ? { csrfToken: "legacy" } : { csrfToken: `${state.subject}-token`, resultApi: 2, resultSubject: state.subject } }));
  const finals: Array<Record<string, unknown>> = [];
  const partials: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial === true) { partials.push(body); return route.fulfill({ status: 202, json: { queued: true, partial: true } }); }
    finals.push(body);
    const status = await onFinal(finals.length, body, state);
    return route.fulfill({ status, json: { message: status === 403 ? "Invalid CSRF token" : status === 400 ? "Érvénytelen beküldés." : "ok", ...(status === 202 ? { queued: true } : {}) } });
  });
  return { finals, partials, state };
}

test("R49 / L1 (a): 403 után más fiók V2-tokenje, majd egy régi példány 400-at ad → a régi (címke nélküli) alakú ismétlés NEM megy el", async ({ page }) => {
  const { finals } = await identityMock(page, async (n, _body, state) => {
    if (n === 1) { state.subject = "fiok-b"; return 403; } // közben B fiók lépett be egy másik fülön
    if (n === 2) return 400; // telepítési átfedés: egy még régi példány az új mezőkre
    return 202;
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await answerAll(page);
  await expect.poll(() => finals.length).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(2500);
  expect(finals.map(body => body.subject), "csak a rögzített címkével ment; címke nélküli (régi alakú) kérés nincs").toStrictEqual(["anon", "anon"]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes(":quiz:sent:"))), "nem jelölődött elküldöttnek").toEqual([]);
});

test("R49 / L1 (a): 403 után a frissített token egy régi (jelzés nélküli) példányé, a kör rögzített fiókcímkéje nem igazolható → nincs régi alakú kérés", async ({ page }) => {
  const { finals } = await identityMock(page, async (n, _body, state) => {
    if (n === 1) { state.legacy = true; return 403; }
    return 202;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await answerAll(page);
  await expect.poll(() => finals.length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(2500);
  expect(finals.map(body => body.subject), "a rögzített címke nem igazolható a régi példány felé: a bejegyzés vár").toStrictEqual(["anon"]);
});

test("R49 / L2 (b): a végleges kérés 403-a alatt újrapárosul az eszköz → az ismétlés nem a lecserélt (A) párosítással megy", async ({ page }) => {
  await page.addInitScript(token => { if (!sessionStorage.getItem("paired")) { sessionStorage.setItem("paired", "1"); localStorage.setItem("websuli.learnerToken", token); } }, LEARNER_A);
  const { finals } = await identityMock(page, async n => {
    if (n === 1) { await page.evaluate(token => localStorage.setItem("websuli.learnerToken", token), LEARNER_B); return 403; }
    return 202;
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await answerAll(page);
  await expect.poll(() => finals.length).toBe(2);
  expect(finals[0].learner, "az első kérés még A-val (a rögzített párosítás)").toBe(LEARNER_A);
  expect(finals[1].learner, "a 403 utáni ismétlés a lecserélt A tokent nem küldi újra").toBeUndefined();
});

test("R49 / L2 (b): a pillanatkép 403-a alatt újrapárosul az eszköz → a pillanatkép ismétlése párosítás nélkül megy", async ({ page }) => {
  await page.addInitScript(token => { if (!sessionStorage.getItem("paired")) { sessionStorage.setItem("paired", "1"); localStorage.setItem("websuli.learnerToken", token); } }, LEARNER_A);
  await mockWith(page);
  await page.route("**/api/csrf-token", route => route.fulfill({ json: { csrfToken: "t", resultApi: 2, resultSubject: "anon" } }));
  const partials: Array<Record<string, unknown>> = [];
  await page.route("**/api/lessons/lesson-q/results", async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.partial !== true) return route.fulfill({ status: 202, json: { queued: true } });
    partials.push(body);
    if (partials.length === 1) { await page.evaluate(token => localStorage.setItem("websuli.learnerToken", token), LEARNER_B); return route.fulfill({ status: 403, json: { message: "Invalid CSRF token" } }); }
    return route.fulfill({ status: 202, json: { queued: true, partial: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  await quiz.nth(0).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); });
  await expect.poll(() => partials.length).toBe(2);
  expect(partials[0].learner).toBe(LEARNER_A);
  expect(partials[1].learner, "a 403 utáni ismétlés nem a lecserélt párosítással").toBeUndefined();
});

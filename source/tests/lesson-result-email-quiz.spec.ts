import { expect, test, type Page } from "@playwright/test";
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
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
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
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
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
  const state = { valid: "token-1", tokenStatus: 200, tokenCalls: 0, rejected: [] as string[], accepted: [] as Array<{ token: string; body: Record<string, unknown> }> };
  await mockWith(page);
  await page.route("**/api/csrf-token", route => { state.tokenCalls++; return state.tokenStatus === 200 ? route.fulfill({ json: { csrfToken: state.valid } }) : route.fulfill({ status: state.tokenStatus, json: { message: "hiba" } }); });
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
 * Terv R10 — telepítési sorrend: a kliens (Vercel) a szerver (Render) előtt települhet. A „régi szerver” csonk a főág szigorú sémáját
 * utánozza: az új mezőket (`startedAt`, `lastAnsweredAt`, `partial`) tartalmazó törzset 400-zal utasítja el, a régi alakot elfogadja.
 */
async function mockOldServer(page: Page) {
  const state = { rejected: [] as Array<Record<string, unknown>>, accepted: [] as Array<Record<string, unknown>> };
  await mockWith(page);
  await page.route("**/api/lessons/lesson-q/results", route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (["startedAt", "lastAnsweredAt", "partial"].some(field => field in body)) { state.rejected.push(body); return route.fulfill({ status: 400, json: { message: "Érvénytelen beküldés." } }); }
    state.accepted.push(body);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  return state;
}

test("R10: „régi szerver” mellett a kvíz végleges kérése sikerül (400 után egy ismétlés az új mezők nélkül); a pillanatkép NEM alakul végleges beküldéssé", async ({ page }) => {
  const old = await mockOldServer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const quiz = await openQuiz(page);
  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800);
  await hide(page);
  await expect.poll(() => old.rejected.length, { message: "a pillanatkép a régi szerverhez ért (és elutasította)" }).toBe(1);
  await page.waitForTimeout(800);
  expect(old.accepted, "a pillanatkép nem ment át végleges (partial nélküli) alakban").toHaveLength(0);
  for (let i = 3; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => old.accepted.length, { message: "a végleges kvíz az új mezők nélkül elfogadva" }).toBe(1);
  const accepted = old.accepted[0];
  expect(accepted.kind).toBe("quiz");
  expect(accepted).not.toHaveProperty("startedAt");
  expect(accepted).not.toHaveProperty("lastAnsweredAt");
  expect(accepted).not.toHaveProperty("partial");
  expect(Object.values(accepted.picks as Record<string, number>).filter(pick => pick >= 0)).toHaveLength(25);
  expect(old.rejected.filter(body => body.partial !== true), "a végleges kérés első (új mezős) kísérlete").toHaveLength(1);
  await page.waitForTimeout(1000);
  expect(old.accepted, "pontosan egy végleges kérés ment át").toHaveLength(1);
  await page.reload();
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await page.waitForTimeout(1200);
  expect(old.accepted, "a sikeres visszalépés után a kör elküldöttként rögzült").toHaveLength(1);
});

test("R10: „régi szerver” mellett a feladatok végleges kérése is sikerül az új mezők nélkül", async ({ page }) => {
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
  expect(old.rejected.filter(body => body.kind === "tasks"), "az első kísérlet új mezővel ment").toHaveLength(1);
});

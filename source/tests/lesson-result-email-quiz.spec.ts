import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { resultRequestSchema } from "../shared/lesson-result-email";

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
  // B1b (R2): a kör kezdete és az utolsó válasz ideje a törzsben — a szerver szigorú sémája (B1a) elfogadja.
  expect(resultRequestSchema.safeParse(sent).success, "a törzs megfelel a szerver sémájának").toBe(true);
  expect(typeof sent.startedAt === "number" && (sent.startedAt as number) > 0).toBe(true);
  expect(typeof sent.lastAnsweredAt === "number" && (sent.lastAnsweredAt as number) >= (sent.startedAt as number)).toBe(true);
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

// --- Eredmény-e-mail B1b (R2): a 7 napos korhatár az UTOLSÓ VÁLASZHOZ mér ---

/** A beküldés szervere kapcsolható: hibánál 500-at ad (a kliens újrapróbál, a kör „elküldetlen” marad), különben rögzít és 202-t ad. */
async function switchableMock(page: Page) {
  const accepted: Array<Record<string, unknown>> = [];
  const state = { fail: true, attempts: 0 };
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-q/results" && req.method() === "POST") {
      state.attempts++;
      if (state.fail) return route.fulfill({ status: 500, json: { message: "hiba" } });
      accepted.push(req.postDataJSON());
      return route.fulfill({ status: 202, json: { queued: true } });
    }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/quiz-fixture") return route.fulfill({ json: { id: "quiz-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/quiz-fixture") return route.fulfill({ json: { lessonId: "lesson-q", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  return { accepted, state };
}

const DAY = 86_400_000;
const T0 = new Date("2026-11-02T10:00:00+01:00").getTime();

/** Megnyitja a kvízt, megválaszolja mind a 25 kérdést (a szerver ekkor hibázik), majd megvárja, hogy az újrapróbák elfogyjanak. */
async function answerAllWhileFailing(page: Page, attempts: () => number) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  return { quiz, finish: async () => { await page.clock.runFor(60_000); expect(attempts(), "az első beküldés megpróbálta, de nem ért célba").toBeGreaterThan(0); } };
}

async function reloadAndCount(page: Page) {
  await page.reload();
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await expect(page.locator("[data-quiz-id]")).toHaveCount(25);
  await page.clock.runFor(5_000);
  await page.waitForTimeout(1500);
}

for (const sample of [{ days: 8, sends: 0, name: "8 nappal az utolsó válasz után a le nem zárt, elküldetlen kör már nem megy el" }, { days: 6, sends: 1, name: "6 nappal az utolsó válasz után az elküldetlen kör még elmegy" }]) {
  test(`B1b korhatár: ${sample.name}`, async ({ page }) => {
    const { accepted, state } = await switchableMock(page);
    await page.clock.install({ time: new Date(T0) });
    const { quiz, finish } = await answerAllWhileFailing(page, () => state.attempts);
    for (let i = 0; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
    await finish();
    expect(accepted).toHaveLength(0);

    await page.clock.setSystemTime(new Date(T0 + sample.days * DAY));
    state.fail = false;
    const before = state.attempts;
    await reloadAndCount(page);
    expect(accepted.filter(p => p.kind === "quiz")).toHaveLength(sample.sends);
    if (!sample.sends) expect(state.attempts, "elavult körnél a kérés el sem indul").toBe(before);
  });
}

// 1. vak kör L1 + L3: a korhatár az UTOLSÓ VÁLASZHOZ mér, nem a kezdéshez.
test("B1b korhatár: 8 napja megnyitott, de MA megválaszolt kör elmegy (a kezdés ideje nem számít)", async ({ page }) => {
  const { accepted, state } = await switchableMock(page);
  await page.clock.install({ time: new Date(T0) });
  const { quiz, finish } = await answerAllWhileFailing(page, () => state.attempts);
  await quiz.nth(0).locator("button.lesson-option").first().click(); // a kör 8 nappal a többi válasz előtt indul
  await page.clock.setSystemTime(new Date(T0 + 8 * DAY));
  for (let i = 1; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await finish();
  state.fail = false;
  await reloadAndCount(page);
  const sent = accepted.filter(p => p.kind === "quiz");
  expect(sent).toHaveLength(1);
  expect((sent[0].lastAnsweredAt as number) - (sent[0].startedAt as number)).toBeGreaterThanOrEqual(8 * DAY - 60_000);
});

test("B1b korhatár: a régi kliens által tárolt kör (válaszidő nélkül) 8 nap múlva is elmegy — a kor ismeretlen, nem elavult", async ({ page }) => {
  const { accepted, state } = await switchableMock(page);
  await page.clock.install({ time: new Date(T0) });
  const { quiz, finish } = await answerAllWhileFailing(page, () => state.attempts);
  for (let i = 0; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await finish();
  // A B1b előtti kliens formátuma: a tárolt körből kivesszük az utolsó válasz idejét.
  const stripped = await page.evaluate(() => {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? "null");
        if (value && typeof value === "object" && "lastAnsweredAt" in value) { delete value.lastAnsweredAt; localStorage.setItem(key, JSON.stringify(value)); n++; }
      } catch { /* nem JSON érték */ }
    }
    return n;
  });
  expect(stripped, "volt tárolt kör válaszidővel").toBeGreaterThan(0);
  await page.clock.setSystemTime(new Date(T0 + 8 * DAY));
  state.fail = false;
  await reloadAndCount(page);
  const sent = accepted.filter(p => p.kind === "quiz");
  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toHaveProperty("lastAnsweredAt");
});

// --- Eredmény-e-mail B2 (docs/specs/2026-11-22-eredmeny-email-bontas.md): a végleges beküldés hálózati rétege (#510 R4, R8, R23, R26, R37) ---

type SeenResult = { keepalive: boolean; method: string; kind: string; token: string };
/** A `/results` kérések megfigyelése a lapon belül (a `fetch` hívásai): `keepalive`, mód, fajta, CSRF-fejléc. */
async function spyResults(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __results: SeenResult[] };
    w.__results = [];
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/\/api\/lessons\/[^/]+\/results$/.test(target)) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { kind?: string };
        w.__results.push({ keepalive: init?.keepalive === true, method: init?.method ?? "GET", kind: body.kind ?? "", token: new Headers(init?.headers).get("X-CSRF-Token") ?? "" });
      }
      return original(input, init);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __results: SeenResult[] }).__results);
}

async function openQuiz(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  return quiz;
}
async function answerAll(page: Page) {
  await openQuiz(page);
  await answerAllHere(page);
}
/** A már megnyitott lapon (navigáció nélkül — a CSRF-token gyorsítótára és a fetch-figyelő megmarad) a Kvíz fül mind a 25 kérdése. */
async function answerAllHere(page: Page) {
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  for (let i = 0; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
}
async function submitTasks(page: Page) {
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  await page.locator("[data-task-id]").first().locator("textarea").fill("Az alap és a magasság szorzatának a fele.");
  await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
  await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
}

/** R4: munkamenethez kötött CSRF-token utánzása — a tokenek sorszámozottak (t1, t2, …); a szerver csak az érvényeset fogadja el. */
async function mockCsrf(page: Page) {
  const state = { valid: "t2", tokenCalls: 0, rejected: [] as string[], accepted: [] as Array<{ token: string; kind: string }> };
  await mock(page);
  await page.route("**/api/csrf-token", route => { state.tokenCalls++; return route.fulfill({ json: { csrfToken: `t${state.tokenCalls}` } }); });
  await page.route("**/api/lessons/lesson-q/results", route => {
    const token = route.request().headers()["x-csrf-token"] ?? "";
    if (token !== state.valid) { state.rejected.push(token); return route.fulfill({ status: 403, json: { message: "invalid csrf token" } }); }
    state.accepted.push({ token, kind: String((route.request().postDataJSON() as { kind?: string }).kind) });
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  return state;
}

test("B2 / R8: a kvíz végleges kérése keepalive-os, CSRF-fejléces POST; a feladatoké nem keepalive (64 KB-os keret)", async ({ page }) => {
  const seen = await spyResults(page);
  const posts = await mock(page);
  await openQuiz(page);
  await submitTasks(page);
  await expect.poll(() => posts.filter(p => p.kind === "tasks").length).toBe(1);
  await answerAllHere(page);
  await expect.poll(() => quizPosts(posts).length).toBe(1);
  const results = await seen();
  expect(results.every(r => r.method === "POST" && r.token === "test"), "minden eredménykérés CSRF-fejléces POST").toBe(true);
  expect(results.filter(r => r.kind === "quiz").map(r => r.keepalive), "a kvíz végleges kérése keepalive (a lapbezárás nem szakítja meg)").toEqual([true]);
  expect(results.filter(r => r.kind === "tasks").map(r => r.keepalive), "a feladatok törzse meghaladhatja a keepalive keretét").toEqual([false]);
});

test("B2 / R4: lejárt token — a végleges kérés 403 után új tokent kér és EGYSZER ismétel; az ismétlés is keepalive", async ({ page }) => {
  const seen = await spyResults(page);
  const state = await mockCsrf(page);
  await answerAll(page);
  await expect.poll(() => state.accepted.length).toBe(1);
  await page.waitForTimeout(1500);
  expect(state.accepted).toEqual([{ token: "t2", kind: "quiz" }]);
  expect(state.rejected, "csak a lejárt token kapott 403-at").toEqual(["t1"]);
  expect(state.tokenCalls).toBe(2);
  expect((await seen()).map(r => r.keepalive), "az első kérés és a 403 utáni ismétlés is keepalive").toEqual([true, true]);
});

test("B2 / R23: ha a friss tokennel ismételt kérés is 403, a token nem marad a gyorsítótárban — a következő írás új tokent kér", async ({ page }) => {
  const state = await mockCsrf(page);
  state.valid = "egyik-sem";
  await openQuiz(page);
  await submitTasks(page);
  await expect.poll(() => state.rejected.length).toBe(2);
  await page.waitForTimeout(1500);
  expect(state.rejected, "a feladatok kérése: lejárt token, majd a friss is 403 — több kísérlet nincs (a 403 nem újrapróbálható)").toEqual(["t1", "t2"]);
  state.valid = "t3";
  await answerAllHere(page);
  await expect.poll(() => state.accepted.filter(a => a.kind === "quiz").length).toBe(1);
  await page.waitForTimeout(1500);
  // (A sikertelen feladat-kör a nézet újrarenderelésekor újra beküldődhet — a főágon is így van; az is a friss tokennel megy.)
  expect(state.accepted.every(a => a.token === "t3"), "minden elfogadott kérés a friss tokennel ment").toBe(true);
  expect(state.rejected, "a kétszer elutasított token nem megy újra").toEqual(["t1", "t2"]);
  expect(state.tokenCalls).toBe(3);
});

test("B2 / R26: folyamatos 503 mellett nincs beágyazott újrapróba — laponként legfeljebb 3 kérés, azonnali ismétlés nélkül (30 s, majd 60 s)", async ({ page }) => {
  await mock(page);
  let finals = 0;
  await page.route("**/api/lessons/lesson-q/results", route => { finals++; return route.fulfill({ status: 503, json: { message: "átmeneti hiba" } }); });
  await page.clock.install({ time: new Date(T0) });
  await answerAll(page);
  await expect.poll(() => finals).toBe(1);
  await page.clock.runFor(6_000);
  await page.waitForTimeout(500);
  expect(finals, "6 s alatt egyetlen POST (a főágon 1 + 3 gyors belső újrapróba volt)").toBe(1);
  await page.clock.runFor(30_000);
  await expect.poll(() => finals).toBe(2);
  await page.clock.runFor(65_000);
  await expect.poll(() => finals).toBe(3);
  await page.clock.runFor(10 * 60_000);
  await page.waitForTimeout(500);
  expect(finals, "a harmadik kísérlet után a lapon nincs több (a következő betöltéskor a kör újra megy)").toBe(3);
  // PR #556 review (Copilot): a kör lezárása (új `round` érték, az effekt újrafut) sem nyit új, háromkísérletes keretet ugyanarra a körre.
  await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
  await expect(page.locator(".fusion-panel-quiz")).toHaveAttribute("data-finished", "true");
  await page.clock.runFor(10 * 60_000);
  await page.waitForTimeout(500);
  expect(finals, "a lezárás után sem indul újabb kísérlet ezen a lapon").toBe(3);
});

test("B2 / R2 + R26 (PR #556 review): az újrapróba várakozása alatt elavult (8 napja megválaszolt, le nem zárt) kör nem megy el", async ({ page }) => {
  const { accepted, state } = await switchableMock(page);
  await page.clock.install({ time: new Date(T0) });
  await answerAll(page);
  await expect.poll(() => state.attempts).toBe(1);
  // A lap az újrapróba várakozása alatt „alszik” (pl. felfüggesztett laptop), közben a szerver helyreáll.
  await page.clock.setSystemTime(new Date(T0 + 8 * DAY));
  state.fail = false;
  await page.clock.runFor(2 * 60_000);
  await page.waitForTimeout(500);
  expect(state.attempts, "a korhatárt minden kísérlet előtt újra nézi").toBe(1);
  expect(accepted).toHaveLength(0);
});

test("B2 / R26 + R37 (PR #556 review): a 403 utáni tokenfrissítés 15 s-os határideje újrapróbálható hiba — a kör a következő kísérlettel elmegy", async ({ page }) => {
  await mock(page);
  const state = { tokenCalls: 0, hang: true, accepted: [] as string[], rejected: [] as string[] };
  await page.route("**/api/csrf-token", route => {
    state.tokenCalls++;
    if (state.tokenCalls === 1) return route.fulfill({ json: { csrfToken: "t1" } });
    if (state.hang) return; // a frissítés nem válaszol
    return route.fulfill({ json: { csrfToken: `t${state.tokenCalls}` } });
  });
  await page.route("**/api/lessons/lesson-q/results", route => {
    const token = route.request().headers()["x-csrf-token"] ?? "";
    if (token === "t1") { state.rejected.push(token); return route.fulfill({ status: 403, json: { message: "invalid csrf token" } }); }
    state.accepted.push(token);
    return route.fulfill({ status: 202, json: { queued: true } });
  });
  await page.clock.install({ time: new Date(T0) });
  await answerAll(page);
  await expect.poll(() => state.tokenCalls).toBe(2);
  expect(state.rejected).toEqual(["t1"]);
  await page.clock.runFor(16_000); // a frissítés határideje lejár
  state.hang = false;
  await page.clock.runFor(31_000); // az első újrapróba (30 s)
  await expect.poll(() => state.accepted.length).toBe(1);
  expect(state.accepted[0], "az újrapróba friss tokennel ment").toMatch(/^t[3-9]$/);
});

test("B2 / R37: a 202-es fejlécek után megakadó választest olvasását az időkorlát megszakítja", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { started: 0, aborted: 0 };
    (window as unknown as { __stalled: typeof state }).__stalled = state;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/\/api\/lessons\/lesson-q\/results$/.test(url) && init?.method === "POST") {
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
  await mock(page);
  await answerAll(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __stalled: { started: number } }).__stalled.started)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __stalled: { aborted: number } }).__stalled.aborted), { timeout: 5000, message: "a megakadt törzs olvasását az időkorlát megszakította" }).toBe(1);
});

test("B2 / R37: a választ nem adó CSRF-token-lekérésnek saját, 15 s-os határideje van — a végleges kérés nem ragad be", async ({ page }) => {
  test.setTimeout(60_000);
  const posts = await mock(page);
  await page.route("**/api/csrf-token", () => { /* soha nem válaszol */ });
  await answerAll(page);
  await page.waitForTimeout(5_000);
  expect(quizPosts(posts), "a határidő előtt még vár a tokenre").toHaveLength(0);
  await expect.poll(() => quizPosts(posts).length, { timeout: 25_000, message: "a határidő után a kérés elindul (a szerver dönt a token nélküli kérésről)" }).toBe(1);
});

/**
 * JM3a — ONLINE párbaj két böngészőkontextussal, a BUILDELT szerveren, VALÓDI Socket.IO-val (terv JM-A3, JM-A4, JM-A5
 * első fele, D21). A teszt saját szerverpéldányokat indít a már elkészült `dist/index.js`-ből (a Playwright `webServer`-e
 * építi): egyet `MP_MODE=on`, egyet `MP_MODE=admin` beállítással — így a többi e2e-teszt szervere érintetlen marad.
 *
 *  - A (párosított tanulói profillal) szobát nyit, B (vendég) a kóddal belép → váróterem, „Kész”, indítás, teljes meccs
 *    érintéssel → győzteshirdetés mindkét kontextusban → visszavágó;
 *  - csak-polling szállítás (a Vercel-továbbítás szimulációja) + B hálózata kör közben megszakad (`setOffline`) és visszatér;
 *  - A kilép meccs közben → B győz („az ellenfeled kilépett”);
 *  - érvénytelen / nem létező kód; vendég nem nyithat szobát (ACCOUNT_REQUIRED);
 *  - `admin` módban az admin (Node-kliens, admin-munkamenettel) nyit, a NEM admin gyerek a linkről csatlakozik és végigjátszik,
 *    de szobát nem nyithat.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { io as ioClient } from "socket.io-client";

import { connectRt } from "../client/src/lib/rt/rtClient";
import { answerNextRound, assertMobileQuality, playToResult, probe, shot } from "./support/duel-e2e";
import { emulateSafeArea, waitForStable } from "./support/game-mobile-quality";
import { expectMetaScreenOk, insetsFor, metaShot } from "./support/game-meta-quality";

test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "block" });

type Srv = { url: string; proc: ChildProcess; logs: string[] };
const cwd = fileURLToPath(new URL("../", import.meta.url));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, () => {
      const a = s.address();
      s.close(() => (typeof a === "object" && a ? resolve(a.port) : reject(new Error("nincs szabad port"))));
    });
  });
}

async function startServer(mode: "on" | "admin"): Promise<Srv> {
  const port = await freePort();
  const logs: string[] = [];
  const proc = spawn(process.execPath, ["dist/index.js"], {
    cwd,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), WEBSULI_E2E: "1", MP_MODE: mode, MP_GAMES: "parbaj" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  proc.stdout?.on("data", (d) => logs.push(String(d)));
  proc.stderr?.on("data", (d) => logs.push(String(d)));
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${url}/api/rt/status`);
      if (r.ok && (await r.json()).enabled === true) return { url, proc, logs };
    } catch {
      /* még indul */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error(`a(z) MP_MODE=${mode} szerver nem indult el:\n${logs.join("").slice(-2000)}`);
}

let on: Srv;
let admin: Srv;
let learnerToken = "";
let adminCookie = "";
const db = () => new pg.Client({ connectionString: process.env.DATABASE_URL });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  [on, admin] = await Promise.all([startServer("on"), startServer("admin")]);
  const secret = process.env.LEARNER_LINK_SECRET || process.env.SESSION_SECRET!;
  const c = db();
  await c.connect();
  try {
    // A: párosított tanulói profil (D21: szobát nyithat) — a token a szerver saját HMAC-szabályával.
    // Review #464 ÚJ-4: a `learners` neve egyedi (`learners_name_lower_unique`) — futásonként egyedi név, különben ugyanazon az
    // adatbázison az újrafuttatás (és a CI `retries`-e) biztosan elbukna.
    const runTag = randomBytes(4).toString("hex");
    const learnerId = `e2e-duel-learner-${runTag}`;
    await c.query(`INSERT INTO learners (id, name, grade) VALUES ($1, $2, $3)`, [learnerId, `Párbaj Teszt ${runTag}`, 5]);
    learnerToken = `${learnerId}.1.${createHmac("sha256", secret).update(`${learnerId}.1`).digest("base64url").slice(0, 22)}`;
    // Admin-munkamenet a `session` táblában (mint az authz-db-harness): az admin módú szobát ezzel nyitja egy Node-kliens.
    const adminId = `e2e-duel-admin-${randomBytes(4).toString("hex")}`;
    await c.query(`INSERT INTO users (id, email, first_name, last_name, is_admin) VALUES ($1, $2, 'E2E', 'Admin', true)`, [adminId, `${adminId}@example.invalid`]);
    const sid = randomBytes(24).toString("base64url");
    const sig = createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
    adminCookie = `connect.sid=${encodeURIComponent(`s:${sid}.${sig}`)}`;
    // A `session` táblát a munkamenet-tár az ELSŐ olvasáskor hozza létre (createTableIfMissing): egy aláírt, még üres
    // munkamenettel tett kérés ezt kiváltja — így a teszt nem futtat DDL-t.
    await fetch(`${admin.url}/api/auth/user`, { headers: { cookie: adminCookie } });
    const expires = new Date(Date.now() + 3_600_000);
    const sess = { cookie: { originalMaxAge: 3_600_000, expires: expires.toISOString(), secure: false, httpOnly: true, path: "/", sameSite: "lax" }, passport: { user: adminId } };
    await c.query(`INSERT INTO session (sid, sess, expire) VALUES ($1, $2, $3)`, [sid, JSON.stringify(sess), expires]);
  } finally {
    await c.end();
  }
});

test.afterAll(async () => {
  for (const s of [on, admin]) s?.proc.kill();
});

async function phone(browser: Browser, base: string, viewport: { width: number; height: number }, opts: { learner?: boolean } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], viewport, baseURL: base, serviceWorkers: "block" });
  await ctx.addInitScript(
    ([token, withLearner]) => {
      try {
        localStorage.setItem("websuli.classroomGrade", "5");
        if (withLearner) localStorage.setItem("websuli.learnerToken", token as string);
      } catch {
        /* tároló nélkül */
      }
    },
    [learnerToken, !!opts.learner] as const,
  );
  const page = await ctx.newPage();
  return { ctx, page };
}

/** A nyit egy szobát a felületen (a tanulói profillal), visszaadja a kódot. */
async function openRoom(page: Page, query = ""): Promise<string> {
  await page.goto(`/games/parbaj${query}`);
  await expect(page.getByTestId("duel-create")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("duel-create").tap();
  await page.getByTestId("duel-grade-5").tap();
  await page.getByTestId("duel-go").tap();
  await expect(page.getByTestId("duel-lobby")).toBeVisible({ timeout: 20_000 });
  const code = ((await page.getByTestId("duel-room-code").textContent()) ?? "").replace(/\s/g, "");
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  return code;
}

/** B a kóddal (gépelve) vagy a linkről lép be, és jelzi, hogy kész. */
async function joinRoom(page: Page, code: string, via: "code" | "link", grade = 4, query = ""): Promise<void> {
  if (via === "link") {
    await page.goto(`/games/parbaj/${code}${query}`);
  } else {
    await page.goto(`/games/parbaj${query}`);
    await page.getByTestId("duel-join").tap();
    await page.getByTestId("duel-code-input").fill(code.toLowerCase());
  }
  await expect(page.getByTestId("duel-code-input")).toHaveValue(code);
  await page.getByTestId(`duel-grade-${grade}`).tap();
  await page.getByTestId("duel-join-go").tap();
  await expect(page.getByTestId("duel-lobby")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("duel-ready").tap();
  await expect(page.getByTestId("duel-ready")).toHaveAttribute("aria-pressed", "true");
}

test("A nyit, B kóddal csatlakozik: váróterem → teljes meccs érintéssel → győzteshirdetés mindkettőn → visszavágó", async ({ browser }) => {
  test.setTimeout(180_000);
  const A = await phone(browser, on.url, { width: 390, height: 844 }, { learner: true });
  const B = await phone(browser, on.url, { width: 360, height: 640 });
  try {
    await A.page.goto("/games");
    await expect(A.page.getByTestId("games-duel-entry")).toContainText("Online");
    const code = await openRoom(A.page);
    await expect(A.page.getByTestId("duel-waiting")).toBeVisible();
    await A.page.getByTestId("duel-qr-toggle").tap();
    await expect(A.page.getByTestId("duel-qr").getByRole("img")).toBeVisible();
    await assertMobileQuality(A.page, "váróterem (gazda)");
    await shot(A.page, "online-lobby-host");
    await joinRoom(B.page, code, "code");
    // Review #464 H1: a 2 fős szobába egy harmadik (a linket megkapó idegen) nem ülhet be — érthető hibaképernyő.
    const C = await phone(browser, on.url, { width: 360, height: 640 });
    try {
      await C.page.goto(`/games/parbaj/${code}`);
      await C.page.getByTestId("duel-join-go").tap();
      await expect(C.page.getByTestId("duel-error")).toHaveAttribute("data-code", "ROOM_FULL", { timeout: 15_000 });
      await expect(C.page.getByTestId("duel-error")).toContainText("megtelt");
      // JM3a-2 (ÚJ-5): nem hálózati hiba-képernyő — nincs „Újrapróbálom”; a vendégnek „Vissza a játékokhoz” kiút.
      await expect(C.page.getByTestId("duel-retry")).toHaveCount(0);
      await expect(C.page.getByTestId("duel-error-games")).toBeVisible();
      await shot(C.page, "online-room-full");
    } finally {
      await C.ctx.close();
    }
    await expect(A.page.getByTestId("duel-players").locator("li")).toHaveCount(2);
    await assertMobileQuality(B.page, "váróterem (csatlakozó)");
    await shot(B.page, "online-lobby-guest");
    await expect(A.page.getByTestId("duel-players")).toContainText("Kész ✓");
    await expect(A.page.getByTestId("duel-start")).toBeEnabled({ timeout: 10_000 });
    await shot(A.page, "online-lobby-ready");
    await A.page.getByTestId("duel-start").tap();
    await expect(A.page.getByTestId("duel-countdown")).toBeVisible({ timeout: 10_000 });
    await expect(B.page.getByTestId("duel-countdown")).toBeVisible({ timeout: 10_000 });

    // Mindkét játékos érintéssel, EMBERI TEMPÓBAN (JM3a-2, A7) válaszol körönként (A a 0., B az 1. opciót választja).
    let lastA = 0;
    let lastB = 0;
    let shotDone = false;
    for (let i = 0; i < 12; i++) {
      const [ra, rb] = await Promise.all([answerNextRound(A.page, lastA, 0, 30_000, 1200), answerNextRound(B.page, lastB, 1, 30_000, 900)]);
      if (ra === "result" || rb === "result") break;
      lastA = ra;
      lastB = rb;
      if (!shotDone) {
        shotDone = true;
        await expect(A.page.getByTestId("duel-verdict")).toBeVisible({ timeout: 15_000 });
        await shot(A.page, "online-reveal");
        await shot(B.page, "online-reveal");
        await assertMobileQuality(B.page, "felfedés (360×640)");
      }
    }
    for (const p of [A.page, B.page]) {
      await expect(p.getByTestId("duel-result")).toBeVisible({ timeout: 30_000 });
      await expect(p.getByTestId("duel-winner")).toBeVisible();
      await expect(p.getByTestId("duel-stats-me")).toContainText("Pontosság");
      await expect(p.getByTestId("duel-stats-me")).toContainText("Leggyorsabb helyes");
      await expect(p.getByTestId("duel-stats-me")).toContainText("Legjobb sorozat");
    }
    await A.page.waitForTimeout(600);
    await assertMobileQuality(A.page, "győzteshirdetés");
    await shot(A.page, "online-result");
    await shot(B.page, "online-result");
    // A7: a „Leggyorsabb helyes” valódi számérték (emberi tempó → nem „gyanús”). Mindkét kártya látszik A-nál; ha ebben a
    // meccsben egyik játékos sem talált (≈ 1/128 esély), a visszavágó meccsét is megnézzük.
    const fastestShown = async () => {
      const texts = await Promise.all(["duel-stats-me-fast", "duel-stats-rival-fast"].map((id) => A.page.getByTestId(id).textContent()));
      return texts.some((t) => /^\d+,\d mp$/.test((t ?? "").trim()));
    };
    let sawFastest = await fastestShown();
    // Visszavágó (review #464 K4 + JM3a-2, kétoldalú): B kéri → B-nél „várjuk a válaszát”, A-nál a győzteshirdetés MARAD a
    // kérdéssel; A „Benne vagyok” → AZONNAL visszaszámlálás mindkettőnél (nincs újra „Kész” + „Indítás”).
    await B.page.getByTestId("duel-rematch").tap();
    await expect(B.page.getByTestId("duel-rematch-waiting")).toBeVisible({ timeout: 10_000 });
    await expect(A.page.getByTestId("duel-rematch-ask")).toBeVisible({ timeout: 10_000 });
    await expect(A.page.getByTestId("duel-result")).toBeVisible();
    await shot(A.page, "online-rematch-ask");
    await shot(B.page, "online-rematch-waiting");
    await A.page.getByTestId("duel-rematch-accept").tap();
    await expect(A.page.getByTestId("duel-countdown")).toBeVisible({ timeout: 10_000 });
    await expect(B.page.getByTestId("duel-countdown")).toBeVisible({ timeout: 10_000 });
    if (!sawFastest) {
      let la = 0;
      let lb = 0;
      for (let i = 0; i < 12; i++) {
        const [ra, rb] = await Promise.all([answerNextRound(A.page, la, 2, 30_000, 1200), answerNextRound(B.page, lb, 3, 30_000, 900)]);
        if (ra === "result" || rb === "result") break;
        la = ra;
        lb = rb;
      }
      await expect(A.page.getByTestId("duel-result")).toBeVisible({ timeout: 30_000 });
      sawFastest = await fastestShown();
    }
    expect(sawFastest, "a „Leggyorsabb helyes” számérték (pl. „1,4 mp”) legalább egy kártyán").toBe(true);
  } finally {
    await A.ctx.close();
    await B.ctx.close();
  }
});

test("csak-polling (Vercel-szimuláció): B hálózata kör közben megszakad, majd visszatér — ugyanazt az állapotot látja; utána A kilép, B nyer", async ({ browser }) => {
  test.setTimeout(150_000);
  const A = await phone(browser, on.url, { width: 844, height: 390 }, { learner: true });
  const B = await phone(browser, on.url, { width: 390, height: 844 });
  try {
    const code = await openRoom(A.page, "?rtTransport=polling");
    await shot(A.page, "online-lobby-host");
    await joinRoom(B.page, code, "link", 6, "?rtTransport=polling");
    await A.page.getByTestId("duel-start").tap();
    // 1. kör: mindketten válaszolnak.
    const r1 = await answerNextRound(A.page, 0, 0);
    await answerNextRound(B.page, 0, 0);
    expect(r1).toBe(1);
    // 2. kör: B kiesik a válasza előtt.
    await A.page.waitForFunction(() => (window as unknown as { __websuliGame: { probe: () => { round: number; phase: string } } }).__websuliGame.probe().round === 2 && (window as unknown as { __websuliGame: { probe: () => { phase: string } } }).__websuliGame.probe().phase === "round_open", null, { timeout: 30_000 });
    await shot(A.page, "online-question");
    await assertMobileQuality(A.page, "kérdés (844×390)");
    await B.ctx.setOffline(true);
    await expect(B.page.getByTestId("duel-reconnecting")).toBeVisible({ timeout: 15_000 });
    await shot(B.page, "online-reconnecting");
    await B.page.waitForTimeout(5_000);
    await B.ctx.setOffline(false);
    await expect(B.page.getByTestId("duel-reconnecting")).toHaveCount(0, { timeout: 20_000 });
    const pb = await probe(B.page);
    expect(pb.code).toBe(code);
    expect(pb.conn).toBe("open");
    expect(["round_open", "round_reveal", "countdown"]).toContain(pb.phase);
    // A kilép meccs közben (megerősítéssel) → B győz.
    await A.page.getByTestId("duel-exit").tap();
    await A.page.getByTestId("duel-exit-leave").tap();
    await expect(A.page.getByTestId("duel-home")).toBeVisible({ timeout: 10_000 });
    await expect(B.page.getByTestId("duel-result")).toBeVisible({ timeout: 20_000 });
    await expect(B.page.getByTestId("duel-result-reason")).toContainText("kilépett");
    await expect(B.page.getByTestId("duel-result")).toHaveAttribute("data-won", "true");
    await shot(B.page, "online-opponent-left");
  } finally {
    await A.ctx.close();
    await B.ctx.close();
  }
});

test("review #464: kapcsolódás közben a Vissza gombbal elnavigálva a későn visszatérő munkamenet lezárul — az új szobanyitás sikerül (nincs ALREADY_IN_ROOM)", async ({ browser }) => {
  test.setTimeout(90_000);
  const A = await phone(browser, on.url, { width: 390, height: 844 }, { learner: true });
  try {
    await A.page.goto("/games");
    await A.page.getByTestId("games-duel-entry").tap();
    await expect(A.page.getByTestId("duel-create")).toBeVisible({ timeout: 30_000 });
    // Az első jegykérés lassú (2,5 s): közben a gyerek visszalép a játéklistára.
    let delayed = false;
    await A.page.route("**/api/rt/ticket", async (route) => {
      if (!delayed) {
        delayed = true;
        await new Promise((r) => setTimeout(r, 2_500));
      }
      await route.continue();
    });
    const status = async () => (await fetch(`${on.url}/api/admin/rt/status`, { headers: { cookie: adminCookie } })).json();
    // Kiindulás: az előző tesztek (polling-kliensei a szerver ping-időkorlátjáig) még élhetnek — ehhez mérünk.
    const base = await status();
    await A.page.getByTestId("duel-create").tap();
    await A.page.getByTestId("duel-go").tap();
    await expect(A.page.getByTestId("duel-busy")).toBeVisible();
    await A.page.goBack();
    await expect(A.page.getByTestId("games-duel-entry")).toBeVisible();
    await A.page.waitForTimeout(4_000); // a lassú indítás ezalatt befejeződik — és lezárul
    // Nincs élő, gazdátlan kapcsolat és szoba (a részletes státusz admin-munkamenettel; a munkamenet-tár közös adatbázis).
    const st = await status();
    expect(st.connections, `${JSON.stringify(base)} → ${JSON.stringify(st)}`).toBeLessThanOrEqual(base.connections);
    expect(st.activeRooms, `${JSON.stringify(base)} → ${JSON.stringify(st)}`).toBeLessThanOrEqual(base.activeRooms);
    await A.page.getByTestId("games-duel-entry").tap();
    const code = await openRoom(A.page);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  } finally {
    await A.ctx.close();
  }
});

test("review #464: újratöltés a váróteremben (vendég, tárolt tokennel) és meccs közben (gazda) — mindkettő a saját helyére ül vissza, a meccs a győzteshirdetésig megy", async ({ browser }) => {
  test.setTimeout(150_000);
  const A = await phone(browser, on.url, { width: 390, height: 844 }, { learner: true });
  const B = await phone(browser, on.url, { width: 360, height: 640 });
  try {
    const code = await openRoom(A.page);
    await joinRoom(B.page, code, "link", 4);
    // B újratölt a váróteremben → visszaül (nem „megtelt”), a gazda továbbra is 2 főt lát.
    await B.page.reload();
    await expect(B.page.getByTestId("duel-lobby")).toBeVisible({ timeout: 20_000 });
    await expect(A.page.getByTestId("duel-players").locator("li")).toHaveCount(2);
    if ((await B.page.getByTestId("duel-ready").getAttribute("aria-pressed")) !== "true") await B.page.getByTestId("duel-ready").tap();
    await expect(A.page.getByTestId("duel-start")).toBeEnabled({ timeout: 10_000 });
    await A.page.getByTestId("duel-start").tap();
    const r1 = await answerNextRound(A.page, 0, 0);
    expect(r1).toBe(1);
    // A (gazda) a kör / felfedés alatt újratölt → vissza a meccsbe ugyanazzal a szobával.
    await A.page.reload();
    await expect(A.page.getByTestId("duel-match")).toBeVisible({ timeout: 20_000 });
    expect((await probe(A.page)).code).toBe(code);
    let lastA = 1;
    let lastB = 0;
    for (let i = 0; i < 12; i++) {
      const [ra, rb] = await Promise.all([answerNextRound(A.page, lastA, 0), answerNextRound(B.page, lastB, 1)]);
      if (ra === "result" || rb === "result") break;
      lastA = ra;
      lastB = rb;
    }
    for (const p of [A.page, B.page]) await expect(p.getByTestId("duel-result")).toBeVisible({ timeout: 30_000 });
    // JM3a-2 (K4): A kér visszavágót, majd kilép — B-nél a kérdés azonnal zárul érthető szöveggel, az eredmény marad.
    await A.page.getByTestId("duel-rematch").tap();
    await expect(B.page.getByTestId("duel-rematch-ask")).toBeVisible({ timeout: 10_000 });
    await A.page.getByTestId("duel-new").tap();
    await expect(B.page.getByTestId("duel-rematch-gone")).toBeVisible({ timeout: 10_000 });
    await expect(B.page.getByTestId("duel-result")).toBeVisible();
    await expect(B.page.getByTestId("duel-rematch-accept")).toHaveCount(0);
    // PR #476 review + JM3a-2/R tervezési döntés: meccs után a kód csak visszavágóra él — az ugyanazzal a kóddal érkező
    // idegen érthető hibát kap (ROOM_STARTED), B-nél marad a „kilépett” szöveg és az „Új szoba” kiút (nem ragad be).
    const C = await phone(browser, on.url, { width: 360, height: 640 });
    try {
      await C.page.goto(`/games/parbaj/${code}`);
      await C.page.getByTestId("duel-join-go").tap();
      await expect(C.page.getByTestId("duel-error")).toHaveAttribute("data-code", "ROOM_STARTED", { timeout: 15_000 });
      await expect(B.page.getByTestId("duel-rematch-gone")).toBeVisible();
      await expect(B.page.getByTestId("duel-new")).toBeVisible();
    } finally {
      await C.ctx.close();
    }
  } finally {
    await A.ctx.close();
    await B.ctx.close();
  }
});

test("PR #476 review (Codex 4591991467): mindkét játékos EGYSZERRE nyomja a Visszavágót — kölcsönös elfogadás, mindkettőnél azonnali visszaszámlálás", async ({ browser }) => {
  test.setTimeout(150_000);
  const A = await phone(browser, on.url, { width: 390, height: 844 }, { learner: true });
  const B = await phone(browser, on.url, { width: 360, height: 640 });
  try {
    const code = await openRoom(A.page);
    await joinRoom(B.page, code, "link", 4);
    await expect(A.page.getByTestId("duel-start")).toBeEnabled({ timeout: 10_000 });
    await A.page.getByTestId("duel-start").tap();
    let lastA = 0;
    let lastB = 0;
    for (let i = 0; i < 12; i++) {
      const [ra, rb] = await Promise.all([answerNextRound(A.page, lastA, 0), answerNextRound(B.page, lastB, 1)]);
      if (ra === "result" || rb === "result") break;
      lastA = ra;
      lastB = rb;
    }
    for (const p of [A.page, B.page]) await expect(p.getByTestId("duel-rematch")).toBeVisible({ timeout: 30_000 });
    // Egyszerre: egyik kliens sem látja még a másik kérését, amikor a sajátját elküldi.
    await Promise.all([A.page.getByTestId("duel-rematch").tap(), B.page.getByTestId("duel-rematch").tap()]);
    for (const p of [A.page, B.page]) await expect(p.getByTestId("duel-countdown")).toBeVisible({ timeout: 10_000 });
  } finally {
    await A.ctx.close();
    await B.ctx.close();
  }
});

test("JM3a-2 (A3): online kilépés `leave()`-vel — a váróteremben maradó gazda azonnal üres helyet lát, nem 60 s „Kapcsolódik…”-ot", async ({ browser }) => {
  const A = await phone(browser, on.url, { width: 390, height: 844 }, { learner: true });
  const B = await phone(browser, on.url, { width: 360, height: 640 });
  try {
    const code = await openRoom(A.page);
    await joinRoom(B.page, code, "link", 4);
    await expect(A.page.getByTestId("duel-players").locator("li")).toHaveCount(2);
    await B.page.getByTestId("duel-leave").tap();
    await expect(B.page.getByTestId("duel-home")).toBeVisible({ timeout: 10_000 });
    await expect(A.page.getByTestId("duel-waiting")).toBeVisible({ timeout: 5_000 });
    await expect(A.page.getByTestId("duel-players")).not.toContainText("Kapcsolódik");
  } finally {
    await A.ctx.close();
    await B.ctx.close();
  }
});

test("JM3a-2: az online nem-játék képernyők a meta-mérő alatt (X1–X8; 360×640, 412×915, 844×390): váróterem, megtelt szoba, győzteshirdetés, visszavágó-kérés", async ({ browser }) => {
  test.setTimeout(180_000);
  const META = [{ width: 360, height: 640 }, { width: 412, height: 915 }, { width: 844, height: 390 }] as const;
  const A = await phone(browser, on.url, { width: 360, height: 640 }, { learner: true });
  const B = await phone(browser, on.url, { width: 360, height: 640 });
  const C = await phone(browser, on.url, { width: 360, height: 640 });
  const measure = async (page: Page, name: string, where: string, settle?: string) => {
    for (const vp of META) {
      await page.setViewportSize(vp);
      const insets = insetsFor(vp);
      await emulateSafeArea(page, insets);
      if (settle) await waitForStable(page, settle);
      else await page.waitForTimeout(250);
      await metaShot(page, name, true);
      await expectMetaScreenOk(page, `${where} ${vp.width}x${vp.height}`, { insets });
    }
  };
  try {
    const code = await openRoom(A.page);
    await measure(A.page, "parbaj-varoterem-ures", "Párbaj váróterem (gazda, egyedül)");
    await joinRoom(B.page, code, "link", 4);
    await measure(B.page, "parbaj-varoterem-csatlakozo", "Párbaj váróterem (csatlakozó)");
    await C.page.goto(`/games/parbaj/${code}`);
    await C.page.getByTestId("duel-join-go").tap();
    await expect(C.page.getByTestId("duel-error")).toHaveAttribute("data-code", "ROOM_FULL", { timeout: 15_000 });
    await measure(C.page, "parbaj-megtelt", "Párbaj megtelt szoba");
    await A.page.setViewportSize({ width: 360, height: 640 });
    await A.page.getByTestId("duel-start").tap();
    let la = 0;
    let lb = 0;
    for (let i = 0; i < 12; i++) {
      const [ra, rb] = await Promise.all([answerNextRound(A.page, la, 0), answerNextRound(B.page, lb, 1)]);
      if (ra === "result" || rb === "result") break;
      la = ra;
      lb = rb;
    }
    await expect(A.page.getByTestId("duel-result")).toBeVisible({ timeout: 30_000 });
    await expect(B.page.getByTestId("duel-result")).toBeVisible({ timeout: 30_000 });
    await measure(A.page, "parbaj-online-eredmeny", "Párbaj online győzteshirdetés", '[data-testid="duel-result"]');
    await B.page.getByTestId("duel-rematch").tap();
    await expect(A.page.getByTestId("duel-rematch-ask")).toBeVisible({ timeout: 10_000 });
    await measure(A.page, "parbaj-visszavago-keres", "Párbaj visszavágó-kérés", '[data-testid="duel-rematch-ask"]');
    await measure(B.page, "parbaj-visszavago-var", "Párbaj visszavágó — várakozás", '[data-testid="duel-rematch-waiting"]');
  } finally {
    await A.ctx.close();
    await B.ctx.close();
    await C.ctx.close();
  }
});

test("érvénytelen és nem létező kód; vendég nem nyithat szobát (ACCOUNT_REQUIRED), de csatlakozni tud", async ({ browser }) => {
  const B = await phone(browser, on.url, { width: 360, height: 640 });
  try {
    await B.page.goto("/games/parbaj");
    await expect(B.page.getByTestId("duel-home")).toBeVisible({ timeout: 30_000 });
    await expect(B.page.getByTestId("duel-create")).toHaveCount(0);
    await expect(B.page.getByTestId("duel-account-needed")).toBeVisible();
    await expect(B.page.getByTestId("duel-join")).toBeVisible();
    await expect(B.page.getByTestId("duel-bot")).toBeVisible();
    await waitForStable(B.page, "[data-game-start]"); // a kezdőképernyő belépő animációja után
    await assertMobileQuality(B.page, "kezdő (vendég)");
    await shot(B.page, "online-home-guest");
    const res = await B.page.request.post(`${on.url}/api/rt/ticket`, { data: { intent: "create" }, headers: { origin: on.url } });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ code: "ACCOUNT_REQUIRED" });
    // A beírt kód tisztul (0 / O / 1 / I és írásjel ki, nagybetű).
    await B.page.getByTestId("duel-join").tap();
    await B.page.getByTestId("duel-code-input").fill("a0b-1c2I");
    await expect(B.page.getByTestId("duel-code-input")).toHaveValue("ABC2");
    await expect(B.page.getByTestId("duel-join-go")).toBeDisabled();
    // Érvényes alakú, de nem létező szoba → barátságos hiba, kiúttal.
    await B.page.goto("/games/parbaj/ZZZZZZ");
    await B.page.getByTestId("duel-join-go").tap();
    await expect(B.page.getByTestId("duel-error")).toHaveAttribute("data-code", "ROOM_NOT_FOUND", { timeout: 15_000 });
    await expect(B.page.getByTestId("duel-error")).toContainText("nem létezik");
    await shot(B.page, "online-error-code");
    await B.page.getByTestId("duel-error-back").tap();
    await expect(B.page.getByTestId("duel-home")).toBeVisible();
  } finally {
    await B.ctx.close();
  }
});

test("admin mód: az admin nyit (Node-kliens, admin-munkamenet), a nem admin gyerek a linkről vendégként csatlakozik és végigjátszik; szobát nem nyithat", async ({ browser }) => {
  test.setTimeout(150_000);
  // Az admin szobát nyit a szerver valódi jegy-útján és Socket.IO-kapuján.
  const t = await fetch(`${admin.url}/api/rt/ticket`, { method: "POST", headers: { "content-type": "application/json", origin: admin.url, cookie: adminCookie }, body: JSON.stringify({ intent: "create" }) });
  expect(t.status).toBe(200);
  const ticket = (await t.json()) as { ticket: string; path: string };
  const host = await connectRt({ ticket: ticket.ticket, path: ticket.path, url: admin.url, ioFactory: ioClient, extraHeaders: { origin: admin.url } });
  const created = await host.request("room:create", { gameId: "parbaj", mode: "duel", grade: 6, settings: {} });
  expect(created.ok).toBe(true);
  const code = (created as { roomCode: string }).roomCode;
  // A gép-gazda minden körben az 1. opciót választja.
  host.on("round:open", (o) => void host.request("round:answer", { round: o.round, optionIndex: 1, clientRtMs: 800 }));

  const kid = await phone(browser, admin.url, { width: 390, height: 844 });
  try {
    await kid.page.goto("/games/parbaj");
    await expect(kid.page.getByTestId("duel-home")).toBeVisible({ timeout: 30_000 });
    await expect(kid.page.getByTestId("duel-create")).toHaveCount(0);
    await expect(kid.page.getByTestId("duel-join")).toBeVisible();
    const deny = await kid.page.request.post(`${admin.url}/api/rt/ticket`, { data: { intent: "create" }, headers: { origin: admin.url } });
    expect(deny.status()).toBe(403);
    await joinRoom(kid.page, code, "link", 4);
    await expect.poll(() => host.state?.players.length ?? 0, { timeout: 10_000 }).toBe(2);
    await expect.poll(() => host.state?.players.every((p) => p.ready) ?? false, { timeout: 10_000 }).toBe(true);
    expect((await host.request("room:start", {})).ok).toBe(true);
    await playToResult(kid.page, 0);
    await expect(kid.page.getByTestId("duel-winner")).toBeVisible();
    await shot(kid.page, "online-admin-mode-result");
  } finally {
    host.close();
    await kid.ctx.close();
  }
});

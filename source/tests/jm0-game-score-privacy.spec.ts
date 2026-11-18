/**
 * JM0 (terv JM-A1, JM-A2): valós szerver + eldobható Postgres ellen (npm run test:e2e -- tests/jm0-game-score-privacy.spec.ts).
 *  - a nyilvános ranglista-válasz nem tartalmaz valódi nevet / e-mailt, a régi (valódi nevű) sorokra sem;
 *  - POST /api/games/score: régi kliens (runId nélkül) működik; azonos runId + tartalom → ugyanaz a válasz, új sor nélkül;
 *    eltérő tartalom → 409; felhasználónként 60 / 15 perc, IP-plafon 600 / 15 perc után 429.
 * Minden teszt saját, kitalált kliens-IP-t kap (X-Forwarded-For, trust proxy = 1), így a korlát-számlálók nem keverednek.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import bcrypt from "bcryptjs";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const PASSWORD = `Jm0-${randomBytes(9).toString("hex")}`;
const ORIGIN_PORT = process.env.WEBSULI_E2E_PORT ?? "5000";
const ORIGIN = `https://localhost:${ORIGIN_PORT}`; // a proxy mögötti https-t utánozzuk (x-forwarded-proto), hogy az origin egyezzen
const GAME_ID = `jm0-game-${randomBytes(4).toString("hex")}`;

const FIRST = "Mihálygergely";
const LAST = "Kovácsnémeth";

type Seeded = { id: string; email: string };
let pool: pg.Pool;
const created: Seeded[] = [];

async function seedUser(opts: { eligible: boolean; withScore?: boolean }): Promise<Seeded> {
  const id = randomUUID();
  const email = `jm0.${randomBytes(5).toString("hex")}@teszt-iskola.example`;
  const hash = await bcrypt.hash(PASSWORD, 4);
  await pool.query(
    `INSERT INTO users (id, google_id, email, password, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, opts.eligible ? `g-${id}` : null, email, hash, FIRST, LAST],
  );
  if (opts.eligible) {
    await pool.query(`INSERT INTO email_subscriptions (user_id, email, classrooms, is_subscribed) VALUES ($1, $2, ARRAY[1], true)`, [id, email]);
  }
  if (opts.withScore) {
    await pool.query(
      `INSERT INTO game_scores (user_id, game_id, difficulty, total_xp, best_run_xp, best_streak, best_run_seconds, games_played)
       VALUES ($1, $2, 'normal', 500, 500, 7, 60, 1)`,
      [id, GAME_ID],
    );
  }
  const seeded = { id, email };
  created.push(seeded);
  return seeded;
}

function headersFor(ip: string): Record<string, string> {
  // x-forwarded-proto: éles módban a munkamenet-süti Secure, a proxy mögötti https-t a fejléc jelzi.
  return { origin: ORIGIN, "x-forwarded-for": ip, "x-forwarded-proto": "https" };
}

async function login(request: APIRequestContext, user: Seeded, ip: string): Promise<string> {
  const res = await request.post("/api/login", {
    headers: { ...headersFor(ip), "content-type": "text/plain" },
    data: JSON.stringify({ email: user.email, password: PASSWORD }),
  });
  expect(res.status(), "bejelentkezés").toBe(200);
  const tokenRes = await request.get("/api/csrf-token", { headers: headersFor(ip) });
  expect(tokenRes.status()).toBe(200);
  const body = (await tokenRes.json()) as { csrfToken: string };
  return body.csrfToken;
}

function post(request: APIRequestContext, ip: string, csrf: string, data: Record<string, unknown>) {
  return request.post("/api/games/score", { headers: { ...headersFor(ip), "x-csrf-token": csrf }, data });
}

async function rowCount(userId: string): Promise<{ played: number; rows: number }> {
  const { rows } = await pool.query<{ games_played: number }>(
    `SELECT games_played FROM game_scores WHERE user_id = $1 AND game_id = $2`,
    [userId, GAME_ID],
  );
  return { rows: rows.length, played: rows[0]?.games_played ?? 0 };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  await pool.query(`INSERT INTO games_catalog (id, title, sort_order) VALUES ($1, 'JM0 próbajáték', 9999) ON CONFLICT (id) DO NOTHING`, [GAME_ID]);
});

test.afterAll(async () => {
  await pool.query(`DELETE FROM games_catalog WHERE id = $1`, [GAME_ID]); // game_scores: ON DELETE CASCADE
  for (const u of created) {
    await pool.query(`DELETE FROM email_subscriptions WHERE user_id = $1`, [u.id]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [u.id]);
  }
  await pool.end();
});

test("JM-A1: a ranglista-válasz nem tartalmaz valódi nevet vagy e-mailt (a már tárolt, valódi nevű játékos sora sem)", async ({ request }) => {
  const a = await seedUser({ eligible: true, withScore: true });
  const b = await seedUser({ eligible: true, withScore: true });
  const res = await request.get(`/api/games/leaderboard?gameId=${GAME_ID}&difficulty=normal&limit=25`, { headers: headersFor("10.20.0.1") });
  expect(res.status()).toBe(200);
  const text = await res.text();
  const board = JSON.parse(text) as Array<{ displayName: string; rank: number }>;
  expect(board.length).toBe(2);
  for (const forbidden of [FIRST, LAST, a.email, b.email, a.id, b.id, "teszt-iskola"]) {
    expect(text, `a válasz nem tartalmazhatja: ${forbidden}`).not.toContain(forbidden);
  }
  expect(text).not.toMatch(/[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i);
  expect(text).not.toMatch(/firstName|lastName|email|userId/);
  for (const row of board) expect(row.displayName).toMatch(/^Játékos #\d{4}$/);
});

test("régi kliens (runId nélkül) a pontot változatlanul menti", async ({ request }) => {
  const ip = "10.20.0.2";
  const user = await seedUser({ eligible: true });
  const csrf = await login(request, user, ip);
  const res = await post(request, ip, csrf, { gameId: GAME_ID, difficulty: "normal", runXp: 100, runStreak: 3, runSeconds: 50 });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { gamesPlayed: number; duplicate?: boolean };
  expect(body.gamesPlayed).toBe(1);
  expect(body.duplicate).toBeUndefined();
  const second = await post(request, ip, csrf, { gameId: GAME_ID, difficulty: "normal", runXp: 100, runStreak: 3, runSeconds: 50 });
  expect(second.status()).toBe(200);
  expect((await rowCount(user.id)).played).toBe(2); // runId nélkül minden küldés külön menet (mint eddig)
});

test("JM-A2: azonos runId + azonos tartalom → ugyanaz a válasz új írás nélkül; eltérő tartalom → 409", async ({ request }) => {
  const ip = "10.20.0.3";
  const user = await seedUser({ eligible: true });
  const csrf = await login(request, user, ip);
  const runId = randomUUID();
  const payload = { gameId: GAME_ID, difficulty: "normal", runXp: 250, runStreak: 5, runSeconds: 80, runId };

  const first = await post(request, ip, csrf, payload);
  expect(first.status()).toBe(200);
  const firstBody = (await first.json()) as { id: string; totalXp: number; gamesPlayed: number };
  expect(firstBody.gamesPlayed).toBe(1);

  const again = await post(request, ip, csrf, payload);
  expect(again.status()).toBe(200);
  const againBody = (await again.json()) as { id: string; totalXp: number; gamesPlayed: number; ok?: boolean; duplicate?: boolean };
  expect(againBody).toMatchObject({ id: firstBody.id, totalXp: firstBody.totalXp, gamesPlayed: 1, ok: true, duplicate: true });
  expect(await rowCount(user.id)).toEqual({ rows: 1, played: 1 });

  const different = await post(request, ip, csrf, { ...payload, runXp: 9999 });
  expect(different.status()).toBe(409);
  expect(await rowCount(user.id)).toEqual({ rows: 1, played: 1 });

  const other = await post(request, ip, csrf, { ...payload, runId: randomUUID() });
  expect(other.status()).toBe(200);
  expect((await rowCount(user.id)).played).toBe(2);

  const badId = await post(request, ip, csrf, { ...payload, runId: "nem-uuid" });
  expect(badId.status()).toBe(400);
});

const scoreBody = () => ({ gameId: GAME_ID, difficulty: "normal", runXp: 1, runStreak: 1, runSeconds: 1, runId: randomUUID() });

test("JM-A2: felhasználónként 60 / 15 perc; ugyanarról az IP-ről a másik felhasználónak külön keret jár; a 429 Retry-After-rel, személyes adat nélkül", async ({ playwright, baseURL }) => {
  const ip = "10.20.0.4"; // közös IP (osztályterem / testvérek / mobil-NAT)
  const userA = await seedUser({ eligible: true });
  const userB = await seedUser({ eligible: true });
  const ctxA = await playwright.request.newContext({ baseURL });
  const ctxB = await playwright.request.newContext({ baseURL });
  try {
    const csrfA = await login(ctxA, userA, ip);
    const csrfB = await login(ctxB, userB, ip);
    for (let i = 0; i < 60; i++) {
      const res = await post(ctxA, ip, csrfA, scoreBody());
      expect(res.status(), `A felhasználó ${i + 1}. kérése`).toBe(200);
    }
    const blocked = await post(ctxA, ip, csrfA, scoreBody());
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
    const text = await blocked.text();
    for (const forbidden of [userA.email, userA.id, userB.email, userB.id, FIRST, LAST, ip, "@"]) {
      expect(text, `a 429 nem tartalmazhat: ${forbidden}`).not.toContain(forbidden);
    }
    // a másik felhasználó ugyanarról az IP-ről érintetlen kerettel indul
    const other = await post(ctxB, ip, csrfB, scoreBody());
    expect(other.status()).toBe(200);
  } finally {
    await ctxA.dispose();
    await ctxB.dispose();
  }
});

test("JM-A2: a laza IP-plafon (600 / 15 perc) külön védi a végpontot az elárasztás ellen", async ({ request }) => {
  const ip = "10.20.0.5";
  const statuses: number[] = [];
  for (let i = 0; i < 602; i++) {
    const res = await request.post("/api/games/score", { headers: headersFor(ip), data: scoreBody() });
    statuses.push(res.status());
  }
  expect(statuses.slice(0, 600).includes(429)).toBe(false);
  expect(statuses.slice(600).every((st) => st === 429)).toBe(true);
});

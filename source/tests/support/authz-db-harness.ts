/**
 * JM7a — közös segéd a jogosultsági DB-tesztekhez (admin-authz-matrix-db, player-auth-db), az eldobható Postgresen
 * (scripts/run-learning-db-tests.ts). Az alkalmazást a szerverrel AZONOS útvonal-felcsatolással (`mountAppRoutes`) építi,
 * valódi HTTP-n (süti, CSRF-token, munkamenet-tár) hívja.
 *
 * Védőkorlát az importok ELŐTT: csak a saját eldobható adatbázis; e2e-mód (a projekt .env-je nem töltődik, a pool csak
 * loopbackre kapcsolódhat); a külső szolgáltatások kulcsai törölve (levél, MI, mentés) — valódi levél / hívás nem mehet ki.
 */
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
process.env.WEBSULI_E2E = "1";
for (const key of Object.keys(process.env)) {
  if (/RESEND|OPENAI|OPENROUTER|ANTHROPIC|ELEVENLABS|GEMINI|GOOGLE_API|VAPID|BACKUP|NEON|PRODUCTION|SOURCE_DATABASE|DEV_DATABASE_URL|PROXY_SECRET/i.test(key)) delete process.env[key];
}
process.env.SESSION_SECRET = randomBytes(32).toString("hex");
process.env.GOOGLE_CLIENT_ID = "authz-test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "authz-test-client-secret";

const { default: express } = await import("express");
const { dbPool } = await import("../../server/db");
const { mountAppRoutes } = await import("../../server/app-routes");

export { dbPool };

export async function startApp(prepare?: (app: import("express").Express) => void): Promise<{ app: import("express").Express; base: string; close: () => Promise<void> }> {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  await mountAppRoutes(app);
  prepare?.(app);
  const server: Server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { app, base, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

/** Egy „böngésző”: saját sütivel és CSRF-tokennel. */
export class Client {
  cookie: string | null;
  csrf: string | null = null;
  constructor(public base: string, cookie: string | null = null) { this.cookie = cookie; }

  async request(method: string, path: string, body?: unknown): Promise<{ status: number; text: string; json: unknown }> {
    const headers: Record<string, string> = { origin: this.base, accept: "application/json" };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf && method !== "GET" && method !== "HEAD") headers["x-csrf-token"] = this.csrf;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${this.base}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(15_000),
    });
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("connect.sid="));
    if (setCookie) this.cookie = setCookie.split(";")[0]!;
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, text, json };
  }

  async fetchCsrf(): Promise<void> {
    const r = await this.request("GET", "/api/csrf-token");
    assert.equal(r.status, 200);
    this.csrf = (r.json as { csrfToken: string }).csrfToken;
  }
}

/** express-session (cookie-signature) aláírás: `s:<sid>.<HMAC-SHA256 base64, '=' nélkül>`. */
function signedSessionCookie(sid: string): string {
  const sig = createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
  return `connect.sid=${encodeURIComponent(`s:${sid}.${sig}`)}`;
}

/**
 * Munkamenet közvetlenül a tárba (connect-pg-simple `session` tábla) — pontosan úgy, ahogy a szerver tárolná.
 * A JM7b Google-os játékosát és a tiltott fiókokat így szimuláljuk (a valódi e-mailes út a player-auth tesztben fut).
 */
export async function injectSession(data: Record<string, unknown>): Promise<string> {
  const sid = randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + 3_600_000);
  const sess = { cookie: { originalMaxAge: 3_600_000, expires: expires.toISOString(), secure: false, httpOnly: true, path: "/", sameSite: "lax" }, ...data };
  await dbPool.query(`INSERT INTO session (sid, sess, expire) VALUES ($1, $2, $3)`, [sid, JSON.stringify(sess), expires]);
  return signedSessionCookie(sid);
}

/** A teljes adatbázis-tartalom ujjlenyomata táblánként (a `session` kivételével, mert azt minden kérés érinti). */
export async function databaseFingerprint(): Promise<Record<string, string>> {
  const { rows } = await dbPool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'session' ORDER BY tablename`,
  );
  const out: Record<string, string> = {};
  for (const { tablename } of rows) {
    const r = await dbPool.query<{ h: string }>(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${tablename}" t`);
    out[tablename] = r.rows[0]!.h;
  }
  return out;
}

/** Korlátozott párhuzamosság (a munkamenet-tár és a pool ne teljen be). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }));
  return out;
}

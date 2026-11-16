/**
 * JM7b — a játékos Google-út VALÓDI végigjátszása tesztben, a Google hálózati része nélkül. A szerver saját
 * „google-player” Passport-stratégiája fut (state + PKCE a munkamenetben, egyedi visszahívás, verify), csak a két Google-hívás
 * (kód → hozzáférési token, token → profil) van helyettesítve. Valódi hívás a Google felé nem megy ki.
 */
import assert from "node:assert/strict";
import passport from "passport";
import type { Client } from "./authz-db-harness";

export type FakeGoogleProfile = { id: string; emails?: { value: string; verified?: boolean | string }[] };

const profiles = new Map<string, FakeGoogleProfile>();
let seq = 0;

type OAuthStrategy = {
  _oauth2: { getOAuthAccessToken: (code: string, params: unknown, cb: (err: unknown, at?: string, rt?: string, p?: unknown) => void) => void };
  userProfile: (accessToken: string, done: (err: unknown, profile?: unknown) => void) => void;
};

/** A jelenleg regisztrált (a legutóbb felépített alkalmazás) játékos-stratégiájának helyettesítése. Idempotens. */
export function installPlayerGoogleStub(): void {
  const strategy = (passport as unknown as { _strategy(name: string): OAuthStrategy | undefined })._strategy("google-player");
  assert.ok(strategy, "a google-player stratégia nincs regisztrálva (GOOGLE_CLIENT_ID / SECRET kell)");
  strategy._oauth2.getOAuthAccessToken = (code, _params, cb) => {
    if (!profiles.has(code)) return cb({ statusCode: 400, data: "invalid_grant" });
    cb(null, `at:${code}`, "rt", {});
  };
  strategy.userProfile = (accessToken, done) => {
    const p = profiles.get(accessToken.slice(3));
    if (!p) return done(new Error("ismeretlen token"));
    done(null, { provider: "google", id: p.id, emails: p.emails, displayName: "Valódi Név", name: { givenName: "Valódi", familyName: "Név" }, photos: [{ value: "https://kep.example/arc.jpg" }] });
  };
}

async function rawGet(client: Client, path: string): Promise<{ status: number; location: string | null }> {
  const headers: Record<string, string> = { accept: "text/html" };
  if (client.cookie) headers.cookie = client.cookie;
  const res = await fetch(`${client.base}${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("connect.sid="));
  if (setCookie) client.cookie = setCookie.split(";")[0]!;
  await res.text();
  return { status: res.status, location: res.headers.get("location") };
}

export type GoogleRun = { start: { status: number; location: string | null }; state: string | null; callback: { status: number; location: string | null } | null };

/**
 * Egy teljes játékos Google-belépés: indítás → (Google) → visszahívás. `tamperState`: a visszahívás más `state`-tel
 * (login-CSRF szimuláció); `skipCallback`: csak az indítás.
 */
export async function playerGoogleLogin(client: Client, profile: FakeGoogleProfile, opts: { returnTo?: string; tamperState?: boolean; skipCallback?: boolean; reuse?: GoogleRun } = {}): Promise<GoogleRun & { code: string }> {
  installPlayerGoogleStub();
  const code = `code-${++seq}-${profile.id}`;
  profiles.set(code, profile);
  const start = opts.reuse?.start ?? await rawGet(client, `/auth/player/google${opts.returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(opts.returnTo)}`}`);
  let state: string | null = opts.reuse?.state ?? null;
  if (!opts.reuse && start.status === 302 && start.location?.startsWith("https://accounts.google.com/")) {
    const url = new URL(start.location);
    state = url.searchParams.get("state");
    assert.ok(state && state.length >= 16, "a Google-kérésben van state");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256", "PKCE");
    assert.equal(url.searchParams.get("scope"), "email", "csak e-mail hatókör (név / kép nem kell)");
  }
  if (opts.skipCallback || !state) return { start, state, callback: null, code };
  const sent = opts.tamperState ? `${state.slice(0, -2)}xx` : state;
  const callback = await rawGet(client, `/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(sent)}`);
  return { start, state, callback, code };
}

/**
 * Review #449 (A1): a MEGLÉVŐ admin „google” stratégia helyettesítése ugyanígy (csak a két Google-hívás), hogy a közös
 * callbacken párhuzamos admin- és játékos-folyamat vizsgálható legyen. Az admin-út viselkedése (state nélkül) változatlan.
 */
export function installAdminGoogleStub(profile: FakeGoogleProfile): void {
  const strategy = (passport as unknown as { _strategy(name: string): OAuthStrategy | undefined })._strategy("google");
  assert.ok(strategy, "a google (admin) stratégia nincs regisztrálva");
  strategy._oauth2.getOAuthAccessToken = (code, _params, cb) => cb(null, `at:${code}`, "rt", {});
  strategy.userProfile = (_accessToken, done) => done(null, { provider: "google", id: profile.id, emails: profile.emails, name: {}, photos: [] });
}

/** Nyers GET a kliens sütijével (átirányítás követése nélkül). */
export const getNoFollow = rawGet;

/**
 * JM7b — a játékos Google-út VALÓDI végigjátszása tesztben, a Google hálózati része nélkül. A szerver saját
 * „google-player” Passport-stratégiája fut (state + PKCE a munkamenetben, egyedi visszahívás, verify), csak a két Google-hívás
 * (kód → hozzáférési token, token → profil) van helyettesítve. Valódi hívás a Google felé nem megy ki.
 */
import assert from "node:assert/strict";
import passport from "passport";
import type { Client } from "./authz-db-harness";
import { withDifferentChar } from "./tamper";

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
  // Mindig eltérő (az utolsó karakter cseréje; az alak `p.` + 32 karakter marad) — a régi `…xx` 1/4096 eséllyel azonos volt.
  const sent = opts.tamperState ? withDifferentChar(state, -1) : state;
  const callback = await rawGet(client, `/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(sent)}`);
  return { start, state, callback, code };
}

/**
 * Review #449 (A1): a MEGLÉVŐ admin „google” stratégia helyettesítése ugyanígy (csak a két Google-hívás), hogy a közös
 * callbacken párhuzamos admin- és játékos-folyamat vizsgálható legyen. JM7c-1: az admin-út is `state` + PKCE-s — a csonk a
 * Google viselkedését utánozza: `code_verifier` nélküli tokencsere → invalid_grant.
 */
export function installAdminGoogleStub(profile: FakeGoogleProfile, opts: { tokenError?: boolean } = {}): void {
  const strategy = (passport as unknown as { _strategy(name: string): OAuthStrategy | undefined })._strategy("google");
  assert.ok(strategy, "a google (admin) stratégia nincs regisztrálva");
  strategy._oauth2.getOAuthAccessToken = (code, params, cb) => {
    if (opts.tokenError || typeof (params as { code_verifier?: unknown } | undefined)?.code_verifier !== "string") return cb({ statusCode: 400, data: "invalid_grant" });
    cb(null, `at:${code}`, "rt", {});
  };
  strategy.userProfile = (_accessToken, done) => done(null, { provider: "google", id: profile.id, emails: profile.emails, name: { givenName: "Valódi", familyName: "Név" }, photos: [] });
}

/**
 * JM7c-1: egy teljes admin / felhasználói Google-belépés a MEGLÉVŐ `/auth/google` úton (a szerver valódi stratégiája,
 * `state` + PKCE a munkamenetben, közös visszahívás; csak a Google hálózati része helyettesítve).
 * `state`: "valid" (alap), "tampered" (más érték), "missing" (a telepítéskor folyamatban lévő, régi belépés), vagy
 * egy konkrét érték (pl. idegen munkamenet state-je).
 */
export async function adminGoogleLogin(client: Client, profile: FakeGoogleProfile, opts: { returnTo?: string; state?: "valid" | "tampered" | "missing" | { value: string }; tokenError?: boolean } = {}): Promise<GoogleRun> {
  installAdminGoogleStub(profile, { tokenError: opts.tokenError });
  const start = await rawGet(client, `/auth/google${opts.returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(opts.returnTo)}`}`);
  assert.equal(start.status, 302);
  assert.ok(start.location?.startsWith("https://accounts.google.com/"), "a Google felé irányít");
  const url = new URL(start.location!);
  const state = url.searchParams.get("state");
  assert.match(state ?? "", /^a\.[A-Za-z0-9_-]{32}$/, "az admin-kérésben `a.` előtagú state van");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256", "PKCE");
  const mode = opts.state ?? "valid";
  // A hamisított state garantáltan eltér az eredetitől (a véletlen state 1/4096 eséllyel eleve „xx”-re végződhet).
  const tampered = `${state!.slice(0, -2)}${state!.endsWith("xx") ? "yy" : "xx"}`;
  const sent = typeof mode === "object" ? mode.value : mode === "valid" ? state : mode === "tampered" ? tampered : null;
  if (mode === "tampered") assert.notEqual(sent, state, "a hamisított state eltér");
  const code = `admin-code-${++seq}-${profile.id}`;
  const callback = await rawGet(client, `/auth/google/callback?code=${encodeURIComponent(code)}${sent === null ? "" : `&state=${encodeURIComponent(sent!)}`}`);
  return { start, state, callback };
}

/** Nyers GET a kliens sütijével (átirányítás követése nélkül). */
export const getNoFollow = rawGet;

/**
 * JM7b — a játékos Google-útjának tiszta részei (server/player/google.ts; terv 10.4, D12; tulajdonosi G11).
 * A teljes HTTP-folyamat (state / PKCE, admin e-mail-című Google-fiók, élő admin-munkamenet) eldobható adatbázison:
 * tests/player-account-db.integration.ts és a jogosultsági mátrix „valódi Google-os játékos” szerepe.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createPlayerGoogleVerify, sanitizePlayerReturnTo } from "../server/player/google";

type Call = { sub: string; email: string };

function fakeStore(result: "OK" | "CONFLICT" | "BANNED" = "OK") {
  const calls: Call[] = [];
  return {
    calls,
    store: {
      async upsertGooglePlayer(sub: string, email: string) {
        calls.push({ sub, email });
        if (result === "CONFLICT") return { kind: "CONFLICT" as const };
        return { kind: "OK" as const, id: `p-${sub}`, banned: result === "BANNED" };
      },
    },
  };
}

function run(verify: ReturnType<typeof createPlayerGoogleVerify>, profile: Parameters<ReturnType<typeof createPlayerGoogleVerify>>[0]) {
  return new Promise<{ err: Error | null; user: unknown; info: unknown }>((resolve) => {
    void verify(profile, (err, user, info) => resolve({ err, user, info }));
  });
}

describe("JM7b — játékos Google verify (csak player_accounts)", () => {
  it("megerősített cím → játékos-fiók; a cím normalizálva, a név / kép nem jut tovább", async () => {
    const { calls, store } = fakeStore();
    const r = await run(createPlayerGoogleVerify(store), {
      id: "g-123", emails: [{ value: "  Diak@Pelda.HU ", verified: true }],
      // A Google-profil többi mezője (név, kép) a verify-nak nem is kell — itt szándékosan ott van, mégsem tárolódik.
      ...({ name: { givenName: "Valódi", familyName: "Név" }, photos: [{ value: "https://kep.example/x.jpg" }] } as object),
    });
    assert.equal(r.err, null);
    assert.deepEqual(r.user, { id: "p-g-123" });
    assert.deepEqual(calls, [{ sub: "g-123", email: "diak@pelda.hu" }]);
  });

  it("a Google által NEM megerősített / hiányzó cím → elutasítás, fiók nem jön létre", async () => {
    for (const verified of [false, "false", undefined] as const) {
      const { calls, store } = fakeStore();
      const r = await run(createPlayerGoogleVerify(store), { id: "g-1", emails: [{ value: "x@pelda.hu", verified }] });
      assert.equal(r.user, false);
      assert.deepEqual(r.info, { code: "nincs-megerositve" });
      assert.equal(calls.length, 0);
    }
    const { calls, store } = fakeStore();
    assert.equal((await run(createPlayerGoogleVerify(store), { id: "g-1" })).user, false);
    assert.equal((await run(createPlayerGoogleVerify(store), { id: "g-1", emails: [{ value: "nem cím", verified: true }] })).user, false);
    assert.equal(calls.length, 0);
  });

  it("tiltott fiók és Google-azonosító-ütközés → elutasítás (munkamenet nélkül)", async () => {
    assert.deepEqual((await run(createPlayerGoogleVerify(fakeStore("BANNED").store), { id: "g", emails: [{ value: "a@b.hu", verified: true }] })).info, { code: "tiltva" });
    assert.deepEqual((await run(createPlayerGoogleVerify(fakeStore("CONFLICT").store), { id: "g", emails: [{ value: "a@b.hu", verified: "true" }] })).info, { code: "utkozes" });
  });
});

describe("JM7b — visszatérési cél: csak belső engedélylista (nyílt átirányítás ellen)", () => {
  it("engedett belső célok", () => {
    for (const p of ["/fiok", "/profile", "/games", "/games/tsunami-english", "/games/speed-quiz-math"]) assert.equal(sanitizePlayerReturnTo(p), p);
  });
  it("minden más elutasítva: külső, protokoll-relatív, admin, lekérdezés, vezérlőjel, nem szöveg", () => {
    for (const p of ["https://evil.example", "//evil.example", "/\\evil.example", "/admin", "/admin/stats", "/fiok?x=1", "/games/../admin",
      "/games/x/y", "/games/ABC", `/fiok${String.fromCharCode(13, 10)}Set-Cookie: x=1`, "", "javascript:alert(1)", 42, null]) {
      assert.equal(sanitizePlayerReturnTo(p), null, String(p));
    }
  });
});

describe("JM7b — szerkezeti elválasztás (forrás-őr)", () => {
  const google = readFileSync(new URL("../server/player/google.ts", import.meta.url), "utf8");
  const code = google.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  it("a játékos Google-út nem hív req.login-t, nem ír / olvas users-t, és nem hivatkozik admin-jogra", () => {
    for (const forbidden of ["req.login", "logIn(", "upsertUser", "getUserByEmail", "isAdmin", "storage", "FROM users", "INTO users"]) {
      assert.ok(!code.includes(forbidden), `tiltott hivatkozás a google.ts-ben: ${forbidden}`);
    }
    assert.match(code, /state: true/);
    assert.match(code, /store: new PlayerStateStore\(\)/);
    assert.match(code, /pkce: true/);
    assert.match(code, /session: false/);
  });
  it("az auth.ts a közös callbackben a játékos-ágat a Passport admin-ága ELŐTT választja le", () => {
    const auth = readFileSync(new URL("../server/auth.ts", import.meta.url), "utf8");
    const cb = auth.slice(auth.indexOf("app.get('/auth/google/callback'"));
    const branch = cb.indexOf("isPlayerState(req.query.state)");
    const adminAuth = cb.indexOf("passport.authenticate('google'");
    assert.ok(branch > 0 && adminAuth > branch, "a játékos-ág az admin passport.authenticate előtt");
    assert.doesNotMatch(auth, /oauthFlow/, "nincs egyetlen, felülírható munkamenet-jelző (review #449 A1)");
  });
});

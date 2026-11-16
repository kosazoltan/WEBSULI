/**
 * JM7a (G11 / D12) — a meglévő Google-belépés e-mail-egyezéssel köt meglévő fiókhoz (storage.upsertUser), és új felhasználónál
 * az ADMIN_EMAIL-egyezésből admin-jogot ad. Megerősítetlen Google-e-maillel ez admin-fiók átvételét tenné lehetővé, ezért:
 * megerősítetlen cím → nincs belépés, nincs írás. A jogos (megerősített) admin-belépés változatlanul működik.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL = "postgresql://authz:authz@127.0.0.1:1/google_verify";
process.env.SESSION_SECRET ??= "google-email-verified-test-secret";
const { createGoogleVerify } = await import("../server/auth");

const ADMIN = "admin@websuli.example";
type Stored = { id: string; email: string; isAdmin: boolean };

function fakeStore(existing: Stored[]) {
  const upserts: Record<string, unknown>[] = [];
  return {
    upserts,
    store: {
      async getUserByEmail(email: string) { return (existing.find((u) => u.email === email) ?? null) as never; },
      async upsertUser(data: Record<string, unknown>) {
        upserts.push(data);
        const found = existing.find((u) => u.email === data.email);
        return { id: found?.id ?? "new-user", email: data.email, isAdmin: data.isAdmin } as never;
      },
    },
  };
}

function run(verify: ReturnType<typeof createGoogleVerify>, verified: unknown, email = ADMIN) {
  return new Promise<{ err: Error | null; user: unknown }>((resolve) => {
    void verify({ id: "google-sub-attacker", emails: [{ value: email, verified: verified as boolean }] }, (err, user) => resolve({ err, user }));
  });
}

describe("JM7a — Google-belépés csak megerősített e-maillel", () => {
  it("megerősítetlen e-mailű profil az admin címével → nincs belépés, nincs fiók-összekapcsolás / írás", async () => {
    for (const verified of [false, "false", undefined, null, 1, "yes"]) {
      const { store, upserts } = fakeStore([{ id: "admin-id", email: ADMIN, isAdmin: true }]);
      const result = await run(createGoogleVerify(store, () => ADMIN), verified);
      assert.equal(result.err, null);
      assert.equal(result.user, false, `verified=${String(verified)}: nem léphet be`);
      assert.equal(upserts.length, 0, `verified=${String(verified)}: nem írhat (googleId-kötés)`);
    }
  });

  it("megerősítetlen e-maillel új admin-sor sem jöhet létre (ADMIN_EMAIL-egyezés, de még nincs fiók)", async () => {
    const { store, upserts } = fakeStore([]);
    const result = await run(createGoogleVerify(store, () => ADMIN), false);
    assert.equal(result.user, false);
    assert.equal(upserts.length, 0);
  });

  it("a jogos, megerősített admin-belépés megmarad (boolean és a régi \"true\" alak is)", async () => {
    for (const verified of [true, "true"]) {
      const { store, upserts } = fakeStore([{ id: "admin-id", email: ADMIN, isAdmin: true }]);
      const result = await run(createGoogleVerify(store, () => ADMIN), verified);
      assert.equal(result.err, null);
      assert.deepEqual(result.user, { id: "admin-id", email: ADMIN, isAdmin: true });
      assert.equal(upserts.length, 1);
      assert.equal(upserts[0]!.isAdmin, true, "a meglévő admin megtartja a jogát");
    }
  });

  it("megerősített, nem admin cím → nem admin felhasználó; a meglévő nem admin nem lesz admin", async () => {
    const fresh = fakeStore([]);
    const r1 = await run(createGoogleVerify(fresh.store, () => ADMIN), true, "diak@pelda.hu");
    assert.equal((r1.user as Stored).isAdmin, false);
    const existing = fakeStore([{ id: "u-1", email: "diak@pelda.hu", isAdmin: false }]);
    const r2 = await run(createGoogleVerify(existing.store, () => ADMIN), true, "diak@pelda.hu");
    assert.equal((r2.user as Stored).isAdmin, false);
  });

  it("e-mail nélküli profil → hiba, írás nélkül", async () => {
    const { store, upserts } = fakeStore([]);
    const verify = createGoogleVerify(store, () => ADMIN);
    const result = await new Promise<{ err: Error | null }>((resolve) => { void verify({ id: "x" }, (err) => resolve({ err })); });
    assert.ok(result.err instanceof Error);
    assert.equal(upserts.length, 0);
  });
});

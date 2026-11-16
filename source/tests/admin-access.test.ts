/**
 * JM7c-1 (terv 10.4a, lezárt tulajdonosi döntés 2026-11-16) — az admin-jog egyetlen képlete:
 *   admin = users.is_admin ÉS az e-mail az admin-engedélylistán ÉS nem tiltott
 * Engedélylista: ADMIN_ALLOWLIST → (üres / csupa hibás) → ADMIN_EMAIL → (egyik sem) → a meglévő jelző marad (fail-open a
 * MEGLÉVŐ adminokra). Kizárás elleni őr: ha a lista egyetlen létező, nem tiltott adminra sem illik, a jelző marad érvényben.
 * Az ADMIN_EMAILS értesítési lista, jogot NEM ad.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://authz:authz@127.0.0.1:1/admin_access";
process.env.SESSION_SECRET ??= "admin-access-test-secret";

const {
  adminPolicy, configureAdminAccess, isAdminUser, isAllowlistedAdminEmail, normalizeAdminEmail, parseAdminAllowlist, prepareAdminAccess, reportAdminAccessStatus, adminInactiveReason, storedAdminFlag,
} = await import("../server/lib/admin-access");
const { AdminStateStore, isAdminState, ADMIN_STATE_PREFIX } = await import("../server/lib/admin-oauth-state");
const { createGoogleVerify } = await import("../server/auth");

const KEYS = ["ADMIN_ALLOWLIST", "ADMIN_EMAIL", "ADMIN_EMAILS"] as const;
let saved: Record<string, string | undefined> = {};

function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  setEnv({});
  configureAdminAccess(null);
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  configureAdminAccess(null);
});

const admin = (email: string | null, extra: { isAdmin?: boolean; isBanned?: boolean } = {}) => ({ email, isAdmin: true, isBanned: false, ...extra });

describe("JM7c-1 — engedélylista feldolgozása", () => {
  it("normalizálás: kisbetű, szóköz levágva; hibás alak → null", () => {
    assert.equal(normalizeAdminEmail("  Tulaj@Pelda.HU "), "tulaj@pelda.hu");
    for (const bad of ["", "   ", "nincs-kukac", "a@b", "@pelda.hu", "a b@pelda.hu", 42, null, undefined]) {
      assert.equal(normalizeAdminEmail(bad), null, String(bad));
    }
  });

  it("vessző / pontosvessző / szóköz tagolás, ismétlés egyszer, hibás elem eldobva és számolva", () => {
    const r = parseAdminAllowlist(" A@pelda.hu, b@pelda.hu;a@PELDA.hu  hibas ,, c@pelda.hu ");
    assert.deepEqual(r.emails.sort(), ["a@pelda.hu", "b@pelda.hu", "c@pelda.hu"]);
    assert.equal(r.invalid, 1);
    assert.deepEqual(parseAdminAllowlist(undefined), { emails: [], invalid: 0 });
  });

  it("ALAPÉRTÉK: ha az ADMIN_ALLOWLIST nincs beállítva, az ADMIN_EMAIL a lista — a mostani admin beállítás nélkül admin marad", () => {
    setEnv({ ADMIN_EMAIL: "Tulaj@Pelda.hu" });
    const p = adminPolicy();
    assert.equal(p.source, "ADMIN_EMAIL");
    assert.deepEqual([...p.emails], ["tulaj@pelda.hu"]);
    assert.equal(isAdminUser(admin("tulaj@pelda.hu")), true);
    assert.equal(isAdminUser(admin("TULAJ@PELDA.HU ")), true, "kis- / nagybetű, szóköz");
  });

  it("üres vagy csupa hibás ADMIN_ALLOWLIST → visszaesés az ADMIN_EMAIL-re (jelezve)", () => {
    for (const bad of ["", "   ", "hibas, @@, nincs"]) {
      setEnv({ ADMIN_ALLOWLIST: bad, ADMIN_EMAIL: "tulaj@pelda.hu" });
      const p = adminPolicy();
      assert.equal(p.source, "ADMIN_EMAIL", JSON.stringify(bad));
      assert.equal(p.allowlistInvalid, bad.trim() !== "");
      assert.equal(isAdminUser(admin("tulaj@pelda.hu")), true);
    }
  });

  it("beállított ADMIN_ALLOWLIST felülírja az ADMIN_EMAIL-t (a listán kívüli ADMIN_EMAIL nem admin)", () => {
    setEnv({ ADMIN_ALLOWLIST: "masik@pelda.hu", ADMIN_EMAIL: "tulaj@pelda.hu" });
    assert.equal(adminPolicy().source, "ADMIN_ALLOWLIST");
    assert.equal(isAllowlistedAdminEmail("tulaj@pelda.hu"), false);
    assert.equal(isAllowlistedAdminEmail("MASIK@pelda.hu"), true);
  });

  it("az ADMIN_EMAILS (értesítési lista) NEM ad jogot és nem kerül a listára", () => {
    setEnv({ ADMIN_EMAIL: "tulaj@pelda.hu", ADMIN_EMAILS: "tulaj@pelda.hu,ertesitendo@pelda.hu" });
    assert.deepEqual([...adminPolicy().emails], ["tulaj@pelda.hu"]);
    assert.equal(isAdminUser(admin("ertesitendo@pelda.hu")), false);
  });
});

describe("JM7c-1 — a képlet (jelző ÉS lista ÉS nem tiltott)", () => {
  it("minden kombináció", () => {
    setEnv({ ADMIN_ALLOWLIST: "tulaj@pelda.hu" });
    const cases: { email: string; isAdmin: boolean; isBanned: boolean; want: boolean }[] = [];
    for (const listed of [true, false]) for (const isAdmin of [true, false]) for (const isBanned of [true, false]) {
      cases.push({ email: listed ? "tulaj@pelda.hu" : "diak@pelda.hu", isAdmin, isBanned, want: listed && isAdmin && !isBanned });
    }
    for (const c of cases) assert.equal(isAdminUser(c), c.want, JSON.stringify(c));
    assert.equal(isAdminUser(null), false);
    assert.equal(isAdminUser(undefined), false);
    assert.equal(isAdminUser({ email: null, isAdmin: true, isBanned: false }), false, "cím nélküli jelzős fiók");
    assert.equal(isAdminUser({ email: "tulaj@pelda.hu", isAdmin: "true" as unknown as boolean }), false, "csak a valódi true számít");
  });

  it("listáról levett admin a KÖVETKEZŐ hívásnál már nem admin (munkamenet-újraépítés nélkül)", () => {
    setEnv({ ADMIN_ALLOWLIST: "tulaj@pelda.hu, masik@pelda.hu" });
    const u = admin("masik@pelda.hu");
    assert.equal(isAdminUser(u), true);
    process.env.ADMIN_ALLOWLIST = "tulaj@pelda.hu";
    assert.equal(isAdminUser(u), false);
    process.env.ADMIN_ALLOWLIST = "tulaj@pelda.hu,masik@pelda.hu";
    assert.equal(isAdminUser(u), true);
  });

  it("semmilyen konfiguráció → a meglévő jelző marad (fail-open a meglévő adminokra), de új jogot nem ad", () => {
    assert.equal(adminPolicy().source, "none");
    assert.equal(isAdminUser(admin("barki@pelda.hu")), true);
    assert.equal(isAdminUser(admin("barki@pelda.hu", { isAdmin: false })), false);
    assert.equal(isAdminUser(admin("barki@pelda.hu", { isBanned: true })), false);
    assert.equal(isAllowlistedAdminEmail("barki@pelda.hu"), false, "listára vétel nélkül új admin-jog nem adható");
  });
});

describe("JM7c-1 / review #462 — tárolt jelző és az eltérés oka", () => {
  it("tiltott / listán kívüli jelzős fiók: tárolt jelző igaz, ok megnevezve; érvényes adminnál és jelző nélkül nincs ok", () => {
    setEnv({ ADMIN_ALLOWLIST: "tulaj@pelda.hu" });
    assert.equal(adminInactiveReason(admin("tulaj@pelda.hu", { isBanned: true })), "tiltott");
    assert.equal(adminInactiveReason(admin("regi@pelda.hu")), "nincs-a-listan");
    assert.equal(adminInactiveReason(admin("tulaj@pelda.hu")), null);
    assert.equal(adminInactiveReason(admin("diak@pelda.hu", { isAdmin: false })), null);
    assert.equal(storedAdminFlag(admin("regi@pelda.hu")), true);
    assert.equal(storedAdminFlag(admin("regi@pelda.hu", { isAdmin: false })), false);
  });
});

describe("JM7c-1 — kizárás elleni őr", () => {
  const fakeDb = (emails: (string | null)[] | Error) => {
    const calls: string[] = [];
    return {
      calls,
      db: { query: async (sql: string) => { calls.push(sql); if (emails instanceof Error) throw emails; return { rows: emails.map((email) => ({ email })) }; } },
    };
  };

  it("a lista létező admin-fiókra illik → szigorú: a listán kívüli jelzős fiók nem admin", async () => {
    setEnv({ ADMIN_ALLOWLIST: "tulaj@pelda.hu" });
    const f = fakeDb(["Tulaj@pelda.hu", "regi-admin@pelda.hu"]);
    configureAdminAccess(f.db);
    await prepareAdminAccess(admin("regi-admin@pelda.hu"));
    assert.equal(isAdminUser(admin("regi-admin@pelda.hu")), false);
    assert.equal(isAdminUser(admin("tulaj@pelda.hu")), true);
    assert.match(f.calls[0]!, /is_admin = true AND COALESCE\(is_banned, false\) = false/);
  });

  it("a lista egyetlen létező adminra sem illik (elírás) → a meglévő jelző marad; új jogot ez sem ad", async () => {
    setEnv({ ADMIN_ALLOWLIST: "tulja@pelda.hu" });
    configureAdminAccess(fakeDb(["tulaj@pelda.hu"]).db);
    assert.equal(isAdminUser(admin("tulaj@pelda.hu")), false, "frissítés előtt szigorú");
    await prepareAdminAccess(admin("tulaj@pelda.hu"));
    assert.equal(isAdminUser(admin("tulaj@pelda.hu")), true, "a tulajdonos nincs kizárva");
    assert.equal(isAdminUser(admin("diak@pelda.hu", { isAdmin: false })), false, "jelző nélkül továbbra sem admin");
    assert.equal(isAdminUser(admin("tulaj@pelda.hu", { isBanned: true })), false, "tiltott továbbra sem admin");
    assert.equal(isAllowlistedAdminEmail("tulaj@pelda.hu"), false, "új admin-jog nem adható");
  });

  it("listás fióknál és jelző nélküli fióknál nincs lekérdezés", async () => {
    setEnv({ ADMIN_ALLOWLIST: "tulaj@pelda.hu" });
    const f = fakeDb(["tulaj@pelda.hu"]);
    configureAdminAccess(f.db);
    await prepareAdminAccess(admin("tulaj@pelda.hu"));
    await prepareAdminAccess(admin("diak@pelda.hu", { isAdmin: false }));
    assert.equal(f.calls.length, 0);
  });

  it("a negatív (őr-aktív) eredmény nem öröklődik: ha közben létrejön a listás admin, a következő kérés már szigorú", async () => {
    // e2e-ben mért verseny (2026-11-16): induláskor üres adatbázis → őr aktív; 3 s múlva a listás admin már létezett, de a
    // gyorsítótárazott negatív eredmény miatt a listán kívüli jelzős fiók admin lett volna.
    setEnv({ ADMIN_ALLOWLIST: "tulaj@pelda.hu" });
    const rows: string[] = ["regi-admin@pelda.hu"];
    configureAdminAccess({ query: async () => ({ rows: rows.map((email) => ({ email })) }) });
    await reportAdminAccessStatus();
    rows.push("tulaj@pelda.hu");
    await prepareAdminAccess(admin("regi-admin@pelda.hu"));
    assert.equal(isAdminUser(admin("regi-admin@pelda.hu")), false);
  });

  it("lekérdezési hiba → az őr nem kapcsol be (szigorú marad)", async () => {
    setEnv({ ADMIN_ALLOWLIST: "tulja@pelda.hu" });
    configureAdminAccess(fakeDb(new Error("db le")).db);
    await prepareAdminAccess(admin("tulaj@pelda.hu"));
    assert.equal(isAdminUser(admin("tulaj@pelda.hu")), false);
  });

  it("a lista futás közbeni cseréje új lekérdezést kér (a régi eredmény nem érvényes az új listára)", async () => {
    setEnv({ ADMIN_ALLOWLIST: "tulja@pelda.hu" });
    const f = fakeDb(["tulaj@pelda.hu", "masik@pelda.hu"]);
    configureAdminAccess(f.db);
    await prepareAdminAccess(admin("tulaj@pelda.hu"));
    assert.equal(isAdminUser(admin("masik@pelda.hu")), true, "őr aktív");
    process.env.ADMIN_ALLOWLIST = "tulaj@pelda.hu";
    assert.equal(isAdminUser(admin("masik@pelda.hu")), false, "új lista: az előző őr-állapot nem érvényes");
    await prepareAdminAccess(admin("masik@pelda.hu"));
    assert.equal(isAdminUser(admin("masik@pelda.hu")), false, "a lista illik a tulajdonosra → szigorú");
    assert.equal(f.calls.length, 2);
  });
});

describe("JM7c-1 — Google-os első belépés: új sor jelzőt csak listás címmel kap", () => {
  function fakeStore(existing: { id: string; email: string; isAdmin: boolean }[]) {
    const upserts: Record<string, unknown>[] = [];
    return {
      upserts,
      store: {
        async getUserByEmail(email: string) { return (existing.find((u) => u.email === email) ?? null) as never; },
        async upsertUser(data: Record<string, unknown>) { upserts.push(data); return { id: "u", ...data } as never; },
      },
    };
  }
  const run = (verify: ReturnType<typeof createGoogleVerify>, email: string) => new Promise<unknown>((resolve) => {
    void verify({ id: "g", emails: [{ value: email, verified: true }] }, (_err, user) => resolve(user));
  });

  it("alapból az adminPolicy listája dönt (ADMIN_EMAIL alapérték; kis- / nagybetű)", async () => {
    setEnv({ ADMIN_EMAIL: "tulaj@pelda.hu" });
    const a = fakeStore([]);
    await run(createGoogleVerify(a.store), "Tulaj@Pelda.hu");
    assert.equal(a.upserts[0]!.isAdmin, true);
    const b = fakeStore([]);
    await run(createGoogleVerify(b.store), "diak@pelda.hu");
    assert.equal(b.upserts[0]!.isAdmin, false);
  });

  it("konfiguráció nélkül senki nem kap új jelzőt", async () => {
    const a = fakeStore([]);
    await run(createGoogleVerify(a.store), "barki@pelda.hu");
    assert.equal(a.upserts[0]!.isAdmin, false);
  });
});

describe("JM7c-1 — AdminStateStore (login-CSRF)", () => {
  type Sess = { adminOauthStates?: Record<string, { v: string; t: number }> };
  const req = (session: Sess) => ({ session }) as never;
  const store = new AdminStateStore();
  const put = (session: Sess, verifier = "ver") => new Promise<string>((resolve, reject) => {
    store.store(req(session), verifier, undefined, {}, (err, h) => (err ? reject(err) : resolve(h!)));
  });
  const check = (session: Sess, provided: unknown) => new Promise<string | false>((resolve) => {
    store.verify(req(session), provided, (_err, ok) => resolve(ok));
  });

  it("a passport-oauth2 szerződés alakja (store: 5, verify: 3 paraméter → PKCE)", () => {
    assert.equal(store.store.length, 5);
    assert.equal(store.verify.length, 3);
  });

  it("`a.` előtag, egyszer használható, a PKCE-ellenőrzőt adja vissza", async () => {
    const s: Sess = {};
    const h = await put(s, "pkce-verifier");
    assert.ok(h.startsWith(ADMIN_STATE_PREFIX) && isAdminState(h), h);
    assert.equal(await check(s, h), "pkce-verifier");
    assert.equal(await check(s, h), false, "második beváltás");
  });

  it("idegen munkamenet, hamis, hiányzó és játékos-előtagú state → elutasítva", async () => {
    const mine: Sess = {};
    const other: Sess = {};
    const h = await put(other);
    await put(mine);
    for (const bad of [h, undefined, "", `a.${"A".repeat(32)}`, `p.${h.slice(2)}`, "__proto__", "constructor"]) {
      assert.equal(await check(mine, bad), false, String(bad));
    }
  });

  it("15 perc után lejár; legfeljebb 5 függő belépés", async () => {
    const s: Sess = {};
    const h = await put(s);
    s.adminOauthStates![h]!.t -= 15 * 60_000;
    assert.equal(await check(s, h), false);
    const handles: string[] = [];
    for (let i = 0; i < 7; i++) handles.push(await put(s));
    assert.equal(Object.keys(s.adminOauthStates!).length, 5);
    assert.equal(await check(s, handles[6]), "ver", "a legújabb érvényes");
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { adventAnnounceEmail, ADVENT_ANNOUNCE_PATH } from "../shared/advent/announce-email";
import { announceAdvent, announceRecipientHash, collectAnnounceRecipients, type AnnounceDeps } from "../server/advent/announce";
import { adventAnnounceSender, setAdventAnnounceSender } from "../server/advent/announce-sender";

// S8 — adventi értesítő levél (A37–A39): a sablon, a címzettszabály, a száraz futás, a megerősítés és az ismételt küldés.

test("sablon: tárgy az évaddal, a gomb a /adventi-naptar címre mutat, leiratkozási sor, HTML-escape a címben", () => {
  const { subject, html } = adventAnnounceEmail({ season: 2026, baseUrl: "https://websuli.vip/" });
  assert.match(subject, /adventi naptára \(2026\)/);
  assert.ok(html.includes(`href="https://websuli.vip${ADVENT_ANNOUNCE_PATH}"`));
  assert.match(html, /leiratkozhatsz a platformon belül/);
  assert.ok(adventAnnounceEmail({ season: 2026, baseUrl: 'https://x.hu/"><script>' }).html.includes("&quot;&gt;&lt;script&gt;"));
});

test("címzettek (A39): csak feliratkozók és külön címek; kisbetű, trim, ismétlődés- és érvénytelencím-szűrés, forrásonkénti szám", () => {
  const r = collectAnnounceRecipients({ subscriptions: [" Anna@Pelda.hu ", "anna@pelda.hu", "rossz-cim", null], extras: ["ANNA@pelda.hu", "bela@pelda.hu", ""] });
  assert.deepEqual(r.list, [{ email: "anna@pelda.hu", source: "subscription" }, { email: "bela@pelda.hu", source: "extra" }]);
  assert.deepEqual(r.bySource, { subscription: 1, extra: 1 });
});

/** Memóriabeli `advent_announcements` a lekérdezések szövegére illesztve (a valódi SQL-t a DB-teszt fedi). */
function fakeDb() {
  const rows = new Map<string, { id: string; status: string }>();
  let n = 0;
  return {
    rows,
    async query(sql: string, params: unknown[] = []) {
      if (sql.startsWith("SELECT recipient_hash")) return { rows: [...rows].filter(([, v]) => v.status === "sent").map(([k]) => ({ recipient_hash: k.split("|")[1] })) };
      if (sql.startsWith("INSERT INTO advent_announcements")) {
        const k = `${params[0]}|${params[1]}`; const cur = rows.get(k);
        if (cur && cur.status !== "failed") return { rows: [] };
        const row = cur ?? { id: `r${++n}`, status: "pending" }; row.status = "pending"; rows.set(k, row);
        return { rows: [{ id: row.id }] };
      }
      const m = /SET status = '(sent|failed)'/.exec(sql);
      if (m) { for (const v of rows.values()) if (v.id === params[0]) v.status = m[1]!; return { rows: [] }; }
      throw new Error(`váratlan SQL: ${sql}`);
    },
  };
}

function deps(over: Partial<AnnounceDeps> = {}) {
  const db = fakeDb();
  const sent: string[] = [];
  const d: AnnounceDeps = {
    db, season: 2026, baseUrl: "https://websuli.vip", secret: () => "titok",
    recipients: async () => ({ subscriptions: ["a@x.hu", "b@x.hu"], extras: ["c@x.hu"] }),
    send: async (to) => { sent.push(to); },
    ...over,
  };
  return { d, db, sent };
}

test("száraz futás (A37): darabszám és levél, cím nélkül; nem ír és nem küld", async () => {
  const { d, db, sent } = deps();
  const r = await announceAdvent(d, { dryRun: true });
  assert.equal(r.status, 200);
  assert.ok(r.status === 200 && r.dryRun && r.recipients === 3 && r.alreadySent === 0);
  assert.ok(!JSON.stringify(r).includes("@x.hu"), "a válaszban nincs e-mail-cím");
  assert.equal(db.rows.size, 0); assert.equal(sent.length, 0);
});

test("éles küldés (A38): rossz confirmCount → 409 küldés nélkül; jóval mindenki egyszer kap; a második küldés nem dupláz", async () => {
  const { d, sent } = deps();
  const bad = await announceAdvent(d, { dryRun: false, confirmCount: 2 });
  assert.equal(bad.status, 409); assert.equal(sent.length, 0);
  const ok = await announceAdvent(d, { dryRun: false, confirmCount: 3 });
  assert.deepEqual(ok, { status: 200, dryRun: false, sent: 3, failed: 0, skipped: 0 });
  const again = await announceAdvent(d, { dryRun: false, confirmCount: 3 });
  assert.deepEqual(again, { status: 200, dryRun: false, sent: 0, failed: 0, skipped: 3 });
  assert.equal(sent.length, 3);
  const dry = await announceAdvent(d, { dryRun: true });
  assert.ok(dry.status === 200 && dry.dryRun && dry.alreadySent === 3);
});

test("hibás küldés: a sor failed lesz, és a következő küldés újrapróbálja (csak azt)", async () => {
  let fail = true;
  const { d, sent } = deps({ send: async (to) => { if (fail && to === "b@x.hu") throw new Error("hálózat"); sent.push(to); } });
  const first = await announceAdvent(d, { dryRun: false, confirmCount: 3 });
  assert.deepEqual(first, { status: 200, dryRun: false, sent: 2, failed: 1, skipped: 0 });
  fail = false;
  const second = await announceAdvent(d, { dryRun: false, confirmCount: 3 });
  assert.deepEqual(second, { status: 200, dryRun: false, sent: 1, failed: 0, skipped: 2 });
  assert.deepEqual([...sent].sort(), ["a@x.hu", "b@x.hu", "c@x.hu"]);
});

test("titok nélkül 503; a lenyomat kulcsolt és kisbetű-független", async () => {
  assert.equal((await announceAdvent(deps({ secret: () => null }).d, { dryRun: true })).status, 503);
  assert.equal(announceRecipientHash("k", "A@X.hu"), announceRecipientHash("k", "a@x.hu"));
  assert.notEqual(announceRecipientHash("k1", "a@x.hu"), announceRecipientHash("k2", "a@x.hu"));
});

test("tesztben / e2e-módban valódi levél nem megy ki: a beállított hamis küldő nélkül a küldő hibát dob", async () => {
  setAdventAnnounceSender(null);
  await assert.rejects(adventAnnounceSender({ NODE_ENV: "test" })("a@x.hu", "t", "h", "k"), /valódi értesítő levél nem küldhető/);
  await assert.rejects(adventAnnounceSender({ NODE_ENV: "production", WEBSULI_E2E: "1" })("a@x.hu", "t", "h", "k"), /nem küldhető/);
  const calls: string[] = [];
  setAdventAnnounceSender(async (to) => { calls.push(to); });
  await adventAnnounceSender({ NODE_ENV: "test" })("a@x.hu", "t", "h", "k");
  setAdventAnnounceSender(null);
  assert.deepEqual(calls, ["a@x.hu"]);
});

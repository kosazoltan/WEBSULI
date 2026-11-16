import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTicketService, ticketSecret } from "../server/realtime/ticket";

/**
 * JM2 — belépőjegy (végrehajtás JM2 4. lépés; terv 10.3 6. pont): aláírt, ≤ 60 s, egyszer használatos, szándékhoz kötött.
 * Lejárt, újrahasznált, hamis aláírású, más kulccsal aláírt, csonka jegy → elutasítás.
 */

const claims = { kind: "guest" as const, sub: "guest:abc", nickname: "Fürge Vidra", avatar: null, grade: null, intent: { kind: "create" as const, code: null } };

describe("JM2 belépőjegy", () => {
  it("érvényes jegy egyszer váltható be, másodszor REUSED", () => {
    const svc = createTicketService({ secret: "s".repeat(40) });
    const { ticket } = svc.issue(claims);
    const first = svc.consume(ticket);
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.claims.nickname, "Fürge Vidra");
      assert.deepEqual(first.claims.intent, { kind: "create", code: null });
    }
    assert.deepEqual(svc.consume(ticket), { ok: false, reason: "REUSED" });
  });

  it("lejárt jegy (60 s után) → EXPIRED; az élettartam legfeljebb 60 s akkor is, ha hosszabbat kérnek", () => {
    let now = 1_000_000;
    const svc = createTicketService({ secret: "s".repeat(40), now: () => now, ttlMs: 600_000 });
    assert.equal(svc.ttlMs, 60_000);
    const { ticket, expiresAt } = svc.issue(claims);
    assert.equal(expiresAt, now + 60_000);
    now += 60_000;
    assert.deepEqual(svc.consume(ticket), { ok: false, reason: "EXPIRED" });
  });

  it("hamis / módosított aláírás, más kulcs, módosított törzs → SIGNATURE; csonka → MALFORMED", () => {
    const svc = createTicketService({ secret: "s".repeat(40) });
    const other = createTicketService({ secret: "t".repeat(40) });
    const { ticket } = svc.issue(claims);
    const [body, sig] = ticket.split(".");
    assert.equal(other.consume(ticket).ok, false);
    assert.deepEqual(other.consume(ticket), { ok: false, reason: "SIGNATURE" });
    const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), kind: "admin" })).toString("base64url");
    assert.deepEqual(svc.consume(`${forgedBody}.${sig}`), { ok: false, reason: "SIGNATURE" });
    assert.deepEqual(svc.consume(`${body}.${sig!.slice(0, -2)}AA`), { ok: false, reason: "SIGNATURE" });
    for (const bad of ["", "abc", "a.b.c", `${body}.`, 42, null, "x".repeat(2000)]) assert.equal(svc.consume(bad).ok, false);
  });

  it("a jegy nem tartalmaz e-mailt / valódi nevet (csak a megadott becenevet) és nem URL-es", () => {
    const svc = createTicketService({ secret: "s".repeat(40) });
    const { ticket } = svc.issue(claims);
    const decoded = Buffer.from(ticket.split(".")[0]!, "base64url").toString();
    assert.equal(/@/.test(decoded), false);
    assert.deepEqual(Object.keys(JSON.parse(decoded)).sort(), ["avatar", "exp", "grade", "intent", "kind", "nickname", "nonce", "sub", "v"]);
    assert.match(ticket, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  // Review #452 ALACSONY-7: rögzített (a repóban látható) tartalék-kulcs SEHOL — titok nélkül nincs jegy.
  it("titok: SESSION_SECRET nélkül (bármely környezetben) nincs jegy; túl rövid titok sem elég", () => {
    assert.equal(ticketSecret({ NODE_ENV: "production" }), null);
    assert.equal(ticketSecret({ NODE_ENV: "development" }), null);
    assert.equal(ticketSecret({}), null);
    assert.equal(ticketSecret({ SESSION_SECRET: "rövid" }), null);
    assert.equal(ticketSecret({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(32) }), "x".repeat(32));
  });
});

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { PlayerStateStore } from "../server/player/google";
import { createTicketService } from "../server/realtime/ticket";
import { withDifferentChar } from "./support/tamper";

/**
 * A tesztek „hamisítása” (docs/specs/2026-11-20-teszt-hamisitas-utkozes.md): a régi minta (`slice(0, -2)` + rögzített végződés)
 * ugyanazt az értéket adta, ha a véletlen érték már így végződött — a szerver jogosan elfogadta, a teszt hibásan bukott
 * (OAuth state: 1/4096, belépőjegy-aláírás: ~1/1024). A közös segéd mindig eltérő értéket ad.
 */
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

describe("withDifferentChar (A1, A2)", () => {
  it("mindig eltér, azonos hosszú, és csak a megadott pozícióban különbözik (negatív index a végétől)", () => {
    for (let n = 0; n < 200; n++) {
      const value = randomBytes(24).toString("base64url");
      for (const index of [0, 5, value.length - 1, -1, -2]) {
        const out = withDifferentChar(value, index);
        const at = index < 0 ? value.length + index : index;
        assert.equal(out.length, value.length);
        assert.notEqual(out[at], value[at]);
        assert.equal(out.slice(0, at) + out.slice(at + 1), value.slice(0, at) + value.slice(at + 1));
        assert.ok(B64URL.includes(out[at]!), "a base64url ábécében marad");
      }
    }
    for (const c of B64URL) assert.notEqual(withDifferentChar(`${c}xyz`, 0)[0], c, c);
  });

  it("tartományon kívüli index és üres érték: kivétel (nincs csendes „hamisítás”)", () => {
    assert.throws(() => withDifferentChar("", 0));
    assert.throws(() => withDifferentChar("abc", 3));
    assert.throws(() => withDifferentChar("abc", -4));
  });

  it("base64url-aláírás ELSŐ karakterének cseréje a dekódolt bájtokat is megváltoztatja — minden első karakterre", () => {
    const sig = randomBytes(32).toString("base64url");
    for (const c of B64URL) {
      const value = `${c}${sig.slice(1)}`;
      assert.notDeepEqual(Buffer.from(withDifferentChar(value, 0), "base64url"), Buffer.from(value, "base64url"), c);
    }
    // Ellenpélda (terv 4.): az UTOLSÓ karakter alsó bitjei kitöltés — ott a csere ugyanazt a bájtsort adhatja.
    const last = `${sig.slice(0, -1)}A`;
    assert.deepEqual(Buffer.from(`${sig.slice(0, -1)}B`, "base64url"), Buffer.from(last, "base64url"));
  });
});

describe("a régi hamisítás ütközése, a valódi szerverkóddal (A3)", () => {
  it("OAuth state „…xx” végződéssel: a régi `slice(0, -2) + xx` elfogadott (azonos), az új elutasított", () => {
    const store = new PlayerStateStore();
    let found: { req: { session: Record<string, unknown> }; state: string } | null = null;
    for (let i = 0; i < 200_000 && !found; i++) {
      const req = { session: {} };
      store.store(req as never, "verifier", null, null, (_err, handle) => { if (handle?.endsWith("xx")) found = { req, state: handle }; });
    }
    assert.ok(found, "200 000 próbán belül van „xx”-re végződő state (várható ~4096)");
    const { req, state } = found as { req: { session: Record<string, unknown> }; state: string };
    const fresh = () => ({ session: { playerOauthStates: { ...(req.session.playerOauthStates as object) } } });
    const verdict = (r: unknown, provided: string) => { let ok: string | false = false; store.verify(r as never, provided, (_e, v) => { ok = v; }); return ok; };
    assert.equal(`${state.slice(0, -2)}xx`, state, "a régi hamisítás azonos értéket ad");
    assert.equal(verdict(fresh(), `${state.slice(0, -2)}xx`), "verifier", "…és a szerver jogosan elfogadja — ez volt a bukás");
    assert.equal(verdict(fresh(), withDifferentChar(state, -1)), false, "az új hamisítás elutasított");
  });

  it("belépőjegy „…AA” aláírással: a régi `slice(0, -2) + AA` elfogadott (azonos bájtok), az új SIGNATURE", () => {
    const svc = createTicketService({ secret: "s".repeat(40) });
    const claims = { kind: "guest" as const, sub: "guest:abc", nickname: "Fürge Vidra", avatar: null, grade: null, intent: { kind: "create" as const, code: null } };
    let ticket: string | null = null;
    for (let i = 0; i < 200_000 && !ticket; i++) {
      const t = svc.issue(claims).ticket;
      if (t.endsWith("AA")) ticket = t;
    }
    assert.ok(ticket, "200 000 próbán belül van „AA”-ra végződő aláírás (várható ~1024)");
    const [body, sig] = ticket!.split(".");
    assert.deepEqual(svc.consume(`${body}.${withDifferentChar(sig!, 0)}`), { ok: false, reason: "SIGNATURE" }, "az új hamisítás elutasított");
    assert.equal(svc.consume(`${body}.${sig!.slice(0, -2)}AA`).ok, true, "a régi hamisítás azonos jegy — a szerver jogosan elfogadja");
  });
});

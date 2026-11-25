import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseLearnerToken, signLearnerToken } from "../server/lib/learner-token";
import { PlayerStateStore } from "../server/player/google";
import { createTicketService } from "../server/realtime/ticket";
import { withDifferentChar } from "./support/tamper";

/**
 * A tesztek „hamisítása” (docs/specs/2026-11-20-teszt-hamisitas-utkozes.md): a régi minta (`slice(0, -2)` + rögzített végződés)
 * ugyanazt az értéket adta, ha a véletlen érték már így végződött — a szerver jogosan elfogadta, a teszt hibásan bukott
 * (OAuth state: 1/4096, belépőjegy-aláírás: ~1/1024). A közös segéd mindig eltérő értéket ad. Minden eset rögzített bemenetű
 * (nincs sorsolás, nincs falióra-függés — vak ellenőr 1. kör L1).
 */
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** Rögzített minták: egykarakteres, „A”-val és nem „A”-val kezdődő / végződő, teljes ábécé. */
const SAMPLES = ["A", "z", "AAAA", "p.ABCDEFGHIJKLMNOPQRSTUVWXYZ0123xx", B64URL, "Ks2Cv7TG7RtnLzhR7Al03xWtOa39qVrrl3mQ_J8HDAA"];

describe("withDifferentChar (A1, A2)", () => {
  it("minden pozitív és a megfelelő negatív pozícióban: eltér, azonos hosszú, és csak abban az egy pozícióban különbözik", () => {
    for (const value of SAMPLES) {
      for (let at = 0; at < value.length; at++) {
        for (const index of [at, at - value.length]) {
          const out = withDifferentChar(value, index);
          assert.equal(out.length, value.length, `${value}@${index}`);
          assert.notEqual(out[at], value[at], `${value}@${index}`);
          assert.equal(out.slice(0, at) + out.slice(at + 1), value.slice(0, at) + value.slice(at + 1), `${value}@${index}`);
          assert.ok(B64URL.includes(out[at]!), "a base64url ábécében marad");
        }
      }
    }
    for (const c of B64URL) assert.notEqual(withDifferentChar(c, 0), c, c);
  });

  it("nem egész, tartományon kívüli index és üres érték: kivétel (nincs csendes „hamisítás”)", () => {
    assert.throws(() => withDifferentChar("", 0), RangeError);
    assert.throws(() => withDifferentChar("abc", 3), RangeError);
    assert.throws(() => withDifferentChar("abc", -4), RangeError);
    // L4: a lebegőpontos normalizálás (32 + (-1 - ε) → 31) nem csempészhet át tört indexet.
    assert.throws(() => withDifferentChar("x".repeat(32), -1 - Number.EPSILON), RangeError);
    assert.throws(() => withDifferentChar("abc", 0.5), RangeError);
    assert.throws(() => withDifferentChar("abc", Number.NaN), RangeError);
  });

  it("base64url-aláírás ELSŐ karakterének cseréje a dekódolt bájtokat is megváltoztatja — minden első karakterre", () => {
    const sig = "Ks2Cv7TG7RtnLzhR7Al03xWtOa39qVrrl3mQ_J8HDAA";
    for (const c of B64URL) {
      const value = `${c}${sig.slice(1)}`;
      assert.notDeepEqual(Buffer.from(withDifferentChar(value, 0), "base64url"), Buffer.from(value, "base64url"), c);
    }
    // Ellenpélda (terv 4.): az UTOLSÓ karakter alsó bitjei kitöltés — ott a csere ugyanazt a bájtsort adja.
    assert.deepEqual(Buffer.from(`${sig.slice(0, -1)}B`, "base64url"), Buffer.from(sig, "base64url"));
  });
});

describe("a régi hamisítás ütközése, rögzített értékekkel és a valódi szerverkóddal (A3)", () => {
  it("OAuth state „…xx” végződéssel: a régi `slice(0, -2) + xx` azonos és elfogadott, az új elutasított", (t) => {
    // KB #212: befagyasztott óra — a bizonyíték nem függhet a falióra állásától vagy ugrásától (a rekord időbélyege és a
    // PlayerStateStore.verify saját Date.now()-ja ugyanazt a rögzített pillanatot látja).
    const NOW = 1_800_000_000_000;
    t.mock.timers.enable({ apis: ["Date"], now: NOW });
    const store = new PlayerStateStore();
    const state = "p.ABCDEFGHIJKLMNOPQRSTUVWXYZ0123xx";
    // A munkamenet-rekord olyan, amilyet a PlayerStateStore.store ír (verifier, visszatérési cél, időbélyeg).
    const reqWith = () => ({ session: { playerOauthStates: { [state]: { v: "verifier", r: null, t: NOW } } } });
    const verdict = (provided: string) => { let ok: string | false = false; store.verify(reqWith() as never, provided, (_e, v) => { ok = v; }); return ok; };
    assert.equal(verdict(state), "verifier", "az eredeti state érvényes");
    assert.equal(`${state.slice(0, -2)}xx`, state, "a régi hamisítás azonos értéket ad");
    assert.equal(verdict(`${state.slice(0, -2)}xx`), "verifier", "…és a szerver jogosan elfogadja — ez volt a bukás");
    assert.equal(verdict(withDifferentChar(state, -1)), false, "az új hamisítás elutasított");
  });

  it("belépőjegy „…AA” aláírással: a régi `slice(0, -2) + AA` azonos jegy és elfogadott, az új pontosan SIGNATURE", () => {
    // Rögzített jegy, amelyet ez a szolgáltatás (ugyanaz a titok, befagyasztott óra) állított elő; az aláírás „AA”-ra végződik.
    const NOW = 1_800_000_000_000;
    const TICKET = "eyJ2IjoxLCJraW5kIjoiZ3Vlc3QiLCJzdWIiOiJndWVzdDphYmMiLCJuaWNrbmFtZSI6IkbDvHJnZSBWaWRyYSIsImF2YXRhciI6bnVsbCwiZ3JhZGUiOm51bGwsImludGVudCI6eyJraW5kIjoiY3JlYXRlIiwiY29kZSI6bnVsbH0sImV4cCI6MTgwMDAwMDA2MDAwMCwibm9uY2UiOiJZQ1pLb3NaZUYzdkxYb3JvVXBfMVdnIn0.Ks2Cv7TG7RtnLzhR7Al03xWtOa39qVrrl3mQ_J8HDAA";
    const service = () => createTicketService({ secret: "s".repeat(40), now: () => NOW });
    const [body, sig] = TICKET.split(".");
    assert.equal(service().consume(TICKET).ok, true, "az eredeti jegy érvényes");
    assert.equal(`${body}.${sig!.slice(0, -2)}AA`, TICKET, "a régi hamisítás azonos jegyet ad");
    assert.equal(service().consume(`${body}.${sig!.slice(0, -2)}AA`).ok, true, "…és a szerver jogosan elfogadja — ez volt a bukás");
    assert.deepEqual(service().consume(`${body}.${withDifferentChar(sig!, 0)}`), { ok: false, reason: "SIGNATURE" }, "az új hamisítás pontosan SIGNATURE");
  });

  it("tanulói token „…AAAA” aláírással (a DB-teszt futásonként véletlen kulcsa mellett előfordulhat): a régi `slice(0, -4) + AAAA` elfogadott, az új null", () => {
    // Rögzített kulcs, amellyel a „jm7b-learner-1” 1-es tokenje „AAAA”-ra végződik (offline keresés, 5 188 597. próba).
    const SECRET = "harness-secret-5188596";
    const token = signLearnerToken("jm7b-learner-1", 1, SECRET);
    assert.equal(token, "jm7b-learner-1.1.ENFbZJdHqh8Sc3JYicAAAA");
    assert.equal(`${token.slice(0, -4)}AAAA`, token, "a régi hamisítás azonos tokent ad");
    assert.deepEqual(parseLearnerToken(`${token.slice(0, -4)}AAAA`, SECRET), { id: "jm7b-learner-1", version: 1 }, "…és a szerver jogosan elfogadja");
    assert.equal(parseLearnerToken(withDifferentChar(token, -1), SECRET), null, "az új hamisítás elutasított");
  });
});

describe("a játékos-tár state-élettartamának határa befagyasztott órán (A5, review PR #547)", () => {
  it("PlayerStateStore.verify: 15 perc − 1 ms érvényes, pontosan 15 perc lejárt (külön rekordokkal)", (t) => {
    // Az admin-tár határa az admin-access.test.ts-ben bizonyított; ez a játékos-tár (server/player/google.ts) párja.
    // A „pontosan 15 perc” eset elkapja a `>=` → `>` mutációt (azzal a lejárt rekord elfogadott lenne).
    const NOW = 1_800_000_000_000;
    const TTL = 15 * 60_000;
    t.mock.timers.enable({ apis: ["Date"], now: NOW });
    const store = new PlayerStateStore();
    const verdict = (state: string, age: number) => {
      const req = { session: { playerOauthStates: { [state]: { v: `verifier-${state}`, r: null, t: NOW - age } } } };
      let ok: string | false | undefined;
      store.verify(req as never, state, (_e, v) => { ok = v; });
      assert.deepEqual(req.session.playerOauthStates, {}, "a rekord egyszer használatos — ellenőrzéskor törlődik");
      return ok;
    };
    assert.equal(verdict("p.friss", TTL - 1), "verifier-p.friss", "15 perc − 1 ms: érvényes");
    assert.equal(verdict("p.lejart", TTL), false, "pontosan 15 perc: lejárt");
    assert.equal(verdict("p.regi", TTL + 1), false, "15 perc + 1 ms: lejárt");
  });
});

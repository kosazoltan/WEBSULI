/**
 * JM7b — a regisztrált becenév szűrője és foglaltsági kulcsa (shared/player-nickname.ts; terv 10.4, 10.9; JM-A11).
 * A láthatatlan / kétirányú karaktereket `String.fromCodePoint`-tal állítjuk elő (a forrásban nyers vezérlőjel ne legyen).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NICKNAME_MESSAGES, PLAYER_NICK_MAX, checkPlayerNickname, nicknameKey, prepareNickname, suggestNicknames, withDiscriminator,
  type NicknameProblem,
} from "../shared/player-nickname";

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const problemsOf = (s: string): NicknameProblem[] => {
  const r = checkPlayerNickname(s);
  return r.ok ? [] : r.problems;
};
const ok = (s: string) => {
  const r = checkPlayerNickname(s);
  assert.ok(r.ok, `elfogadandó: ${JSON.stringify(s)} → ${r.ok ? "" : r.problems.join(",")}`);
  return r;
};
const rejectsWith = (s: string, p: NicknameProblem) => assert.ok(problemsOf(s).includes(p), `${JSON.stringify(s)} → ${p} várt, kapott: ${problemsOf(s).join(",") || "OK"}`);

describe("JM7b — becenév: elfogadott alakok (ellenpróbák is)", () => {
  it("magyar ékezetes nevek, számok, szóköz, _ és - elfogadva; az előkészítés NFKC + szóköz-egységesítés", () => {
    for (const n of ["Villám Róka", "Ödön_99", "Kis-Kata", "Űrhajós Ő", "abc", "Árvíztűrő", "Bátor Sólyom"]) ok(n);
    assert.equal(ok("  Fürge   Vidra  ").nickname, "Fürge Vidra");
    assert.equal(prepareNickname("Ｐａｎｄａ"), "Panda", "teljes szélességű betűk NFKC-vel");
  });

  it("ártatlan szavak, amelyekben tiltott tő lapulna, NEM esnek ki", () => {
    for (const n of ["Szarvas", "Fosztó", "Segítő", "Badminton", "Grape", "Peacock", "Dickens", "Ignazio", "Basszus", "Pinata", "Kakadu"]) ok(n);
  });

  it("hossz: 3–16 karakter a megkülönböztető nélkül; a #1234 utótag megengedett", () => {
    rejectsWith("ab", "LENGTH_SHORT");
    rejectsWith("a".repeat(PLAYER_NICK_MAX + 1), "LENGTH_LONG");
    ok("a".repeat(PLAYER_NICK_MAX));
    ok(`${"a".repeat(PLAYER_NICK_MAX)}#0042`);
    rejectsWith("1234", "NO_LETTER");
  });
});

describe("JM7b — becenév: tiltott karakterek, homoglifák", () => {
  it("vezérlő-, nulla szélességű és kétirányú karakter → INVISIBLE (a normalizálás előtt és után is)", () => {
    for (const c of [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0xfeff, 0x0007, 0x2028, 0xe000]) {
      rejectsWith(`Kata${cp(c)}Bot`, "INVISIBLE");
    }
  });

  it("HTML / szkript-karakterek és írásjelek → CHARS (a megjelenítés amúgy is szövegként történik)", () => {
    for (const n of ["<script>", "a&b;c", "Kata\"x", "x'y'z", "Kata.Bot", "Kata/Bot", "a😀bc"]) rejectsWith(n, "CHARS");
  });

  it("kombináló jelek halmozása (zalgo) → CHARS", () => {
    rejectsWith(`Ka${cp(0x0301, 0x0301, 0x0301)}ta`, "CHARS");
  });

  it("nem latin írás (cirill / görög homoglifa, nem ASCII számjegy) → SCRIPT", () => {
    rejectsWith(`${cp(0x0430)}dmin`, "SCRIPT"); // cirill „а”
    rejectsWith(`P${cp(0x03bf)}nda`, "SCRIPT"); // görög „ο”
    rejectsWith(`Kata${cp(0x0663)}`, "SCRIPT"); // arab-indiai 3
  });
});

describe("JM7b — becenév: e-mail, URL, telefonszám, trágárság, megtévesztés", () => {
  it("e-mail-, URL- és telefonszám-szerű minta tiltva", () => {
    rejectsWith("kata@gmail", "EMAIL");
    rejectsWith("kata gmail", "EMAIL");
    rejectsWith("kata kukac freemail pont hu", "EMAIL");
    rejectsWith("www kata", "URL");
    rejectsWith("httpKata", "URL");
    rejectsWith("Kata pont hu", "URL");
    rejectsWith("Kata 06301234567", "PHONE");
    rejectsWith("Kata123456", "PHONE");
    ok("Kata12345");
  });

  it("trágár kifejezés magyarul és angolul, leet / ékezet / ismétlés / szóköz-tagolás ellenére is", () => {
    for (const n of ["Fasz", "f4sz", "F a s z", "Kuuurva", "kurv4", "Gécí", "Bitch", "sh1t", "FUCK", "Hülye", "Seggfej", "idióta", "Nazi", "Hitler"]) {
      rejectsWith(n, "BLOCKED");
    }
  });

  it("hivatalosnak látszó / megtévesztő nevek tiltva (admin, moderátor, websuli, tanár …), leet-tel is", () => {
    for (const n of ["Admin", "4dm1n", "Moderátor", "WebSuli", "Web Suli", "Tanár Úr", "Tanárnő", "Igazgató", "Support", "mod", "Rendszer"]) {
      rejectsWith(n, "RESERVED");
    }
  });

  it("minden hibakódnak van magyar üzenete", () => {
    for (const [code, msg] of Object.entries(NICKNAME_MESSAGES)) assert.ok(msg.length > 10, code);
  });
});

describe("JM7b — foglaltsági kulcs és ajánlások", () => {
  it("a kulcs kis-/nagybetű-, ékezet- és elválasztó-független, az összetéveszthetőket egybevonja", () => {
    assert.equal(nicknameKey("Kata"), nicknameKey("KÁTA"));
    assert.equal(nicknameKey("Kis-Kata"), nicknameKey("kis kata"));
    assert.equal(nicknameKey("Kis_Kata"), nicknameKey("KisKata"));
    assert.equal(nicknameKey("Leo"), nicknameKey("1eo"));
    assert.equal(nicknameKey("Leo"), nicknameKey("Ieo"));
    assert.equal(nicknameKey("Bo0"), nicknameKey("boo"));
    assert.notEqual(nicknameKey("Kata"), nicknameKey("Kati"));
    assert.ok(nicknameKey(`${"Á".repeat(16)}#9999`).length <= 32, "a kulcs elfér a varchar(32)-ben");
  });

  it("a megkülönböztetős alak érvényes, és a kulcsa eltér az alapnévtől", () => {
    const v = withDiscriminator("Fürge Vidra", 42);
    assert.equal(v, "Fürge Vidra#0042");
    assert.ok(checkPlayerNickname(v).ok);
    assert.notEqual(nicknameKey(v), nicknameKey("Fürge Vidra"));
    assert.equal(withDiscriminator("Fürge Vidra#0042", 7), "Fürge Vidra#0007", "a meglévő utótag lecserélődik");
  });

  it("az ajánlott becenevek mind átmennek a szűrőn, és nem ismétlődnek", () => {
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const list = suggestNicknames(rnd, 30);
    assert.ok(list.length >= 20);
    assert.equal(new Set(list).size, list.length);
    for (const n of list) ok(n);
  });
});

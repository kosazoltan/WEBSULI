/**
 * JM7b — a regisztrált becenév szűrője és foglaltsági kulcsa (shared/player-nickname.ts; terv 10.4, 10.9; JM-A11).
 * A láthatatlan / kétirányú karaktereket `String.fromCodePoint`-tal állítjuk elő (a forrásban nyers vezérlőjel ne legyen).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLOCKED_ROOTS, NICKNAME_MESSAGES, PLAYER_NICK_MAX, RESERVED_ROOTS, checkPlayerNickname, confusableFold, nicknameKey, prepareNickname,
  suggestNicknames, withDiscriminator, type NicknameProblem,
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

describe("JM7b — review #449 K1: engedélylista, a latin írású hasonmás betűk sem mennek át", () => {
  // A hasonmás betűk kódpontjai (forrásban csak számként): kiskapitális A, IPA-alfa, pont nélküli i, kiskapitális L,
  // IPA-g, æ, kiskapitális T, IPA-o (nyitott), ſ (hosszú s), kiskapitális K.
  const A_SC = cp(0x1d00), ALPHA = cp(0x0251), DOTLESS_I = cp(0x0131), L_SC = cp(0x029f), G_IPA = cp(0x0261), AE = cp(0x00e6);
  const cases = [
    `${A_SC}dmin`, `${ALPHA}dmin`, `Adm${DOTLESS_I}n`, `t${ALPHA}n${ALPHA}r`, `Ig${ALPHA}zg${ALPHA}to`, `websu${L_SC}i`, `Moder${ALPHA}tor`,
    `f${A_SC}sz`, `kurv${ALPHA}`, `${G_IPA}eci`, `f${AE}sz`, `s${AE}x`, `K${A_SC}t${A_SC}`, `Kat${cp(0x1d00)}`, `${cp(0x1d1b)}anar`, `Mo${cp(0x0254)}a`,
    `${cp(0x1d0b)}ata`, `Kata${cp(0x0131)}`,
  ];
  it("a review megkerülő alakjai MIND elutasítva (és a vendég-szűrő is elutasítja őket)", async () => {
    const jm1 = await import("../shared/nicknames");
    for (const n of cases) {
      const r = checkPlayerNickname(n);
      assert.equal(r.ok, false, `elutasítandó: ${[...n].map((c) => c.codePointAt(0)!.toString(16)).join(" ")}`);
      assert.ok(jm1.nicknameProblems(n).length > 0);
    }
  });
  it("az NFKC által ASCII-ra bontott alak (pl. hosszú s) a TÁROLT alakban már sima betű — nincs hasonmás a névben", () => {
    const r = checkPlayerNickname(`Ka${cp(0x017f)}a`);
    assert.ok(r.ok && r.nickname === "Kasa" && r.key === nicknameKey("Kasa"));
  });
  it("a kontrollok változatlanok: tiltott név ASCII-ban, szóköz-tagolva, cirillel is elutasítva", () => {
    rejectsWith("admin", "RESERVED");
    rejectsWith("Tanár", "RESERVED");
    rejectsWith("a d m i n", "RESERVED");
    rejectsWith(`web${cp(0x0455)}uli`, "SCRIPT");
    rejectsWith("Adm1n", "RESERVED");
    rejectsWith("Mod3r4tor", "RESERVED");
    rejectsWith("Taaanaaar", "RESERVED");
  });
  it("a magyar nevek átmennek", () => {
    for (const n of ["Zsófi", "Őzike_7", "Kis Béla", "Bátor Róka", "Szarvas", "Őzike", "Ügyes_Ödön", "ÁRVÍZTŰRŐ", "Űrhajós-Ili"]) ok(n);
  });
  it("csak ékezetben / kis-nagybetűben / elválasztóban eltérő nevek ütköznek (azonos kulcs)", () => {
    const k = (s: string) => (checkPlayerNickname(s) as { key: string }).key;
    assert.equal(k("Kis Béla"), k("kis_bela"));
    assert.equal(k("Kis Béla"), k("KISBÉLA"));
    assert.equal(k("Kis Béla"), k("Kis-Bela"));
    assert.equal(k("Zsófi"), k("zsofi"));
    assert.equal(k("Őzike_7"), k("ozike 7"));
  });
});

describe("JM7b-utójavítás N1 — kis L / nagy I / 1 felcserélés (review #449 újraellenőrzés)", () => {
  /** A tő minden l / i pozícióján minden összetéveszthető jel (kis- és nagybetűvel, számjeggyel). */
  const confusableVariants = (root: string): string[] => {
    let out = [""];
    for (const ch of root) {
      const opts = ch === "l" || ch === "i" ? ["i", "l", "I", "L", "1"] : [ch];
      out = out.flatMap((prefix) => opts.map((o) => prefix + o));
    }
    return out;
  };

  it("a szonda hat neve elutasítva (foglalt név / trágár szó), a szerver és a JM2-jegy szűrője is", async () => {
    const jm1 = await import("../shared/nicknames");
    const cases: [string, NicknameProblem][] = [
      ["ADMlN", "RESERVED"], ["WEBSULl", "RESERVED"], ["GECl", "BLOCKED"], ["BUZl", "BLOCKED"], ["PlCSA", "BLOCKED"], ["NlGGER", "BLOCKED"],
      ["admln", "RESERVED"], ["CIAUDE", "RESERVED"], ["WEBSUII", "RESERVED"], ["Websuuli", "RESERVED"], ["M0D", "RESERVED"],
    ];
    for (const [n, p] of cases) {
      rejectsWith(n, p);
      assert.ok(jm1.nicknameProblems(n).length > 0, `a JM1 / JM2 szűrő is elutasítja: ${n}`);
    }
  });

  it("tulajdonság: MINDEN tiltott és foglalt tő minden l / I / L / 1 / i cseréje elutasítva (kisbetűvel és nagy kezdőbetűvel)", () => {
    let checked = 0;
    for (const [roots, problem] of [[BLOCKED_ROOTS, "BLOCKED"], [RESERVED_ROOTS, "RESERVED"]] as const) {
      for (const root of roots) {
        for (const v of confusableVariants(root)) {
          for (const n of [v, v.charAt(0).toUpperCase() + v.slice(1)]) {
            assert.ok(problemsOf(n).includes(problem), `${root} → ${JSON.stringify(n)}: ${problem} várt, kapott: ${problemsOf(n).join(",") || "OK"}`);
            checked++;
          }
        }
      }
    }
    assert.ok(checked > 400, `generált változatok: ${checked}`);
  });

  it("a foglaltsági kulcs és a szűrő UGYANAZT az összevonást használja (nem térhetnek el)", () => {
    for (const [a, b] of [["ADMlN", "ADMIN"], ["WEBSULl", "websuli"], ["GEC1", "geci"], ["Kata1", "KataI"]]) {
      assert.equal(nicknameKey(a), nicknameKey(b), `${a} ~ ${b}`);
      assert.equal(confusableFold(a), confusableFold(b), `${a} ~ ${b}`);
    }
    assert.equal(nicknameKey("Kis Lili#0042"), confusableFold("Kis Lili#0042").replace(/[ #]/g, ""));
  });

  it("ellenpróba: gyakori, ártatlan nevek NEM esnek ki (hamis tiltás nincs)", () => {
    for (const n of ["Lili", "Lilla", "Ildikó", "Bálint", "Vili", "Milán", "Illés", "Olivér", "Emil", "Kitti", "Niki", "Kolibri", "Liliom", "Pilóta", "Csilla", "Gellért", "Villám Róka", "Kis Lili", "Ili_07"]) ok(n);
  });
});

describe("JM7b — egyetlen becenév-szabály (a JM1 nicknameProblems erre delegál)", () => {
  it("a vendég-szűrő ugyanazt a szabályt és hossz-határt használja; a vendégnevek a közös listákból jönnek", async () => {
    const jm1 = await import("../shared/nicknames");
    assert.equal(jm1.NICKNAME_MIN, 3);
    assert.equal(jm1.NICKNAME_MAX, PLAYER_NICK_MAX);
    for (const bad of ["Admin", "4dm1n", `Kata${cp(0x200b)}`, `${cp(0x0430)}nna`, "annablog.com"]) {
      assert.ok(jm1.nicknameProblems(bad).length > 0, `a JM1-szűrő is elutasítja: ${JSON.stringify(bad)}`);
      assert.equal(checkPlayerNickname(bad).ok, false, bad);
    }
    rejectsWith("annablog.com", "URL");
    for (let i = 0; i < 50; i++) ok(jm1.guestNickname(`seed-${i}`));
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

/**
 * JM7a — e-mailes belépés tiszta részei (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md „JM7a” 4–5.; JM-A11).
 * Adatbázis nélkül: normalizálás, kód / link-token, hash-kötés, levél-sablon (a linkben nincs cím), flag, napló-őr.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CODE_PATTERN, CODE_TTL_MS, DEFAULT_LOGIN_EMAIL_DAILY_MAX, LINK_TOKEN_PATTERN, LINK_TTL_MS, MAX_CODE_ATTEMPTS, MAX_FAILED_ATTEMPTS_PER_DAY,
  START_PER_EMAIL_DAILY_MAX, START_PER_EMAIL_MAX, START_PER_IP_DAILY_MAX, START_PER_IP_MAX, VERIFY_PER_IP_MAX, limitKey, loginEmailDailyMax,
  codeHash, emailHash, generateCode, generateLinkToken, linkHash, normalizeEmail, playerAuthKey,
} from "../server/player/codes";
import { buildPlayerLoginEmail, playerLinkBaseUrl, playerLoginLink } from "../server/player/email-template";
import { PLAYER_CODE_SWEEP_INTERVAL_MS, startPlayerCodeSweeper } from "../server/player/sweeper";
import { playerAccountsEnabled } from "../server/player/require-player";
import { getTableColumns } from "drizzle-orm";
import { playerAccounts, playerAuthCodes } from "../shared/schema";

const KEY = playerAuthKey({ SESSION_SECRET: "player-codes-test-secret" } as NodeJS.ProcessEnv);

describe("JM7a — normalizálás és korlátok", () => {
  it("normalizeEmail: trim + kisbetű + NFC; hibás / túl hosszú → null", () => {
    // Nem ASCII helyi rész / domain (IDN) nem fogadható — az NFC-alakok így nem okozhatnak két fiókot.
    assert.equal(normalizeEmail("éva@pelda.hu"), null);
    assert.equal(normalizeEmail("éva@pelda.hu"), null);
    // Review #445 (K2): szigorú, egyetlen cím — „Név <cím>”, elválasztók, idézőjel, szóköz, vezérlőkarakter, sortörés
    // (fejléc-injektálás), több @, IDN / nem ASCII, pont a szélén, hosszkorlát.
    for (const bad of ["", "nincs-kukac", "a@b", "a b@c.hu", "@c.hu", 42, null, undefined, `${"a".repeat(250)}@b.hu`, `${"a".repeat(65)}@b.hu`,
      "a<b@c.hu>", "Anna <anna@pelda.hu>", "a,b@c.hu", "a;b@c.hu", "\"a\"@c.hu", "a\u0001@b.hu", "a\r\nbcc:x@c.hu", "a@b@c.hu", "a(b)@c.hu",
      "a:b@c.hu", "a[b]@c.hu", "a\\b@c.hu", ".a@c.hu", "a.@c.hu", "a..b@c.hu", "árvíztűrő@pelda.hu", "a@példa.hu", "a@c.h", "a@-c.hu", "a@c-.hu"]) {
      assert.equal(normalizeEmail(bad), null, `elutasítandó: ${String(bad).slice(0, 20)}`);
    }
  });

  it("a terv szerinti időkorlátok és számkorlátok", () => {
    assert.equal(CODE_TTL_MS, 10 * 60_000);
    assert.equal(LINK_TTL_MS, 15 * 60_000);
    assert.equal(MAX_CODE_ATTEMPTS, 5);
    assert.equal(START_PER_EMAIL_MAX, 3);
    assert.equal(START_PER_EMAIL_DAILY_MAX, 10);
    assert.equal(START_PER_IP_MAX, 50);
    assert.equal(START_PER_IP_DAILY_MAX, 150);
    assert.equal(VERIFY_PER_IP_MAX, 120);
    assert.equal(MAX_FAILED_ATTEMPTS_PER_DAY, 10);
  });

  it("review #445 (K1): a kitalálási esély a korlátokkal ≤ 0,1 % / év / fiók (8 jegy, napi 10 hibás próba)", () => {
    const space = 10 ** 8;
    assert.match("12345678", CODE_PATTERN);
    assert.doesNotMatch("123456", CODE_PATTERN);
    const perYear = 1 - (1 - MAX_FAILED_ATTEMPTS_PER_DAY / space) ** 365;
    assert.ok(perYear <= 0.001, `éves esély: ${perYear}`);
    assert.ok(perYear < 0.00004, "≈ 0,0037 %");
  });

  it("review #445 (K2): korlát-kulcs — aliasok összevonva (Gmail pont, +címke, googlemail), a fiók-cím változatlan", () => {
    assert.equal(limitKey("a.b+x@gmail.com"), "ab@gmail.com");
    assert.equal(limitKey("ab@googlemail.com"), "ab@gmail.com");
    assert.equal(limitKey("anna+suli@pelda.hu"), "anna@pelda.hu");
    assert.equal(limitKey("a.nna@pelda.hu"), "a.nna@pelda.hu", "nem Gmail: a pont jelentéses");
    assert.equal(normalizeEmail("A.B+X@Gmail.com"), "a.b+x@gmail.com", "a tárolt / fiók-cím nem kanonizált");
  });

  it("review #445 (K2): a belépő levelek napi plafonja környezetből, biztonságos alapértékkel", () => {
    assert.equal(loginEmailDailyMax({} as NodeJS.ProcessEnv), DEFAULT_LOGIN_EMAIL_DAILY_MAX);
    assert.equal(loginEmailDailyMax({ PLAYER_LOGIN_EMAIL_DAILY_MAX: "50" } as NodeJS.ProcessEnv), 50);
    for (const bad of ["0", "-1", "abc", "1.5", "999999999"]) assert.equal(loginEmailDailyMax({ PLAYER_LOGIN_EMAIL_DAILY_MAX: bad } as NodeJS.ProcessEnv), DEFAULT_LOGIN_EMAIL_DAILY_MAX, bad);
  });
});

describe("JM7a — kód, link-token, hash", () => {
  it("a kód 6 számjegy, a link-token 43 jeles base64url, és mindkettő változatos", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCode()));
    assert.ok([...codes].every((c) => c.length === 8));
    for (const c of codes) assert.match(c, CODE_PATTERN);
    assert.ok(codes.size > 190, "200 kódból legfeljebb néhány ismétlődhet");
    const tokens = new Set(Array.from({ length: 50 }, () => generateLinkToken()));
    for (const t of tokens) assert.match(t, LINK_TOKEN_PATTERN);
    assert.equal(tokens.size, 50);
  });

  it("a hash a címhez és a titokhoz kötött; nyers érték nem olvasható ki belőle", () => {
    const a = emailHash(KEY, "anna@example.com");
    const b = emailHash(KEY, "bela@example.com");
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
    assert.notEqual(codeHash(KEY, a, "123456"), codeHash(KEY, b, "123456"), "ugyanaz a kód más címre más hash");
    const otherKey = playerAuthKey({ SESSION_SECRET: "masik-titok" } as NodeJS.ProcessEnv);
    assert.notEqual(emailHash(otherKey, "anna@example.com"), a);
    assert.ok(!a.includes("anna"));
    const token = generateLinkToken();
    assert.match(linkHash(KEY, token), /^[0-9a-f]{64}$/);
    assert.throws(() => playerAuthKey({} as NodeJS.ProcessEnv), /SESSION_SECRET/);
  });
});

describe("JM7a — belépő levél", () => {
  it("a link a tokent a URL-töredékben viszi, e-mail-cím nélkül; a levél magyar, és tartalmazza a kódot", () => {
    const token = generateLinkToken();
    const link = playerLoginLink("https://websuli.vip/", token);
    assert.equal(link, `https://websuli.vip/belepes/link#t=${token}`);
    assert.ok(!link.includes("?"), "nincs lekérdezési paraméter (szerver- és proxynaplóba kerülne)");
    const mail = buildPlayerLoginEmail({ code: "04213799", link });
    assert.match(mail.subject, /0421 3799/);
    assert.ok(mail.html.includes("0421 3799") && mail.text.includes("0421 3799"));
    assert.ok(mail.html.includes(link) && mail.text.includes(link));
    assert.match(mail.text, /10 percig/);
    assert.match(mail.text, /15 percig/);
    assert.doesNotMatch(mail.html + mail.text, /@/, "a levél törzsében nincs e-mail-cím");
    assert.doesNotMatch(mail.html + mail.text, /életkor|születési|jelszó/i);
  });
});

describe("JM7a — review #445 (üzemeltetés): a belépő link alapcíme", () => {
  it("csak https FRONTEND_URL a várt felületi domainen (vagy CUSTOM_DOMAIN); minden más → nincs levél", () => {
    const env = (o: Record<string, string>) => o as NodeJS.ProcessEnv;
    assert.equal(playerLinkBaseUrl(env({ FRONTEND_URL: "https://websuli.vip/" })), "https://websuli.vip");
    assert.equal(playerLinkBaseUrl(env({ FRONTEND_URL: "https://www.websuli.org" })), "https://www.websuli.org");
    assert.equal(playerLinkBaseUrl(env({ FRONTEND_URL: "https://suli.example", CUSTOM_DOMAIN: "suli.example" })), "https://suli.example");
    for (const bad of [{}, { FRONTEND_URL: "" }, { FRONTEND_URL: "http://websuli.vip" }, { FRONTEND_URL: "https://websuli-api.onrender.com" },
      { FRONTEND_URL: "https://websuli.vip.tamado.example" }, { FRONTEND_URL: "https://localhost:5000" }, { FRONTEND_URL: "https://websuli.vip:8443" },
      { FRONTEND_URL: "https://user:pw@websuli.vip" }, { FRONTEND_URL: "nem url" }, { BASE_URL: "https://websuli.vip" }]) {
      assert.equal(playerLinkBaseUrl(env(bad as Record<string, string>)), null, JSON.stringify(bad));
    }
  });
});

describe("JM7a — review #445 (A3): ütemezett kódrekord-takarítás", () => {
  it("induláskor azonnal és óránként fut (unref-elt időzítő), a hibát elnyeli és naplózza", async () => {
    let calls = 0;
    let scheduled: { ms: number; unref: boolean } | null = null;
    const timers = { setInterval: (_fn: () => void, ms: number) => { scheduled = { ms, unref: false }; return { unref: () => { scheduled!.unref = true; } }; } };
    const run = startPlayerCodeSweeper(async () => { calls++; if (calls === 2) throw new Error("db le"); return [1, 1]; }, timers);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls, 1, "induláskor lefut");
    assert.deepEqual(scheduled, { ms: PLAYER_CODE_SWEEP_INTERVAL_MS, unref: true });
    assert.equal(PLAYER_CODE_SWEEP_INTERVAL_MS, 60 * 60_000);
    await run(); // a hiba nem dob ki
    assert.equal(calls, 2);
  });
});

describe("JM7a — PLAYER_ACCOUNTS flag", () => {
  it("alapból KI; csak on / 1 / true kapcsol be", () => {
    assert.equal(playerAccountsEnabled({} as NodeJS.ProcessEnv), false);
    for (const off of ["", "off", "0", "false", "yes", "ON!", "enabled"]) assert.equal(playerAccountsEnabled({ PLAYER_ACCOUNTS: off } as NodeJS.ProcessEnv), false, off);
    for (const on of ["on", "ON", " 1 ", "true"]) assert.equal(playerAccountsEnabled({ PLAYER_ACCOUNTS: on } as NodeJS.ProcessEnv), true, on);
  });

  it("a render.yaml nem kapcsolja be élesben (a bekapcsolás az orkesztrátor lépése)", () => {
    const yaml = readFileSync(new URL("../../render.yaml", import.meta.url), "utf8");
    assert.doesNotMatch(yaml, /PLAYER_ACCOUNTS[\s\S]{0,80}value:\s*["']?(on|1|true)\b/i);
  });
});

describe("JM7a — migráció 0040 ↔ Drizzle-séma", () => {
  for (const [name, table] of [["player_accounts", playerAccounts], ["player_auth_codes", playerAuthCodes]] as const) {
    it(`a migráció és a séma oszlopai egyeznek (${name}); nincs admin-mező`, () => {
      const sqlText = readFileSync(new URL("../migrations/0040_player_accounts.sql", import.meta.url), "utf8");
      const start = sqlText.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`);
      assert.ok(start >= 0, `CREATE TABLE ${name}`);
      const body = sqlText.slice(start, sqlText.indexOf("\n);", start));
      const inSql = [...body.matchAll(/^\s{2}([a-z_]+)\s+(?:varchar|integer|char|timestamp)/gm)].map((m) => m[1]).sort();
      const inSchema = Object.values(getTableColumns(table)).map((c) => c.name).sort();
      assert.deepEqual(inSql, inSchema);
      assert.ok(!inSchema.some((c) => /admin|role|password/.test(c)), "a játékos-fiók szerkezetileg nem kaphat jogot / jelszót");
    });
  }

  it("a migráció additív és idempotens (nincs DROP / ALTER … DROP; minden CREATE IF NOT EXISTS)", () => {
    const sqlText = readFileSync(new URL("../migrations/0040_player_accounts.sql", import.meta.url), "utf8");
    const code = sqlText.replace(/^\s*--.*$/gm, "");
    assert.doesNotMatch(code, /\bDROP\b/i);
    assert.equal((code.match(/CREATE (?:TABLE|INDEX) (?!IF NOT EXISTS)/g) ?? []).length, 0);
    assert.match(sqlText, /Visszaállítás \(down\)/);
  });
});

describe("JM7a — napló-őr: a játékos-modul és a levélküldő nem ír címet / kódot / tokent maszkolás nélkül", () => {
  const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "server");
  const files = [join(SERVER, "resend.ts"), ...readdirSync(join(SERVER, "player")).map((f) => join(SERVER, "player", f))];
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  function loggerStatements(source: string): string[] {
    const code = stripComments(source);
    const out: string[] = [];
    const start = /logger\.(?:debug|info|warn|error)\(/g;
    let m: RegExpExecArray | null;
    while ((m = start.exec(code))) {
      const end = code.indexOf(");", m.index);
      out.push(code.slice(m.index, end === -1 ? undefined : end + 2));
    }
    return out;
  }

  it("minden logger-hívásban az e-mail csak maskEmail()-en át, kód / token / link soha", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const stmt of loggerStatements(readFileSync(file, "utf8"))) {
        const inTemplate = /\$\{(?![^}]*maskEmail\()[^}]*\b(?:email|to|userEmail|recipientEmail|confirmedEmail)\b[^}]*\}/.test(stmt);
        const asArgument = /(?:,|(?<!maskEmail)\()\s*(?:[\w.]*\.)?(?:email|to|userEmail|recipientEmail|confirmedEmail)\s*[,)]/.test(stmt);
        const secret = /\b(?:code|token|linkToken|link|mail\.html|mail\.text)\b\s*[,)}]/.test(stmt);
        if (inTemplate || asArgument || secret) offenders.push(`${file}: ${stmt.split("\n")[0]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});

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
  CODE_PATTERN, CODE_TTL_MS, LINK_TOKEN_PATTERN, LINK_TTL_MS, MAX_CODE_ATTEMPTS, START_PER_EMAIL_MAX, START_PER_IP_MAX,
  codeHash, emailHash, generateCode, generateLinkToken, linkHash, normalizeEmail, playerAuthKey,
} from "../server/player/codes";
import { buildPlayerLoginEmail, playerLoginLink } from "../server/player/email-template";
import { playerAccountsEnabled } from "../server/player/require-player";
import { getTableColumns } from "drizzle-orm";
import { playerAccounts, playerAuthCodes } from "../shared/schema";

const KEY = playerAuthKey({ SESSION_SECRET: "player-codes-test-secret" } as NodeJS.ProcessEnv);

describe("JM7a — normalizálás és korlátok", () => {
  it("normalizeEmail: trim + kisbetű + NFC; hibás / túl hosszú → null", () => {
    assert.equal(normalizeEmail("  Anna.Kovacs@Example.COM "), "anna.kovacs@example.com");
    // NFD (e + kombináló ékezet) → NFC: ugyanaz a cím ugyanaz a fiók
    assert.equal(normalizeEmail("éva@pelda.hu"), normalizeEmail("éva@pelda.hu"));
    for (const bad of ["", "nincs-kukac", "a@b", "a b@c.hu", "@c.hu", 42, null, undefined, `${"a".repeat(250)}@b.hu`]) {
      assert.equal(normalizeEmail(bad), null, `elutasítandó: ${String(bad).slice(0, 20)}`);
    }
  });

  it("a terv szerinti időkorlátok és számkorlátok", () => {
    assert.equal(CODE_TTL_MS, 10 * 60_000);
    assert.equal(LINK_TTL_MS, 15 * 60_000);
    assert.equal(MAX_CODE_ATTEMPTS, 5);
    assert.equal(START_PER_EMAIL_MAX, 3);
    assert.equal(START_PER_IP_MAX, 10);
  });
});

describe("JM7a — kód, link-token, hash", () => {
  it("a kód 6 számjegy, a link-token 43 jeles base64url, és mindkettő változatos", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCode()));
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
    const mail = buildPlayerLoginEmail({ code: "042137", link });
    assert.match(mail.subject, /042137/);
    assert.ok(mail.html.includes("042137") && mail.text.includes("042137"));
    assert.ok(mail.html.includes(link) && mail.text.includes(link));
    assert.match(mail.text, /10 percig/);
    assert.match(mail.text, /15 percig/);
    assert.doesNotMatch(mail.html + mail.text, /@/, "a levél törzsében nincs e-mail-cím");
    assert.doesNotMatch(mail.html + mail.text, /életkor|születési|jelszó/i);
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

/**
 * Adatvédelmi őr (docs/specs/2026-11-16-valodi-cimek-ki.md, kanban #57): a repó NYILVÁNOS, ezért valódi személy e-mail-címe
 * egyetlen követett fájlban sem lehet. A teszt a `git ls-files` minden szöveges fájlját (lock-fájlok, `node_modules` és bináris
 * fájlok kivételével) átnézi, és minden e-mail-alakú szövegrészt összevet az alábbi, tételesen indokolt engedélylistával.
 * Új találat → a teszt bukik `fájl:sor` üzenettel (a címet NEM írja ki). A helyes javítás: helyőrző (`<ADMIN_EMAIL>`,
 * `valaki@pelda.hu`) vagy környezeti változó — nem a lista bővítése valódi címmel.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SELF = "source/tests/no-real-emails-guard.test.ts";

/** Domainek (kisbetűs, pontos egyezés vagy aldomain), amelyeken bármely cím megengedett. */
const ALLOWED_DOMAINS: { domain: string; why: string }[] = [
  { domain: "pelda.hu", why: "a repó saját magyar példa-domainje (helyőrző)" },
  { domain: "example.com", why: "RFC 2606 példa-domain" },
  { domain: "example.org", why: "RFC 2606 példa-domain" },
  { domain: "example.net", why: "RFC 2606 példa-domain" },
  { domain: "example.co.uk", why: "példa-domain (normalizálási tesztek)" },
  { domain: "websuli.vip", why: "a projekt saját domainje: technikai feladó (noreply) és teszt-címek" },
  { domain: "mail.web-suli.vip", why: "a Resend-feladó domain-ellenőrzés tesztje (hasonmás domain)" },
  { domain: "websuli.org", why: "a projekt régi saját domainje: technikai feladó a doksiban / .env.example-ben" },
  { domain: "resend.dev", why: "a Resend szolgáltató technikai (sandbox) feladó-domainje" },
  { domain: "notresend.dev", why: "a Resend-sandbox felismerés ellenpróbája (teszt)" },
  { domain: "users.noreply.github.com", why: "a GitHub technikai noreply-címe (commit-szerzőség)" },
  { domain: "x.hu", why: "egybetűs szintetikus teszt-domain" },
  { domain: "b.hu", why: "egybetűs szintetikus teszt-domain" },
  { domain: "c.hu", why: "egybetűs szintetikus teszt-domain" },
  { domain: "-c.hu", why: "hibás alakú domain (cím-validáció ellenpróbája)" },
  { domain: "c-.hu", why: "hibás alakú domain (cím-validáció ellenpróbája)" },
  { domain: "-websuli.vip", why: "hibás alakú domain (feladó-validáció ellenpróbája)" },
  { domain: "websuli-.vip", why: "hibás alakú domain (feladó-validáció ellenpróbája)" },
  { domain: "iskola.hu", why: "szintetikus iskolai teszt-domain" },
];

/** RFC 2606 / 6761 fenntartott legfelső szintű domainek — soha nem valódi postafiók. */
const RESERVED_TLDS = ["example", "test", "invalid", "localhost"];

/**
 * Pontos címek (kisbetűsen), amelyek valódi szolgáltatói domainen vannak, de szintetikus tesztértékek vagy technikai címek.
 * Gmail-domainen CSAK ez a lista engedett (a normalizálási tesztekhez valódi Gmail-domain kell).
 */
const ALLOWED_ADDRESSES: { address: string; why: string }[] = [
  { address: "noreply@anthropic.com", why: "technikai cím (Co-Authored-By sor a commit-üzenet sablonokban)" },
  { address: "példa@email.com", why: "űrlap-helyőrző szöveg (placeholder)" },
  { address: "példa@domain.hu", why: "űrlap-helyőrző szöveg (placeholder)" },
  { address: "local@label.label", why: "kódmegjegyzés: a feladó-formátum leírása" },
  { address: "p@www.nkp.hu", why: "URL-be ágyazott hitelesítő adat ellenpróbája (web-gather teszt)" },
  { address: "a.b+x@gmail.com", why: "Gmail-alias normalizálás (szintetikus)" },
  { address: "ab@gmail.com", why: "Gmail-alias normalizálás (szintetikus)" },
  { address: "ab@googlemail.com", why: "googlemail → gmail normalizálás (szintetikus)" },
  { address: "kisdiak@gmail.com", why: "Gmail-alias keret-teszt (szintetikus)" },
  { address: "kisdiak+1@gmail.com", why: "Gmail-alias keret-teszt (szintetikus)" },
  { address: "kisdiak+5@gmail.com", why: "Gmail-alias keret-teszt (szintetikus)" },
  { address: "kis.diak+2@gmail.com", why: "Gmail-alias keret-teszt (szintetikus)" },
  { address: "k.i.s.diak@googlemail.com", why: "Gmail-alias keret-teszt (szintetikus)" },
];

const SKIP_FILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|[^/]+\.lock)$|(^|\/)node_modules\//;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|pdf|mp3|mp4|wav|ogg|webm|zip|gz|tgz|7z|db|sqlite|wasm|exe|dll|node|bin)$/i;
const MAX_BYTES = 8 * 1024 * 1024;
/** Fájlkiterjesztés, amely nem létező legfelső szintű domain (nincs `.png`, `.js`, `.tsx` TLD). */
const FILE_EXT_TLD = /\.(png|jpe?g|gif|svg|webp|avif|js|mjs|cjs|ts|tsx|jsx|css|json|map|html)$/;
/** E-mail-alakú szövegrész: Unicode-betűs helyi rész, ASCII domain legalább egy ponttal és betűs legfelső szintű domainnel. */
const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(?![A-Za-z0-9-])/gu;

const usedAddresses = new Set<string>();

export function isAllowedEmail(address: string): boolean {
  const lower = address.toLowerCase();
  const domain = lower.slice(lower.lastIndexOf("@") + 1);
  if (ALLOWED_ADDRESSES.some((a) => a.address === lower)) {
    usedAddresses.add(lower);
    return true;
  }
  // Nem e-mail, hanem fájlnév (pl. `ikon@2x.png`, `csomag@1.2.3.js`): a „legfelső szintű domain” egy fájlkiterjesztés.
  if (FILE_EXT_TLD.test(domain)) return true;
  if (RESERVED_TLDS.some((tld) => domain === tld || domain.endsWith(`.${tld}`))) return true;
  return ALLOWED_DOMAINS.some((d) => domain === d.domain || domain.endsWith(`.${d.domain}`));
}

function trackedFiles(): string[] {
  const out = execFileSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // Ez a fájl maga az engedélylista: kihagyjuk, különben az elavultság-ellenőrzés önmagára hivatkozva mindig zöld lenne.
  return out.split("\0").filter((p) => p && p !== SELF && !SKIP_FILE.test(p) && !BINARY_EXT.test(p));
}

describe("adatvédelmi őr — nincs valódi e-mail-cím a nyilvános repóban", () => {
  it("minden követett szöveges fájlban csak engedélylistás (példa / technikai) cím szerepel", () => {
    const files = trackedFiles();
    assert.ok(files.length > 500, `túl kevés követett fájl (${files.length}) — a git ls-files nem a repó gyökerén futott?`);
    const offenders: string[] = [];
    for (const rel of files) {
      const full = join(ROOT, rel);
      let size: number;
      try {
        size = statSync(full).size;
      } catch {
        continue; // törölt, de még indexelt fájl (helyi munkafa) — a CI-ban nem fordul elő
      }
      if (size > MAX_BYTES) continue;
      const text = readFileSync(full, "utf8");
      if (text.includes("\0")) continue;
      text.split(/\r?\n/).forEach((line, i) => {
        if (!line.includes("@")) return;
        for (const m of line.matchAll(EMAIL)) {
          if (!isAllowedEmail(m[0])) offenders.push(`${rel}:${i + 1}`);
        }
      });
    }
    assert.deepEqual(offenders, [], "engedélylistán kívüli e-mail-cím (fájl:sor) — cseréld helyőrzőre vagy környezeti változóra");
    // A pontos címlista csak szűkülhet: elavult (már sehol nem szereplő) engedély ne maradjon.
    const stale = ALLOWED_ADDRESSES.map((a) => a.address).filter((a) => !usedAddresses.has(a));
    assert.deepEqual(stale, [], "az ALLOWED_ADDRESSES elavult bejegyzést tartalmaz");
  });

  it("ellenpróba: a valódi szolgáltatói címet és az ismeretlen domaint megbuktatja, a példákat átengedi", () => {
    const fake = (local: string, domain: string) => [local, domain].join("@");
    for (const bad of [fake("valaki", "gmail.com"), fake("Valaki.Mas", "Gmail.com"), fake("tanar", "freemail.hu"), fake("x", "outlook.com"),
      fake("példa", "gmail.com"), fake("admin", "websuli.vip.evil.com"), fake("a", "pelda.hu.evil.com")]) {
      assert.equal(isAllowedEmail(bad), false, bad.replace(/^[^@]*/, "***"));
    }
    for (const ok of [fake("tulaj", "pelda.hu"), fake("Tulaj", "PELDA.HU"), fake("a", "x.test"), fake("noreply", "websuli.vip"),
      fake("a", "iskola.pelda.hu"), fake("anna", "example.com"), fake("ikon", "2x.png")]) {
      assert.equal(isAllowedEmail(ok), true, ok);
    }
    // A minta a szövegből is kiemeli a címet (Unicode-betűs helyi rész, mondatvégi pont, szögletes zárójel).
    const line = `Írj: <${fake("dávid.kovács", "gmail.com")}>. Vagy ${fake("x", "outlook.com")}.`;
    const found = [...line.matchAll(EMAIL)].map((m) => m[0]);
    assert.equal(found.length, 2);
    assert.ok(found.every((f) => !isAllowedEmail(f)));
  });
});

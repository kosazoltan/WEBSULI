import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chooseRequest, pickArticle, validatePick, type NewsletterDeps } from "../server/newsletter";
import { isAllowedArticleUrl, NEWSLETTER_DOMAINS } from "../shared/newsletter-sources";
import { newsletterHtml, newsletterSubject } from "../shared/newsletter";
import type { PublicPage } from "../server/studio/safe-fetch";

/** docs/specs/2026-10-19-mai-felfedezes-hirlevel.md (S2) */
const root = join(import.meta.dirname, "..");
const LONG = "A repülőgép szárnya felhajtóerőt termel, mert a levegő gyorsabban áramlik felette. ".repeat(12);
const page = (url: string, title = "Cikk"): PublicPage => ({ url, title, text: LONG });
const materials = [{ id: "m1", title: "A repülés fizikája" }, { id: "m2", title: "Az ókori Egyiptom" }];

function deps(urls: string[], choice: (req: { system: string; user: string }) => unknown, pages: Record<string, PublicPage> = {}): NewsletterDeps & { seen: Array<{ system: string; user: string }> } {
  const seen: Array<{ system: string; user: string }> = [];
  return {
    seen,
    async search() { return urls; },
    async download(url) { const p = pages[url] ?? page(url); return p; },
    async choose(req) { seen.push(req); return choice(req); },
  };
}

test("forráslista: ≤ 100 domain (a keresési szűrő korlátja); csak https és az engedélyezett domain vagy aldomainje", () => {
  assert.ok(NEWSLETTER_DOMAINS.length > 0 && NEWSLETTER_DOMAINS.length <= 100);
  assert.equal(isAllowedArticleUrl("https://mult-kor.hu/cikk"), true);
  assert.equal(isAllowedArticleUrl("https://www.qubit.hu/2026/10/19/x"), true, "aldomain");
  assert.equal(isAllowedArticleUrl("http://mult-kor.hu/cikk"), false, "http");
  assert.equal(isAllowedArticleUrl("https://mult-kor.hu.evil.example/x"), false, "álcázott host");
  assert.equal(isAllowedArticleUrl("https://notmult-kor.hu/x"), false, "végződés-egyezés nem elég");
  assert.equal(isAllowedArticleUrl("nem url"), false);
});

test("pickArticle: nem engedélyezett domain és a korábban küldött URL kiesik; a választás a letöltöttből", async () => {
  const d = deps(["https://evil.example/a", "https://mult-kor.hu/regi", "https://airportal.hu/uj"], () => ({
    url: "https://airportal.hu/uj", title: "Új repülő", teaser: "Egy új repülőgépet mutattak be. Nagyon gyors!", question: "Miért repül a repülő?", materialId: "m1", ageAppropriate: true, reason: "illik",
  }));
  const r = await pickArticle({ interests: ["repülők"], grade: 5, recentUrls: new Set(["https://mult-kor.hu/regi"]), materials }, d);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.pick, { url: "https://airportal.hu/uj", title: "Új repülő", teaser: "Egy új repülőgépet mutattak be. Nagyon gyors!", question: "Miért repül a repülő?", materialId: "m1" });
  const user = d.seen[0].user;
  assert.doesNotMatch(user, /evil\.example|mult-kor\.hu\/regi/, "a kizárt URL a modellhez sem jut el");
});

test("pickArticle: ageAppropriate hamis vagy hiányzik → nincs cikk", async () => {
  const base = { url: "https://airportal.hu/uj", title: "x", teaser: "Rövid ismertető.", question: "Kérdés?", materialId: null };
  for (const ageAppropriate of [false, undefined]) {
    const r = await pickArticle({ interests: ["katonaság"], grade: 6, recentUrls: new Set(), materials }, deps(["https://airportal.hu/uj"], () => ({ ...base, ageAppropriate })));
    assert.equal(r.ok, false);
  }
});

test("validatePick: ismeretlen anyag → nincs híd, a cikk megy; nem letöltött URL, túl hosszú ismertető → elutasítva", () => {
  const articles = [page("https://qubit.hu/a", "Áram")];
  const ok = validatePick({ url: "https://qubit.hu/a", title: "", teaser: "Az áram töltések mozgása.", question: "Mi az áram?", materialId: "kitalalt", ageAppropriate: true }, articles, materials);
  assert.ok(ok.ok);
  if (ok.ok) { assert.equal(ok.pick.materialId, null); assert.equal(ok.pick.title, "Áram", "üres cím → a cikk címe"); }
  assert.equal(validatePick({ url: "https://qubit.hu/MAS", teaser: "a", question: "b", ageAppropriate: true }, articles, materials).ok, false);
  assert.equal(validatePick({ url: "https://qubit.hu/a", teaser: "x".repeat(451), question: "b", ageAppropriate: true }, articles, materials).ok, false);
  assert.equal(validatePick(null, articles, materials).ok, false);
});

test("pickArticle: rövid vagy nem magyar oldal nem cikk; ha nincs jó, a modell sem hívódik", async () => {
  const d = deps(["https://index.hu/a"], () => { throw new Error("nem hívódhat"); }, { "https://index.hu/a": { url: "https://index.hu/a", title: "x", text: "too short english text" } });
  const r = await pickArticle({ interests: ["K-pop"], grade: 7, recentUrls: new Set(), materials }, d);
  assert.equal(r.ok, false);
  assert.equal(d.seen.length, 0);
});

test("chooseRequest: csak érdeklődés, évfolyam, kivonat és anyaglista — név, e-mail-cím nincs benne", () => {
  const req = chooseRequest({ interests: ["történelem"], grade: 5, articles: [page("https://mult-kor.hu/a")], materials });
  assert.match(req.user, /történelem/);
  assert.doesNotMatch(`${req.system}\n${req.user}`, /@|Kristóf|Léna|Dominik|Marci/);
  assert.match(req.system, /ageAppropriate/);
});

test("sablon: escape, a cikk és az anyag linkje; tárgy a keresztnévvel", () => {
  const html = newsletterHtml({ first: "Marci", title: "<script>x</script>", teaser: "A & B", question: "Miért?", articleUrl: "https://qubit.hu/a?x=1&y=2", materialTitle: "Az áram", materialUrl: "https://websuli.vip/preview/m1?t=abc" });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/qubit\.hu\/a\?x=1&amp;y=2"/);
  assert.match(html, /HA EZ TETSZETT/);
  assert.doesNotMatch(newsletterHtml({ first: "M", title: "t", teaser: "a", question: "b", articleUrl: "https://qubit.hu/a" }), /HA EZ TETSZETT/, "anyag nélkül nincs híd");
  assert.equal(newsletterSubject("Marci", "Hogyan működik a villanymotor?"), "🔭 Marci, mai felfedezésed: Hogyan működik a villanymotor?");
});

test("ütemezés: naponta 16:00 és 16:30 budapesti időben, csak élesben; e2e-ben nem indul", () => {
  const src = readFileSync(join(root, "server", "newsletter.ts"), "utf8");
  assert.match(src, /cron\.schedule\("0 16 \* \* \*"[\s\S]*timezone: REMINDER_TIMEZONE/);
  assert.match(src, /cron\.schedule\("30 16 \* \* \*"/);
  const index = readFileSync(join(root, "server", "index.ts"), "utf8");
  const e2eGuard = index.indexOf("if (!e2e) {");
  const call = index.indexOf("setupNewsletters();");
  assert.ok(e2eGuard > 0 && call > e2eGuard, "a hírlevél az e2e-őr mögött indul");
});

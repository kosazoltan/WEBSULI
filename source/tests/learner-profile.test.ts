import { test } from "node:test";
import assert from "node:assert/strict";
import { learnerLinkSecret, parseLearnerToken, signLearnerToken } from "../server/lib/learner-token";
import { takeLearnerTokenFromUrl } from "../client/src/lib/learnerProfile";

// docs/specs/2026-10-18-tanuloi-profil.md (S1): személyes link, aláírt token, név nélkül.
const SECRET = "teszt-titok";
const ID = "3f1c2a9e-1111-4222-8333-944455556666";

test("token: aláírás és ellenőrzés; a token nem tartalmaz nevet", () => {
  const token = signLearnerToken(ID, 1, SECRET);
  assert.match(token, /^[A-Za-z0-9-]+\.1\.[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(parseLearnerToken(token, SECRET), { id: ID, version: 1 });
});

test("token: hamisított aláírás, más titok, módosított azonosító vagy verzió, rossz formátum → null", () => {
  const token = signLearnerToken(ID, 2, SECRET);
  const [id, version, sig] = token.split(".");
  assert.equal(parseLearnerToken(token, "masik-titok"), null);
  assert.equal(parseLearnerToken(`${id}.3.${sig}`, SECRET), null, "a verzióléptetés (visszavonás) a régi tokent érvényteleníti");
  assert.equal(parseLearnerToken(`${id.replace("3f", "4f")}.${version}.${sig}`, SECRET), null);
  assert.equal(parseLearnerToken(`${id}.${version}.${sig.slice(0, -1)}A`, SECRET), null);
  for (const bad of [undefined, null, 42, "", "a.b", `${id}.0.${sig}`, `${id}.-1.${sig}`, `rövid.1.${sig}`, "x".repeat(200)]) {
    assert.equal(parseLearnerToken(bad, SECRET), null, String(bad));
  }
});

test("titok: LEARNER_LINK_SECRET, majd SESSION_SECRET; élesben titok nélkül kikapcsol, fejlesztésben fix kulcs", () => {
  assert.equal(learnerLinkSecret({ LEARNER_LINK_SECRET: "a", SESSION_SECRET: "b" } as NodeJS.ProcessEnv), "a");
  assert.equal(learnerLinkSecret({ SESSION_SECRET: "b" } as NodeJS.ProcessEnv), "b");
  assert.equal(learnerLinkSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv), null);
  assert.ok(learnerLinkSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv));
});

test("kliens: a t paraméter kikerül a címből, a többi paraméter és a hash marad; nem tokenszerű érték nem tárolódik", () => {
  const token = signLearnerToken(ID, 1, SECRET);
  assert.deepEqual(takeLearnerTokenFromUrl(`https://websuli.vip/preview/abc?t=${token}&x=1#kviz`), { token, cleanUrl: "/preview/abc?x=1#kviz" });
  assert.deepEqual(takeLearnerTokenFromUrl("https://websuli.vip/?t=<script>"), { token: null, cleanUrl: "/" });
  assert.deepEqual(takeLearnerTokenFromUrl("https://websuli.vip/preview/abc?x=1"), { token: null, cleanUrl: null });
});

test("tanuló-szinkron: név szerint egy tanuló (két cím is), évfolyam a legutóbb módosított aktív címből; név nélküli cím leválik", async () => {
  const { planLearnerSync } = await import("../server/learners");
  const at = (d: string) => new Date(d);
  const rows = [
    { id: "e1", studentName: "Teszt Anna Kata", classrooms: [9], isActive: true, updatedAt: at("2026-10-01"), learnerId: null },
    { id: "e2", studentName: " teszt anna kata ", classrooms: [10], isActive: true, updatedAt: at("2026-10-10"), learnerId: null },
    { id: "e3", studentName: "Próba Béla", classrooms: [4], isActive: false, updatedAt: at("2026-10-12"), learnerId: null },
    { id: "e4", studentName: "Próba Béla", classrooms: [5], isActive: true, updatedAt: at("2026-09-01"), learnerId: null },
    { id: "e5", studentName: null, classrooms: [3], isActive: true, updatedAt: at("2026-10-01"), learnerId: "régi" },
  ];
  const plan = planLearnerSync(rows, [{ id: "L1", name: "Próba Béla", grade: 4 }]);
  assert.deepEqual(plan.create, [{ name: "teszt anna kata", grade: 10 }], "kisbetű-függetlenül egy tanuló; a név és az évfolyam a legutóbb módosított aktív címé");
  assert.deepEqual(plan.grade, [{ id: "L1", grade: 5 }], "az aktív cím évfolyama nyer az inaktív újabbal szemben");
  assert.deepEqual(plan.link.find(l => l.emailId === "e5"), { emailId: "e5", name: null });
  assert.equal(plan.link.length, 5);
});

test("napi emlékeztető: személyes link ?t= paraméterrel; token nélkül változatlan", async () => {
  const { personalUrl } = await import("../server/daily-reminder");
  const token = signLearnerToken(ID, 1, SECRET);
  assert.equal(personalUrl("https://websuli.vip/preview/abc", token), `https://websuli.vip/preview/abc?t=${token}`);
  assert.equal(personalUrl("https://websuli.vip/preview/abc", null), "https://websuli.vip/preview/abc");
  assert.deepEqual(takeLearnerTokenFromUrl(personalUrl("https://websuli.vip/preview/abc", token)).token, token);
});

test("review #301: tárhelyhibánál is eltűnik a token a címsorból", async () => {
  const { captureLearnerTokenFromUrl } = await import("../client/src/lib/learnerProfile");
  const token = signLearnerToken(ID, 1, SECRET);
  const replaced: string[] = [];
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = {
    location: { href: `https://websuli.vip/preview/abc?t=${token}&x=1` },
    localStorage: { setItem: () => { throw new Error("QuotaExceededError"); } },
    history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } },
  };
  try {
    captureLearnerTokenFromUrl();
  } finally {
    g.window = prev;
  }
  assert.deepEqual(replaced, ["/preview/abc?x=1"]);
});

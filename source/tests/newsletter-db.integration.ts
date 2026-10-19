import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { extraEmailAddresses, htmlFiles, learnerNewsletters, learners } from "../shared/schema";

// „Mai felfedezés” hírlevél (docs/specs/2026-10-19-mai-felfedezes-hirlevel.md, S2) — eldobható Postgresben, álmodellel.
// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");
const { runNewsletters, setNewsletterSender } = await import("../server/newsletter");
type Deps = Parameters<typeof runNewsletters>[1];

const sent: Array<{ subject: string; html: string; to: string }> = [];
setNewsletterSender(async (subject, html, to) => { sent.push({ subject, html, to }); });
const GRADE = 12; // elszigetelt évfolyam
const DAY1 = new Date("2026-10-19T14:00:00Z"); // 16:00 Budapest
const DAY2 = new Date("2026-10-20T14:00:00Z");
const LONG = "A villanymotor a mágneses mező és az áram kölcsönhatásával forog. ".repeat(15);

function fakeDeps(opts: { url: string; ageAppropriate: boolean; seen: string[] }): NonNullable<Deps> {
  return {
    async search() { return [opts.url]; },
    async download(u) { return { url: u, title: "Villanymotor", text: LONG }; },
    async choose(req) {
      opts.seen.push(`${req.system}\n${req.user}`);
      return { url: opts.url, title: "Hogyan forog a villanymotor?", teaser: "A villanymotor mágnesekkel forog. Ez fizika!", question: "Mi forgatja a motort?", materialId: "nl-mat", ageAppropriate: opts.ageAppropriate, reason: "x" };
    },
  };
}

before(async () => {
  await db.insert(htmlFiles).values([{ id: "nl-mat", title: "Az elektromosság alapjai", content: "<p>x</p>", classroom: GRADE }]);
  await db.insert(learners).values([
    { id: "nl-on", name: "Próba Marci", grade: GRADE, interests: ["motorok", "elektromosság"], newsletter: true },
    { id: "nl-off", name: "Kikapcsolt Kati", grade: GRADE, interests: ["történelem"], newsletter: false },
    { id: "nl-empty", name: "Üres Ede", grade: GRADE, interests: [], newsletter: true },
  ]);
  await db.insert(extraEmailAddresses).values([
    { email: "marci@example.test", classrooms: [GRADE], studentName: "Próba Marci", learnerId: "nl-on" },
    { email: "marci-masik@example.test", classrooms: [GRADE], studentName: "Próba Marci", learnerId: "nl-on" },
    { email: "kati@example.test", classrooms: [GRADE], studentName: "Kikapcsolt Kati", learnerId: "nl-off" },
    { email: "ede@example.test", classrooms: [GRADE], studentName: "Üres Ede", learnerId: "nl-empty" },
  ]);
});
after(async () => { setNewsletterSender(null); await dbPool.end(); });

test("csak a bekapcsolt, érdeklődéssel bíró tanuló kap levelet, minden címére; a modell nem látja a nevet és a címet", async () => {
  const seen: string[] = [];
  const r = await runNewsletters(DAY1, fakeDeps({ url: "https://qubit.hu/villanymotor", ageAppropriate: true, seen }));
  assert.deepEqual({ sent: r.sent, skipped: r.skipped, failed: r.failed }, { sent: 1, skipped: 0, failed: 0 });
  assert.deepEqual(sent.map((m) => m.to).sort(), ["marci-masik@example.test", "marci@example.test"]);
  assert.match(sent[0].subject, /^🔭 Marci, mai felfedezésed: Hogyan forog a villanymotor\?$/);
  assert.match(sent[0].html, /href="https:\/\/qubit\.hu\/villanymotor"/);
  assert.match(sent[0].html, /Az elektromosság alapjai/);
  assert.match(sent[0].html, /\/preview\/nl-mat\?t=/, "személyes anyaglink");
  assert.equal(seen.length, 1);
  assert.doesNotMatch(seen[0], /Marci|Próba|@example\.test|nl-on/, "a modell bemenete név, cím és azonosító nélkül");
  const [row] = await db.select().from(learnerNewsletters).where(eq(learnerNewsletters.learnerId, "nl-on"));
  assert.equal(row.status, "sent");
  assert.equal(row.articleUrl, "https://qubit.hu/villanymotor");
});

test("ugyanaznap másodszor nincs levél; másnap az előző cikk nem ismétlődhet", async () => {
  sent.length = 0;
  const again = await runNewsletters(DAY1, fakeDeps({ url: "https://qubit.hu/villanymotor", ageAppropriate: true, seen: [] }));
  assert.deepEqual({ sent: again.sent, duplicate: again.duplicate }, { sent: 0, duplicate: 1 });
  const next = await runNewsletters(DAY2, fakeDeps({ url: "https://qubit.hu/villanymotor", ageAppropriate: true, seen: [] }));
  assert.equal(next.sent, 0);
  assert.equal(next.skipped, 1, "az egyetlen jelölt a tegnapi cikk volt → kihagyva");
  assert.equal(sent.length, 0);
});

test("korának nem megfelelő választás → kihagyva, nincs levél", async () => {
  sent.length = 0;
  const day3 = new Date("2026-10-21T14:00:00Z");
  const r = await runNewsletters(day3, fakeDeps({ url: "https://qubit.hu/masik", ageAppropriate: false, seen: [] }));
  assert.deepEqual({ sent: r.sent, skipped: r.skipped }, { sent: 0, skipped: 1 });
  assert.equal(sent.length, 0);
});

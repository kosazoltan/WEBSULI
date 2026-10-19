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
    // Review #313: a KERESÉS bemenete is rögzítve — név, cím, azonosító ott sem lehet.
    async search(input) { opts.seen.push(JSON.stringify(input)); return [opts.url]; },
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
  assert.equal(seen.length, 2, "keresés + választás");
  for (const input of seen) assert.doesNotMatch(input, /Marci|Próba|@example\.test|nl-on/, "a modell bemenete (keresés és választás) név, cím és azonosító nélkül");
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

test("review #313: újrapróbáláskor ugyanaz a cikk megy, és a már kézbesített cím nem kap újra", async () => {
  sent.length = 0;
  const day = new Date("2026-10-22T14:00:00Z");
  let failSecond = true;
  setNewsletterSender(async (subject, html, to) => {
    if (to === "marci-masik@example.test" && failSecond) { failSecond = false; throw new Error("átmeneti hiba"); }
    sent.push({ subject, html, to });
  });
  const first = await runNewsletters(day, fakeDeps({ url: "https://qubit.hu/elso", ageAppropriate: true, seen: [] }));
  assert.equal(first.failed, 1);
  assert.deepEqual(sent.map((m) => m.to), ["marci@example.test"]);
  // A második kör más cikket „találna” — de a foglalásban rögzített cikk megy, csak a hiányzó címre.
  const seen: string[] = [];
  const second = await runNewsletters(day, fakeDeps({ url: "https://qubit.hu/masik-cikk", ageAppropriate: true, seen }));
  assert.equal(second.sent, 1);
  assert.equal(seen.length, 0, "nincs új keresés és választás");
  assert.deepEqual(sent.map((m) => m.to), ["marci@example.test", "marci-masik@example.test"]);
  assert.match(sent[1].html, /href="https:\/\/qubit\.hu\/elso"/);
  setNewsletterSender(async (subject, html, to) => { sent.push({ subject, html, to }); });
});

test("review #313: a 20 percnél régebbi „pending” foglalás visszavehető; a friss nem", async () => {
  sent.length = 0;
  const day = new Date("2026-10-23T14:00:00Z");
  await db.insert(learnerNewsletters).values({ learnerId: "nl-on", day: "2026-10-23", status: "pending", attempts: 1 });
  const fresh = await runNewsletters(day, fakeDeps({ url: "https://qubit.hu/harmadik", ageAppropriate: true, seen: [] }));
  assert.equal(fresh.duplicate, 1, "élő foglalás: nem nyúl hozzá");
  await db.update(learnerNewsletters).set({ updatedAt: new Date(Date.now() - 30 * 60_000) }).where(eq(learnerNewsletters.day, "2026-10-23"));
  const stale = await runNewsletters(day, fakeDeps({ url: "https://qubit.hu/harmadik", ageAppropriate: true, seen: [] }));
  assert.equal(stale.sent, 1, "a beragadt foglalás visszavéve");
});

test("review #313: a közben kikapcsolt cím nem kap levelet", async () => {
  sent.length = 0;
  const day = new Date("2026-10-24T14:00:00Z");
  setNewsletterSender(async (subject, html, to) => {
    sent.push({ subject, html, to });
    // Az első küldés után a másik címet kikapcsolják.
    await db.update(extraEmailAddresses).set({ isActive: false }).where(eq(extraEmailAddresses.email, "marci-masik@example.test"));
  });
  const r = await runNewsletters(day, fakeDeps({ url: "https://qubit.hu/negyedik", ageAppropriate: true, seen: [] }));
  assert.equal(r.sent, 1);
  assert.deepEqual(sent.map((m) => m.to), ["marci@example.test"]);
});

test("review #314: tesztben álküldő nélkül valódi levél nem megy (a futás hibát rögzít)", async () => {
  setNewsletterSender(null);
  const day = new Date("2026-10-25T14:00:00Z");
  await db.update(extraEmailAddresses).set({ isActive: true }).where(eq(extraEmailAddresses.email, "marci-masik@example.test"));
  const r = await runNewsletters(day, fakeDeps({ url: "https://qubit.hu/otodik", ageAppropriate: true, seen: [] }));
  assert.equal(r.sent, 0);
  assert.equal(r.failed, 1);
  const [row] = await db.select().from(learnerNewsletters).where(eq(learnerNewsletters.day, "2026-10-25"));
  assert.match(row.error ?? "", /álküldővel/);
  setNewsletterSender(async (subject, html, to) => { sent.push({ subject, html, to }); });
});

test("review #314: a részben kézbesített (failed) cikk is ismétlés — másnap nem választható újra", async () => {
  sent.length = 0;
  // 10-25: failed, de a kézbesített címek kivonata nincs — most adjunk egyet, mintha egy cím megkapta volna.
  await db.update(learnerNewsletters).set({ articleUrl: "https://qubit.hu/otodik", deliveredTo: ["abcd"] }).where(eq(learnerNewsletters.day, "2026-10-25"));
  const r = await runNewsletters(new Date("2026-10-26T14:00:00Z"), fakeDeps({ url: "https://qubit.hu/otodik?utm=x", ageAppropriate: true, seen: [] }));
  assert.equal(r.sent, 0);
  assert.equal(r.skipped, 1, "a (kanonikusan azonos) cikk már ismétlés");
});

test("review #314: a visszavett foglalásra a régi futó nem írhat (tulajdon = próbálkozás sorszáma)", async () => {
  sent.length = 0;
  const day = new Date("2026-10-27T14:00:00Z");
  let reclaimed = false;
  setNewsletterSender(async (subject, html, to) => {
    if (!reclaimed) {
      reclaimed = true;
      // Egy másik kör „visszaveszi” a foglalást az első küldés közben (a próbálkozás sorszáma nő).
      await db.update(learnerNewsletters).set({ attempts: 2 }).where(eq(learnerNewsletters.day, "2026-10-27"));
    }
    sent.push({ subject, html, to });
  });
  const r = await runNewsletters(day, fakeDeps({ url: "https://qubit.hu/hatodik", ageAppropriate: true, seen: [] }));
  assert.equal(r.failed, 1, "a régi futó a tulajdon elvesztésekor megáll");
  assert.equal(sent.length, 1, "a második címre a régi futó már nem küld");
  const [row] = await db.select().from(learnerNewsletters).where(eq(learnerNewsletters.day, "2026-10-27"));
  assert.notEqual(row.status, "sent", "a régi futó nem írhatta „sent”-re");
  setNewsletterSender(async (subject, html, to) => { sent.push({ subject, html, to }); });
});

test("review #314: egy hibás cím nem akadályozza a többit; a foglalás újrapróbálható marad", async () => {
  sent.length = 0;
  const day = new Date("2026-10-28T14:00:00Z");
  setNewsletterSender(async (subject, html, to) => {
    if (to === "marci@example.test") throw new Error("visszapattant");
    sent.push({ subject, html, to });
  });
  const r = await runNewsletters(day, fakeDeps({ url: "https://qubit.hu/hetedik", ageAppropriate: true, seen: [] }));
  assert.equal(r.failed, 1, "a hibás cím miatt újrapróbálható");
  assert.deepEqual(sent.map((m) => m.to), ["marci-masik@example.test"], "a működő cím megkapta");
  setNewsletterSender(async (subject, html, to) => { sent.push({ subject, html, to }); });
  const retry = await runNewsletters(day, fakeDeps({ url: "https://qubit.hu/masik", ageAppropriate: true, seen: [] }));
  assert.equal(retry.sent, 1);
  assert.deepEqual(sent.map((m) => m.to), ["marci-masik@example.test", "marci@example.test"], "a pótkör csak a hiányzó címre, ugyanazzal a cikkel");
  assert.match(sent[1].html, /qubit\.hu\/hetedik/);
});

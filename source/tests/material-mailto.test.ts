import { test } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { MATERIAL_CAPTURE_SCRIPT, rewriteLocationAssignments } from "../server/lib/material-capture";
import { buildMaterialResultEmail, materialResultDedupKey, normalizeMaterialResult, ResultCoalescer } from "../server/lib/material-result";
import { ViewDedup } from "../server/lib/view-dedup";

// Régi (HTML) tananyagok eredménye e-mailben (docs/specs/2026-10-17-regi-anyag-eredmeny.md): a kiszolgáláskori átalakítás.
const LOC = "(window.__websuliLoc||location).href";
const scriptOf = (html: string) => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const compiles = (code: string) => { new Script(code); return true; };

test("a mailto-értékadás bal oldala az elfogóra mutat; a jobb oldal (többsoros is) változatlan", () => {
  const src = `<script>
function send(){ var email = document.getElementById('m').value;
  window.location.href = 'mailto:' + encodeURIComponent(email) +
    '?subject=' + encodeURIComponent(s) + '&body=' + encodeURIComponent(b);
  window.location.href=\`mailto:\${email}?subject=\${s}&body=\${b}\`;
  var mailtoLink = "mailto:" + email; window.location.href = mailtoLink;
  location.href = 'mailto:x'; window.location = 'mailto:y'; document.location.href = 'mailto:z';
}
</script>`;
  const r = rewriteLocationAssignments(src);
  assert.equal(r.count, 6);
  assert.ok(!/(^|[^.\w])window\.location(\.href)?\s*=[^=]/m.test(r.html), "nem maradt közvetlen értékadás");
  assert.ok(r.html.includes(`${LOC} = 'mailto:' + encodeURIComponent(email) +\n    '?subject='`), "a többsoros jobb oldal érintetlen");
  assert.ok(r.html.includes(`${LOC}=\`mailto:`));
  assert.ok(compiles(scriptOf(r.html)[0]), "az átalakított szkript érvényes JS");
});

test("nem érinti: összehasonlítás, olvasás, window.top, más objektum .location-je, külső és nem-JS szkript, szöveg", () => {
  const src = `<p>window.location.href = 'mailto:a'</p>
<script src="x.js">window.location.href = 'x'</script>
<script type="application/json">{"a":"window.location.href = 1"}</script>
<script>
if (window.location.href == 'a' || location.href === 'b') {}
var here = window.location.href; window.top.location.href = url; obj.location = 'x'; window.location.href += '#a';
</script>`;
  const r = rewriteLocationAssignments(src);
  assert.equal(r.count, 0);
  assert.equal(r.html, src);
});

test("az eseménykezelő attribútumban is cserél, a sima attribútumban és a szövegben nem; kétszer futtatva sem változik tovább", () => {
  const src = `<button onclick="window.location.href='mailto:'+m">Küld</button><a title="window.location.href = 1" href="#">x</a>`;
  const once = rewriteLocationAssignments(src);
  assert.equal(once.count, 1);
  assert.ok(once.html.includes(`onclick="${LOC}='mailto:'+m"`));
  assert.ok(once.html.includes(`title="window.location.href = 1"`));
  const twice = rewriteLocationAssignments(once.html);
  assert.equal(twice.count, 0);
  assert.equal(twice.html, once.html);
});

test("a beinjektált futásidejű szkript érvényes JS, nem tartalmaz e-mail címet, és a szerveres végpontot hívja", () => {
  const code = scriptOf(MATERIAL_CAPTURE_SCRIPT)[0];
  assert.ok(compiles(code));
  assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(code), "nincs e-mail cím literál");
  assert.ok(code.includes("/api/material-result"));
  assert.ok(code.includes("window.__websuliLoc = loc"));
  // a sablonsztringben a \d / \s escape-elve kell legyen — különben a kiadott szkriptben „d” / „s” lesz belőle
  assert.ok(code.includes(String.raw`var PERCENT = /\d+(?:[.,]\d+)?\s*%/;`));
  assert.ok(code.includes(String.raw`var FRACTION = /\d+\s*\/\s*\d+/;`));
  assert.ok(code.includes(String.raw`jegy\s*:/i;`));
});

test("a végpont: az auto jelölés opcionális logikai érték; a tárgy végén jelölve, legfeljebb 200 karakter", () => {
  const ok = normalizeMaterialResult({ materialId: "abc-1", subject: "Kvíz", body: "80%", auto: true });
  assert.ok(ok.ok && ok.value.auto === true);
  const manual = normalizeMaterialResult({ materialId: "abc-1", subject: "Kvíz", body: "80%" });
  assert.ok(manual.ok && manual.value.auto === undefined);
  assert.equal(normalizeMaterialResult({ materialId: "abc-1", subject: "Kvíz", body: "", auto: "igen" }).ok, false);
  assert.ok(ok.ok);
  const mail = buildMaterialResultEmail(ok.value, "Törtek", "https://websuli.vip/dev/abc-1");
  assert.equal(mail.subject, "[WebSuli eredmény] Kvíz — automatikus");
  const long = normalizeMaterialResult({ materialId: "abc-1", subject: "x".repeat(200), body: "", auto: true });
  assert.ok(long.ok);
  const longMail = buildMaterialResultEmail(long.value, null, "u");
  assert.equal(longMail.subject.length, 200);
  assert.ok(longMail.subject.endsWith(" — automatikus"));
  assert.equal(buildMaterialResultEmail(manual.ok ? manual.value : ok.value, null, "u").subject, "[WebSuli eredmény] Kvíz");
});

test("ismétlésvédelem: azonos anyag + kliens + tartalom egyszer; más tanuló (IP) vagy más eredmény újra küld; a meghiúsult visszavonható", () => {
  const v = { materialId: "abc-1", subject: "Kvíz", body: "80%" };
  const d = new ViewDedup(10 * 60 * 1000, 5000);
  const k = materialResultDedupKey(v, "1.1.1.1");
  assert.equal(d.shouldRecord(k, 0), true);
  assert.equal(d.shouldRecord(k, 60_000), false);
  assert.equal(d.shouldRecord(materialResultDedupKey(v, "2.2.2.2"), 60_000), true);
  assert.equal(d.shouldRecord(materialResultDedupKey({ ...v, body: "90%" }, "1.1.1.1"), 60_000), true);
  d.forget(k);
  assert.equal(d.shouldRecord(k, 61_000), true, "a pótlás nem akad el az ismétlésvédelmen");
  assert.equal(d.shouldRecord(k, 61_000 + 10 * 60 * 1000), true, "10 perc után újra küldhető");
});

test("a tananyaggyártó specifikációja (tulajdonosi kérés 2026-10-17): a feladat- és kvízeredményt sendResultEmail küldi; mailto tilos", async () => {
  const { LESSON_HTML_SPEC_V74 } = await import("../server/ai/lesson-html-spec");
  assert.match(LESSON_HTML_SPEC_V74, /## EREDMÉNYKÜLDÉS E-MAILBEN \(KÖTELEZŐ — a szöveges feladatok ÉS a kvíz\)/);
  assert.match(LESSON_HTML_SPEC_V74, /window\.sendResultEmail\(document\.title/);
  assert.match(LESSON_HTML_SPEC_V74, /TILOS a `mailto:`/);
  assert.ok(!/mailto link/.test(LESSON_HTML_SPEC_V74), "a régi „mailto link” előírás kikerült");
});

test("review #281: címzettenkénti kézbesítés — részleges hibánál a kimaradt pótolható, a már értesített nem kap újra, és nincs hamis duplicate", async () => {
  const { deliverToRecipients } = await import("../server/lib/material-result");
  const dedup = new ViewDedup(10 * 60 * 1000, 5000);
  const sent: string[] = [];
  let failB = true;
  const send = async (to: string) => { if (to === "b@x.test" && failB) return false; sent.push(to); return true; };
  const retries: Array<() => Promise<void>> = [];
  const base = { recipients: ["a@x.test", "b@x.test"], baseKey: "k1", dedup, send, scheduleRetry: (run: () => Promise<void>) => { retries.push(run); } };

  const first = await deliverToRecipients(base);
  assert.deepEqual(first, { duplicate: false, delivered: 1, failed: ["b@x.test"] });
  assert.equal(retries.length, 1, "a kimaradt címzett pótlása ütemezve");
  // a pótlás is hibázik → b kulcsa törlődik
  await retries[0]();
  // ismételt beküldés: csak b-nek megy, a-nak nem, és nem „duplicate”
  failB = false;
  const again = await deliverToRecipients(base);
  assert.deepEqual(again, { duplicate: false, delivered: 1, failed: [] });
  assert.deepEqual(sent, ["a@x.test", "b@x.test"]);
  assert.deepEqual(await deliverToRecipients(base), { duplicate: true });

  // teljes hiba: minden kulcs törlődik, az ismétlés mindkettőnek küld
  const d2 = new ViewDedup(10 * 60 * 1000, 5000);
  const none = await deliverToRecipients({ ...base, baseKey: "k2", dedup: d2, send: async () => false });
  assert.deepEqual(none, { duplicate: false, delivered: 0, failed: ["a@x.test", "b@x.test"] });
  const ok = await deliverToRecipients({ ...base, baseKey: "k2", dedup: d2, send: async () => true });
  assert.deepEqual(ok, { duplicate: false, delivered: 2, failed: [] });
});

test("review #281: a clientId opcionális, formátumellenőrzött; két tanuló ugyanazon IP mögött azonos eredménnyel különböző kulcsot kap", () => {
  assert.equal(normalizeMaterialResult({ materialId: "abc-1", subject: "K", body: "80%", clientId: "a1b2c3d4e5f6" }).ok, true);
  assert.equal(normalizeMaterialResult({ materialId: "abc-1", subject: "K", body: "80%", clientId: "x" }).ok, false);
  assert.equal(normalizeMaterialResult({ materialId: "abc-1", subject: "K", body: "80%", clientId: "<script>alert(1)</script>" }).ok, false);
  const a = { materialId: "abc-1", subject: "K", body: "80%", clientId: "aaaaaaaa1111" };
  const b = { ...a, clientId: "bbbbbbbb2222" };
  assert.notEqual(materialResultDedupKey(a, "1.1.1.1"), materialResultDedupKey(b, "1.1.1.1"));
  assert.equal(materialResultDedupKey(a, "1.1.1.1"), materialResultDedupKey({ ...a }, "1.1.1.1"), "ugyanaz az oldalbetöltés ismétlése duplikátum marad");
});

// docs/specs/2026-10-18-regi-anyag-eredmeny-azonnal.md: a kliens azonnal küld, a szerver kulcsonként összevár.
function fakeClock() {
  let now = 0; let id = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => now,
    setTimer: (run: () => void, ms: number) => { const t = ++id; timers.set(t, { at: now + ms, run }); return t; },
    clearTimer: (t: unknown) => { timers.delete(t as number); },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].run(); await new Promise(r => setImmediate(r));
      }
      now = end;
    },
  };
}

test("összevárás: 30 mp-en belüli beküldésekből egy levél a legutolsó állapottal; külön kulcs külön levél", async () => {
  const clock = fakeClock(); const sent: string[] = [];
  const c = new ResultCoalescer<string>({ deliver: async p => { sent.push(p); return true; }, ...clock });
  c.submit("anyag|kliensA", "1 / 3"); await clock.advance(10_000);
  c.submit("anyag|kliensA", "2 / 3"); await clock.advance(10_000);
  c.submit("anyag|kliensA", "3 / 3");
  c.submit("anyag|kliensB", "Léna 90%");
  await clock.advance(29_000);
  assert.deepEqual(sent, []);
  await clock.advance(1_000);
  assert.deepEqual(sent.sort(), ["3 / 3", "Léna 90%"]);
  assert.equal(c.size, 0);
});

test("összevárás: folyamatos tevékenységnél legkésőbb 3 perccel az első beküldés után megy; leállításkor azonnal", async () => {
  const clock = fakeClock(); const sent: string[] = [];
  const c = new ResultCoalescer<string>({ deliver: async p => { sent.push(p); return true; }, ...clock });
  for (let i = 1; i <= 9; i++) { c.submit("k", `állapot ${i}`); await clock.advance(20_000); }
  assert.deepEqual(sent, ["állapot 9"]); // 9 × 20 mp = 180 mp: a felső korlát lejárt
  c.submit("k", "új sorozat");
  await c.flushAll();
  assert.deepEqual(sent, ["állapot 9", "új sorozat"]);
  await clock.advance(60_000);
  assert.equal(sent.length, 2, "a leállításkor elküldött nem megy újra");
});

test("review #300: a sikeres közvetlen (mailto) küldés letiltja a kulcsot — a függő és a később beérkező automatikus levél sem megy", async () => {
  const clock = fakeClock(); const sent: string[] = [];
  const c = new ResultCoalescer<string>({ deliver: async p => { sent.push(p); return true; }, ...clock });
  c.submit("anyag|kliensA", "automatikus 70%");
  c.submit("anyag|kliensB", "másik tanuló 80%");
  c.suppress("anyag|kliensA");
  assert.equal(c.submit("anyag|kliensA", "későn beérkező automatikus 70%"), false);
  await clock.advance(31_000);
  assert.deepEqual(sent, ["másik tanuló 80%"]);
  await clock.advance(10 * 60_000);
  assert.equal(c.submit("anyag|kliensA", "új oldalbetöltés"), true, "a letiltás lejár");
});

test("review #300: teljes kézbesítési hiba (false vagy kivétel) → korlátozott újrapróba; a frissebb állapotot nem írja felül", async () => {
  const clock = fakeClock(); const tries: string[] = []; let failUntil = 2;
  const c = new ResultCoalescer<string>({ deliver: async p => { tries.push(p); if (tries.length <= failUntil) { if (tries.length === 2) throw new Error("Resend 503"); return false; } return true; }, ...clock });
  c.submit("k", "80%");
  await clock.advance(30_000); // 1. próba: false
  await clock.advance(60_000); // 2. próba: kivétel
  await clock.advance(60_000); // 3. próba: siker
  assert.deepEqual(tries, ["80%", "80%", "80%"]);
  await clock.advance(10 * 60_000);
  assert.equal(tries.length, 3);

  tries.length = 0; failUntil = 1;
  c.submit("k2", "régi 70%");
  await clock.advance(30_000); // false → újrapróba ütemezve
  c.submit("k2", "friss 90%"); // a közben érkezett frissebb állapot nyer
  await clock.advance(30_000);
  assert.deepEqual(tries, ["régi 70%", "friss 90%"]);
  await clock.advance(5 * 60_000);
  assert.equal(tries.length, 2, "a régi állapot nem megy újra");

  tries.length = 0; failUntil = 99;
  c.submit("k3", "mindig hibás");
  await clock.advance(10 * 60_000);
  assert.equal(tries.length, 3, "legfeljebb 3 próba");
});

test("review #300: a leállítás a folyamatban lévő kézbesítést is megvárja", async () => {
  const clock = fakeClock(); let release: () => void = () => {}; let done = false;
  const c = new ResultCoalescer<string>({ deliver: () => new Promise<boolean>(r => { release = () => { done = true; r(true); }; }), ...clock });
  c.submit("k", "90%");
  await clock.advance(30_000); // a kézbesítés elindult, még fut
  let flushed = false;
  const f = c.flushAll().then(() => { flushed = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(flushed, false);
  release(); await f;
  assert.equal(done && flushed, true);
});

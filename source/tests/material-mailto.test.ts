import { test } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { MATERIAL_CAPTURE_SCRIPT, rewriteLocationAssignments } from "../server/lib/material-capture";
import { buildMaterialResultEmail, materialResultDedupKey, normalizeMaterialResult } from "../server/lib/material-result";
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

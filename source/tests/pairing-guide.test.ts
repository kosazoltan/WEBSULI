import { test } from "node:test";
import assert from "node:assert/strict";
import { childPairingGuideEmail, parentPairingGuideEmail, planPairingGuides } from "../shared/pairing-guide";
import { firstNameOf } from "../shared/daily-reminder";

// docs/specs/2026-10-21-tanulo-parositas.md („Kiegészítés — párosítási útmutató e-mailben”).
test("gyereklevél: a saját párosító gomb, a lépések, a „Szia, …!” ellenőrzés és a Spam-tipp", () => {
  const m = childPairingGuideEmail({ firstName: "Lili", pairLink: "https://websuli.vip/?t=abc.1.x" });
  assert.match(m.subject, /^\[WebSuli\] Lili, kapcsold össze a telefonodat/);
  assert.ok(m.html.includes(`href="https://websuli.vip/?t=abc.1.x"`));
  assert.match(m.html, /Párosítom ezt az eszközt/);
  assert.match(m.html, /azon a telefonon/);
  assert.match(m.html, /„Szia, Lili!”/);
  assert.match(m.html, /minden|más böngészőben is/);
  assert.match(m.html, /ne küldd tovább/);
  assert.ok(m.html.includes("noreply@websuli.vip"));
  assert.ok(m.html.includes("Spam / Promóciók"));
});

test("gyereklevél: a név és a link escape-elve", () => {
  const m = childPairingGuideEmail({ firstName: "<b>X</b>", pairLink: `https://websuli.vip/?t=a"b` });
  assert.ok(!m.html.includes("<b>X</b>"));
  assert.ok(m.html.includes(`href="https://websuli.vip/?t=a&quot;b"`));
});

test("szülőlevél: a három út, a QR a szülő képernyőjén, ellenőrzés; link nincs benne, a név escape-elve", () => {
  const m = parentPairingGuideEmail({ names: ["Minta Lili Anna", "<i>Teszt</i>"] });
  assert.equal(m.subject, "[WebSuli] Így párosítsd a gyerekek eszközeit");
  assert.match(m.html, /A gyerek saját levele/);
  assert.match(m.html, /a te képernyődről/);
  assert.match(m.html, /Párosító QR-kód/);
  assert.match(m.html, /Párosító link másolása/);
  assert.match(m.html, /Vendég tanuló/);
  assert.match(m.html, /Minta Lili Anna/);
  assert.ok(!m.html.includes("<i>Teszt</i>"));
  assert.ok(!m.html.includes("?t="));
});

test("terv: minden tanuló minden (egyedi) címe a saját linkjét kapja, a szülők egy-egy levelet; link vagy cím nélkül nincs levél", () => {
  const plan = planPairingGuides([
    { id: "a", name: "Próba Bence Máté", emails: ["d@x.hu", "D@x.hu ", "d2@x.hu"], pairLink: "https://w/?t=A" },
    { id: "b", name: "Minta Lili Anna", emails: ["l@x.hu"], pairLink: "https://w/?t=B" },
    { id: "c", name: "Cím Nélküli", emails: [], pairLink: "https://w/?t=C" },
    { id: "d", name: "Titok Nélküli", emails: ["t@x.hu"], pairLink: null },
  ], ["p1@x.hu", "p2@x.hu", "p1@x.hu"], firstNameOf);
  const child = plan.filter(m => m.kind === "child");
  assert.deepEqual(child.map(m => m.to), ["d@x.hu", "d2@x.hu", "l@x.hu"]);
  assert.ok(child.filter(m => m.to.startsWith("d")).every(m => m.html.includes("?t=A") && !m.html.includes("?t=B") && /Bence/.test(m.subject)));
  assert.ok(child.find(m => m.to === "l@x.hu")!.html.includes("?t=B"));
  const parent = plan.filter(m => m.kind === "parent");
  assert.deepEqual(parent.map(m => m.to), ["p1@x.hu", "p2@x.hu"]);
  assert.match(parent[0].html, /Próba Bence Máté, Minta Lili Anna/);
  assert.ok(!parent[0].html.includes("Cím Nélküli") && !parent[0].html.includes("Titok Nélküli"));
  assert.deepEqual(planPairingGuides([], ["p1@x.hu"], firstNameOf), []);
});

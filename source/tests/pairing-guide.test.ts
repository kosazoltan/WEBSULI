import { test } from "node:test";
import assert from "node:assert/strict";
import { ADVENT_GUEST_PROGRESS_NOTE, childPairingGuideEmail, parentPairingGuideEmail, planPairingGuides } from "../shared/pairing-guide";
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

test("szülőlevél: az adventi naptár vendégként elért haladásának átkerüléséről szóló mondat (tulajdonosi döntés 2026-11-18) — csak BEKAPCSOLT naptárnál (GPT-vak L5)", () => {
  assert.equal(ADVENT_GUEST_PROGRESS_NOTE, "Ha a gyermek a személyes linkjével nyitja meg a naptárat azon az eszközön, amelyen addig vendégként játszott, a vendégként elért haladás a gyermek profiljához kerül.");
  // Kikapcsolt naptárnál (alapértelmezés) a levél nem ígér olyat, ami nem érhető el.
  const off = parentPairingGuideEmail({ names: ["Kiss Lili"] });
  assert.ok(!off.html.includes(ADVENT_GUEST_PROGRESS_NOTE) && !off.html.includes("Adventi naptár"), "kikapcsolt naptárnál nincs bekezdés");
  assert.ok(!planPairingGuides([{ id: "1", name: "Kiss Lili", emails: ["a@x.hu"], pairLink: "https://websuli.vip/?t=a.1.x" }], ["p@x.hu"], (n) => n).some((m) => m.html.includes(ADVENT_GUEST_PROGRESS_NOTE)));
  assert.ok(planPairingGuides([{ id: "1", name: "Kiss Lili", emails: ["a@x.hu"], pairLink: "https://websuli.vip/?t=a.1.x" }], ["p@x.hu"], (n) => n, { advent: true }).some((m) => m.kind === "parent" && m.html.includes(ADVENT_GUEST_PROGRESS_NOTE)));
  const m = parentPairingGuideEmail({ names: ["Kiss Lili"] }, { advent: true });
  assert.ok(m.html.includes(ADVENT_GUEST_PROGRESS_NOTE), "a mondat szó szerint az útmutatóban");
  assert.match(m.html, /<strong>Adventi naptár:<\/strong>/);
  // A gyereklevélbe nem kerül (a szülőnek szól).
  assert.ok(!childPairingGuideEmail({ firstName: "Lili", pairLink: "https://websuli.vip/?t=abc.1.x" }).html.includes(ADVENT_GUEST_PROGRESS_NOTE));
});

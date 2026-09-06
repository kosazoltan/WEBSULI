import assert from "node:assert/strict";
import test from "node:test";

import { autonomousDecision, AUTONOMOUS_MAX_ROUNDS } from "../server/studio/autonomous";
import { nextStep } from "../server/studio/pipeline";

/**
 * LS-7 (#189) — tulajdonosi döntés 2026-09-06: az egygombos úton NINCS emberi kapu.
 *
 * Mérve élesben (a tulajdonos képernyőképe): a Studio panel a „Vázlat jóváhagyása"
 * gombra `Nem hagyható jóvá — Csak a szerző lépésre váró job vázlata hagyható jóvá`
 * hibát adott, azaz a futás emberi döntésre parkolt. A tulajdonos kérése: feltöltés
 * → kész tananyag, utólagos javító prompt a maximum.
 *
 * A GÉPI ellenőrzések MEGMARADNAK (verbatim, fedettség, séma, publikálási kapu) —
 * csak a döntést hozza a gép: ahol eddig parkolt és emberre várt, ott most
 * automatikusan továbbmegy, és a hiányt jelzésként rögzíti.
 */

test("a fedettségi bukás NEM parkol emberre, hanem javító kört kér (#189)", () => {
  const d = autonomousDecision({
    reason: "coverage",
    round: 0,
    detail: "hiányzó kulcsfogalom: c3",
  });
  assert.equal(d.action, "retry", "a gép újrapróbál, nem vár emberre");
  assert.equal(d.nextRound, 1);
});

test("a kör-limit elérése után a fedettségi bukás sem parkol: publikál jelzéssel (#189)", () => {
  const d = autonomousDecision({
    reason: "coverage",
    round: AUTONOMOUS_MAX_ROUNDS,
    detail: "hiányzó kulcsfogalom: c3",
  });
  assert.equal(d.action, "accept", "a lánc végén is elkészül a tananyag");
  assert.match(d.note ?? "", /fedettség/i, "a hiány jelzésként megmarad");
});

test("a lektor-blokkoló limit után sem áll meg emberi döntésre (#189)", () => {
  const d = autonomousDecision({
    reason: "lektor_blocker",
    round: AUTONOMOUS_MAX_ROUNDS,
    detail: "2 blokkoló jegyzet",
  });
  assert.equal(d.action, "accept");
  assert.match(d.note ?? "", /lektor/i);
});

test("a séma/modell hiba TOVÁBBRA IS hiba — azt nem lehet elfogadni (#189)", () => {
  const d = autonomousDecision({ reason: "step_error", round: 0, detail: "zod: blocks.0.kind" });
  assert.equal(d.action, "fail", "a technikai hibát nem söpörjük a szőnyeg alá");
});

test("a pipeline lektor-átmenete a limit után 'gate'-re megy, nem 'error'-ra (#189)", () => {
  // A régi viselkedés: error + „emberi döntés szükséges". Az új: a kapu döntsön.
  const t = nextStep({ step: "lektor", ok: true, round: 2, blockers: 3 });
  assert.equal(t.step, "gate", "a lektor blokkolója nem öli meg a futást a limit után");
});

test("a publikálási kapu bukása a limit után sem 'error': elkészül, jelzéssel (#189)", () => {
  const t = nextStep({ step: "gate", ok: true, round: 2, gatePassed: false });
  assert.equal(t.step, "done", "a tananyag elkészül; a kapu-hiány jelzés lesz");
});

test("a limit ELŐTT viszont továbbra is javító kör fut (#189)", () => {
  assert.equal(nextStep({ step: "lektor", ok: true, round: 0, blockers: 2 }).step, "author");
  assert.equal(nextStep({ step: "gate", ok: true, round: 0, gatePassed: false }).step, "author");
});

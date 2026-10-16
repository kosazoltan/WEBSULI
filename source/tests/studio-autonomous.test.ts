import assert from "node:assert/strict";
import test from "node:test";

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

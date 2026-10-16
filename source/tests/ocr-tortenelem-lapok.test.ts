import test from "node:test";
import assert from "node:assert/strict";
import { checkVerbatim } from "../server/studio/verbatim";

/* Spec 2026-10-05 S11/6 + S9/7 — a 4 történelem-lap futásának hibái (mért: job 8953db4b, map d70d8f67). */

// S4b (docs/specs/2026-10-16-egy-futas.md): a régi lépésgép törölt moduljaira épülő esetből a MEGMARADÓ modulok állításai, szó szerint.
test("(2b) a szó szerinti ellenőrzés a jelölőket, a nyilakat és a soremelést figyelmen kívül hagyja", () => {
  const source = "A történelem forrásai\n↙⟦?⟧ tárgyak\n↓ írott emlékek\n\nírott emlékek\n↙⟦?⟧ elsődleges\nforrások\n↘⟦?⟧ másodlagos\nforrások\n[KERET: társadalom]\n1. élén: a király\n[KERET VÉGE]";
  assert.equal(checkVerbatim("írott emlékek elsődleges források", source).ok, true);
  assert.equal(checkVerbatim("írott emlékek\n↙⟦?⟧ elsődleges\nforrások", source).ok, true);
  assert.equal(checkVerbatim("↓ írott emlékek", "A történelem forrásai\n→ tárgyak\n→ írott emlékek").ok, true, "más nyíl a forrásban");
  assert.equal(checkVerbatim("társadalom 1. élén: a király", source).ok, false, "a keret felirata jelölő, nem forrásszöveg");
  assert.equal(checkVerbatim("1. élén: a király", source).ok, true);
  // mért c41: az idézet átugorja az elsődleges sorokat → továbbra sem szó szerinti
  assert.deepEqual(checkVerbatim("írott emlékek\n↘⟦?⟧ másodlagos\nforrások", source), { ok: false, reason: "not_found" });
  assert.equal(checkVerbatim("Hold változása → kőnaptár⟦?⟧ készítése az őskorban", "Hold változása → kőnaptár készítése az őskorban").ok, true);
});

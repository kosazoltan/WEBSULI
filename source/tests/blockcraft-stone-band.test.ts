import { test } from "node:test";
import assert from "node:assert/strict";
import { pickStoneBand, type StoneBand } from "../client/src/pages/blockcraft-stone-band";

const band = (top: number, bottom: number, left = 0, right = 390): StoneBand => ({ top, bottom, left, right, landscape: false });

test("FLAKE-BC-K1-CI: a zár alatt a kősáv fajtája nem vált, amíg a korábbi használható (a kövek nem ugranak el a koppintás elől)", () => {
  const below = { kind: "below" as const, band: band(715, 800, 138, 300) };
  // 1. mérés: a kártya alatti sáv még szűk → az alsó sáv a jobb.
  const first = pickStoneBand([{ kind: "main", band: band(321, 360) }, below], null);
  assert.equal(first?.kind, "below");
  // 2. mérés: a kártya összement, a kártya alatti sáv nagyobb lett — a kövek mégis a helyükön maradnak.
  const second = pickStoneBand([{ kind: "main", band: band(321, 451) }, below], first!.kind);
  assert.equal(second?.kind, "below");
});

test("FLAKE-BC-K1-CI: ha a korábbi sáv használhatatlanná válik, a legnagyobb használható sávra vált; használható sáv nélkül nincs sáv", () => {
  const r = pickStoneBand([{ kind: "main", band: band(321, 451) }, { kind: "below", band: band(780, 786) }], "below");
  assert.equal(r?.kind, "main");
  assert.equal(pickStoneBand([{ kind: "main", band: band(321, 330) }], null), null);
  assert.equal(pickStoneBand([{ kind: "main", band: band(321, 451) }, { kind: "below", band: band(700, 800) }], null)?.kind, "main");
});

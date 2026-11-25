import assert from "node:assert/strict";
import test from "node:test";

import { escapeMissedByLayer, type EscapeKeyEvent } from "../client/src/advent/dialog-escape";

const key = (k: string, prevented = false): EscapeKeyEvent & { prevents: number } => {
  const e = { key: k, defaultPrevented: prevented, prevents: 0, preventDefault() { e.prevents++; e.defaultPrevented = true; } };
  return e;
};

test("a könyvtár által NEM kezelt Escape: a hívó zár, és az esemény lefoglalva (még egyszer nem zár)", () => {
  const e = key("Escape");
  assert.equal(escapeMissedByLayer(e), true);
  assert.equal(e.prevents, 1);
  assert.equal(escapeMissedByLayer(e), false, "ugyanaz az esemény másodszor már nem zár");
});

test("a könyvtár által már kezelt Escape (preventDefault) és más billentyű: nincs teendő", () => {
  const handled = key("Escape", true);
  assert.equal(escapeMissedByLayer(handled), false);
  for (const k of ["Enter", " ", "Tab", "Esc"]) {
    const e = key(k);
    assert.equal(escapeMissedByLayer(e), false, k);
    assert.equal(e.prevents, 0, k);
  }
});

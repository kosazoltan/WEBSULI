import assert from "node:assert/strict";
import test from "node:test";

import { deleteImprovedConfirmMessage } from "../shared/improver-ui";

/**
 * #172 — a törlés-megerősítő generikus szövege azt a kérdést váltotta ki a
 * tulajdonosból, hogy a tananyag is törlődik-e. A szöveg mostantól explicit:
 * csak a javítási másolat törlődik, a tananyag nem.
 */

test("függő javítás: a másolat vész el, az eredeti tananyag marad", () => {
  const msg = deleteImprovedConfirmMessage("pending");
  assert.ok(msg.includes("csak ezt a javítási másolatot"), "explicit hatókör");
  assert.ok(msg.includes("tananyagot NEM érinti"), "a tananyag védve");
  assert.ok(msg.includes("nem vonható vissza"), "a véglegesség marad");
});

test("alkalmazott javítás: a tananyag a javított tartalommal marad élesben", () => {
  const msg = deleteImprovedConfirmMessage("applied");
  assert.ok(msg.includes("javított tartalommal marad"), "az élő állapot nem változik");
  assert.ok(msg.includes("Újra alkalmaz"), "megmondja, mi vész el valójában");
  assert.ok(msg.includes("nem vonható vissza"));
});

test("ismeretlen státusz: a biztonságos általános szöveg", () => {
  const msg = deleteImprovedConfirmMessage("akarmi");
  assert.ok(msg.includes("csak ezt a javítási másolatot"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachPoolErrorHandler } from "../server/lib/pool-error-handler";

// docs/specs/2026-11-01-db-pool-error-crash.md

test("control: an 'error' event without a listener throws (this is what crashed the server)", () => {
  const pool = new EventEmitter();
  assert.throws(() => pool.emit("error", new Error("terminating connection due to administrator command")));
});

test("E1: with the handler an idle client error does not throw and is logged with [DB] prefix, message and code", () => {
  const pool = new EventEmitter();
  const logs: string[] = [];
  attachPoolErrorHandler(pool, (m) => logs.push(m));
  const err = Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" });
  assert.doesNotThrow(() => pool.emit("error", err));
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[DB\] /);
  assert.match(logs[0], /terminating connection due to administrator command/);
  assert.match(logs[0], /code=57P01/);
});

test("edge: a non-Error value is stringified, and repeated errors each produce one log line", () => {
  const pool = new EventEmitter();
  const logs: string[] = [];
  attachPoolErrorHandler(pool, (m) => logs.push(m));
  pool.emit("error", "socket hang up");
  pool.emit("error", new Error("Connection terminated unexpectedly"));
  assert.equal(logs.length, 2);
  assert.match(logs[0], /socket hang up \(code=n\/a\)/);
  assert.match(logs[1], /Connection terminated unexpectedly/);
});

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";

// D1H-1: a kivágott forráskép tárolása és kiszolgálása, eldobható Postgresben. Guard BEFORE importing modules with a database connection.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { dbPool } = await import("../server/db");
const { sourceImagesRouter, storeSourceImage } = await import("../server/source-images");

const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x20, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(24, 7)]);
let base = "";
let close = () => {};
before(async () => {
  const app = express();
  app.use("/api/source-images", sourceImagesRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(async () => { close(); await dbPool.end(); });

test("tárolás: tartalomcímzett (sha256), idempotens; a meta (forrás, oldal) az első tárolásé", async () => {
  const id = await storeSourceImage(WEBP, { sourceUrl: "https://www.nkp.hu/a", sourceFile: "nkp-a", credit: "nkp.hu" });
  assert.equal(id, createHash("sha256").update(WEBP).digest("hex"));
  assert.equal(await storeSourceImage(WEBP, { sourceFile: "masik", credit: "más" }), id);
  const rows = (await dbPool.query("SELECT mime, source_url, credit FROM lesson_source_images WHERE id = $1", [id])).rows;
  assert.deepEqual(rows, [{ mime: "image/webp", source_url: "https://www.nkp.hu/a", credit: "nkp.hu" }]);
  await assert.rejects(storeSourceImage(Buffer.from("nem kép"), { credit: "x" }), /kép/i);
});

test("végpont: a kép a helyes MIME-vel, nosniff-fel, hosszú gyorsítótárral; hibás azonosító 400, ismeretlen 404", async () => {
  const id = await storeSourceImage(WEBP, { credit: "nkp.hu" });
  const ok = await fetch(`${base}/api/source-images/${id}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/webp");
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  assert.match(ok.headers.get("cache-control") ?? "", /immutable/);
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), WEBP);
  assert.equal((await fetch(`${base}/api/source-images/nem-hex`)).status, 400);
  assert.equal((await fetch(`${base}/api/source-images/${"b".repeat(64)}`)).status, 404);
});

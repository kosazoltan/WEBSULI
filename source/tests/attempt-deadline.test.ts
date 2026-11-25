import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attemptDeadline } from "../shared/attempt-deadline";

/** Review #602 (B5b): a pillanatkép teljes kísérletének határideje — a függő ujjlenyomat sem tartja fel a „pending” jelzőt. */
test("a határidőn túl függő előkészítés undefined-dal ér véget, és a hátralévő idő 0", async () => {
  const d = attemptDeadline(40);
  const never = new Promise<string>(() => undefined);
  const started = Date.now();
  assert.equal(await d.within(never), undefined);
  assert.ok(Date.now() - started < 1000);
  assert.equal(d.left(), 0);
});

test("CI #610: ha a lejárati időzítő az órához képest korábban fut le (ms-kerekítés), a within után a hátralévő idő akkor is pontosan 0", async () => {
  // Az órát kézzel léptetjük: az időzítő lefutásakor az óra még 1 ms-mal a határidő előtt áll (a Node időzítője a Date.now-hoz
  // képest ms-kerekítéssel korábban is tüzelhet). Lejárat után a kísérlet nem indíthat 1 ms-os POST-ot.
  let clock = 1_000;
  const d = attemptDeadline(5, () => clock);
  const pending = d.within(new Promise<string>(() => undefined));
  clock = 1_004;
  assert.equal(await pending, undefined);
  assert.equal(d.left(), 0, "lejárat után a hátralévő idő 0");
});

test("a határidőn belül teljesülő előkészítés értéke átjön, a hátralévő idő pozitív", async () => {
  const d = attemptDeadline(5_000);
  assert.equal(await d.within(Promise.resolve("fp")), "fp");
  assert.ok(d.left() > 0 && d.left() <= 5_000);
});

test("a pillanatkép a teljes kísérletre alkalmazza a határidőt: ujjlenyomat a határidőn belül, a POST a hátralévő idővel, lejáratkor nincs küldés", () => {
  const src = readFileSync(new URL("../client/src/lesson-runtime/resultReport.ts", import.meta.url), "utf8");
  assert.match(src, /const deadline = attemptDeadline\(SNAPSHOT_POST_TIMEOUT_MS\);/);
  assert.match(src, /const fingerprint = await deadline\.within\(getFingerprint\(\)\.catch\(\(\) => undefined\)\);/);
  assert.match(src, /const left = deadline\.left\(\);\s*if \(left <= 0\) return;/);
  assert.match(src, /timeout: left \}\);/);
  assert.match(src, /const release = setTimeout\(\(\) => \{ if \(state\.pending === mark\) state\.pending = null; \}, SNAPSHOT_POST_TIMEOUT_MS\);/);
});

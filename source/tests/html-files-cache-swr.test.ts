import { test } from "node:test";
import assert from "node:assert/strict";
import { HtmlFilesCache } from "../server/cache/HtmlFilesCache";
import type { HtmlFile } from "../shared/schema";

// Spec 2026-11-03-fooldal-sebesseg: mérve a lista lejáratakor minden egyidejű kérés külön, párhuzamosan építette újra a teljes listát.
const list = (title: string) => [{ id: title, title } as unknown as HtmlFile];
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

test("üres gyorsítótárnál az egyidejű kérések EGYETLEN építésen osztoznak", async () => {
  const cache = new HtmlFilesCache(5);
  let builds = 0;
  const gate = deferred<HtmlFile[]>();
  const build = () => { builds++; return gate.promise; };
  const pending = Array.from({ length: 10 }, () => cache.getOrBuild(build));
  gate.resolve(list("A"));
  const results = await Promise.all(pending);
  assert.equal(builds, 1);
  assert.ok(results.every((r) => r[0].title === "A"));
});

test("elavult listánál azonnal a régi lista jön, és egyetlen háttér-újraépítés fut", async () => {
  const cache = new HtmlFilesCache(0.0001); // ~6 ms
  cache.set(list("régi"));
  await new Promise((r) => setTimeout(r, 20));
  let builds = 0;
  const gate = deferred<HtmlFile[]>();
  const build = () => { builds++; return gate.promise; };
  const answers = await Promise.all(Array.from({ length: 5 }, () => cache.getOrBuild(build)));
  assert.ok(answers.every((r) => r[0].title === "régi"), "az elavult lista azonnal kiszolgálódik");
  assert.equal(builds, 1, "egyetlen háttér-újraépítés");
  gate.resolve(list("új"));
  await gate.promise; await new Promise((r) => setTimeout(r, 0));
  assert.equal((await cache.getOrBuild(build))[0].title, "új");
});

test("az érvénytelenítés előtt indult építés eredménye nem kerül be; a hibás háttér-építés után a régi lista marad", async () => {
  const cache = new HtmlFilesCache(5);
  const gate = deferred<HtmlFile[]>();
  const first = cache.getOrBuild(() => gate.promise);
  cache.invalidate();
  const fresh = cache.getOrBuild(async () => list("friss"));
  gate.resolve(list("elavult-építés"));
  await first;
  assert.equal((await fresh)[0].title, "friss");
  assert.equal((await cache.getOrBuild(async () => list("x")))[0].title, "friss");

  const stale = new HtmlFilesCache(0.0001);
  stale.set(list("régi"));
  await new Promise((r) => setTimeout(r, 20));
  let reported = 0;
  assert.equal((await stale.getOrBuild(async () => { throw new Error("DB"); }, () => { reported++; }))[0].title, "régi");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reported, 1);
  assert.equal((await stale.getOrBuild(async () => list("helyreállt")))[0].title, "régi", "a következő kérés újrapróbál, közben a régi megy");
});

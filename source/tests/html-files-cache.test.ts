import assert from "node:assert/strict";
import test from "node:test";
import type { HtmlFile } from "../shared/schema";

import { HtmlFilesCache, getHtmlFilesCache } from "../server/cache/HtmlFilesCache";

/**
 * server/cache/HtmlFilesCache.ts — the in-process cache in front of GET /api/html-files.
 * A stale or shared-by-reference entry would be served to every visitor, so the TTL and
 * the copy-on-read/write behaviour are worth pinning down.
 */

function file(id: string): HtmlFile {
  return {
    id,
    userId: null,
    title: `title-${id}`,
    content: "",
    description: null,
    classroom: 1,
    contentType: "html",
    displayOrder: 0,
    createdAt: new Date(0),
  } as HtmlFile;
}

test("a fresh cache is empty and invalid", () => {
  const cache = new HtmlFilesCache(5);
  assert.equal(cache.get(), null);
  assert.equal(cache.isValid(), false);
});

test("set then get returns the stored list", () => {
  const cache = new HtmlFilesCache(5);
  cache.set([file("a"), file("b")]);
  assert.equal(cache.get()?.length, 2);
  assert.equal(cache.isValid(), true);
});

test("invalidate clears the entry", () => {
  const cache = new HtmlFilesCache(5);
  cache.set([file("a")]);
  cache.invalidate();
  assert.equal(cache.get(), null);
  assert.equal(cache.isValid(), false);
});

test("an expired entry is dropped and reported as invalid", () => {
  const cache = new HtmlFilesCache(0); // 0 minute TTL
  cache.set([file("a")]);
  // With a zero TTL any elapsed millisecond expires the entry; force the clock forward.
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 1000;
    assert.equal(cache.isValid(), false);
    assert.equal(cache.get(), null);
  } finally {
    Date.now = realNow;
  }
});

test("an entry inside the TTL survives", () => {
  const cache = new HtmlFilesCache(5);
  cache.set([file("a")]);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 4 * 60 * 1000; // 4 minutes < 5 minute TTL
    assert.equal(cache.isValid(), true);
    assert.equal(cache.get()?.length, 1);
  } finally {
    Date.now = realNow;
  }
});

test("set copies the input so later caller mutations cannot corrupt the cache", () => {
  const cache = new HtmlFilesCache(5);
  const source = [file("a")];
  cache.set(source);
  source.push(file("b"));
  assert.equal(cache.get()?.length, 1);
});

test("get returns a copy so a caller cannot mutate the cached list", () => {
  // The cached array is handed to res.json() on every request; if callers shared the
  // same array, one mutation would poison the response for every later visitor.
  const cache = new HtmlFilesCache(5);
  cache.set([file("a")]);
  const first = cache.get();
  assert.ok(first);
  first.push(file("injected"));
  assert.equal(cache.get()?.length, 1);
});

test("getHtmlFilesCache returns a singleton", () => {
  assert.equal(getHtmlFilesCache(), getHtmlFilesCache());
});

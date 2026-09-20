import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { homeFilesQueryOptions, lessonNeighbours, HOME_FILES_REFETCH_MS } from "../client/src/lib/home-files-query";

/* Spec 2026-09-20 — a főoldal listája mobilon is magától frissül; könnyű váltás a tananyagok között. */

test("a főoldal lekérdezése mindig frissít megjelenéskor, percenként a látható lapon, fókuszra és hálózatra is", () => {
  const o = homeFilesQueryOptions();
  assert.deepEqual([...o.queryKey], ["/api/html-files"]);
  assert.equal(o.staleTime, 0);
  assert.equal(o.refetchOnMount, "always");
  assert.equal(o.refetchOnWindowFocus, true);
  assert.equal(o.refetchOnReconnect, true);
  assert.equal(o.refetchInterval, HOME_FILES_REFETCH_MS);
  assert.ok(HOME_FILES_REFETCH_MS <= 60_000 && HOME_FILES_REFETCH_MS >= 15_000);
  assert.equal(o.refetchIntervalInBackground, false, "rejtett lap nem kérdez");
});

test("előző/következő tananyag a lista sorrendje szerint, a szélen null", () => {
  const files = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(lessonNeighbours(files, "b"), { prev: { id: "a" }, next: { id: "c" } });
  assert.deepEqual(lessonNeighbours(files, "a"), { prev: null, next: { id: "b" } });
  assert.deepEqual(lessonNeighbours(files, "c"), { prev: { id: "b" }, next: null });
  assert.deepEqual(lessonNeighbours(files, "x"), { prev: null, next: null });
});

test("a lista-végpont nem ad max-age-et (a mobil böngésző ne cache-eljen)", () => {
  const routes = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
  const start = routes.indexOf('app.get("/api/html-files", ');
  const end = routes.indexOf('app.get("/api/html-files/search"', start);
  const handler = routes.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(handler, /max-age=\d+/);
  assert.match(handler, /no-cache, must-revalidate/);
  const home = fs.readFileSync(path.resolve("client/src/pages/Home.tsx"), "utf8");
  assert.match(home, /homeFilesQueryOptions\(\)/);
  assert.match(home, /pageshow/);
});

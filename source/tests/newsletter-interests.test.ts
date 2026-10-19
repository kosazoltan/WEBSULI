import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { interestsFromText, NEWSLETTER_LIMITS, normalizeInterests } from "../shared/newsletter";

/** docs/specs/2026-10-19-mai-felfedezes-hirlevel.md (S1) */
const root = join(import.meta.dirname, "..");

test("normalizeInterests: trim, üres elhagyva, kis-nagybetűtől független egyediség (az első alak marad)", () => {
  assert.deepEqual(normalizeInterests(["  Repülők ", "", "repülők", "Történelem", "  "]), ["Repülők", "Történelem"]);
  assert.deepEqual(normalizeInterests(["K-pop  és   Korea"]), ["K-pop és Korea"], "belső szóközök összevonva");
  assert.deepEqual(normalizeInterests([]), []);
});

test("normalizeInterests: hibás bemenet → null", () => {
  assert.equal(normalizeInterests("repülők"), null, "nem tömb");
  assert.equal(normalizeInterests([1, 2]), null, "nem szöveg");
  assert.equal(normalizeInterests(["x".repeat(NEWSLETTER_LIMITS.tagChars + 1)]), null, "túl hosszú címke");
  assert.equal(normalizeInterests(["rossz\u0007címke"]), null, "vezérlőkarakter");
  assert.equal(normalizeInterests(Array.from({ length: NEWSLETTER_LIMITS.tags + 1 }, (_, i) => `téma ${i}`)), null, "túl sok címke");
  assert.deepEqual(normalizeInterests(Array.from({ length: NEWSLETTER_LIMITS.tags }, (_, i) => `téma ${i}`))?.length, NEWSLETTER_LIMITS.tags, "a határ még jó");
});

test("interestsFromText: vessző, pontosvessző és sortörés választ el", () => {
  assert.deepEqual(interestsFromText("repülők, katonaság; történelem\nmotorok,,"), ["repülők", "katonaság", "történelem", "motorok"]);
});

test("a végpont admin-routeren van, és a lista az érdeklődést és a kapcsolót is adja", () => {
  const routes = readFileSync(join(root, "server", "routes.ts"), "utf8");
  assert.match(routes, /adminRouter\.patch\("\/learners\/:id"/);
  assert.match(routes, /interests: prefs\.get\(o\.id\)\?\.interests \?\? \[\], newsletter: prefs\.get\(o\.id\)\?\.newsletter \?\? false/);
});

test("migráció ↔ séma: a két oszlop alapból üres / KI", () => {
  const migration = readFileSync(join(root, "migrations", "0034_learner_newsletter.sql"), "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS interests text\[\] NOT NULL DEFAULT '\{\}'/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS newsletter boolean NOT NULL DEFAULT false/);
  const schema = readFileSync(join(root, "shared", "schema.ts"), "utf8");
  assert.match(schema, /interests: text\("interests"\)\.array\(\)\.notNull\(\)\.default\(sql`'\{\}'::text\[\]`\)/);
  assert.match(schema, /newsletter: boolean\("newsletter"\)\.notNull\(\)\.default\(false\)/);
});

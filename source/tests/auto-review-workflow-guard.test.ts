import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Spec docs/specs/2026-11-19-bence-maradvany-tisztitas.md — az `auto-review.yml` minden PR-re megjegyzést ír, amelyet az
 * ügynökök élő dokumentációként olvasnak. A korábbi szöveg egy megszűnt szereplős rendszerre hivatkozott („Bence merge-eli”,
 * „Junior javit”), és automatikus beolvasztást ígért. A beolvasztást az orkesztrátor végzi a minőségkapuk után
 * (docs/minosegkapuk.md). Ez az őr azt méri, hogy a workflow szövege igaz marad, és a három review-bot indítója megvan.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const workflow = readFileSync(join(ROOT, ".github", "workflows", "auto-review.yml"), "utf8");

/** A régi állapotkulcs pontos szava: az átálláskor a „már lefutott” ellenőrzésnek fel kell ismernie (spec §4). */
const LEGACY_KEY_WORD = "bence-auto-review";

test("auto-review: a workflow neve semleges, a job neve változatlan", () => {
  assert.match(workflow, /^name: Auto Review\r?$/m);
  assert.match(workflow, /^ {2}trigger-review-bots:\r?\n {4}name: Trigger Sourcery \+ Codex review\r?$/m);
});

test("auto-review: a három review-bot indítója és az átfogó review bekezdése megvan", () => {
  for (const trigger of ["@sourcery-ai review", "@codex review", "@vercel run a review"]) {
    assert.ok(workflow.includes(`'${trigger}',`), `hiányzik a megjegyzés önálló sora: ${trigger}`);
  }
  assert.ok(workflow.includes("docs/specs/2026-10-18-atfogo-review.md"), "hiányzik az átfogó review hivatkozása");
});

test("auto-review: nincs megszűnt szereplő és nincs automatikus merge ígérete", () => {
  const text = workflow.split(LEGACY_KEY_WORD).join("");
  const hit = /bence|junior|merge-eli|openclaw|\bcodi\b|eszter/i.exec(text);
  assert.equal(hit, null, `tiltott szó a workflow-ban: ${hit?.[0]}`);
  assert.ok(workflow.includes("docs/minosegkapuk.md"), "a megjegyzés nem hivatkozik a minőségkapukra");
  assert.match(workflow, /merge-et az orkesztrator vegzi/, "a megjegyzés nem mondja ki, hogy ki végzi a merge-et");
});

test("auto-review: SHA-nként egy megjegyzés — az új és a régi állapotkulcsot is felismeri", () => {
  assert.ok(workflow.includes("const stateKey = `<!-- auto-review: ${headSha} -->`;"), "az új állapotkulcs hiányzik");
  assert.ok(workflow.includes("const legacyKey = `<!-- " + LEGACY_KEY_WORD + ": ${headSha} -->`;"), "a régi állapotkulcs felismerése hiányzik");
  const some = /comments\.some\(([^\n]*)\);/.exec(workflow)?.[1] ?? "";
  assert.ok(some.includes("includes(stateKey)") && some.includes("includes(legacyKey)"), "a „már lefutott” feltétel nem nézi mindkét kulcsot");
  assert.ok(workflow.includes("core.setOutput('state_key', stateKey);"), "az új megjegyzés nem az új kulccsal készül");
  assert.equal(workflow.split(LEGACY_KEY_WORD).length - 1, 1, "a régi kulcs szava pontosan egyszer szerepelhet (csak a felismerésben)");
});

test("a gyökér .harness/ alatt nincs követett fájl (régi szereplős munkanapló)", () => {
  const tracked = execFileSync("git", ["ls-files", "--", ".harness"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(tracked, "", `követett fájl a .harness/ alatt:\n${tracked}`);
});

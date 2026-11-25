import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { RESULT_API_VERSION, supportsResultApi } from "../shared/result-compat";

/**
 * Eredmény-e-mail B3 (#510 R10, R12; docs/specs/2026-11-22-eredmeny-email-bontas.md „B3 / B5a"): a kliens csak a szerver numerikus
 * `resultApi: 2` jelzésére küldi a végleges törzs új mezőit; jelzés nélkül (régi vagy még nem hirdető szerver) a régi alak megy.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

test("B3: a képesség-jelzés csak a pontos numerikus verzió", () => {
  assert.equal(RESULT_API_VERSION, 2);
  assert.equal(supportsResultApi({ resultApi: 2 }), true);
  for (const value of [undefined, null, 1, 3, "2", true, 2.5, {}]) assert.equal(supportsResultApi({ resultApi: value }), false, String(value));
  assert.equal(supportsResultApi({}), false);
  assert.equal(supportsResultApi(null as never), false, "hiányzó válasz sem dob");
});

test("B3: a végleges törzs új mezői (startedAt, lastAnsweredAt) csak jelzéssel kerülnek a kérésbe", () => {
  const report = read("client/src/lesson-runtime/resultReport.ts");
  const bodyBlock = report.slice(report.indexOf("const bodyFor = (learner: string | undefined) => kind === \"tasks\""), report.indexOf("// J5 (spec 2026-11-10-gyartas-meres)"));
  assert.ok(bodyBlock.length > 0);
  assert.doesNotMatch(bodyBlock, /\.\.\.times/, "a törzs alapból régi alakú");
  assert.match(report, /resultTimes: times/, "az időbélyegek külön opcióként mennek az apiRequest-nek");
  const client = read("client/src/lib/queryClient.ts");
  // B5b (dokumentált spec-változás: docs/specs/2026-11-25-eredmeny-email-b5b.md 1. pont): a token a pillanatkép jelzését is hordozza.
  assert.match(client, /return \{ token: data\.csrfToken, resultApi: supportsResultApi\(data\), ownerBinding: data\.resultOwnerBinding === true, partial: data\.resultPartial === true \};/);
  assert.match(client, /capable && addsFields \?/, "a mezők csak képes szervernél olvadnak a törzsbe");
  assert.match(client, /await sendOnce\(capable, controller\.signal\)/);
  assert.match(client, /await sendOnce\(newCsrfToken\.resultApi, retryController\.signal\)/, "a CSRF-újrapróba a friss token jelzését követi");
  assert.match(client, /if \(first\.status !== 400 \|\| !capable \|\| !addsFields\) return first;/, "R10: régi alakú ismétlés csak jelzéssel és új mezővel");
});

test("B3: a szerver még nem hirdeti a V2-t (a hirdetés a B5a elfogadási feltétele)", () => {
  assert.doesNotMatch(read("server/routes.ts"), /resultApi\s*:/);
});

test("B5b: a szerver a pillanatkép képességét CSAK a RESULT_PARTIAL_EMAIL kapcsolóval hirdeti (resultPartial: true)", () => {
  const routes = read("server/routes.ts");
  const csrf = routes.slice(routes.indexOf("app.get('/api/csrf-token'"), routes.indexOf("app.get('/api/csrf-token'") + 900);
  assert.match(csrf, /resultPartialEmailEnabled\(\) \? \{ resultPartial: true \} : \{\}/);
  assert.doesNotMatch(csrf, /resultApi/, "a teljes V2-t a B5b nem hirdeti");
});

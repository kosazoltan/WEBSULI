import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Spec 2026-11-10-gyartas-meres, J4 szelet: a tömeges e-mail gomb nem állíthat hamis sikert.
const sourceDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel: string): string => readFileSync(join(sourceDir, rel), "utf8");

test("J4 · forrásőrök: a tömeges e-mail végpont 501-et ad, a kliens nem mutat hamis sikert", () => {
  const routes = read("server/routes.ts");
  assert.doesNotMatch(routes, /not yet implemented/i);

  const start = routes.indexOf('adminRouter.post("/materials/bulk-email"');
  assert.ok(start >= 0, "a bulk-email kezelő hiányzik");
  const end = routes.indexOf('adminRouter.post("/materials/bulk-move"', start);
  const handler = routes.slice(start, end);
  assert.match(handler, /status\(501\)/);
  assert.doesNotMatch(handler, /success:\s*true/);

  const client = read("client/src/components/AdminFileDashboard.tsx");
  const cStart = client.indexOf("const handleBulkEmail");
  assert.ok(cStart >= 0, "a handleBulkEmail kezelő hiányzik");
  const cEnd = client.indexOf("const handleBulkMove", cStart);
  const fn = client.slice(cStart, cEnd);
  const successToast = fn.indexOf("Email értesítések elküldve");
  const catchAt = fn.indexOf("} catch (");
  // A siker-értesítés csak a sikeres await után (a catch előtt) lehet, a hibaág pedig destruktív toast a szerver üzenetével.
  assert.ok(fn.indexOf('apiRequest("POST", "/api/admin/materials/bulk-email"') < successToast);
  assert.ok(successToast < catchAt);
  const catchBlock = fn.slice(catchAt);
  assert.match(catchBlock, /variant:\s*"destructive"/);
  assert.match(catchBlock, /error\.message/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isAutomatedUserAgent } from "../server/lib/automated-agent";

/* Spec 2026-10-20-robot-megtekintes — mért: 7 nap alatt a megtekintések 77 %-a robot (311 meta-externalagent). */

test("robot / előnézet / parancssor: automatikus (éles UA-minták)", () => {
  for (const ua of [
    "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "curl/8.22.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "python-requests/2.32.0",
    "",
    undefined,
  ]) assert.equal(isAutomatedUserAgent(ua), true, String(ua));
});

test("valódi böngésző: nem automatikus", () => {
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1",
  ]) assert.equal(isAutomatedUserAgent(ua), false, ua);
});

test("a /dev/:id megtekintés-rögzítése az automatikus kliens szűrője mögött van", () => {
  const src = fs.readFileSync("server/routes.ts", "utf8");
  const at = src.indexOf('app.get("/dev/:id"');
  const block = src.slice(at, at + 3000);
  const guard = block.indexOf("isAutomatedUserAgent(userAgent)");
  const record = block.indexOf("storage.createMaterialView(");
  assert.ok(guard > 0 && record > guard);
});

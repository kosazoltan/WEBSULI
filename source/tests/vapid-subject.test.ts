/**
 * docs/specs/2026-11-16-valodi-cimek-ki.md (V3): a VAPID subject környezeti változóból jön (`VAPID_SUBJECT`), személyes cím
 * nincs a kódban; hiányzó / hibás értéknél a nem személyes `https://websuli.vip` az alapérték, a hibás érték nem kerül a naplóba.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const { vapidSubject, DEFAULT_VAPID_SUBJECT } = await import("../server/lib/vapid-subject");
const { logger } = await import("../server/lib/logger");

function captureWarn<T>(fn: () => T): { value: T; lines: string[] } {
  const lines: string[] = [];
  const orig = logger.warn;
  logger.warn = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  try {
    return { value: fn(), lines };
  } finally {
    logger.warn = orig;
  }
}

describe("VAPID subject", () => {
  it("nincs beállítva → a nem személyes alapérték, figyelmeztetés nélkül", () => {
    assert.equal(DEFAULT_VAPID_SUBJECT, "https://websuli.vip");
    for (const env of [{}, { VAPID_SUBJECT: "" }, { VAPID_SUBJECT: "   " }]) {
      const { value, lines } = captureWarn(() => vapidSubject(env));
      assert.equal(value, DEFAULT_VAPID_SUBJECT);
      assert.deepEqual(lines, []);
    }
  });

  it("érvényes mailto: / https: érték → maga (levágott szóközökkel)", () => {
    assert.equal(vapidSubject({ VAPID_SUBJECT: "mailto:admin@pelda.hu" }), "mailto:admin@pelda.hu");
    assert.equal(vapidSubject({ VAPID_SUBJECT: "  https://pelda.hu/kapcsolat " }), "https://pelda.hu/kapcsolat");
  });

  it("hibás érték → alapérték + figyelmeztetés, amely az értéket nem írja ki", () => {
    for (const bad of ["mailto:", "mailto:nem-cim", "mailto:titkos@", "admin@pelda.hu", "http://pelda.hu", "javascript:alert(1)", "https://localhost", "ftp://pelda.hu"]) {
      const { value, lines } = captureWarn(() => vapidSubject({ VAPID_SUBJECT: bad }));
      assert.equal(value, DEFAULT_VAPID_SUBJECT, bad);
      assert.equal(lines.length, 1, bad);
      assert.ok(!lines[0].includes(bad), `a napló nem tartalmazhatja a hibás értéket: ${bad}`);
      assert.ok(!lines[0].includes("@"), bad);
    }
  });

  it("a web-push elfogadja az alapértéket (setVapidDetails nem dob)", async () => {
    const webPush = (await import("web-push")).default;
    const keys = webPush.generateVAPIDKeys();
    assert.doesNotThrow(() => webPush.setVapidDetails(DEFAULT_VAPID_SUBJECT, keys.publicKey, keys.privateKey));
    assert.doesNotThrow(() => webPush.setVapidDetails(vapidSubject({ VAPID_SUBJECT: "mailto:admin@pelda.hu" }), keys.publicKey, keys.privateKey));
  });

  it("mindkét push-beállító hely a közös függvényt hívja, beégetett mailto: nélkül", () => {
    const read = (p: string) => readFileSync(fileURLToPath(new URL(`../server/${p}`, import.meta.url)), "utf8");
    const push = read("pushNotifications.ts");
    assert.match(push, /const vapidEmail = vapidSubject\(\);/);
    const routes = read("routes.ts");
    const test = routes.slice(routes.indexOf('adminRouter.post("/push/test"'), routes.indexOf('adminRouter.post("/push/test"') + 1500);
    assert.match(test, /webPush\.setVapidDetails\(\s*vapidSubject\(\),/);
    for (const src of [push, routes]) assert.doesNotMatch(src, /setVapidDetails\(\s*['"`]mailto:/);
  });
});

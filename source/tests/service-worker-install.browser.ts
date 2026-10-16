import { expect, test, type Page } from "@playwright/test";

// Spec: docs/specs/2026-10-13-sw-telepites-cache-biztonsag.md
// Real Chrome service worker lifecycle against client/public/service-worker.js.

const CACHE_PREFIX = "anyagok-profiknak-v";

async function installInitialWorker(page: Page): Promise<string> {
  await page.request.get("/__sw-test/reset");
  await page.goto("/");
  const cacheNames = await page.evaluate(async () => {
    await navigator.serviceWorker.register("/service-worker.js");
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state !== "activated") {
      await new Promise<void>((resolve) => {
        reg.active!.addEventListener("statechange", () => {
          if (reg.active?.state === "activated") resolve();
        });
      });
    }
    return caches.keys();
  });
  expect(cacheNames).toHaveLength(1);
  expect(cacheNames[0].startsWith(CACHE_PREFIX)).toBe(true);
  return cacheNames[0];
}

// Triggers registration.update() and resolves with the final state of the new worker
// ("activated" or "redundant").
async function updateWorker(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) throw new Error("no registration");
    await reg.update();
    const worker = reg.installing ?? reg.waiting;
    if (!worker) throw new Error("update() did not produce a new worker");
    return new Promise<string>((resolve) => {
      const check = () => {
        if (worker.state === "activated" || worker.state === "redundant") resolve(worker.state);
      };
      worker.addEventListener("statechange", check);
      check();
    });
  });
}

async function cacheHasOffline(page: Page, cacheName: string): Promise<boolean> {
  return page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return !!(await cache.match("/offline.html"));
  }, cacheName);
}

test("successful update leaves only the new versioned cache", async ({ page }) => {
  const oldCache = await installInitialWorker(page);
  await page.request.get("/__sw-test/set?version=9.9.9-ok");

  expect(await updateWorker(page)).toBe("activated");

  const newCache = `${CACHE_PREFIX}9.9.9-ok`;
  expect(newCache).not.toBe(oldCache);
  expect(await page.evaluate(() => caches.keys())).toEqual([newCache]);
  expect(await cacheHasOffline(page, newCache)).toBe(true);
});

test("failed install keeps the previous cache and offline fallback intact", async ({ page }) => {
  const oldCache = await installInitialWorker(page);
  await page.request.get("/__sw-test/set?version=9.9.9-fail&fail=/favicon.ico");

  expect(await updateWorker(page)).toBe("redundant");

  const keys = await page.evaluate(() => caches.keys());
  expect(keys).toContain(oldCache);
  expect(await cacheHasOffline(page, oldCache)).toBe(true);
  const activeScript = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active?.state;
  });
  expect(activeScript).toBe("activated");
});

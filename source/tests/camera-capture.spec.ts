import { expect, test, type Page } from "@playwright/test";
import { mockAdmin } from "./admin-responsive-helpers";

/**
 * Fényképezős forrásfelvétel (docs/specs/2026-10-31-tananyag-fenykepezo.md) — valódi böngészős render.
 * A kamerát determinisztikus ál-stream adja (canvas.captureStream 1920×1080): így a happy path (exponálás →
 * forrásfájl-lista) és a hibaút (engedély megtagadva → natív capture-input) is gép nélkül, stabilan mérhető.
 */
test.use({ serviceWorkers: "block" });

async function fakeCamera(page: Page) {
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111111";
    ctx.font = "90px sans-serif";
    ctx.fillText("Tankönyvoldal — ő ű", 80, 540);
    setInterval(() => ctx.fillRect(0, 0, 4, 4), 100); // a stream élő marad
    const md = navigator.mediaDevices;
    // Hívásonként friss stream: a kamera-munkamenet az eszközváltáskor leállítja az elsőt, és újra kér.
    Object.defineProperty(md, "getUserMedia", { value: async () => canvas.captureStream(10) });
    Object.defineProperty(md, "enumerateDevices", {
      value: async () => [{ deviceId: "fake-rear", kind: "videoinput", label: "Back Camera (fake)" }],
    });
  });
}

test("fényképezés: gomb → élő előnézet → exponálás → a kép a forrásfájl-listában", async ({ page }) => {
  await mockAdmin(page);
  await fakeCamera(page);
  await page.goto("/admin?tab=lesson-studio");
  const open = page.getByTestId("camera-open");
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.getByTestId("camera-dialog")).toBeVisible();
  const shutter = page.getByTestId("camera-shutter");
  await expect(shutter).toBeEnabled();
  await shutter.click();
  await expect(page.getByTestId("camera-photo-strip").locator("img")).toHaveCount(1);
  await page.getByTestId("camera-done").click();
  await expect(page.getByTestId("camera-dialog")).toHaveCount(0);
  await expect(page.getByTestId("extract-file-list")).toContainText(/fenykep-.*\.jpg · image/);
});

test("fényképezés: megtagadott engedély → a natív kamera-input nyílik (fallback)", async ({ page }) => {
  await mockAdmin(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      },
    });
  });
  await page.goto("/admin?tab=lesson-studio");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("camera-open").click();
  // A natív `capture` input kattintása fájlválasztóként jelentkezik a tesztben — ez a fallback bizonyítéka.
  await chooser;
  await expect(page.getByTestId("camera-dialog")).toHaveCount(0);
});

test("magicv6-kulso: a Fényképezés gomb látszik és nem lóg ki a tananyagkészítés fülön", async ({ page }) => {
  await mockAdmin(page);
  await page.setViewportSize({ width: 393, height: 780 });
  await page.goto("/admin?tab=lesson-studio");
  const open = page.getByTestId("camera-open");
  await open.scrollIntoViewIfNeeded();
  await expect(open).toBeVisible();
  const box = (await open.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(393 + 1);
  const ovx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(ovx).toBeLessThanOrEqual(1);
});

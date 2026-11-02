import { expect, test } from "@playwright/test";

/**
 * docs/specs/2026-11-02-mht-forras.md — a tananyagkészítő feltöltő MHT/MHTML webarchívumot is felvesz:
 * a fájl „mht” fajtával a listába kerül (nincs „Nem támogatott fájl”), és a gyártás data-URL-ként, `kind: "mht"`-vel küldi.
 * Valódi render, mockolt API.
 */
test.use({ serviceWorkers: "block" });

const MHT = Buffer.from(
  'From: <Saved by Blink>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; type="text/html"; boundary="b"\r\n\r\n' +
  '--b\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: binary\r\n\r\n<html><body><h1>Antigoné</h1></body></html>\r\n--b--\r\n',
  "utf8",
);

test("MHT forrás: listába kerül és kind=mht data-URL-ként megy a gyártásba", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const bodies: Array<{ files: Array<{ name: string; kind: string; content: string }> }> = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/studio/lessons/one-step") { bodies.push(route.request().postDataJSON()); return route.fulfill({ status: 202, json: { runId: "run-mht" } }); }
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    if (path === "/api/csrf-token") data = { csrfToken: "test" };
    if (path === "/api/config") data = { baseUrl: "http://localhost", materialOrigin: "" };
    if (path === "/api/studio/maps") data = { maps: [] };
    if (path.startsWith("/api/studio/lessons/one-step/")) data = { phase: "extract", jobId: null, error: null };
    await route.fulfill({ json: data });
  });
  await page.goto("/admin?tab=lesson-studio");
  const form = page.getByTestId("source-upload-form").first();
  const input = form.getByTestId("extract-file-input");
  expect(await input.getAttribute("accept")).toContain(".mht");
  expect(await input.getAttribute("accept")).toContain(".mhtml");
  await input.setInputFiles({ name: "Szophoklész_ Antigoné.mht", mimeType: "multipart/related", buffer: MHT });
  await expect(form.getByTestId("extract-file-list")).toContainText("Szophoklész_ Antigoné.mht · mht");
  await expect(page.getByText("Nem támogatott fájl")).toHaveCount(0);
  for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await form.screenshot({ path: `tests/screenshots/studio-mht-upload-${size.width}.png` });
  }
  await form.getByTestId("one-step-submit").click();
  await expect.poll(() => bodies.length).toBe(1);
  const [file] = bodies[0].files;
  expect(file.kind).toBe("mht");
  expect(file.name).toBe("Szophoklész_ Antigoné.mht");
  expect(Buffer.from(file.content.replace(/^data:[^,]*;base64,/, ""), "base64").equals(MHT)).toBe(true);
  expect(errors).toEqual([]);
});

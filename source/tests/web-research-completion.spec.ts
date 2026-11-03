import { expect, test, type Page } from "@playwright/test";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";

test.use({ serviceWorkers: "block" });
const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és a területképlet.", subject: "Matematika", experience: compactFusionFixture().experience };
const html = `<!DOCTYPE html><html lang="hu"><body><h1>Árvíztűrő tananyag</h1><script type="application/json" id="websuli-lesson-data">${JSON.stringify(data)}</script></body></html>`;
const sources = [{ url: "https://www.oktatas.hu/", title: "Ellenőrzött forrás" }];
const id = "c34b1bd5-c8ac-48f6-b602-75f4f548b305";
const job = { id, state: "running", message: "Készíts tananyagot", title: "Angol gyakorlás", stage: "Források feldolgozása…", content: "Források megvannak. Készül a tananyag:", sources, createdAt: Date.now() };
const done = { ...job, state: "done", html, classroom: 7, materialId: "saved-web-lesson" };
async function open(page: Page) {
  await page.route("**/api/csrf-token", r => r.fulfill({ json: { csrfToken: "test" } }));
  await page.route("**/api/studio/maps", r => r.fulfill({ json: { maps: [] } }));
  await page.goto("/__studio-panel-probe");
  await page.getByTestId("studio-mode-web").click();
}
async function send(page: Page, message = "Keress és készíts angol gyakorló tananyagot") {
  const box = page.getByPlaceholder("Pl.: Keress tananyagot 5. osztályos törtekhez, és készítsd el");
  await box.fill(message); await box.press("Enter");
}
test("sikertelen készítés után tartós hiba látható minden képernyőn", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: { ...job, state: "error", error: "Nem készült tananyag: JSON-bank experience.tasks hibás." } }));
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-error")).toContainText("Nem készült tananyag");
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  await expect(page.getByTestId("web-research-sources")).toContainText("Ellenőrzött forrás");
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.getByTestId("web-research-error").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("web-research-error")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.getByTestId("web-research-error").evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await page.screenshot({ path: `tests/screenshots/web-research-error-${viewport.width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
test("a szerver ment, a kliens a tartalom évfolyamát és a mentett új anyagot mutatja", async ({ page }) => {
  let reads = 0; let clientWrites = 0;
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: ++reads === 1 ? done : { ...job, state: "error", error: "Második készítés hibás" } }));
  await page.route("**/api/html-files", r => { clientWrites++; return r.fulfill({ status: 500 }); });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-open-saved")).toHaveAttribute("href", "/preview/saved-web-lesson");
  await expect(page.getByTestId("web-research-classroom")).toContainText("7.");
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  await send(page, "Másik témából új tananyagot kérek");
  await expect(page.getByTestId("web-research-error")).toBeVisible();
  await expect(page.getByTestId("web-research-open-saved")).toHaveCount(0);
  await expect(page.getByTestId("web-research-preview")).toHaveCount(0);
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  expect(clientWrites).toBe(0);
});
test("mentési hiba után a szerveren megmaradt jelölt menthető új AI nélkül", async ({ page }) => {
  let generations = 0; let publications = 0;
  await page.route("**/api/studio/web-research/jobs", r => { generations++; return r.fulfill({ status: 202, json: job }); });
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: { ...done, state: "ready", materialId: undefined, error: "Mentés átmenetileg nem elérhető" } }));
  await page.route("**/api/studio/web-research/jobs/*/publish", r => { publications++; return r.fulfill({ json: done }); });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-error")).toContainText("Mentés átmenetileg");
  await expect(page.getByTestId("web-research-preview")).toBeVisible();
  await page.getByTestId("web-research-save").click();
  await expect(page.getByTestId("web-research-open-saved")).toHaveAttribute("href", "/preview/saved-web-lesson");
  await expect(page.getByTestId("web-research-error")).toHaveCount(0);
  expect(generations).toBe(0); expect(publications).toBe(1);
});
test("újratöltés után ugyanazt a futást követi, átmeneti hálózati hiba nem indít újat", async ({ page }) => {
  let startedId = ""; let generations = 0; let ready = false; let failRead = false;
  await page.route("**/api/studio/web-research/jobs", r => { generations++; startedId = r.request().postDataJSON().id; return r.fulfill({ status: 202, json: { ...job, id: startedId } }); });
  const ids: string[] = [];
  await page.route("**/api/studio/web-research/jobs/*", r => {
    ids.push(r.request().url().split("/").pop()!);
    if (!startedId) return r.fulfill({ status: 404, json: {} });
    if (failRead) { failRead = false; return r.abort(); }
    return r.fulfill({ json: { ...(ready ? done : job), id: startedId } });
  });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-status")).toContainText("Források feldolgozása");
  await page.reload(); await page.getByTestId("studio-mode-web").click();
  await expect(page.getByTestId("web-research-status")).toContainText("Források feldolgozása");
  failRead = true;
  await expect(page.getByTestId("web-research-status")).toContainText("újracsatlakozás", { timeout: 8000 });
  ready = true;
  await expect(page.getByTestId("web-research-open-saved")).toBeVisible({ timeout: 8000 });
  expect(generations).toBe(1); expect(new Set(ids)).toEqual(new Set([startedId]));
});
test("a futás közben a mentési cím nem változhat, az indítás bemenete rögzített", async ({ page }) => {
  let request: Record<string, unknown> | undefined; let ready = false;
  await page.route("**/api/studio/web-research/jobs", r => { request = r.request().postDataJSON(); return r.fulfill({ status: 202, json: job }); });
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill(request ? { json: ready ? done : job } : { status: 404, json: {} }));
  await open(page); await page.getByTestId("web-research-title").fill("A választott cím"); await send(page);
  await expect(page.getByTestId("web-research-title")).toBeDisabled();
  await expect(page.getByTestId("web-research-classroom")).toBeDisabled();
  await expect(page.getByTestId("web-research-status")).toContainText("Források feldolgozása");
  expect(request!.title).toBe("A választott cím");
  ready = true;
  await expect(page.getByTestId("web-research-open-saved")).toBeVisible();
  await expect(page.getByTestId("web-research-title")).toBeEnabled();
});
test("spec 2026-09-25: a folytatás a háttérben fut, a panel újra követi és a kész anyagot mutatja", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  let resumed = false; let readsAfterResume = 0; let publications = 0;
  await page.route("**/api/studio/web-research/jobs", r => r.fulfill({ status: 202, json: job }));
  await page.route("**/api/studio/web-research/jobs/*", r => {
    if (!resumed) return r.fulfill({ json: { ...job, state: "error", error: "A szerverfutás megszakadt vagy túllépte az időkeretet. A mentett részeredményekből folytatható.", canResume: true } });
    readsAfterResume++;
    return r.fulfill({ json: readsAfterResume < 2 ? { ...job, stage: "Gyakorlóbank készítése: 3. csomag kész…" } : done });
  });
  await page.route("**/api/studio/web-research/jobs/*/publish", r => { publications++; resumed = true; return r.fulfill({ json: { ...job, stage: "Folytatás a mentett részeredményekből…" } }); });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-save")).toHaveText(/Folytatás a mentett eredményből/);
  await page.getByTestId("web-research-save").click();
  await expect(page.getByTestId("web-research-error")).toHaveCount(0);
  await expect(page.getByTestId("web-research-open-saved")).toHaveAttribute("href", "/preview/saved-web-lesson");
  expect(publications).toBe(1); expect(readsAfterResume).toBeGreaterThanOrEqual(2);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `tests/screenshots/web-research-resume-${viewport.width}.png`, fullPage: true });
  }
  // Mérve 2026-09-25 a módosítatlan kódon is: a kész előnézet sandbox-iframe-je (allow-same-origin nélkül) ezt az
  // egy serviceWorker-hibát adja a tesztböngészőben; minden más oldalhiba bukás.
  expect(errors.filter(e => !/Service worker is disabled because the context is sandboxed/.test(e))).toEqual([]);
});
test("spec 2026-09-25: a Studio-gyártással kész internetes lecke megnyitható, iframe-előnézet és hibajelzés nélkül", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  let reads = 0;
  const studioDone = { ...job, state: "done", output: "studio", materialId: "studio-lesson-html", classroom: 5, title: "Eger ostroma 1552", stage: "A tananyag elkészült és közzétéve (Studio-lecke)." };
  await page.route("**/api/studio/web-research/jobs", r => r.fulfill({ status: 202, json: job }));
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: ++reads < 2 ? { ...job, stage: "Studio-gyártás: tanulási terv" } : studioDone }));
  await open(page); await send(page, "Készíts tananyagot Eger 1552-es ostromáról");
  await expect(page.getByTestId("web-research-open-saved")).toHaveAttribute("href", "/preview/studio-lesson-html");
  await expect(page.getByTestId("web-research-error")).toHaveCount(0);
  await expect(page.getByTestId("web-research-preview")).toHaveCount(0);
  await expect(page.getByTestId("web-research-save")).toBeDisabled();
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `tests/screenshots/web-research-studio-${viewport.width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
// Spec 2026-10-19-webes-keszites-uj-inditas: a korábbi futás nem foglalhatja a panelt.
test("beragadt futás: az „Új készítés” elengedi (megerősítéssel), és új kérés új azonosítóval indul", async ({ page }) => {
  const starts: string[] = [];
  await page.route("**/api/studio/web-research/jobs", r => { starts.push(r.request().postDataJSON().id); return r.fulfill({ status: 202, json: { ...job, id: starts.at(-1) } }); });
  // Mint a szerver: ismeretlen azonosítóra 404 (a kliens erre indít POST-ot), az indítottra a beragadt „running”.
  await page.route("**/api/studio/web-research/jobs/*", r => {
    const id = r.request().url().split("/").pop()!;
    return r.fulfill(starts.includes(id) ? { json: { ...job, id } } : { status: 404, json: {} });
  });
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-status")).toContainText("Források feldolgozása");
  const box = page.getByPlaceholder("Pl.: Keress tananyagot 5. osztályos törtekhez, és készítsd el");
  await expect(box).toBeDisabled();
  page.once("dialog", d => void d.accept());
  await page.getByTestId("web-research-new").click();
  await expect(box).toBeEnabled();
  await expect(page.getByTestId("web-research-status")).toHaveCount(0);
  await send(page, "Új téma: a vulkánok");
  await expect.poll(() => starts.length).toBe(2);
  expect(starts[1]).not.toBe(starts[0]);
});
test("kész futás után újratöltéskor üres a panel (a böngésző elfelejti a futást)", async ({ page }) => {
  await page.route("**/api/studio/web-research/jobs", r => r.fulfill({ status: 202, json: job }));
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: done }));
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-open-saved")).toBeVisible();
  await page.reload(); await page.getByTestId("studio-mode-web").click();
  await expect(page.getByTestId("web-research-panel-ready").or(page.getByTestId("web-research-agent-panel"))).toBeVisible();
  await expect(page.getByTestId("web-research-open-saved")).toHaveCount(0);
  await expect(page.getByTestId("web-research-new")).toHaveCount(0);
  await expect(page.getByPlaceholder("Pl.: Keress tananyagot 5. osztályos törtekhez, és készítsd el")).toBeEnabled();
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});
test("review #317: a kézi mentés befejezése után is elfelejti a futást (újratöltéskor üres panel)", async ({ page }) => {
  await page.route("**/api/studio/web-research/jobs", r => r.fulfill({ status: 202, json: job }));
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: { ...done, state: "ready", materialId: undefined, error: "Mentés átmenetileg nem elérhető" } }));
  await page.route("**/api/studio/web-research/jobs/*/publish", r => r.fulfill({ json: done }));
  await open(page); await send(page);
  await page.getByTestId("web-research-save").click();
  await expect(page.getByTestId("web-research-open-saved")).toBeVisible();
  await page.reload(); await page.getByTestId("studio-mode-web").click();
  await expect(page.getByTestId("web-research-open-saved")).toHaveCount(0);
  await expect(page.getByTestId("web-research-new")).toHaveCount(0);
});
test("review #317: két lap — az egyik lap kész futása nem törli a másik lap tárolt (futó) követését", async ({ page, context }) => {
  await page.route("**/api/studio/web-research/jobs", r => r.fulfill({ status: 202, json: job }));
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: done }));
  await open(page); await send(page);
  await expect(page.getByTestId("web-research-open-saved")).toBeVisible();
  // A második lap közben egy másik futást tárol (ugyanaz a localStorage) — az első lap ezt nem törölheti.
  const other = await context.newPage();
  await other.goto("/__studio-panel-probe");
  await other.evaluate(() => localStorage.setItem("websuli:web-research:pending", JSON.stringify({ id: "00000000-0000-4000-8000-000000000002", message: "másik", classroom: 5 })));
  page.once("dialog", d => void d.accept());
  await page.getByTestId("web-research-new").click();
  const stored = await other.evaluate(() => JSON.parse(localStorage.getItem("websuli:web-research:pending") || "null"));
  expect(stored?.id).toBe("00000000-0000-4000-8000-000000000002");
});
// Spec 2026-11-03-webes-keszites-mobil: a telefonos képernyőképen a csevegés buborékjai a gombokra és a beviteli
// mezőre lógtak, a nyers markdown (**…**) olvashatatlan volt. A panel minden eleme a saját helyén, takarás nélkül.
test("mobil: a hosszú csevegés nem lóg ki a dobozából, a gombok és a mező kattinthatók, a markdown formázott", async ({ page }) => {
  const userMessage = "Nat 2020 alapján a földrajzi felszíni formák, a síkság, a dombság, a hegység és a magashegység témakörében, és készítsd el a tananyagot egy negyedik osztályos gyermek számára. Ne hivatkozásokat vagy linkeket tegyél bele, hanem magát a repo szabályai szerinti tananyagot készítsd el.";
  const agentText = "A tananyagírás előtt a források teljes szövegének letöltése folyamatban van...\n\n**Új teljes letöltés:**\n- **Szabó János: Környezetismeret óravázlat 4. osztály (PDF).** A 14. óra „A felszíni formák és ábrázolásuk a térképen”.\n- **Második forrás:** a síkság 0–200 m, a dombság 200–500 m, a hegység 500 m felett.\n\n" + "A források összevetése és a tananyag szerkezetének kialakítása következik. ".repeat(12);
  let reads = 0;
  await page.route("**/api/studio/web-research/jobs", r => r.fulfill({ status: 202, json: { ...job, message: userMessage } }));
  await page.route("**/api/studio/web-research/jobs/*", r => r.fulfill({ json: ++reads < 3 ? { ...job, message: userMessage, content: agentText } : { ...done, message: userMessage } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page); await send(page, userMessage);
  const check = async (label: string) => {
    for (const id of ["chat-input", "chat-send-button", "web-research-save", "web-research-new"]) {
      const target = page.getByTestId(id);
      await expect(target, `${label}: ${id} hiányzik`).toHaveCount(1);
      await target.scrollIntoViewIfNeeded();
      const covered = await target.evaluate(el => {
        // A letiltott gomb (pointer-events: none) a találatvizsgálatból kiesne: a mérés idejére visszakapcsoljuk.
        const html = el as HTMLElement; const previous = html.style.pointerEvents; html.style.pointerEvents = "auto";
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        html.style.pointerEvents = previous;
        return hit && (el === hit || el.contains(hit)) ? "" : (hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName ?? "semmi");
      });
      expect(covered, `${label}: ${id} takarva`).toBe("");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    // Review #390: fekvő telefonon (844×390) a görgethető üzenetterület 0 px-re zsugorodott.
    const messagesHeight = await page.getByTestId("chat-messages-scroll").evaluate(el => el.getBoundingClientRect().height);
    expect(messagesHeight, `${label}: üzenetterület magassága`).toBeGreaterThanOrEqual(160);
  };
  await expect(page.getByTestId("web-research-status")).toBeVisible();
  await expect(page.locator('[data-testid^="chat-message-assistant"]')).toContainText("Új teljes letöltés:");
  await check("futás közben");
  await page.setViewportSize({ width: 844, height: 390 });
  await check("futás közben, fekvő");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-testid^="chat-message-assistant"] strong').first()).toHaveText("Új teljes letöltés:");
  await expect(page.locator('[data-testid^="chat-message-assistant"]')).not.toContainText("**");
  await page.screenshot({ path: "tests/screenshots/web-research-mobile-running-390.png", fullPage: true });
  await expect(page.getByTestId("web-research-open-saved")).toBeVisible({ timeout: 8000 });
  await check("kész állapot");
  await page.setViewportSize({ width: 844, height: 390 });
  await check("kész állapot, fekvő");
  // Review #390 (Copilot): fekvő nézetben hosszú kérés gépelésekor a növekvő mező sem nyomhatja nullára az
  // üzenetterületet, és a mező alja sem vágódhat le a kártyán.
  await page.getByTestId("chat-input").fill(userMessage + " " + userMessage);
  await page.getByTestId("chat-input").dispatchEvent("input");
  expect(await page.getByTestId("chat-input").evaluate(el => el.getBoundingClientRect().height), "a mező megnőtt").toBeGreaterThan(150);
  await check("hosszú gépelt kérés, fekvő");
  const clipped = await page.getByTestId("chat-input").evaluate(el => {
    const card = el.closest('[data-testid="chat-interface"]')!.getBoundingClientRect();
    return el.getBoundingClientRect().bottom - card.bottom;
  });
  expect(clipped, "a mező alja a kártyán belül").toBeLessThanOrEqual(0);
  await page.getByTestId("chat-input").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "tests/screenshots/web-research-mobile-done-390.png", fullPage: true });
});

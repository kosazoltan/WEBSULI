import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Spec docs/specs/2026-11-10-fejezet-kisfilmek-v2.md: a korosztályos kisfilm-lejátszó valódi böngészőben, a próbaoldalon.
// CLIP_SHOTS=<mappa>: jelenetenkénti képernyőképek a szemrevételezéshez.
// A szolgáltatásmunkás a page.route csonkjait megkerülné (az /api/* kéréseket maga kéri le) — az alap e2e-futásban is tiltjuk,
// nem csak a saját konfigurációban (CI: 10 teszt bukott emiatt, a csonkolt hang és kisfilm-válasz helyett a valódi szerver felelt).
test.use({ serviceWorkers: "block" });

const SHOTS = process.env.CLIP_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** 0,1 mp csendes WAV a hangvégpont helyén (a Vite-próbaszerveren nincs /api/tts). */
const silentWav = () => {
  const samples = 800, b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples * 2, 40);
  return b;
};
const player = (page: Page) => page.getByTestId("clip-player");

test("kisfilm nélkül nincs gomb és nincs jelzés", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?fusion=1");
  await expect(page.getByTestId("lesson-runtime")).toBeVisible();
  await expect(page.locator(".clip-btn")).toHaveCount(0);
  await expect(page.getByTestId("clip-all")).toHaveCount(0);
});

// ── v2 (docs/specs/2026-11-10-fejezet-kisfilmek-v2.md): korosztályos kisfilm — rajzolt kép, pontos ábra, sávonkénti megjelenés ──
const MEDIA = (n: number) => String(n).repeat(32);
/** 1×1-es PNG a rajzolt kép helyén. */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const v2Clip = (band: "adventure" | "laboratory") => ({ v: 2, band, title: band === "adventure" ? "Kaland-próba" : "Labor-próba",
  shots: [{ image: MEDIA(1), alt: "Első rajzolt kép" }, { image: MEDIA(2), alt: "Második rajzolt kép" }],
  scenes: [
    { say: "Az első jelenet a címet mutatja a rajzolt képen.", shot: 0, camera: "in", audio: MEDIA(7), ms: 900, overlay: { kind: "title", text: "A próba címe" } },
    { say: "A második jelenetben a képlet darabjai sorban érkeznek.", shot: 0, camera: "left", audio: MEDIA(7), ms: 900, overlay: { kind: "formula", parts: [{ t: "s = 400 m", note: "megtett út" }, { t: "Δs = 0 m", note: "elmozdulás" }], caption: "Egy teljes kör után." } },
    { say: "A harmadik jelenet grafikont rajzol a pontokból.", shot: 1, camera: "right", audio: MEDIA(7), ms: 900, overlay: { kind: "graph", xLabel: "t (s)", yLabel: "s (m)", points: [[0, 0], [60, 300], [120, 600]] } },
    { say: "A negyedik jelenet erőnyilakat mutat egy testen.", shot: 1, camera: "out", audio: MEDIA(7), ms: 900, overlay: { kind: "vectors", body: "kiskocsi", arrows: [{ dir: "right", label: "10 N", size: 3 }, { dir: "left", label: "2 N", size: 1 }, { dir: "down", label: "G", size: 2 }] } },
    { say: "Az ötödik jelenet két dolgot állít szembe.", shot: 1, camera: "still", audio: MEDIA(7), ms: 900, overlay: { kind: "compare", left: { label: "Út: a görbe hossza" }, right: { label: "Elmozdulás: egy nyíl" }, verdict: "Nem ugyanaz" } },
  ] });
const serveV2 = async (page: Page, band: "adventure" | "laboratory", audio: "ok" | "broken" = "ok") => {
  await page.route("**/tmp/lesson-clips2.json", (route) => route.fulfill({ json: { clips: [{ sectionIndex: 0, clip: v2Clip(band) }], pending: false } }));
  await page.route("**/api/lesson-clips/media/**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    if (id === MEDIA(7)) return audio === "ok" ? route.fulfill({ contentType: "audio/wav", body: silentWav() }) : route.abort();
    return route.fulfill({ contentType: "image/png", body: PIXEL });
  });
};

test("a kisfilm a korosztály megjelenésével játszik, a jelenet a hang végén vált, a felirat kikapcsolható", async ({ page }) => {
  await serveV2(page, "laboratory");
  await page.goto("/__lesson-runtime-probe?fusion=1&clips2=1");
  await page.getByTestId("clip-play-0").click();
  await expect(player(page)).toHaveAttribute("data-clip-band", "laboratory");
  await expect(player(page).locator(".clip2-shot[data-active='true']")).toHaveAttribute("alt", "Első rajzolt kép");
  await expect(page.getByTestId("clip-caption")).toBeVisible();
  await page.getByTestId("clip-cc").click();
  await expect(page.getByTestId("clip-caption")).toHaveCount(0);
  await expect(page.getByTestId("clip-cc")).toHaveAttribute("aria-pressed", "false");
  await expect(player(page)).toHaveAttribute("data-state", "finished", { timeout: 20000 });
  await expect(player(page)).toHaveAttribute("data-scene", "4");
  await expect(player(page)).toHaveAttribute("data-audio", "mp3");
  // A kabala a v2 lejátszóban nincs: a figura a rajzon él.
  await expect(page.locator(".clip-narrator")).toHaveCount(0);
});

test("a mozgóképes jelenet némított videót játszik a kép fölött; hibás videónál a kép marad", async ({ page }) => {
  const withFilm = v2Clip("adventure");
  (withFilm.scenes[0] as Record<string, unknown>).video = MEDIA(8);
  await page.route("**/tmp/lesson-clips2.json", (route) => route.fulfill({ json: { clips: [{ sectionIndex: 0, clip: withFilm }], pending: false } }));
  await page.route("**/api/lesson-clips/media/**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    if (id === MEDIA(7)) return route.fulfill({ contentType: "audio/wav", body: silentWav() });
    if (id === MEDIA(8)) return route.abort();
    return route.fulfill({ contentType: "image/png", body: PIXEL });
  });
  await page.goto("/__lesson-runtime-probe?fusion=1&clips2=1");
  await page.getByTestId("clip-play-0").click();
  // A videó nem tölthető be: a jelenet a rajzolt képpel megy tovább, a kisfilm nem akad el.
  await expect(page.getByTestId("clip-film")).toHaveCount(0);
  await expect(player(page).locator(".clip2-shot[data-active='true']")).toBeVisible();
  await expect(player(page)).toHaveAttribute("data-state", "finished", { timeout: 20000 });
});

test("a két korosztály megjelenése eltér (keret, vonalvastagság, feliratméret)", async ({ page }) => {
  const look = async (band: "adventure" | "laboratory") => {
    await serveV2(page, band);
    await page.goto("/__lesson-runtime-probe?fusion=1&clips2=1");
    await page.getByTestId("clip-play-0").click();
    await page.getByTestId("clip-toggle").click();
    await page.getByTestId("clip-next").click();
    const out = await page.evaluate(() => {
      const panel = getComputedStyle(document.querySelector(".clip2-panel")!);
      return { radius: panel.borderTopLeftRadius, stroke: panel.borderTopWidth, ink: panel.color, caption: getComputedStyle(document.querySelector(".clip2-caption")!).fontSize };
    });
    await page.unrouteAll();
    return out;
  };
  const young = await look("adventure"), old = await look("laboratory");
  expect(young).toEqual({ radius: "20px", stroke: "4px", ink: "rgb(112, 60, 27)", caption: "19px" });
  expect(old).toEqual({ radius: "8px", stroke: "2px", ink: "rgb(20, 59, 98)", caption: "16px" });
});

test("hang nélkül néma időzítővel megy végig", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); });
  await serveV2(page, "adventure", "broken");
  await page.goto("/__lesson-runtime-probe?fusion=1&clips2=1");
  await page.getByTestId("clip-play-0").click();
  await expect(player(page)).toHaveAttribute("data-audio", "silent");
  await expect(player(page)).toHaveAttribute("data-scene", "1", { timeout: 8000 });
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) for (const band of ["adventure", "laboratory"] as const) {
  test(`az ábrapanel a színpadon belül marad, semmi sem vágódik le (${band}, ${viewport.width} px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await serveV2(page, band);
    await page.goto("/__lesson-runtime-probe?fusion=1&clips2=1");
    await page.getByTestId("clip-play-0").click();
    await page.getByTestId("clip-toggle").click();
    await expect(player(page)).toHaveAttribute("data-state", "paused");
    await page.getByTestId("clip-prev").click();
    for (let scene = 0; scene < 5; scene++) {
      await expect(player(page)).toHaveAttribute("data-scene", String(scene));
      const report = await page.evaluate(() => {
        // Szünetben az ábra belépő mozgásai állnak: a végállapotukra ugratjuk őket, és azt mérjük.
        for (const a of document.querySelector(".clip2-stage")!.getAnimations({ subtree: true })) if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish();
        const stage = document.querySelector<HTMLElement>(".clip2-stage")!.getBoundingClientRect();
        const panel = document.querySelector<HTMLElement>(".clip2-panel")!;
        const p = panel.getBoundingClientRect();
        const dialog = document.querySelector<HTMLElement>(".clip-player")!.getBoundingClientRect();
        const caption = document.querySelector<HTMLElement>(".clip-caption")!;
        return {
          panelInside: p.left >= stage.left - 1 && p.right <= stage.right + 1 && p.top >= stage.top - 1 && p.bottom <= stage.bottom + 1,
          panelOverflowX: panel.scrollWidth - panel.clientWidth, panelOverflowY: panel.scrollHeight - panel.clientHeight,
          pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
          dialogInside: dialog.left >= -1 && dialog.right <= window.innerWidth + 1 && dialog.bottom <= window.innerHeight + 1,
          captionOverflow: caption.scrollHeight - caption.clientHeight,
        };
      });
      expect(report, `jelenet ${scene}`).toEqual({ panelInside: true, panelOverflowX: 0, panelOverflowY: 0, pageOverflowX: 0, dialogInside: true, captionOverflow: 0 });
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `v2-${band}-${viewport.width}-${scene}.png`) });
      if (scene < 4) await page.getByTestId("clip-next").click();
    }
  });
}

test("a fejezetcím melletti gomb elérhető néven indítja a kisfilmet; Esc bezárja; az „újra” elölről indít", async ({ page }) => {
  await serveV2(page, "adventure");
  await page.goto("/__lesson-runtime-probe?fusion=1&clips2=1");
  const button = page.getByTestId("clip-play-0");
  await expect(button).toHaveAccessibleName("A(z) 1. fejezet kisfilmjének lejátszása");
  await button.click();
  await expect(player(page)).toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("clip-caption")).toHaveText("Az első jelenet a címet mutatja a rajzolt képen.");
  await expect(player(page)).toHaveAttribute("data-state", "finished", { timeout: 20000 });
  await expect(page.getByTestId("clip-caption")).toHaveText("Az ötödik jelenet két dolgot állít szembe.");
  await page.getByTestId("clip-toggle").click();
  await expect(player(page)).toHaveAttribute("data-state", "playing");
  await page.keyboard.press("Escape");
  await expect(player(page)).toHaveCount(0);
});

test("a „Kisfilmek lejátszása” a kész kisfilmeket fejezetsorrendben játssza le", async ({ page }) => {
  const two = { clips: [{ sectionIndex: 1, clip: { ...v2Clip("adventure"), title: "Második kisfilm" } }, { sectionIndex: 0, clip: v2Clip("adventure") }], pending: false };
  await serveV2(page, "adventure");
  await page.route("**/tmp/lesson-clips2.json", (route) => route.fulfill({ json: two }));
  await page.goto("/__lesson-runtime-probe?fusion=1&clips2=1");
  await expect(page.getByTestId("clip-play-all")).toHaveText("Kisfilmek lejátszása (2)");
  await page.getByTestId("clip-play-all").click();
  await expect(player(page)).toHaveAttribute("data-chapter", "0");
  await expect(player(page).getByRole("heading")).toContainText("1. kisfilm a 2-ből");
  await expect(player(page)).toHaveAttribute("data-chapter", "1", { timeout: 20000 });
  await expect(player(page).getByRole("heading")).toContainText("Második kisfilm");
  await expect(player(page)).toHaveAttribute("data-state", "finished", { timeout: 20000 });
  await page.getByTestId("clip-close").click();
  await expect(player(page)).toHaveCount(0);
});

test("amíg készülnek a kisfilmek, a lecke újra kérdez, és az új gomb újratöltés nélkül megjelenik", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await serveV2(page, "adventure");
  await page.route("**/api/lessons/practice-probe/clips", (route) => { calls++; return route.fulfill({ json: calls === 1 ? { clips: [], pending: true } : { clips: [{ sectionIndex: 0, clip: v2Clip("adventure") }], pending: false } }); });
  await page.goto("/__lesson-runtime-probe?fusion=1&practice=1");
  await expect(page.getByTestId("clip-pending")).toHaveText("Készülnek a kisfilmek…");
  await expect(page.getByTestId("clip-play-0")).toHaveCount(0);
  await page.clock.fastForward(21000);
  await expect(page.getByTestId("clip-play-0")).toBeVisible();
  await expect(page.getByTestId("clip-pending")).toHaveCount(0);
  await page.clock.fastForward(60000);
  expect(calls).toBe(2);
});

test("álló mobilon a „Készülnek a kisfilmek…” jelzés nem nyomja össze és nem fedi a fejezetválasztót (2. vak kör L5)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serveV2(page, "adventure");
  await page.route("**/api/lessons/practice-probe/clips", (route) => route.fulfill({ json: { clips: [], pending: true } }));
  await page.goto("/__lesson-runtime-probe?fusion=1&practice=1");
  await expect(page.getByTestId("clip-pending")).toBeVisible();
  const select = page.getByRole("combobox", { name: "Fejezet" }).first();
  const boxes = await page.locator(".learning-book-head").first().evaluate((head) => {
    const sel = head.querySelector("select")!.getBoundingClientRect();
    const others = [...head.children].filter((c) => !c.contains(head.querySelector("select"))).flatMap((c) => [...c.querySelectorAll("button, [role=status]")]).map((el) => el.getBoundingClientRect());
    const overlap = others.reduce((max, r) => Math.max(max, Math.max(0, Math.min(r.right, sel.right) - Math.max(r.left, sel.left)) * Math.max(0, Math.min(r.bottom, sel.bottom) - Math.max(r.top, sel.top))), 0);
    return { width: sel.width, overlap, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  await expect(select).toBeVisible();
  if (SHOTS) { await select.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOTS, "mobil-keszulo-kisfilmek.png") }); }
  expect(boxes.width, "a fejezetválasztó használható szélességű").toBeGreaterThanOrEqual(150);
  expect(boxes.overlap, "semmi nem fedi a fejezetválasztót").toBe(0);
  expect(boxes.scroll, "nincs vízszintes görgetés").toBeLessThanOrEqual(0);
});

test("ha a lekérdezés elakad, a várakozás lejártakor a „Készülnek a kisfilmek…” jelzés eltűnik (2. vak kör L4)", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await serveV2(page, "adventure");
  // Az első válasz `pending: true`, a második soha nem érkezik meg.
  await page.route("**/api/lessons/practice-probe/clips", (route) => { calls++; return calls === 1 ? route.fulfill({ json: { clips: [], pending: true } }) : new Promise(() => undefined); });
  await page.goto("/__lesson-runtime-probe?fusion=1&practice=1");
  await expect(page.getByTestId("clip-pending")).toBeVisible();
  await page.clock.fastForward(21_000);
  await expect.poll(() => calls).toBe(2);
  await page.clock.fastForward(31 * 60_000);
  await expect(page.getByTestId("clip-pending")).toHaveCount(0);
});

test("egy átmeneti 502 nem állítja le a várakozást: a később elkészült kisfilm újratöltés nélkül megjelenik (4. vak kör L3)", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await serveV2(page, "adventure");
  await page.route("**/api/lessons/practice-probe/clips", (route) => {
    calls++;
    if (calls === 1) return route.fulfill({ json: { clips: [], pending: true } });
    if (calls === 2) return route.fulfill({ status: 502, json: { message: "átmeneti hiba" } });
    return route.fulfill({ json: { clips: [{ sectionIndex: 0, clip: v2Clip("adventure") }], pending: false } });
  });
  await page.goto("/__lesson-runtime-probe?fusion=1&practice=1");
  await expect(page.getByTestId("clip-pending")).toBeVisible();
  await page.clock.fastForward(21_000);
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByTestId("clip-pending"), "az átmeneti hiba alatt a jelzés marad").toBeVisible();
  await page.clock.fastForward(61_000);
  await expect.poll(() => calls).toBe(3);
  await expect(page.getByTestId("clip-play-0")).toBeVisible();
  await expect(page.getByTestId("clip-pending")).toHaveCount(0);
});

test("hibás vagy régi formátumú kisfilm-válasz mellett a lecke kisfilm nélkül, hibátlanul megjelenik", async ({ page }) => {
  let body: unknown = null;
  await page.route("**/api/lessons/practice-probe/clips", (route) => (body ? route.fulfill({ json: body }) : route.fulfill({ status: 500, json: { message: "hiba" } })));
  await page.goto("/__lesson-runtime-probe?fusion=1&practice=1");
  await expect(page.getByTestId("lesson-runtime")).toBeVisible();
  await expect(page.locator(".clip-btn")).toHaveCount(0);
  // A kivezetett v1 formátumú kisfilmet a lejátszó nem fogadja el.
  body = { clips: [{ sectionIndex: 0, clip: { v: 1, title: "Régi", scenes: [] } }], pending: false };
  await page.reload();
  await expect(page.getByTestId("lesson-runtime")).toBeVisible();
  await expect(page.locator(".clip-btn")).toHaveCount(0);
});

// S2b-2 review #535 (Codex): a kizárt (forrás-ábrára mutató) tárolt hivatkozás a tényleges lejátszóban — nincs üres panel, a lejátszó
// elrendezése ép; érvényes régi ábránál a panel és benne a rajz megmarad. Próbaleckék: forrás-ábrás (0. fejezet 1. blokk: tábla),
// fúziós (0. fejezet 2. blokk: régi `process` ábra).
for (const viewport of [{ width: 360, height: 640 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
  for (const sample of [{ name: "forrás-ábra: nincs panel", url: "/__lesson-runtime-probe?source-visuals=1&clips2=1", blockIndex: 1, panels: 0 }, { name: "régi ábra: a panel megmarad", url: "/__lesson-runtime-probe?fusion=1&clips2=1", blockIndex: 2, panels: 1 }]) {
    test(`leckeábra a kisfilmben — ${sample.name} (${viewport.width} px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // A séma legalább öt jelenetet vár: a szokásos próbakisfilm második jelenete mutat a lecke ábrájára.
      const base = v2Clip("adventure");
      const clip = { ...base, scenes: base.scenes.map((scene, i) => (i === 1 ? { ...scene, say: "A második jelenet a lecke ábrájára mutat.", overlay: { kind: "lessonVisual", blockIndex: sample.blockIndex } } : scene)) };
      await page.route("**/tmp/lesson-clips2.json", (route) => route.fulfill({ json: { clips: [{ sectionIndex: 0, clip }], pending: false } }));
      await page.route("**/api/lesson-clips/media/**", (route) => new URL(route.request().url()).pathname.endsWith(MEDIA(7)) ? route.fulfill({ contentType: "audio/wav", body: silentWav() }) : route.fulfill({ contentType: "image/png", body: PIXEL }));
      await page.route("**/api/design-assets/**", (route) => route.fulfill({ status: 404, json: { message: "teszt" } }));
      await page.goto(sample.url);
      await page.getByTestId("clip-play-0").click();
      await page.getByTestId("clip-toggle").click();
      await expect(player(page)).toHaveAttribute("data-state", "paused");
      await page.getByTestId("clip-prev").click();
      await expect(player(page)).toHaveAttribute("data-scene", "0");
      await expect(player(page).locator(".clip2-panel")).toHaveCount(1); // a címpanel a nyitójelenetben mindkét esetben megvan
      await page.getByTestId("clip-next").click();
      await expect(player(page)).toHaveAttribute("data-scene", "1");
      await expect(player(page).locator(".clip2-panel")).toHaveCount(sample.panels);
      if (sample.panels) await expect(player(page).locator(".clip2-panel .clip2-visual > *").first()).toBeVisible();
      await expect(page.getByTestId("clip-caption")).toBeVisible();
      const layout = await page.evaluate(() => {
        const dialog = document.querySelector<HTMLElement>(".clip-player")!.getBoundingClientRect();
        const caption = document.querySelector<HTMLElement>(".clip-caption")!;
        return { pageOverflowX: document.documentElement.scrollWidth - window.innerWidth, dialogInside: dialog.left >= -1 && dialog.right <= window.innerWidth + 1 && dialog.bottom <= window.innerHeight + 1, captionOverflow: caption.scrollHeight - caption.clientHeight };
      });
      expect(layout).toEqual({ pageOverflowX: 0, dialogInside: true, captionOverflow: 0 });
    });
  }
}

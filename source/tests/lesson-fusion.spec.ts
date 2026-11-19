import { test, expect } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { balancedLayouts, choiceSeed } from "../shared/option-order";
import { ttsAudioHash, ttsAudioPath } from "../shared/tts-audio-key";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8b-2: az előre gyártott hang csak akkor szól, ha a hangtár elérhetőségi jegyzéke szerint megvan.
// A próbaszerveren nincs hangtár (a jegyzék-kérés nem ad érvényes választ), ezért a korábbi felolvasás-tesztek változatlanul a lánc
// böngészőhang- és tartalék-lépését mérik; a jegyzéket és a hangfájlt a „prepared audio” tesztek hálózati elfogással adják.

// Keep the candidate JSON interception identical in the focused and general CI runs.
test.use({ serviceWorkers: "block" });

for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1440, 900], [2560, 1440]]) {
  test(`four pages, written tasks and frozen quiz scoring at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/__lesson-runtime-probe?fusion=1");
    await expect(page.getByRole("tab", { name: "Tananyag", exact: true })).toBeVisible();
    for (const name of ["Tananyag", "Módszerek", "Feladatok", "Kvíz"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect.poll(async () => (await page.locator(".fusion-tabs").boundingBox())!.y).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const targets = await page.locator(".fusion-tabs button").evaluateAll(els => els.map(e => { const b = e.getBoundingClientRect(); return { width: b.width, height: b.height }; }));
      expect(targets.every(b => b.width >= 44 && b.height >= 44)).toBe(true);
    }
    const quiz = page.locator('[data-quiz-id]');
    await expect(quiz).toHaveCount(25);
    await expect(page.locator('[data-quiz-id]:visible')).toHaveCount(25);
    await expect(page.getByRole("tabpanel", { name: "Kvíz", exact: true }).locator(".learning-pager, .learning-mode")).toHaveCount(0);
    // Spec 2026-11-02-valasz-keveres (dokumentált spec-változás): a válaszok kevert sorrendben jelennek meg, ezért a helyes válasz
    // megjelenített helyét a kör kiegyensúlyozott elrendezéséből számoljuk; a szándék változatlan: 1 rossz + 24 jó válasz.
    const bank = fusionFixture().experience!.quiz;
    const round = (await quiz.evaluateAll(els => els.map(el => el.getAttribute("data-quiz-id")!))).map(id => bank.find(q => q.id === id)!);
    const layouts = balancedLayouts(round);
    const correctAt = (n: number) => layouts.get(choiceSeed(round[n].question, round[n].options))!.indexOf(round[n].correctIndex);
    await quiz.first().getByRole("button").nth((correctAt(0) + 1) % round[0].options.length).click();
    await expect(quiz.first().getByRole("button").first()).toBeDisabled();
    for (let i = 1; i < 25; i++) await quiz.nth(i).getByRole("button").nth(correctAt(i)).click();
    await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText("24 / 25 pont");
    await page.reload();
    await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText("96%");
    await page.getByRole("button", { name: "Új kvíz", exact: true }).click();
    await page.getByRole("button", { name: "Mégse", exact: true }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText("24 / 25 pont");
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    await expect(page.locator('[data-task-id]')).toHaveCount(15);
    await expect(page.locator('[data-task-id]:visible textarea:visible')).toHaveCount(15);
    await expect(page.getByRole("tabpanel", { name: "Feladatok", exact: true }).locator(".learning-pager, .learning-mode")).toHaveCount(0);
    const first = page.locator('[data-task-id]').first();
    const id = await first.getAttribute("data-task-id");
    await first.locator("textarea").fill(String((Number(id!.slice(1)) + 1) * 2));
    await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
    await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
    await expect(page.getByRole("region", { name: "Feladatok eredmény" })).toContainText("1 / 15 pont");
    await page.getByRole("tab", { name: "Tananyag", exact: true }).click();
    await expect(page.getByRole("tablist")).toBeInViewport();
    await page.screenshot({ path: `test-results/fusion-viewport-${width}x${height}.png` });
    await page.screenshot({ path: `test-results/fusion-${width}x${height}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("cognitive gates unlock methods, sorting works with accessible controls, themes differ", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?fusion=1");
  const ocean = await page.locator('[data-experience]').evaluate(e => getComputedStyle(e).backgroundColor);
  await page.getByRole("tab", { name: "Módszerek", exact: true }).click();
  await expect(page.locator('[data-method="sorting"]')).toHaveCount(0);
  const methods = page.getByRole("tabpanel", { name: "Módszerek", exact: true });
  await methods.locator('[data-method="gate"]').first().getByRole("button").first().click();
  await expect(methods.locator('[data-method="sorting"]')).toBeVisible();
  const sort = methods.locator('[data-method="sorting"]');
  // Reacquire the moving control: a coordinate double-click hits a different row after the first move.
  await sort.getByRole("button", { name: "Azonosítom az alapot és a magasságot. feljebb", exact: true }).click();
  await sort.getByRole("button", { name: "Azonosítom az alapot és a magasságot. feljebb", exact: true }).click();
  await sort.getByRole("button", { name: "Összeszorzom az alapot és a magasságot. feljebb", exact: true }).click();
  await sort.getByRole("button", { name: "Sorrend ellenőrzése", exact: true }).click();
  await expect(sort.getByRole("status")).toContainText("Helyes sorrend");
  // Websuli Design (dokumentált spec-változás): a színvilágot az évfolyamsáv adja, nem az élménytéma — más évfolyam, más arculat.
  await page.goto("/__lesson-runtime-probe?fusion=1&classroom=11");
  expect(await page.locator('[data-experience]').evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe(ocean);
});

test("foreign-language glossary starts speech only on request, with the correct language and rate", async ({ page }) => {
  const lesson = fusionFixture(); lesson.subject = "angol";
  lesson.experience!.language = "en-GB";
  lesson.experience!.glossary = [{ word: "triangle", translation: "háromszög", partOfSpeech: "főnév", example: "This is a triangle.", exampleTranslation: "Ez egy háromszög." }];
  await page.addInitScript(() => {
    const calls: Array<{ text: string; lang: string; rate: number }> = [];
    Object.defineProperty(window, "speechSynthesis", { value: { cancel() {}, speak(u: SpeechSynthesisUtterance) { calls.push({ text: u.text, lang: u.lang, rate: u.rate }); } } });
    Object.defineProperty(window, "__speechCalls", { value: calls });
  });
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: lesson }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  // Spec 2026-10-21-nyelvlecke-kiejtes (dokumentált UI-változás): a szószedet a „Kiejtés” fülre költözött, a Tananyag tetején belépővel.
  await page.getByTestId("pronounce-entry").click();
  await expect(page.getByRole("heading", { name: "Szószedet · hallgasd és mondd utánam!" })).toBeVisible();
  const calls = () => page.evaluate(() => (window as unknown as { __speechCalls: unknown[] }).__speechCalls);
  expect(await calls()).toEqual([]);
  await page.getByRole("button", { name: "triangle meghallgatása", exact: true }).click();
  // SpeechSynthesisUtterance.rate is stored by Chrome as a 32-bit float.
  expect(await calls()).toEqual([{ text: "triangle", lang: "en-GB", rate: Math.fround(.85) }]);
  await page.locator('.fusion-glossary input[type="range"]').fill("0.65");
  await page.getByRole("button", { name: "This is a triangle. meghallgatása", exact: true }).click();
  expect((await calls())[1]).toEqual({ text: "This is a triangle.", lang: "en-GB", rate: Math.fround(.65) });
});

// Spec 2026-11-18-tananyag-gyartas-minoseg, S8a (E31): a böngésző a gépies brit hangot adja elsőnek — a felolvasás mégis a természetes
// brit hangot kapja; a később betöltődő hanglista (`voiceschanged`, Android) után a következő kimondás már rangsorolt hanggal szól.
test("glossary speech picks the ranked British voice, also after the voice list loads late", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string; lang: string; voice: string | null; pitch: number }> = [];
    const played: string[] = [];
    const voices = [
      { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US", localService: true },
      { name: "Microsoft Hazel Desktop - English (Great Britain)", lang: "en-GB", localService: true },
      { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false },
      { name: "Microsoft Sonia Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false },
    ];
    let loaded = false;
    // A valódi SpeechSynthesisUtterance csak a motor saját hangobjektumát fogadja el — a próbához egyszerű helyettes kell.
    class FakeUtterance { lang = ""; rate = 1; pitch = 1; voice: { name: string } | null = null; onstart: (() => void) | null = null; onend: (() => void) | null = null; constructor(public text: string) {} }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { value: {
      speaking: false, pending: false, cancel() {}, getVoices: () => loaded ? voices : [],
      speak(u: FakeUtterance) { calls.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null, pitch: u.pitch }); setTimeout(() => { u.onstart?.(); u.onend?.(); }, 10); },
    } });
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { played.push(this.src); return Promise.resolve(); };
    Object.defineProperty(window, "__speechCalls", { value: calls });
    Object.defineProperty(window, "__played", { value: played });
    Object.defineProperty(window, "__loadVoices", { value: () => { loaded = true; } });
  });
  const lesson = fusionFixture(); lesson.subject = "angol";
  lesson.experience!.language = "en-GB";
  lesson.experience!.glossary = [{ word: "triangle", translation: "háromszög", partOfSpeech: "főnév", example: "This is a triangle.", exampleTranslation: "Ez egy háromszög." }];
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: lesson }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await page.getByTestId("pronounce-entry").click();
  const calls = () => page.evaluate(() => (window as unknown as { __speechCalls: unknown[] }).__speechCalls);
  await page.getByRole("button", { name: "triangle meghallgatása", exact: true }).click();
  expect(await calls()).toEqual([{ text: "triangle", lang: "en-GB", voice: null, pitch: 1 }]);
  await page.evaluate(() => (window as unknown as { __loadVoices(): void }).__loadVoices());
  await page.getByRole("button", { name: "This is a triangle. meghallgatása", exact: true }).click();
  expect((await calls())[1]).toEqual({ text: "This is a triangle.", lang: "en-GB", voice: "Microsoft Sonia Online (Natural) - English (United Kingdom)", pitch: 1 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __played: string[] }).__played)).toEqual([]);
  await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
});

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8b-2 + S8d (E33, E50–E55): a felolvasás lánca és a hang-előtöltés valódi böngészőben.
// A hangtár jegyzékét és a hangfájlokat hálózati elfogás adja (a tár üres). Az időmérés a hang TÉNYLEGES indulási eseményéből
// (`playing`, illetve a beszéd `start` eseménye) számol, a koppintás (`click`) pillanatához képest.
const SONIA = "Microsoft Sonia Online (Natural) - English (United Kingdom)";
const HAZEL = "Microsoft Hazel Desktop - English (Great Britain)";
const ZIRA = "Microsoft Zira Desktop - English (United States)";
type ChainLog = {
  speech: Array<{ text: string; lang: string; voice: string | null; volume: number; at: number; startedAt: number | null }>;
  /** `unlock`: a lejátszást a hívó azonnal szüneteltette (iOS-feloldás a felhasználói mozdulatnál) — hang nem szól, nem lejátszási kísérlet. */
  played: Array<{ path: string; rate: number; preservesPitch: boolean; at: number; playingAt: number | null; unlock: boolean }>;
  audios: HTMLAudioElement[]; clickAt: number;
  /** A közös beszédmotor `cancel()` hívásai, és hogy éppen „más beszél-e” (a lecke „Felolvasás” gombja, a kisfilm narrációja). */
  cancels: number; foreignSpeaking: boolean;
};
type ChainOptions = {
  /** A jegyzék válasza: `all` — minden kért kulcs megvan; `none` — üres tár; szám — hibakód. */
  manifest: "all" | "none" | number;
  /** A hangfájl-kérés kezelése; alapból csendes WAV, `audioDelayMs` késleltetéssel (lassított hangtár). */
  audio?: (route: import("@playwright/test").Route) => unknown;
  audioDelayMs?: number;
  voices?: Array<{ name: string; lang: string; localService: boolean }>;
  /**
   * `silent`: a motor semmilyen eseményt nem ad; `fail`: minden hang hibát ad; `android`: a `cancel()` utáni azonnali `speak()`-et a
   * motor megszakítottnak jelzi (a repó A2 esete); név: csak az a hang hibázik. Felhasználói aktiváció nélkül a motor — mint a valódi
   * Chrome — minden módban `not-allowed` hibát ad.
   */
  engine?: "ok" | "silent" | "fail" | "android" | string;
  /** Ennyi idő múlva jön a beszéd `start` eseménye (a motor saját indulási ideje — itt utánzott érték). */
  engineStartMs?: number;
  playRejects?: string;
};
const WINDOWS_VOICES = [{ name: ZIRA, lang: "en-US", localService: true }, { name: HAZEL, lang: "en-GB", localService: true }, { name: SONIA, lang: "en-GB", localService: false }];
async function preparedAudioPage(page: import("@playwright/test").Page, options: ChainOptions) {
  await page.addInitScript(({ voices, engine, engineStartMs, playRejects }) => {
    const log: ChainLog = { speech: [], played: [], audios: [], clickAt: 0, cancels: 0, foreignSpeaking: false };
    let interruptNext = false;
    Object.defineProperty(window, "__chain", { value: log });
    document.addEventListener("click", () => { log.clickAt = performance.now(); }, true);
    type Fake = { text: string; lang: string; volume: number; voice: { name: string } | null; onstart: (() => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
    class FakeUtterance { lang = ""; rate = 1; volume = 1; voice: { name: string } | null = null; onstart = null; onend = null; onerror = null; constructor(public text: string) {} }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { value: {
      get speaking() { return log.foreignSpeaking; }, pending: false,
      cancel() { log.cancels += 1; log.foreignSpeaking = false; interruptNext = true; },
      getVoices: () => voices,
      speak(u: Fake) {
        const entry = { text: u.text, lang: u.lang, voice: u.voice?.name ?? null, volume: u.volume, at: performance.now() - log.clickAt, startedAt: null as number | null };
        log.speech.push(entry);
        // A valódi Chrome felhasználói aktiváció nélkül nem enged kimondani.
        if (!(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) { setTimeout(() => u.onerror?.({ error: "not-allowed" }), 0); return; }
        if (engine === "silent") return;
        // Android Chrome: a `cancel()` utáni ELSŐ `speak()` megszakítottnak jelződik, mielőtt elindulna.
        const interrupted = engine === "android" && interruptNext;
        interruptNext = false;
        if (interrupted) { setTimeout(() => u.onerror?.({ error: "interrupted" }), 5); return; }
        setTimeout(() => {
          if (engine === "fail" || u.voice?.name === engine) { u.onerror?.({ error: "synthesis-failed" }); return; }
          entry.startedAt = performance.now() - log.clickAt;
          u.onstart?.(); u.onend?.();
        }, engineStartMs);
      },
    } });
    const realPlay = HTMLMediaElement.prototype.play;
    const realPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement & { __justPlayed?: { unlock: boolean } }) { if (this.__justPlayed) this.__justPlayed.unlock = true; return realPause.call(this); };
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const path = new URL(this.src).pathname;
      const entry = { path, rate: this.playbackRate, preservesPitch: this.preservesPitch, at: performance.now() - log.clickAt, playingAt: null as number | null, unlock: false };
      log.played.push(entry);
      // Feloldás (unlock): a hívó a lejátszást UGYANABBAN a hívásban szünetelteti — a szünet-figyelő ebből ismeri fel.
      const marked = this as HTMLMediaElement & { __justPlayed?: { unlock: boolean } };
      marked.__justPlayed = entry;
      queueMicrotask(() => { delete marked.__justPlayed; });
      if (!log.audios.includes(this as HTMLAudioElement)) log.audios.push(this as HTMLAudioElement);
      this.addEventListener("playing", () => { entry.playingAt = performance.now() - log.clickAt; }, { once: true });
      if (playRejects && path.startsWith("/api/tts/lesson-audio/")) return Promise.reject(new DOMException("a böngésző tiltja", playRejects));
      return realPlay.call(this);
    };
  }, { voices: options.voices ?? WINDOWS_VOICES, engine: options.engine ?? "ok", engineStartMs: options.engineStartMs ?? 10, playRejects: options.playRejects });
  const lesson = fusionFixture(); lesson.subject = "angol";
  lesson.experience!.language = "en-GB";
  lesson.experience!.glossary = [{ word: "triangle", translation: "háromszög", partOfSpeech: "főnév", example: "This is a triangle.", exampleTranslation: "Ez egy háromszög." }];
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: lesson }));
  const requests = { manifest: [] as string[], audio: [] as string[], fallback: [] as string[] };
  await page.route("**/api/tts/audio**", route => { requests.fallback.push(route.request().url()); return route.fulfill({ contentType: "audio/wav", body: silentWav() }); });
  await page.route("**/api/tts/lesson-audio/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/tts/lesson-audio/available") {
      requests.manifest.push(url.search);
      if (typeof options.manifest === "number") return route.fulfill({ status: options.manifest, json: { message: "hiba" } });
      const available = options.manifest === "all" ? (url.searchParams.get("keys") ?? "").split(",") : [];
      return route.fulfill({ json: { available, sizes: Object.fromEntries(available.map(key => [key, 20000])) } });
    }
    requests.audio.push(url.pathname);
    if (options.audio) return options.audio(route);
    if (options.audioDelayMs) await new Promise(resolve => setTimeout(resolve, options.audioDelayMs));
    return route.fulfill({ contentType: "audio/wav", body: silentWav() }).catch(() => {});
  });
  const word = ttsAudioPath(await ttsAudioHash("triangle", "en-GB"));
  const sentence = ttsAudioPath(await ttsAudioHash("This is a triangle.", "en-GB"));
  const speechState = () => page.evaluate(() => { const s = (window as unknown as { __lessonSpeech(): { knowledge: { verified: string | null; skip: Record<string, number>; silentTaps: number }; entries: Array<{ id: string; state: string }> } }).__lessonSpeech(); return { knowledge: s.knowledge, entries: s.entries }; });
  const engineLog = () => page.evaluate(() => { const c = (window as unknown as { __chain: ChainLog }).__chain; return { cancels: c.cancels, foreignSpeaking: c.foreignSpeaking }; });
  const setForeignSpeech = () => page.evaluate(() => { (window as unknown as { __chain: ChainLog }).__chain.foreignSpeaking = true; });
  const open = async () => {
    await page.goto("/__lesson-runtime-probe?candidate=1");
    await page.getByTestId("pronounce-entry").click();
    // A jegyzék a lecke betöltésekor, egy kéréssel érkezik — megvárjuk, hogy a kattintás már a jegyzék ismeretében történjen.
    await expect.poll(() => requests.manifest.length).toBe(1);
    await page.waitForTimeout(200);
  };
  /** Megvárja, hogy az előtöltés mindkét hangot lejátszásra készre pufferelje (a késleltetést itt, a megnyitáskor „fizetjük ki”). */
  const preloaded = () => expect.poll(async () => (await speechState()).entries.map(e => e.state), { timeout: 15000 }).toEqual(["ready", "ready"]);
  const log = () => page.evaluate(() => {
    const c = (window as unknown as { __chain: ChainLog }).__chain;
    // `played`: a valódi lejátszási kísérletek; `unlocked`: a mozdulatnál „megérintett”, azonnal szüneteltetett letöltések (ezekből hang nem szólhat).
    const real = c.played.filter(p => !p.unlock);
    const audible = c.audios.filter((a, i) => c.played.some(p => !p.unlock && p.path === new URL(a.src || location.href).pathname) || i < 0);
    return { speech: c.speech, played: real.map(({ unlock: _unlock, ...rest }) => rest), unlocked: c.played.filter(p => p.unlock).map(p => ({ path: p.path, playingAt: p.playingAt })), audios: audible.map(a => ({ paused: a.paused, ended: a.ended })) };
  });
  const say = (text: string) => page.getByRole("button", { name: `${text} meghallgatása`, exact: true }).click();
  /** A hallható (nem próba-) kimondások. */
  const spoken = async () => (await log()).speech.filter(s => s.volume > 0).map(({ text, lang, voice }) => ({ text, lang, voice }));
  return { open, preloaded, log, say, spoken, speechState, engineLog, setForeignSpeech, requests, word, sentence };
}
/** A tulajdonosnak szánt mért táblázat sorai a tesztjelentésbe (annotáció) és a kimenetre. */
function measured(name: string, ms: number) {
  test.info().annotations.push({ type: "koppintás → hang", description: `${name}: ${Math.round(ms)} ms` });
  console.log(`[S8d-mérés] ${name}: ${Math.round(ms)} ms`);
}

test.describe("prepared audio", () => {
  // E50–E51: az előtöltés a késleltetést a megnyitáskor fizeti ki — koppintásra a pufferelt hang hálózati kör nélkül, azonnal szól.
  test("előtöltés lassított hangtárral (800 ms / fájl): koppintástól a hang indulásáig ≤ 300 ms, új kérés és böngészőhang nélkül", async ({ page }) => {
    const { open, preloaded, log, say, spoken, requests, word, sentence } = await preparedAudioPage(page, { manifest: "all", audioDelayMs: 800 });
    await open();
    expect(requests.manifest, "egyetlen jegyzék-kérés, a lecke mindkét kulcsával, rendezve").toEqual([`?keys=${[word, sentence].map(p => p.split("/").pop()).sort().join(",")}`]);
    await preloaded();
    expect(requests.audio, "a hangok a megnyitáskor, a háttérben töltődtek le — a szószedet sorrendjében").toEqual([word, sentence]);
    expect((await log()).played, "az előtöltés nem játszik le semmit").toEqual([]);
    expect((await log()).unlocked.every(u => u.playingAt === null), "a mozdulatnál megérintett letöltésekből sem szól hang").toBe(true);
    await say("triangle");
    await expect.poll(async () => (await log()).played[0]?.playingAt ?? null).not.toBeNull();
    const first = (await log()).played[0];
    expect({ path: first.path, rate: first.rate, preservesPitch: first.preservesPitch }).toEqual({ path: word, rate: .85, preservesPitch: true });
    measured("előtöltött hang (lassított hangtár, 800 ms / fájl)", first.playingAt!);
    expect(first.playingAt!, "koppintás → `playing`").toBeLessThanOrEqual(300);
    await page.locator('.fusion-glossary input[type="range"]').fill("0.5");
    await say("This is a triangle.");
    await expect.poll(async () => (await log()).played[1]?.playingAt ?? null).not.toBeNull();
    const second = (await log()).played[1];
    expect({ path: second.path, rate: second.rate }).toEqual({ path: sentence, rate: .5 });
    expect(second.playingAt!).toBeLessThanOrEqual(300);
    // Újrajátszás ugyanarról a pufferelt elemről.
    await say("triangle");
    await expect.poll(async () => (await log()).played[2]?.playingAt ?? null).not.toBeNull();
    expect((await log()).played[2].playingAt!).toBeLessThanOrEqual(300);
    await page.waitForTimeout(2000);
    expect(requests.audio, "koppintáskor nincs hálózati kör").toEqual([word, sentence]);
    expect(await spoken(), "böngészőhang nem szól").toEqual([]);
    expect(requests.fallback).toEqual([]);
    expect(requests.manifest.length).toBe(1);
    await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
  });

  // E53: koppintás az előtöltés KÖZBEN — nem vár a letöltésre, és a később megérkező hang nem szólal meg.
  test("koppintás az előtöltés közben (3 mp-es hangtár): a böngészőhang szól azonnal, a megérkező letöltés néma marad, a következő koppintás már pufferelt", async ({ page }) => {
    const { open, preloaded, log, say, spoken, requests, word } = await preparedAudioPage(page, { manifest: "all", audioDelayMs: 3000, engineStartMs: 150 });
    await open();
    await say("triangle");
    const first = (await log()).speech.filter(s => s.volume > 0);
    expect(first.map(({ text, voice }) => ({ text, voice }))).toEqual([{ text: "triangle", voice: SONIA }]);
    expect(first[0].at, "a kimondás a koppintás gesztusában indul, nem a letöltés után").toBeLessThan(100);
    await expect.poll(async () => (await log()).speech.find(s => s.volume > 0)?.startedAt ?? null).not.toBeNull();
    const started = (await log()).speech.find(s => s.volume > 0)!.startedAt!;
    measured("koppintás előtöltés közben → böngészőhang (a motor utánzott indulási ideje 150 ms)", started);
    expect(started, "koppintás → a beszéd `start` eseménye").toBeLessThanOrEqual(1000);
    await preloaded();
    await page.waitForTimeout(500);
    expect((await log()).played, "a megérkezett letöltés magától nem szólal meg — egy koppintásra egy hang").toEqual([]);
    await say("triangle");
    await expect.poll(async () => (await log()).played[0]?.playingAt ?? null).not.toBeNull();
    expect((await log()).played[0].path).toBe(word);
    expect((await log()).played[0].playingAt!).toBeLessThanOrEqual(300);
    expect((await spoken()).length, "a második koppintásra már nem a böngészőhang szól").toBe(1);
    expect(requests.audio.filter(p => p === word).length, "a szó egyszer töltődött le").toBe(1);
  });

  for (const [name, manifest] of [["üres a tár (a jegyzék szerint nincs hang)", "none"], ["a jegyzék hibázik (500)", 500], ["a jegyzéket a sebességkorlát megfogja (429)", 429]] as const) {
    test(`${name} → a rangsorolt brit böngészőhang AZONNAL szól, hangfájl-kérés nélkül`, async ({ page }) => {
      const { open, log, say, spoken, requests } = await preparedAudioPage(page, { manifest });
      await open();
      await say("triangle");
      // Nincs 404-re váró kör: a kimondás a kattintás gesztusában, szinkron indul.
      const first = (await log()).speech.filter(s => s.volume > 0);
      expect(first.map(({ text, lang, voice }) => ({ text, lang, voice }))).toEqual([{ text: "triangle", lang: "en-GB", voice: SONIA }]);
      expect(first[0].at, "a kattintástól a kimondásig nincs hálózati várakozás").toBeLessThan(100);
      await say("This is a triangle.");
      expect((await spoken())[1]).toEqual({ text: "This is a triangle.", lang: "en-GB", voice: SONIA });
      expect(requests.audio, "üres tárnál hangfájl-kérés egyáltalán nem megy").toEqual([]);
      expect((await log()).played).toEqual([]);
      expect(requests.fallback).toEqual([]);
      await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
    });
  }

  // E55 + vak review K3: a hangfájl hibája már a megnyitáskor kiderül — koppintáskor a böngészőhang a gesztusban szól, 404-es kör nélkül.
  for (const [name, status] of [["a hangfájl mégis hiányzik (404)", 404], ["a hangfájlt a sebességkorlát megfogja (429)", 429]] as const) {
    test(`${name} → a hiba az előtöltéskor derül ki; koppintásra a böngészőhang azonnal szól, újabb kérés nélkül`, async ({ page }) => {
      const { open, log, say, spoken, speechState, requests, word, sentence } = await preparedAudioPage(page, { manifest: "all", audio: route => route.fulfill({ status, json: { message: "nincs" } }) });
      await open();
      await expect.poll(async () => (await speechState()).entries.map(e => e.state)).toEqual(["waiting", "waiting"]);
      expect(requests.audio).toEqual([word, sentence]);
      await say("triangle");
      const first = (await log()).speech.filter(s => s.volume > 0);
      expect(first.map(s => s.voice)).toEqual([SONIA]);
      expect(first[0].at, "nincs gesztusvesztés: a böngészőhang a kattintásban indul").toBeLessThan(100);
      await say("triangle");
      await expect.poll(async () => (await spoken()).length).toBe(2);
      expect(requests.audio, "koppintásra nem megy újabb kérés (az újrapróba visszatartással, a háttérben fut)").toEqual([word, sentence]);
      expect((await log()).played).toEqual([]);
      expect(requests.fallback).toEqual([]);
    });
  }

  // E52 (az S8d javítása után): KÉRETLEN kimondás nincs — a motorról a gyerek valódi koppintásai adnak ismeretet.
  test("koppintás nélkül semmi nem mond ki; az első koppintás igazolja a hangot, a következőre az igazolt böngészőhang ≤ 1 s-on belül indul", async ({ page }) => {
    const { open, log, say, speechState } = await preparedAudioPage(page, { manifest: "none", engineStartMs: 150 });
    await open();
    await page.waitForTimeout(1500);
    expect((await log()).speech, "megnyitás, jegyzék, várakozás: kimondás nincs (próba-megszólalás sincs)").toEqual([]);
    await say("triangle");
    await expect.poll(async () => (await log()).speech[0]?.startedAt ?? null).not.toBeNull();
    const first = (await log()).speech[0];
    expect({ voice: first.voice, volume: first.volume }).toEqual({ voice: SONIA, volume: 1 });
    measured("böngészőhang, a munkamenet első koppintása (a motor utánzott indulási ideje 150 ms)", first.startedAt!);
    expect(first.startedAt!).toBeLessThanOrEqual(1000);
    await expect.poll(async () => (await speechState()).knowledge.verified).not.toBeNull();
    await say("This is a triangle.");
    await expect.poll(async () => (await log()).speech[1]?.startedAt ?? null).not.toBeNull();
    const second = (await log()).speech[1];
    expect(second.voice).toBe(SONIA);
    measured("böngészőhang igazolt hanggal (a motor utánzott indulási ideje 150 ms)", second.startedAt!);
    expect(second.startedAt!, "koppintás → a beszéd `start` eseménye").toBeLessThanOrEqual(1000);
    expect((await log()).speech.length, "koppintásonként egy kimondás").toBe(2);
  });

  // Vak review B1: a közös beszédmotoron más is beszélhet (a lecke „Felolvasás” gombja, a kisfilm narrációja).
  test("B1: más kimondása közben a lejátszó koppintás nélkül nem mond ki és nem szakít meg semmit — a „Meghallgatás” koppintás viszont igen", async ({ page }) => {
    const { open, preloaded, log, say, engineLog, setForeignSpeech } = await preparedAudioPage(page, { manifest: "all", audioDelayMs: 300 });
    await page.goto("/__lesson-runtime-probe?candidate=1");
    await page.getByTestId("pronounce-entry").click();
    // A fülváltás (mint eddig) leállítja a szóló hangot — az idegen kimondás ezért a fülváltás UTÁN indul.
    await setForeignSpeech();
    await preloaded();
    await page.getByRole("heading", { name: "Szószedet · hallgasd és mondd utánam!" }).click();
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(4500);
    expect(await engineLog(), "megnyitás, előtöltés, kattintás, görgetés, várakozás: a felolvasás tovább szól").toEqual({ cancels: 0, foreignSpeaking: true });
    expect((await log()).speech).toEqual([]);
    // A gyerek kifejezett koppintása — mint eddig — leállítja az éppen szóló hangot (egyszerre egy hang szól).
    await say("triangle");
    await expect.poll(async () => (await log()).played[0]?.playingAt ?? null).not.toBeNull();
    expect(await engineLog()).toEqual({ cancels: 1, foreignSpeaking: false });
  });

  // Vak review B2: érintésnél a görgetés és a hosszú nyomás nem ad felhasználói aktivációt — a hangválasztást nem ronthatja el.
  test("B2: görgetés és hosszú nyomás után (koppintás nélkül) nincs kimondás; az első valódi koppintásra a rangsor legjobb brit hangja szól", async ({ page }) => {
    const { log, say, spoken, requests } = await preparedAudioPage(page, { manifest: "none" });
    await page.goto("/__lesson-runtime-probe?candidate=1&tab=pronounce");
    await page.mouse.wheel(0, 300);
    await page.mouse.move(200, 300);
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.move(210, 420);
    await page.waitForTimeout(3500);
    expect((await log()).speech, "aktiváció nélkül a lejátszó meg sem próbál kimondani").toEqual([]);
    await page.mouse.up();
    await page.getByTestId("pronounce-entry").click();
    await expect.poll(() => requests.manifest.length).toBe(1);
    await say("triangle");
    await expect.poll(spoken).toEqual([{ text: "triangle", lang: "en-GB", voice: SONIA }]);
    await page.waitForTimeout(300);
    expect((await log()).speech.map(s => s.voice), "nem a rangsor egy gyengébb hangja").toEqual([SONIA]);
    expect(requests.fallback).toEqual([]);
  });

  // Vak review B3 (a repó A2 esete): Android Chrome a `cancel()` utáni azonnali `speak()`-et megszakítottnak jelzi.
  test("B3: gyors két koppintás (az első még szól) után is a brit hang szól — a megszakítás nem a hang hibája", async ({ page }) => {
    const { open, log, say, speechState, requests, setForeignSpeech } = await preparedAudioPage(page, { manifest: "none", engine: "android" });
    await open();
    await say("triangle");
    await expect.poll(async () => (await log()).speech[0]?.startedAt ?? null).not.toBeNull();
    // A második koppintáskor „még szól valami”: a lejátszó cancel()-t hív, majd azonnal speak()-et — a motor megszakítottnak jelzi.
    await setForeignSpeech();
    await say("This is a triangle.");
    await expect.poll(async () => (await log()).speech.at(-1)?.startedAt ?? null, { timeout: 3000 }).not.toBeNull();
    const speech = (await log()).speech;
    expect(speech.map(s => s.voice), "az újrapróba ugyanazzal a brit hanggal megy, amerikai hang nem szól").toEqual([SONIA, SONIA, SONIA]);
    expect((await speechState()).knowledge.skip, "negatív ítélet nem keletkezett").toEqual({});
    await say("triangle");
    await expect.poll(async () => (await log()).speech.length).toBe(4);
    expect((await log()).speech[3].voice).toBe(SONIA);
    expect(requests.fallback).toEqual([]);
  });

  test("néma motor: az első koppintás 3 mp után a tartalékra vált, a következő kettő ≤ 1 s-on belül; a negyedik újra megpróbálja a böngészőhangot", async ({ page }) => {
    const voices = [{ name: "English United Kingdom", lang: "en_GB", localService: true }, { name: "English United States", lang: "en_US", localService: true }];
    const { open, log, say, speechState, requests } = await preparedAudioPage(page, { manifest: "none", engine: "silent", voices });
    await open();
    await say("triangle");
    await expect.poll(() => requests.fallback.length, { timeout: 5000 }).toBe(1);
    const first = (await log()).played[0];
    measured("néma motor, a munkamenet első koppintása → szerveres tartalék", first.at);
    expect(first.at).toBeGreaterThan(2900);
    expect(first.at).toBeLessThan(4000);
    expect((await speechState()).knowledge.silentTaps).toBe(2);
    for (const tap of [2, 3]) {
      await say("triangle");
      await expect.poll(async () => (await log()).played[tap - 1]?.playingAt ?? null, { timeout: 3000 }).not.toBeNull();
      const played = (await log()).played[tap - 1];
      if (tap === 2) measured("néma motor, a következő koppintás → szerveres tartalék (helyi, azonnal válaszoló ál-végpont)", played.playingAt!);
      expect(played.playingAt!, `a ${tap}. koppintás nem vár 3 mp-et`).toBeLessThanOrEqual(1000);
    }
    expect((await log()).speech.length, "néma ítélet alatt a motort nem próbálja").toBe(1);
    await say("triangle");
    await expect.poll(async () => (await log()).speech.length).toBe(2);
    expect((await log()).speech[1].voice, "az ítélet lejár: nem marad örökre a szerverhangon").toBe("English United Kingdom");
    await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
  });
  test("az első böngészőhang hibája → a legjobb telepített helyi hang szól, a szerveres tartalék nem", async ({ page }) => {
    const { open, say, spoken, requests } = await preparedAudioPage(page, { manifest: "none", engine: SONIA });
    await open();
    await say("triangle");
    await expect.poll(spoken).toEqual([{ text: "triangle", lang: "en-GB", voice: SONIA }, { text: "triangle", lang: "en-GB", voice: HAZEL }]);
    await page.waitForTimeout(500);
    expect((await spoken()).length).toBe(2);
    expect(requests.fallback, "a nem brit szerverhang csak a legvégén jönne").toEqual([]);
    await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
  });

  test("J4: minden böngészőhang hibát ad → a rangsor szerinti sorrend után a szerveres tartalék szól", async ({ page }) => {
    const { open, log, say, spoken, requests } = await preparedAudioPage(page, { manifest: "none", engine: "fail" });
    await open();
    await say("triangle");
    await expect.poll(() => requests.fallback.length, { timeout: 3000 }).toBe(1);
    expect((await spoken()).map(s => s.voice)).toEqual([SONIA, HAZEL, ZIRA]);
    expect(new URL(requests.fallback[0]).search).toBe("?text=triangle&lang=en");
    expect((await log()).played.map(p => p.path)).toEqual(["/api/tts/audio"]);
    expect((await log()).played[0].at, "hibaeseménynél a lánc nem vár: a tartalék gyorsan jön").toBeLessThan(1500);
    await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
  });

  // Review B1 (spec 2026-11-09-felolvasas-tartalek A2) — VÉDŐHÁLÓ: ha a próba még nem futott le (a koppintás megelőzi), a csend
  // ekkor sem nő a hangok számával.
  test("B1 védőháló: néma motor három helyi angol hanggal, próba előtti koppintás → a szerveres tartalék 3 mp után szól, nem 9 mp után", async ({ page }) => {
    const voices = [{ name: "English United Kingdom", lang: "en_GB", localService: true }, { name: "English United States", lang: "en_US", localService: true }, { name: "English India", lang: "en_IN", localService: true }];
    const { open, log, say, requests } = await preparedAudioPage(page, { manifest: "none", engine: "silent", voices });
    await open();
    await say("triangle");
    await page.waitForTimeout(2500);
    expect(requests.fallback, "a 3 mp-es csendkeret előtt még a böngészőhangra vár").toEqual([]);
    await expect.poll(() => requests.fallback.length, { timeout: 2500 }).toBe(1);
    const { played, speech } = await log();
    expect(played[0].path).toBe("/api/tts/audio");
    expect(played[0].at).toBeGreaterThan(2900);
    expect(played[0].at, "3 mp + tűrés").toBeLessThan(4000);
    expect(speech.filter(s => s.volume > 0).map(s => s.voice), "a keret elfogytával további hang nem próbálkozik").toEqual(["English United Kingdom"]);
    await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
  });

  test("B1 védőháló: néma hálózati hang mögül a telepített helyi brit hang 3 mp-nél sorra kerül, a tartalék legkésőbb 6 mp-nél szól", async ({ page }) => {
    const { open, log, say, requests } = await preparedAudioPage(page, { manifest: "none", engine: "silent" });
    await open();
    await say("triangle");
    const real = async () => (await log()).speech.filter(s => s.volume > 0);
    await expect.poll(async () => (await real()).map(s => s.voice), { timeout: 4500 }).toEqual([SONIA, HAZEL]);
    const second = (await real())[1].at;
    expect(second).toBeGreaterThan(2900);
    expect(second).toBeLessThan(4000);
    await expect.poll(() => requests.fallback.length, { timeout: 4500 }).toBe(1);
    const { played } = await log();
    expect(played[0].at).toBeGreaterThan(5900);
    expect(played[0].at, "6 mp + tűrés").toBeLessThan(7000);
    expect((await real()).map(s => s.voice), "a harmadik hang már nem nyújtja a csendet").toEqual([SONIA, HAZEL]);
  });

  test("a böngésző lejátszási tiltása (NotAllowedError) → a böngészőhang szól, és ez nem számít hiánynak", async ({ page }) => {
    const { open, preloaded, log, say, spoken, word } = await preparedAudioPage(page, { manifest: "all", playRejects: "NotAllowedError" });
    await open();
    await preloaded();
    await say("triangle");
    await expect.poll(spoken).toEqual([{ text: "triangle", lang: "en-GB", voice: SONIA }]);
    await say("triangle");
    await expect.poll(async () => (await spoken()).length).toBe(2);
    expect((await log()).played.map(p => p.path), "a következő koppintás újra megpróbálja az előre gyártott hangot").toEqual([word, word]);
  });

  test("két gyors koppintás két különböző előtöltött szóra → az első hang leáll, csak a második szól; böngészőhang és tartalék nélkül", async ({ page }) => {
    const { open, preloaded, log, say, spoken, requests, word, sentence } = await preparedAudioPage(page, { manifest: "all" });
    await open();
    await preloaded();
    await say("triangle");
    await say("This is a triangle.");
    await expect.poll(async () => (await log()).played.map(p => p.path)).toEqual([word, sentence]);
    await expect.poll(async () => (await log()).audios[1], { timeout: 4000 }).toEqual({ paused: true, ended: true });
    await page.waitForTimeout(1800);
    const state = await log();
    expect(state.audios[0], "az első koppintás hangja leállítva, nem játszott végig").toEqual({ paused: true, ended: false });
    expect(await spoken(), "az elvetett első koppintás őre nem indít böngészőhangot").toEqual([]);
    expect(requests.fallback).toEqual([]);
    await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
  });
});
// Spec 2026-11-09-felolvasas-tartalek: a tartalék végpont helyett 0,1 mp csendes WAV (a Vite-próbaszerveren nincs /api/tts).
const silentWav = () => {
  const samples = 800, b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples * 2, 40);
  return b;
};
const serveFallbackAudio = (page: import("@playwright/test").Page) => page.route("**/api/tts/audio**", route => route.fulfill({ contentType: "audio/wav", body: silentWav() }));
// Spec 2026-11-09-felolvasas-tartalek: ha a böngésző hangja nem szól, a szerver MP3-a (azonos eredet) szól, hibaüzenet nélkül.
const glossaryLesson = () => {
  const lesson = fusionFixture(); lesson.subject = "angol";
  lesson.experience!.language = "en-GB";
  lesson.experience!.glossary = [{ word: "triangle", translation: "háromszög", partOfSpeech: "főnév", example: "This is a triangle.", exampleTranslation: "Ez egy háromszög." }];
  return lesson;
};
for (const [name, mode] of [
  ["a böngésző kimondása hibát ad (synthesis-failed)", "error"],
  ["a böngésző kimondása el sem indul (néma motor)", "silent"],
  ["nincs speechSynthesis", "absent"],
  ["van hanglista, de angol hang nincs", "novoice"],
] as const) {
  test(`speech fallback: ${name} → a szerver hangja szól, hibaüzenet nélkül`, async ({ page }) => {
    await page.addInitScript((mode) => {
      const played: Array<{ src: string; rate: number }> = [];
      Object.defineProperty(window, "__played", { value: played });
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { played.push({ src: this.src, rate: this.playbackRate }); return Promise.resolve(); };
      if (mode === "absent") { Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); delete (window as { speechSynthesis?: unknown }).speechSynthesis; return; }
      Object.defineProperty(window, "speechSynthesis", { value: {
        speaking: false, pending: false, cancel() {},
        getVoices: () => mode === "novoice" ? [{ lang: "hu-HU" }] : [],
        speak(u: SpeechSynthesisUtterance) { if (mode === "error") setTimeout(() => u.onerror?.({ error: "synthesis-failed" } as SpeechSynthesisErrorEvent), 50); },
      } });
    }, mode);
    await serveFallbackAudio(page);
    await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: glossaryLesson() }));
    await page.goto("/__lesson-runtime-probe?candidate=1");
    await page.getByTestId("pronounce-entry").click();
    await page.getByRole("button", { name: "triangle meghallgatása", exact: true }).click();
    const played = () => page.evaluate(() => (window as unknown as { __played: Array<{ src: string; rate: number }> }).__played);
    await expect.poll(async () => (await played()).length, { timeout: 5000 }).toBe(1);
    const [first] = await played();
    expect(new URL(first.src).pathname + new URL(first.src).search).toBe("/api/tts/audio?text=triangle&lang=en");
    expect(first.rate).toBeCloseTo(.85, 2);
    await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
  });
}

test("speech fallback: a megszakítás (interrupted) nem hiba — nincs tartalék, nincs üzenet", async ({ page }) => {
  await page.addInitScript(() => {
    const played: string[] = [];
    Object.defineProperty(window, "__played", { value: played });
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { played.push(this.src); return Promise.resolve(); };
    Object.defineProperty(window, "speechSynthesis", { value: {
      speaking: false, pending: false, cancel() {}, getVoices: () => [{ lang: "en-GB" }],
      speak(u: SpeechSynthesisUtterance) { setTimeout(() => { u.onstart?.({} as SpeechSynthesisEvent); u.onerror?.({ error: "interrupted" } as SpeechSynthesisErrorEvent); }, 50); },
    } });
  });
  await serveFallbackAudio(page);
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: glossaryLesson() }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await page.getByTestId("pronounce-entry").click();
  await page.getByRole("button", { name: "triangle meghallgatása", exact: true }).click();
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => (window as unknown as { __played: string[] }).__played)).toEqual([]);
  await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
});

// Spec 2026-11-10-hibavadaszat A2: a motor az el nem indult kimondást jelzi megszakítottnak (Android Chrome) — a tanuló semmit sem hallott.
test("speech fallback: az el nem indult kimondás megszakítása (interrupted) → a szerver hangja szól", async ({ page }) => {
  await page.addInitScript(() => {
    const played: string[] = [];
    Object.defineProperty(window, "__played", { value: played });
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { played.push(this.src); return Promise.resolve(); };
    Object.defineProperty(window, "speechSynthesis", { value: {
      speaking: false, pending: false, cancel() {}, getVoices: () => [],
      speak(u: SpeechSynthesisUtterance) { setTimeout(() => u.onerror?.({ error: "interrupted" } as SpeechSynthesisErrorEvent), 50); },
    } });
  });
  await serveFallbackAudio(page);
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: glossaryLesson() }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await page.getByTestId("pronounce-entry").click();
  await page.getByRole("button", { name: "triangle meghallgatása", exact: true }).click();
  const played = () => page.evaluate(() => (window as unknown as { __played: string[] }).__played);
  await expect.poll(async () => (await played()).length, { timeout: 2000 }).toBe(1);
  expect(new URL((await played())[0]).pathname).toBe("/api/tts/audio");
  await expect(page.getByText("A hang most nem érhető el ezen az eszközön.")).toHaveCount(0);
});

// Spec 2026-11-10-hibavadaszat A5: a párosító jobb oszlopa nem a bal oszlop sorrendjében áll; a párosítás az eredeti párokkal működik.
test("párosító: a jobb oszlop kevert sorrendű, a párok mégis helyesen köthetők össze", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?fusion=1&classroom=5&match=4");
  const pairs = [["kutya", "dog"], ["macska", "cat"], ["ló", "horse"], ["madár", "bird"]];
  const match = page.locator('[data-try="match"]').first();
  await expect(match).toBeVisible();
  const columns = match.locator(".grid > div");
  const left = await columns.nth(0).locator("button").allInnerTexts();
  const right = await columns.nth(1).locator("button").allInnerTexts();
  expect(left).toEqual(pairs.map(([l]) => l));
  expect([...right].sort()).toEqual(pairs.map(([, r]) => r).sort());
  expect(right).not.toEqual(pairs.map(([, r]) => r));
  // Hibás pár: nem lesz kész; helyes párok: mind megvan.
  await columns.nth(0).getByRole("button", { name: "kutya", exact: true }).click();
  await columns.nth(1).getByRole("button", { name: "cat", exact: true }).click();
  await expect(match.getByText("Minden pár megvan!")).toHaveCount(0);
  for (const [l, r] of pairs) {
    await columns.nth(0).getByRole("button", { name: l, exact: true }).click();
    await columns.nth(1).getByRole("button", { name: r, exact: true }).click();
  }
  await expect(match.getByText("Minden pár megvan!")).toBeVisible();
});

// Spec 2026-11-10-hibavadaszat A1: fülváltáskor a tartalék hang és az indulási őr is leáll.
for (const [name, mode] of [["a már szóló tartalék hang megáll", "playing"], ["a néma motor őre nem indít hangot a másik fülön", "pending"]] as const) {
  test(`speech fallback: fülváltás — ${name}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      const log = { played: 0, paused: 0 };
      Object.defineProperty(window, "__audio", { value: log });
      HTMLMediaElement.prototype.play = function () { log.played += 1; return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () { log.paused += 1; };
      Object.defineProperty(window, "speechSynthesis", { value: {
        speaking: false, pending: false, cancel() {}, getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) { if (mode === "playing") setTimeout(() => u.onerror?.({ error: "synthesis-failed" } as SpeechSynthesisErrorEvent), 50); },
      } });
    }, mode);
    await serveFallbackAudio(page);
    await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: glossaryLesson() }));
    await page.goto("/__lesson-runtime-probe?candidate=1");
    await page.getByTestId("pronounce-entry").click();
    await page.getByRole("button", { name: "triangle meghallgatása", exact: true }).click();
    const audio = () => page.evaluate(() => (window as unknown as { __audio: { played: number; paused: number } }).__audio);
    if (mode === "playing") await expect.poll(async () => (await audio()).played, { timeout: 2000 }).toBe(1);
    await page.getByRole("tab", { selected: false }).first().click();
    if (mode === "playing") {
      await expect.poll(async () => (await audio()).paused).toBe(1);
    } else {
      await page.waitForTimeout(3500);
      expect((await audio()).played).toBe(0);
    }
  });
}

test("speech fallback: ha a szerver hangja sem szól, érthető üzenet jelenik meg", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { return Promise.reject(new Error("NotSupportedError")); };
    Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
  });
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: glossaryLesson() }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await page.getByTestId("pronounce-entry").click();
  await page.getByRole("button", { name: "triangle meghallgatása", exact: true }).click();
  await expect(page.getByText("A hang most nem érhető el ezen az eszközön.").first()).toBeVisible();
});

// Spec 2026-10-21-nyelvlecke-kiejtes: kiejtésgyakorlás a lecke nyelvén; beszédfelismerés nélkül a billentyűzetes diktálás útja.
const languageLesson = () => {
  const lesson = fusionFixture(); lesson.subject = "angol";
  lesson.experience!.language = "en-GB";
  lesson.experience!.glossary = [{ word: "triangle", translation: "háromszög", partOfSpeech: "főnév", example: "This is a triangle.", exampleTranslation: "Ez egy háromszög." }];
  return lesson;
};

test("pronunciation practice listens in the lesson language and judges the spoken word", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      static last: FakeRecognition | null = null;
      lang = ""; maxAlternatives = 1;
      onresult: ((event: unknown) => void) | null = null; onerror = null; onend: (() => void) | null = null;
      constructor() { FakeRecognition.last = this; }
      start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: "Triangle" }, { transcript: "try angle" }]] }); this.onend?.(); }, 10); }
      stop() { this.onend?.(); } abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition });
    Object.defineProperty(window, "__lastRecognitionLang", { get: () => FakeRecognition.last?.lang });
  });
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: languageLesson() }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await page.getByRole("tab", { name: "Kiejtés", exact: true }).click();
  await page.getByRole("button", { name: "triangle kimondása", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Kiejtés", exact: true });
  await expect(panel.getByTestId("pronounce").first().getByRole("status")).toContainText("Szép kiejtés");
  expect(await page.evaluate(() => (window as unknown as { __lastRecognitionLang: string }).__lastRecognitionLang)).toBe("en-GB");
});

test("review #360: on a 320px phone the six language-lesson tabs wrap into two rows without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: languageLesson() }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await expect(page.getByTestId("pronounce-entry")).toBeVisible();
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < count; i++) {
    const box = await tabs.nth(i).boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 320).toBeTruthy();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("pronunciation practice works without speech recognition via keyboard dictation, and dictation explains instead of vanishing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  });
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: languageLesson() }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await page.getByRole("tab", { name: "Kiejtés", exact: true }).click();
  const practice = page.getByRole("tabpanel", { name: "Kiejtés", exact: true }).getByTestId("pronounce").first();
  await practice.getByRole("button", { name: "triangle kimondása", exact: true }).click();
  await practice.getByRole("textbox").fill("rectangle");
  await practice.getByRole("button", { name: "Ellenőrzés" }).click();
  await expect(practice.getByRole("status")).toContainText("Próbáld újra");
  await practice.getByRole("textbox").fill("triangle");
  await practice.getByRole("button", { name: "Ellenőrzés" }).click();
  await expect(practice.getByRole("status")).toContainText("Szép kiejtés");
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  await expect(page.getByText("billentyűzet 🎤 (mikrofon) gombját").first()).toBeVisible();
  // Nyelvleckén a diktálás nyelve választható (alapból a lecke nyelve).
  await expect(page.getByRole("group", { name: "A diktálás nyelve" }).getByRole("button", { name: "Angolul" })).toHaveAttribute("aria-pressed", "true");
});


// Websuli Design (dokumentált spec-változás, docs/specs/2026-10-16-websuli-design.md): az öt évfolyamsávos arculat mind olvasható
// tintát ad és teljes kidolgozott példát mutat; az öt arculat színe különböző.
test("all five grade-band designs keep readable ink and complete worked examples", async ({ page }) => {
  const colors = new Set<string>();
  for (const classroom of [1, 4, 7, 9, 11]) {
    await page.goto(`/__lesson-runtime-probe?fusion=1&classroom=${classroom}`);
    await expect(page.getByText("Eredmény: 12 cm²", { exact: true })).toBeVisible();
    const palette = await page.locator("[data-experience]").evaluate(el => {
      const s = getComputedStyle(el);
      const luminance = (color: string) => {
        const rgb = color.match(/\d+/g)!.slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const a = luminance(s.color), b = luminance(s.backgroundColor);
      return { color: s.backgroundColor, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
    expect(palette.contrast).toBeGreaterThanOrEqual(4.5);
    colors.add(palette.color);
  }
  expect(colors.size).toBe(5);
});

test("continuous oral tasks keep one dictation session and reject stale results", async ({ page }) => {
  await page.addInitScript(() => {
    type Result = { results: { transcript: string }[][] };
    class FakeRecognition {
      static instances: FakeRecognition[] = [];
      onresult: ((event: Result) => void) | null = null;
      onerror = null;
      onend: (() => void) | null = null;
      capturedResult: ((event: Result) => void) | null = null;
      running = false;
      constructor() { FakeRecognition.instances.push(this); }
      start() { this.running = true; this.capturedResult = this.onresult; }
      stop() { this.running = false; this.onend?.(); }
      abort() { this.running = false; this.onend?.(); }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition });
    Object.defineProperty(window, "__dictationProbe", { value: {
      active: () => FakeRecognition.instances.filter(engine => engine.running).length,
      emit: (index: number, text: string) => FakeRecognition.instances[index].capturedResult?.({ results: [[{ transcript: text }]] }),
    } });
  });
  await page.goto("/__lesson-runtime-probe?fusion=1");
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  const oral = page.locator("[data-task-id]").filter({ has: page.locator(".fusion-speech") });
  const probe = (index?: number, text?: string) => page.evaluate(({ index, text }) => {
    const controls = (window as unknown as { __dictationProbe: { active(): number; emit(index: number, text: string): void } }).__dictationProbe;
    if (index !== undefined && text !== undefined) controls.emit(index, text);
    return controls.active();
  }, { index, text });
  await oral.nth(0).getByRole("button", { name: "Válasz diktálása" }).click();
  expect(await probe()).toBe(1);
  await oral.nth(1).getByRole("button", { name: "Válasz diktálása" }).click();
  expect(await probe()).toBe(1);
  await expect(page.getByRole("button", { name: "Diktálás leállítása" })).toHaveCount(1);
  await probe(0, "stale result");
  await expect(oral.nth(0).locator("textarea")).toHaveValue("");
  await probe(1, "current result");
  await expect(oral.nth(1).locator("textarea")).toHaveValue("current result");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  expect(await probe()).toBe(0);
  await probe(1, "late result");
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  await expect(oral.nth(1).locator("textarea")).toHaveValue("current result");
});

test("oral exercises remain usable without a microphone and actual touch drag orders steps", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  });
  await page.goto("/__lesson-runtime-probe?fusion=1");
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  await expect(page.locator('[data-task-id]:visible textarea:visible')).toHaveCount(15);
  expect(await page.getByText("Szóbeli gyakorlás", { exact: false }).count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Válasz diktálása" })).toHaveCount(0);
  const writtenAnswer = page.locator("[data-task-id] textarea").first();
  await writtenAnswer.fill("Gépeléssel is működik.");
  await expect(writtenAnswer).toHaveValue("Gépeléssel is működik.");
  await page.getByRole("tab", { name: "Módszerek", exact: true }).click();
  const methods = page.getByRole("tabpanel", { name: "Módszerek", exact: true });
  await methods.locator('[data-method="gate"]').first().getByRole("button").first().click();
  const sort = methods.locator('[data-method="sorting"]');
  await sort.scrollIntoViewIfNeeded();
  const cdp = await context.newCDPSession(page);
  for (const destination of [0, 1]) {
    const from = await sort.locator(".fusion-drag").last().boundingBox();
    const to = await sort.locator(".fusion-drag").nth(destination).boundingBox();
    if (!from || !to) throw new Error("Missing drag geometry");
    const x = from.x + from.width / 2, y = from.y + from.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: to.x + to.width / 2, y: to.y + to.height / 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await cdp.detach();
  await sort.getByRole("button", { name: "Sorrend ellenőrzése" }).click();
  await expect(sort.getByRole("status")).toContainText("Helyes sorrend");
});

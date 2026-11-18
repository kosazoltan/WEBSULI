import { expect, test, type Page } from "@playwright/test";

import { WORD_LADDER_DE } from "../client/src/data/wordLadder/de";
import { WORD_LADDER_EN } from "../client/src/data/wordLadder/en";
import { WORD_LADDER_FR } from "../client/src/data/wordLadder/fr";
import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_FR } from "../client/src/data/vocabBank/vocab-fr";
import { canGameCloze } from "../client/src/game-engine/vocab/questionGenerator";

/**
 * Szólétra olvashatóság (docs/specs/2026-11-17-szoletra-olvashatosag.md SZ-2, SZ-4, SZ-5; átmeneti kapu 3(a), 3(c)) —
 * böngészőben, a CI-azonos úton (buildelt szerver, szoftveres WebGL, egy worker).
 *
 * - SZ-2: az óra csak ≥ 400 ms előjelzés után indul, a fogások addig nem élesek; az előjelzés alatti 1–4 billentyű nem
 *   válasz. A mérés a lapon belül, képkockánként (C-65), nem Playwright-oldali várakozással.
 * - SZ-5: a célkártya a keretszöveg ≥ 1,6-szeres betűjével, ≥ 3:1 kontraszttal (WCAG AA nagy szöveg), kilógás és szó
 *   közbeni törés nélkül — mindhárom nézetben, a kézi bank és a szóbank LEGHOSSZABB célszavaival és a hiányos mondattal. A
 *   tételek a valódi kérdés-úton jönnek (`?wlItems=`, csak teszt-kampós buildben); a leghosszabbakat a spec a bankfájlokból
 *   keresi ki.
 * - SZ-4: a tempó-választó működik, és újratöltés után megmarad.
 * - Review K2 / A4 / A7 (SPEC-VÁLTOZÁS 2026-11-17, szoletra-olvashatosag): a kártya a fogás-panelt / HUD-ot nem fedi és
 *   nincs levágva — kérdés- ÉS megoldás-állapotban, az angol, a német és a francia bank leghosszabb célrészeivel és a
 *   megnevezett hosszú tételekkel; a keretsor ≥ 16 px, ≥ 4,5:1 kontraszt, nem halványított; a célszó ≥ 1,6×, mondatnál
 *   (helyhiánykor kicsinyedő kártya) ≥ 1,25× a keretsor; a kézi tételek tűrés nélkül mérve.
 */

test.use({ serviceWorkers: "block", hasTouch: true });

const VIEWS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;

type Probe = Record<string, number | string | null>;
type Api = { forceState: (p: object) => void; probe: () => Probe };

async function stub(page: Page, grade = "4") {
  await page.addInitScript((g) => {
    localStorage.setItem("websuli.classroomGrade", g);
  }, grade);
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { __websuliGame: Api }).__websuliGame.probe());

type Bank = readonly { id: string; focus?: string }[];
type Vocab = readonly { id: string; hu: string; term: string; example: string; kind: string; pos?: string }[];
const longestWord = (s: string) => Math.max(...s.split(/\s+/u).map((w) => w.length));

/** A leghosszabb célrészek egy nyelv bankjaiból (programmal kikeresve): kézi bank (a leghosszabb szó, a leghosszabb
 *  célrész, a leghosszabb hiányos mondat), szóbank típusonként (magyar → cél, cél → magyar, hiányos mondat, mondat-jelentés). */
function longestItems(manualBank: Bank, vocab: Vocab, opts: { cloze: boolean } = { cloze: true }): string[] {
  const manual = manualBank.filter((i) => i.focus);
  const ids = [
    [...manual].sort((a, b) => longestWord(b.focus!) - longestWord(a.focus!))[0]!.id,
    [...manual].sort((a, b) => b.focus!.length - a.focus!.length)[0]!.id,
  ];
  const manualCloze = [...manual].filter((i) => /_{3,}/u.test(i.focus!)).sort((a, b) => b.focus!.length - a.focus!.length)[0];
  if (manualCloze) ids.push(manualCloze.id);
  const pick = (score: (e: Vocab[number]) => number, n: number, filter: (e: Vocab[number]) => boolean = () => true) =>
    [...vocab].filter(filter).sort((a, b) => score(b) - score(a)).slice(0, n);
  for (const e of pick((e) => longestWord(e.hu) * 100 + e.hu.length, 2)) ids.push(`vocab:${e.id}:hu-to-target`);
  for (const e of pick((e) => longestWord(e.term) * 100 + e.term.length, 2)) ids.push(`vocab:${e.id}:target-to-hu`);
  if (opts.cloze) for (const e of pick((e) => e.example.length, 2, (e) => canGameCloze(e as Parameters<typeof canGameCloze>[0]))) ids.push(`vocab:${e.id}:cloze`);
  for (const e of pick((e) => e.example.length, 2, (e) => e.kind === "phrase")) ids.push(`vocab:${e.id}:phrase-meaning`);
  return [...new Set(ids)];
}

/** A célkártya és az elrendezés mérése a lapon belül, egy olvasással (C-64). */
const measure = (page: Page) =>
  page.evaluate(() => {
    const focus = document.querySelector<HTMLElement>('[data-testid="wl-prompt-focus"]');
    const card = document.querySelector<HTMLElement>('[data-testid="wl-question"] .play-question-card');
    if (!card) return null;
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrastOf = (fg: string, bg: string) => {
      const L1 = lum(rgb(fg));
      const L2 = lum(rgb(bg));
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    };
    const cr = card.getBoundingClientRect();
    const hud = document.querySelector<HTMLElement>(".game-hud")?.getBoundingClientRect() ?? null;
    const landscape = window.innerWidth > window.innerHeight && window.innerHeight <= 520;
    const panel = document.querySelector<HTMLElement>('[data-testid="wl-quiz"]')!.getBoundingClientRect();
    const opts = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="wl-option-"]')).map((b) => b.getBoundingClientRect());
    const teach = document.querySelector<HTMLElement>('[data-testid="wl-teach"]')?.getBoundingClientRect() ?? null;
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    // Álló nézetben a fogás-panel (benne a tanító sor) a kártya alatt; fekvőben a fogások a két szélen, a tanító sor középen.
    const holdsTop = landscape ? Math.min(...opts.map((o) => o.top)) : panel.top;
    const overHolds = landscape ? opts.some((o) => hit(o, cr)) || (teach !== null && hit(teach, cr)) : cr.bottom > panel.top + 0.5;
    const overHud = hud !== null && cr.top < hud.bottom - 0.5;
    const clipped = cr.bottom > window.innerHeight + 0.5 || card.scrollHeight > card.clientHeight + 1 || (focus !== null && focus.scrollHeight > focus.clientHeight + 1);
    const frame = document.querySelector<HTMLElement>('[data-testid="wl-prompt-frame"]');
    const cardBg = getComputedStyle(card).backgroundColor;
    const out = {
      key: "",
      holdsFit: document.querySelector<HTMLElement>('[data-testid="wl-quiz"]')?.dataset.fit ?? "",
      holdFont: (() => {
        const b = document.querySelector<HTMLElement>('[data-testid^="wl-option-"]');
        return b ? parseFloat(getComputedStyle(b).fontSize) : 0;
      })(),
      tight: document.querySelector<HTMLElement>('[data-testid="wl-question"]')?.dataset.wlTight === "true",
      statusAfter: (() => {
        const st = card.querySelector<HTMLElement>('[data-testid="play-question-status"]');
        const c = st ? getComputedStyle(st, "::after").content : "none";
        return c && c !== "none" && c !== "normal" ? c : "";
      })(),
      text: focus?.innerText ?? "",
      kind: focus?.dataset.kind ?? "",
      fit: focus?.dataset.fit ?? "",
      fs: focus ? parseFloat(getComputedStyle(focus).fontSize) : 0,
      frameFs: frame ? parseFloat(getComputedStyle(frame).fontSize) : 16,
      frameContrast: frame ? contrastOf(getComputedStyle(frame).color, cardBg) : null,
      frameOpacity: frame ? parseFloat(getComputedStyle(frame).opacity) : 1,
      contrast: focus ? contrastOf(getComputedStyle(focus).color, getComputedStyle(focus).backgroundColor) : 0,
      cardBottom: Math.round(cr.bottom),
      holdsTop: Math.round(holdsTop),
      gap: Math.round(holdsTop - cr.bottom),
      overHolds,
      overHud,
      clipped,
      overflowX: focus !== null && (focus.scrollWidth > focus.clientWidth + 1 || focus.getBoundingClientRect().right > cr.right + 1),
      broken: [] as string[],
      blank: null as null | { w: number; border: number },
    };
    if (focus) {
      // Szó közbeni törés: egy szó (a szöveg-csomópontokon belül) több sorra eső téglalapokat kap. Kötőjeles összetételnél a
      // kötőjel UTÁNI sortörés helyesírási sortörés, nem szó közbeni: a kötőjelig tartó részek külön szavak.
      const walker = document.createTreeWalker(focus, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent ?? "";
        const re = /[^\s-]+-?/gu;
        for (let m = re.exec(text); m; m = re.exec(text)) {
          const r = document.createRange();
          r.setStart(n, m.index);
          r.setEnd(n, m.index + m[0].length);
          const tops = new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top)));
          if (tops.size > 1) out.broken.push(m[0]);
        }
      }
      const blank = focus.querySelector<HTMLElement>('[data-testid="play-question-blank"]');
      if (blank) out.blank = { w: blank.getBoundingClientRect().width, border: parseFloat(getComputedStyle(blank).borderTopWidth) };
    }
    return out;
  });

type Row = NonNullable<Awaited<ReturnType<typeof measure>>> & { state: "kérdés" | "megoldás" };

/**
 * A `?wlItems=` tételein végigmegy: minden kérdésnél az élesítés után mér (kérdés-állapot), majd ROSSZ fogással a
 * megoldás-kijelzést is méri (a kártya ekkor állapotsorral és „Miért?” gombbal nő). A kulcs a probe `questionKey`-e.
 */
async function runItems(page: Page, ids: string[], opts: { lang: "en" | "de" | "fr"; grade: string; onReveal?: (row: Row) => Promise<void> }): Promise<Row[]> {
  await page.addInitScript((o) => {
    localStorage.setItem("websuli.classroomGrade", o.grade);
    localStorage.setItem("websuli.wordladder.lang", o.lang);
  }, opts);
  await page.goto(`/games/word-ladder-hu-en?seed=11&wall=60&wlItems=${encodeURIComponent(ids.join(","))}`);
  await page.getByTestId("wl-start").click();
  const rows: Row[] = [];
  let lastId: string | number | null = null;
  const deadline = Date.now() + 200_000;
  let asked = 0;
  while (Date.now() < deadline && asked < ids.length + 6) {
    const p = await probe(page);
    if (p.questionOpen === 1 && p.questionId !== lastId && p.reveal === 0) {
      lastId = p.questionId;
      asked += 1;
      // Az élesítésig várunk (a fogás addig nem számít), a mérés a kész elrendezésen.
      await expect.poll(async () => { const q = await probe(page); return Number(q.clock) >= Number(q.armedAt); }, { timeout: 5_000 }).toBe(true);
      await page.waitForTimeout(150);
      const key = String(p.questionKey ?? "");
      const q = await measure(page);
      if (q) rows.push({ ...q, key, state: "kérdés" });
      const wrong = page.locator('[data-testid^="wl-option-"][data-correct="false"]:not([disabled])').first();
      if (await wrong.click({ timeout: 3_000 }).then(() => true, () => false)) {
        await expect(page.locator('[data-testid^="wl-option-"][data-state="correct"]').first()).toBeVisible({ timeout: 3_000 });
        await page.waitForTimeout(300);
        const r = await measure(page);
        if (r) {
          rows.push({ ...r, key, state: "megoldás" });
          await opts.onReveal?.({ ...r, key, state: "megoldás" });
        }
      }
    }
    await page.waitForTimeout(150);
  }
  return rows;
}

const keyOf = (id: string) => (id.startsWith("vocab:") ? `vocab:${id.split(":")[1]!.slice(0, 2)}:${id.split(":")[1]}` : `bank:word-ladder-hu-en:${id}`);

/**
 * Review #500 (Copilot): a `runItems` hiányzó kártyánál vagy sikertelen kattintásnál csendben kihagy méréseket. A geometriai
 * ellenőrzések ELŐTT minden kötelező tételre a kérdés- ÉS a megoldás-állapot mérési sora is meglegyen — mérés nélkül nincs zöld.
 */
function expectMeasured(rows: Row[], ids: string[], label: string) {
  for (const id of ids) {
    for (const state of ["kérdés", "megoldás"] as const) {
      expect(rows.some((r) => r.key === keyOf(id) && r.state === state), `${label}: mérve ${id} (${state})`).toBe(true);
    }
  }
}

/** Az elvárások: a szabályból (C-15). Szó: ≥ 1,6× a keretsor; mondat: ≥ 1,25× (helyhiánynál a kártya kicsinyedik, review K2);
 *  egy 360 px-en ki nem férő hosszú szó (review Ú3, `fit=width`): ≥ 1,25×, de szó közben nem törik. */
function check(rows: Row[], label: string) {
  for (const m of rows) {
    const at = `${label} ${m.state} ${m.key} „${m.text.slice(0, 40)}”`;
    expect(m.overHolds, `${at}: a kérdés-kártya fedi a fogásokat (alja ${m.cardBottom}, fogások ${m.holdsTop})`).toBe(false);
    expect(m.overHud, `${at}: a kérdés-kártya fedi a HUD-ot`).toBe(false);
    expect(m.clipped, `${at}: levágás`).toBe(false);
    // Review Ú2: ha a hosszú megoldás-sor helyhiány miatt rejtett, rövid jelzés látszik helyette (a gyerek nem marad szöveg nélkül).
    if (m.tight) expect(m.statusAfter, `${at}: a rejtett megoldás-sor helyén rövid jelzés`).not.toBe("");
    if (!m.text) continue;
    expect(m.frameFs, `${at}: keretsor betű`).toBeGreaterThanOrEqual(16);
    if (m.frameContrast !== null) expect(m.frameContrast, `${at}: keretsor kontraszt`).toBeGreaterThanOrEqual(4.5);
    expect(m.frameOpacity, `${at}: a keretsor nem halványított`).toBe(1);
    expect(m.fs / m.frameFs, `${at}: betűarány ${m.fs}/${m.frameFs}`).toBeGreaterThanOrEqual(m.kind === "word" && m.fit !== "width" ? 1.6 : 1.25);
    expect(m.contrast, `${at}: kontraszt`).toBeGreaterThanOrEqual(3);
    expect(m.overflowX, `${at}: vízszintesen kilóg`).toBe(false);
    expect(m.broken, `${at}: szó közben tör`).toEqual([]);
    if (m.blank) {
      expect(m.blank.w, "a hiány helye látható szélességű").toBeGreaterThanOrEqual(24);
      expect(m.blank.border, "a hiány vastag kerettel jelölt").toBeGreaterThanOrEqual(2);
    }
  }
}

function report(rows: Row[], label: string) {
  for (const m of rows) {
    console.log(`K2|${label}|${m.state}|${m.key}|${m.kind}|${m.fs}px|${m.fit}|kártya alja ${m.cardBottom}|fogások ${m.holdsTop}|rés ${m.gap}|fed ${m.overHolds}|vág ${m.clipped}|rejtett-megoldássor ${m.tight}`);
  }
}

for (const vp of VIEWS) {
  test(`SZ-5 célkártya @ ${vp.width}x${vp.height} (angol): betűarány, kontraszt, nincs kilógás / takarás / szó közbeni törés — a leghosszabb célszavakkal, kérdés- és megoldás-állapotban`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(vp);
    await stub(page);
    // Review Ú3: a leghosszabb kötőjel nélküli szódarabok is (az ellenőr listájából).
    const ids = [...longestItems(WORD_LADDER_EN, VOCAB_EN), "vocab:en4-family-006:phrase-meaning", "vocab:en4-health-016:phrase-meaning", "vocab:en4-nature-020:hu-to-target", "vocab:en2-school-003:hu-to-target"];
    const rows = await runItems(page, ids, { lang: "en", grade: "11" });
    report(rows, `en ${vp.width}x${vp.height}`);
    const keys = new Set(rows.filter((r) => r.text).map((r) => r.key));
    // Review A7: a kézi tételek (és a megnevezett szóbankos tételek) tűrés nélkül mérve.
    for (const id of ids) {
      if (!id.startsWith("vocab:") || id.startsWith("vocab:en4-")) expect(keys.has(keyOf(id)), `mérve: ${id}`).toBe(true);
    }
    // Review #500: a kötelező tételeknél a megoldás-állapot is (nem elég, hogy valamelyik állapot mérve van).
    expectMeasured(rows, ids.filter((id) => !id.startsWith("vocab:") || id.startsWith("vocab:en4-")), `en ${vp.width}x${vp.height}`);
    expect(keys.size, `mért célkártyák: ${[...keys].join(" | ")}`).toBeGreaterThanOrEqual(ids.length - 2);
    expect(rows.some((m) => m.blank), "hiányos mondatos típus is mérve").toBe(true);
    expect(rows.some((m) => m.state === "megoldás"), "megoldás-állapot is mérve").toBe(true);
    check(rows, "en");
  });

  test(`K2 célkártya @ ${vp.width}x${vp.height} (német és francia): a megnevezett hosszú tételek és a bankok leghosszabb célrészei, kérdés- és megoldás-állapotban`, async ({ page, browser }) => {
    test.setTimeout(400_000);
    await page.setViewportSize(vp);
    await stub(page);
    const named = ["de4-060", "vocab:de4-body-006:phrase-meaning", "vocab:de4-nature-014:phrase-meaning", "vocab:de4-nature-002:target-to-hu", "vocab:de4-technology-011:target-to-hu", "vocab:de4-communication-004:target-to-hu"];
    const de = [...new Set([...named, ...longestItems(WORD_LADDER_DE, VOCAB_DE, { cloze: false })])];
    const deRows = await runItems(page, [...new Set(de)], { lang: "de", grade: "11" });
    report(deRows, `de ${vp.width}x${vp.height}`);
    const deKeys = new Set(deRows.map((r) => r.key));
    for (const id of named) expect(deKeys.has(keyOf(id)), `mérve: ${id}`).toBe(true);
    // Review #500: a megnevezett tételeknél a kérdés- és a megoldás-állapot is.
    expectMeasured(deRows, named, `de ${vp.width}x${vp.height}`);
    // Review Ú4: darabszám-állítás — üres futás nem lehet zöld.
    expect(deKeys.size, `német célkártyák mérve: ${[...deKeys].join(" | ")}`).toBeGreaterThanOrEqual(de.length - 2);
    check(deRows, "de");
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, serviceWorkers: "block" });
    const fr = await ctx.newPage();
    await stub(fr);
    const frIds = longestItems(WORD_LADDER_FR, VOCAB_FR, { cloze: false });
    const frRows = await runItems(fr, frIds, { lang: "fr", grade: "11" });
    report(frRows, `fr ${vp.width}x${vp.height}`);
    expect(new Set(frRows.filter((r) => r.text).map((r) => r.key)).size, "francia célkártyák mérve").toBeGreaterThanOrEqual(frIds.length - 2);
    check(frRows, "fr");
    await ctx.close();
  });
}

/**
 * Review Ú1: hiba utáni kérdésnél (az előző hiba „Miért?” gombja még a kártya lábában) a kijelzés-tartalék nem foglalódhat
 * kétszer — ugyanaz a tétel ugyanakkora célkártya-betűvel jelenjen meg, mint rendes kérdésnél. Két menet ugyanazzal a
 * sorrenddel: (A) minden válasz helyes; (B) a töltelék-tételekre rossz válasz, a mért tételekre helyes.
 */
async function focusSizesAfter(page: Page, items: string[], fillers: string[], wrongFillers: boolean): Promise<Map<string, number>> {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "11");
    localStorage.setItem("websuli.wordladder.lang", "en");
  });
  const order = items.flatMap((id, i) => [fillers[i]!, id]);
  await page.goto(`/games/word-ladder-hu-en?seed=11&wall=60&wlItems=${encodeURIComponent(order.join(","))}`);
  await page.getByTestId("wl-start").click();
  const want = new Set(items.map(keyOf));
  const sizes = new Map<string, number>();
  let lastId: string | number | null = null;
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline && sizes.size < want.size) {
    const p = await probe(page);
    if (p.questionOpen === 1 && p.questionId !== lastId && p.reveal === 0) {
      lastId = p.questionId;
      await expect.poll(async () => { const q = await probe(page); return Number(q.clock) >= Number(q.armedAt); }, { timeout: 5_000 }).toBe(true);
      await page.waitForTimeout(250);
      const key = String(p.questionKey ?? "");
      const isItem = want.has(key);
      if (isItem) {
        const fs = await page.evaluate(() => {
          const f = document.querySelector<HTMLElement>('[data-testid="wl-prompt-focus"]');
          return f ? parseFloat(getComputedStyle(f).fontSize) : 0;
        });
        sizes.set(key, fs);
      }
      const correct = isItem || !wrongFillers;
      const opt = page.locator(`[data-testid^="wl-option-"][data-correct="${correct ? "true" : "false"}"]:not([disabled])`).first();
      await opt.click({ timeout: 3_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(150);
  }
  return sizes;
}

test("Ú1 @ 360x640: hiba utáni kérdésnél a célkártya betűje ugyanakkora, mint rendes kérdésnél (nincs kétszeres helyfoglalás)", async ({ browser }) => {
  test.setTimeout(400_000);
  const items = ["en4-052", "vocab:en4-health-023:phrase-meaning", "vocab:en4-time-004:cloze", "vocab:en4-family-006:phrase-meaning"];
  const fillers = ["en0-001", "en0-002", "en0-003", "en0-004"];
  const run = async (wrong: boolean) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await stub(page);
    const sizes = await focusSizesAfter(page, items, fillers, wrong);
    await ctx.close();
    return sizes;
  };
  const normal = await run(false);
  const afterError = await run(true);
  console.log(`Ú1|rendes ${JSON.stringify([...normal])}|hiba után ${JSON.stringify([...afterError])}`);
  expect(normal.size, "mind a négy tétel mérve (rendes)").toBe(items.length);
  expect(afterError.size, "mind a négy tétel mérve (hiba után)").toBe(items.length);
  for (const [key, fs] of normal) expect(afterError.get(key), `${key}: hiba után ${afterError.get(key)} px, rendesen ${fs} px`).toBe(fs);
});

/**
 * Review #498 R2 (Vercel): hosszú válaszoknál (`.wl-answers[data-long="true"]`) a tömör fogás-panel (`data-fit="2"`) stílusa is
 * érvényes legyen, és a kártya alsó biztonsági sávos, keskeny nézetben se fedje a fogásokat. 360×640, `--game-safe-bottom: 34px`
 * (iPhone-szerű alsó sáv), hosszú (mondatnyi) válaszos tételek, kérdés- és megoldás-állapot; képernyőkép a mérési mappába.
 */
test("R2 @ 360x640 alsó biztonsági sávval: hosszú válaszoknál is hat a tömör fogás-panel, a kártya nem fedi a fogásokat", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await stub(page);
  await page.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = ":root { --game-safe-bottom: 34px !important; }";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const ids = ["vocab:en4-family-006:phrase-meaning", "vocab:en4-health-016:phrase-meaning", "vocab:en4-health-023:phrase-meaning", "en4-052"];
  // A képernyőkép a javított esetről (hosszú válaszos, tömör panel, `en4-family-006` megoldás-állapot) a teszt KIMENETI
  // mappájába kerül (review #498-követés): követett repófájlt a teszt nem ír felül; a mérési mappába kézzel kerül.
  const shot = testInfo.outputPath("r2-360x640-also-sav.jpg");
  let shotTaken = false;
  const rows = await runItems(page, ids, {
    lang: "en",
    grade: "11",
    onReveal: async (row) => {
      if (!shotTaken && row.key === keyOf("vocab:en4-family-006:phrase-meaning") && row.holdsFit === "2") {
        await page.screenshot({ path: shot, type: "jpeg", quality: 70 });
        shotTaken = true;
      }
    },
  });
  report(rows, "R2 en 360x640 alsó sáv");
  expectMeasured(rows, ids, "R2");
  for (const m of rows.filter((r) => ids.map(keyOf).includes(r.key))) {
    expect(m.overHolds, `${m.state} ${m.key}: a kártya fedi a fogásokat (alja ${m.cardBottom}, fogások ${m.holdsTop})`).toBe(false);
    expect(m.clipped, `${m.state} ${m.key}: levágás`).toBe(false);
  }
  // A tömör panel stílusa hosszú válaszoknál is érvényes (a `data-long` szabály nem írja felül).
  const holdsFit = rows.filter((r) => r.holdsFit === "2");
  expect(holdsFit.length, "a tömör panel legalább egy mért állapotban életbe lépett").toBeGreaterThan(0);
  for (const m of holdsFit) expect(m.holdFont, `${m.state} ${m.key}: tömör panelen a fogás-felirat 16 px`).toBe(16);
  expect(shotTaken, "képernyőkép a javított esetről (en4-family-006, tömör panel, megoldás)").toBe(true);
  console.log(`R2|képernyőkép: ${shot}`);
});

test("SZ-2 / kapu 3(a): az óra csak ≥ 400 ms előjelzés után indul, a fogások addig nem élesek, az előjelzés alatti billentyű nem válasz", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto("/games/word-ladder-hu-en?seed=5&wall=60");
  await page.getByTestId("wl-start").click();
  // Lapon belül, képkockánként: a következő ÚJ kérdés megjelenésétől mérjük az élesítést és az óra indulását.
  const r = await page.evaluate(
    () =>
      new Promise<{ armedMs: number; timerMs: number; earlyKeyClock: number; armedAt: number; answeredAfterKey: number; sameQuestion: boolean }>((resolve, reject) => {
        const api = (window as unknown as { __websuliGame: Api }).__websuliGame;
        const startId = api.probe().questionId;
        let shownAt = -1;
        let qid: string | number | null = null;
        let armedMs = -1;
        let timerMs = -1;
        let earlyKeyClock = -1;
        let answeredAfterKey = -1;
        let sameQuestion = false;
        const t0 = performance.now();
        const tick = () => {
          const now = performance.now();
          if (now - t0 > 60_000) return reject(new Error("nincs új kérdés"));
          const root = document.querySelector<HTMLElement>('[data-testid="wl-question"][data-state="open"]');
          const id = root?.dataset.questionId ?? null;
          if (shownAt < 0 && id && id !== String(startId ?? "") && document.querySelectorAll('[data-testid^="wl-option-"]').length === 4) {
            shownAt = now;
            qid = id;
            // Azonnali (olvasás nélküli) „1” billentyű az előjelzés alatt.
            const before = Number(api.probe().questionsAnswered);
            earlyKeyClock = Number(api.probe().clock);
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
            setTimeout(() => {
              answeredAfterKey = Number(api.probe().questionsAnswered) - before;
              sameQuestion = String(api.probe().questionId) === qid;
            }, 120);
          }
          if (shownAt >= 0) {
            const enabled = document.querySelectorAll('[data-testid^="wl-option-"]:not([disabled])').length;
            if (armedMs < 0 && enabled > 0) armedMs = now - shownAt;
            const fill = document.querySelector<HTMLElement>(".play-question-timer-fill");
            const m = /scaleX\(([\d.]+)\)/u.exec(fill?.style.transform ?? "");
            if (timerMs < 0 && m && Number(m[1]) < 0.999) timerMs = now - shownAt;
            if (armedMs >= 0 && timerMs >= 0 && answeredAfterKey >= 0) {
              return resolve({ armedMs, timerMs, earlyKeyClock, armedAt: Number(api.probe().armedAt), answeredAfterKey, sameQuestion });
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(r.earlyKeyClock, "a billentyű az élesítés előtt ment").toBeLessThan(r.armedAt);
  expect(r.answeredAfterKey, "az előjelzés alatti billentyű nem válasz").toBe(0);
  expect(r.sameQuestion, "a kérdés nyitva maradt").toBe(true);
  expect(r.armedMs, `a fogások ${r.armedMs.toFixed(0)} ms után élesek`).toBeGreaterThanOrEqual(400);
  expect(r.timerMs, `az óra ${r.timerMs.toFixed(0)} ms után indul`).toBeGreaterThanOrEqual(400);
});

test("SZ-4: a tempó-választó működik (kezdőképernyő és szünet menü), és újratöltés után megmarad; alapérték Nyugodt", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto("/games/word-ladder-hu-en");
  const openSettings = async () => {
    if ((await page.locator("details.game-start-settings[open]").count()) === 0) await page.locator("details.game-start-settings > summary").click();
  };
  await expect(page.getByTestId("wl-menu-info")).toContainText("Tempó: Nyugodt");
  await openSettings();
  await expect(page.getByTestId("wl-tempo-calm")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("wl-tempo-normal").click();
  await expect(page.getByTestId("wl-tempo-normal")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("wl-tempo-calm")).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.getByTestId("wl-menu-info")).toContainText("Tempó: Normál");
  await openSettings();
  await expect(page.getByTestId("wl-tempo-normal")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("wl-start").click();
  await expect.poll(async () => (await probe(page)).tempo).toBe("normal");
  // Szünet menüben is váltható; a következő menet már az új tempóval indul.
  await page.keyboard.press("p");
  await expect(page.getByTestId("wl-tempo-picker")).toBeVisible();
  await page.getByTestId("wl-tempo-fast").click();
  await expect(page.getByTestId("wl-tempo-fast")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("websuli.wordladder.tempo"))).toBe("fast");
  await page.evaluate(() => (window as unknown as { __websuliGame: Api }).__websuliGame.forceState({ phase: "play" }));
  await expect.poll(async () => (await probe(page)).tempo).toBe("fast");
});

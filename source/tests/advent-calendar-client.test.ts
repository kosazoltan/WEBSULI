import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ADVENT_BUSY_FAILED_TEXT, ADVENT_BUSY_WAIT_MS, adventErrorText, isAdventBusy, retryWhenBusy } from "../client/src/advent/busy";
import { ADVENT_ART } from "../shared/advent/art-manifest";
import { ADVENT_ART_SPECS, ADVENT_DOOR_MOTIFS, doorArtId } from "../shared/advent/art";
import type { AdventDoorView, AdventState } from "../shared/advent/contract";
import { adventDateLabel, articleFor, daySuffix, nextDoorToOpen, roundIsOver } from "../shared/advent/home-card";
import { adventSummary, type DoorState } from "../shared/advent/rules";

/**
 * Adventi naptár — a naptároldal tiszta logikája és forrás-őrei: névelő / dátumrag, a soron következő ablak, képhelyek,
 * 2D-s könnyű kliens, az üzenet nincs újragépelve (docs/specs/2026-11-18-adventi-naptar.md 13.3, 13.7, 14.1; A8, A31, A40, A45).
 */
// A forrás-állítások LF-re normalizált szövegen futnak (a munkafa CRLF is lehet).
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

function stateOf(phase: AdventState["phase"], openDay: number, states: Partial<Record<number, DoorState>>, daysUntilStart = 0) {
  const doors: AdventDoorView[] = Array.from({ length: 24 }, (_, i) => {
    const day = i + 1;
    const fallback: DoorState = (phase === "open" || phase === "catchup") && day <= openDay ? "open" : "locked";
    return { day, state: states[day] ?? fallback, subject: null, repairsLeft: 0 };
  });
  const records = Object.fromEntries(doors.filter((d) => d.state === "solved" || d.state === "repairable" || d.state === "failed")
    .map((d) => [d.day, { attempts: d.state === "solved" ? [{ questionId: "q", pick: 0, correct: true, at: "" }] : Array.from({ length: d.state === "failed" ? 3 : 1 }, () => ({ questionId: "q", pick: 0, correct: false, at: "" })) }]));
  return { phase, openDay, daysUntilStart, doors, summary: adventSummary(records, 2) };
}
const solved = (days: number[]) => Object.fromEntries(days.map((d) => [d, "solved" as DoorState]));
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test("névelő és dátumrag: az 1., az 5., a 2.; 1-jén, 2-án, 4-én, 13-án, 20-án, 24-én", () => {
  assert.deepEqual([1, 2, 5, 11, 15, 24].map(articleFor), ["az", "a", "az", "a", "a", "a"]);
  const want: Record<number, string> = { 1: "-jén", 2: "-án", 3: "-án", 4: "-én", 5: "-én", 6: "-án", 7: "-én", 8: "-án", 9: "-én", 10: "-én", 11: "-én", 12: "-én", 13: "-án", 14: "-én", 15: "-én", 16: "-án", 17: "-én", 18: "-án", 19: "-én", 20: "-án", 21: "-én", 22: "-én", 23: "-án", 24: "-én" };
  for (let day = 1; day <= 24; day++) assert.equal(daySuffix(day), want[day], `december ${day}`);
});

test("a soron következő ablak: mai → legkorábbi nyitható → első javítható → nincs (terv 14.1, A45)", () => {
  assert.equal(nextDoorToOpen(stateOf("open", 5, solved([1, 2]))), 5, "a mai megválaszolatlan ablak az első");
  assert.equal(nextDoorToOpen(stateOf("open", 5, solved([1, 5]))), 2, "a mai megvan: a legkorábbi pótolható");
  assert.equal(nextDoorToOpen(stateOf("open", 5, { ...solved([1, 2, 4, 5]), 3: "repairable" })), 3, "csak javítható maradt");
  assert.equal(nextDoorToOpen(stateOf("open", 5, { ...solved([1, 2, 4, 5]), 3: "failed" })), null);
  assert.equal(nextDoorToOpen(stateOf("catchup", 24, solved(range(1, 22)))), 23);
  assert.equal(nextDoorToOpen(stateOf("teaser", 0, {})), null);
  assert.equal(nextDoorToOpen(stateOf("closed", 0, { 3: "repairable" })), null);
});

test("képhelyek: mind a 30 tételnek van mérete; a 24 ablak magyar alt szöveget és helyőrző jelet kap; a díszek alt-ja üres (A40)", () => {
  assert.equal(Object.keys(ADVENT_ART_SPECS).length, 30);
  assert.equal(ADVENT_DOOR_MOTIFS.length, 24);
  for (let day = 1; day <= 24; day++) {
    const spec = ADVENT_ART_SPECS[doorArtId(day)];
    assert.ok(spec, doorArtId(day));
    assert.deepEqual([spec.width, spec.height], [256, 256]);
    assert.ok(spec.alt.length > 3 && spec.alt.endsWith("."), `${day}. ablak alt`);
    assert.ok(spec.placeholder.length > 0, `${day}. ablak helyőrző`);
  }
  for (const id of ["advent-bg-portrait", "advent-bg-landscape", "advent-home-banner", "advent-garland", "advent-frame"]) assert.equal(ADVENT_ART_SPECS[id]!.alt, "", id);
  assert.deepEqual([ADVENT_ART_SPECS["advent-home-banner"]!.width, ADVENT_ART_SPECS["advent-home-banner"]!.height], [1600, 400]);
  for (const [id, spec] of Object.entries(ADVENT_ART_SPECS)) assert.ok(spec.width > 0 && spec.height > 0, id);
  // (A képgyártó készlet-leírójával — `design-assets/advent/prompts.json`, S3c-0 ág — való azonosító-egyezést az S3c teszteli,
  // ahol a két fájl már együtt van; ez a szelet a képgyártó ágtól függetlenül épül.)
  // A kész képek jegyzékében csak ismert azonosító lehet.
  for (const id of Object.keys(ADVENT_ART)) assert.ok(ADVENT_ART_SPECS[id], `ismeretlen kép a jegyzékben: ${id}`);
});

test("a naptár 2D és könnyű: nincs three.js, jelenet-import és képkocka-hurok a naptár kliensfájljaiban (A31)", () => {
  const files = ["client/src/pages/AdventCalendar.tsx", "client/src/advent/AdventArt.tsx", "client/src/advent/Snowfall.tsx", "client/src/advent/useAdvent.ts"];
  for (const file of files) {
    const text = read(file);
    assert.doesNotMatch(text, /from "three|game-engine\/scenes|@react-three/, `${file}: 3D-import`);
    assert.doesNotMatch(text, /requestAnimationFrame/, `${file}: képkocka-hurok`);
  }
  const css = read("client/src/advent/advent.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px/, "12 képpontnál kisebb betű");
});

test("a szó szerinti üzenet a kliensben csak a szerver állapotából jelenik meg — nincs újragépelve (A8)", () => {
  assert.doesNotMatch(read("client/src/pages/AdventCalendar.tsx"), /apukádhoz/);
});

test("429 („most sokan vagyunk”, pl. limit: new-row): egy újrapróba rövid várakozás után; más hiba azonnal megy tovább (S2b M1)", async () => {
  const busy = Object.assign(new Error("Túl sok új naptár erről a hálózatról — próbáld újra később."), { status: 429 });
  const other = Object.assign(new Error("Az évfolyam az első válasz után már nem módosítható."), { status: 409 });
  assert.equal(isAdventBusy(busy), true);
  assert.equal(isAdventBusy(other), false);
  assert.equal(isAdventBusy(new Error("hálózat")), false);
  assert.ok(ADVENT_BUSY_WAIT_MS >= 2000 && ADVENT_BUSY_WAIT_MS <= 8000, "rövid, de nem azonnali várakozás");

  // 1) Első hívás 429, a második sikerül: pontosan egy várakozás, a jelzés be-, majd kikapcsol.
  const log: string[] = [];
  let calls = 0;
  const ok = await retryWhenBusy(async () => { calls++; if (calls === 1) throw busy; return "kész"; },
    { onWait: (w) => log.push(w ? "vár" : "vége"), sleep: async (ms) => { log.push(`alszik ${ms}`); } });
  assert.equal(ok, "kész");
  assert.equal(calls, 2);
  assert.deepEqual(log, ["vár", `alszik ${ADVENT_BUSY_WAIT_MS}`, "vége"]);

  // 2) Kétszer 429: nincs harmadik próba, a hiba kimegy, a jelzés kikapcsol; a gyerek barátságos szöveget kap, nem a nyers üzenetet.
  calls = 0; log.length = 0;
  await assert.rejects(retryWhenBusy(async () => { calls++; throw busy; }, { onWait: (w) => log.push(w ? "vár" : "vége"), sleep: async () => {} }), (e) => e === busy);
  assert.equal(calls, 2);
  assert.deepEqual(log, ["vár", "vége"]);
  assert.equal(adventErrorText(busy, "alap"), ADVENT_BUSY_FAILED_TEXT);
  assert.doesNotMatch(ADVENT_BUSY_FAILED_TEXT, /hálózat|429|hiba/i);

  // 3) Más hiba: nincs várakozás, nincs újrapróba; a szerver üzenete marad.
  calls = 0; log.length = 0;
  await assert.rejects(retryWhenBusy(async () => { calls++; throw other; }, { onWait: (w) => log.push(w ? "vár" : "vége"), sleep: async () => { log.push("alszik"); } }), (e) => e === other);
  assert.equal(calls, 1);
  assert.deepEqual(log, []);
  assert.equal(adventErrorText(other, "alap"), other.message);
  assert.equal(adventErrorText("valami", "alap"), "alap");
});

test("a kör vége és az emberi dátum (S3 K3, kicsi leletek)", () => {
  const closing = (kind: string) => ({ closing: { kind, text: "" } }) as Parameters<typeof roundIsOver>[0];
  assert.deepEqual(["gift", "new-round", "done"].map((k) => roundIsOver(closing(k))), [true, true, true]);
  assert.deepEqual(["repair", "progress", "closed", "soon"].map((k) => roundIsOver(closing(k))), [false, false, false, false]);
  assert.equal(adventDateLabel("2026-12-24"), "2026. december 24.");
  assert.equal(adventDateLabel("2027-01-06"), "2027. január 6.");
  assert.equal(adventDateLabel("nem dátum"), "nem dátum");
});

test("a színváltozók a párbeszédablak gyökerén is élnek — a portál a .advent-page elemen KÍVÜL van (S3 B1)", () => {
  const css = read("client/src/advent/advent.css");
  const block = /([^{}]+)\{[^{}]*--advent-gold:/.exec(css);
  assert.ok(block, "van --advent-gold definíció");
  const selectors = block![1]!.split(",").map((x) => x.trim().split("\n").pop()!.trim());
  for (const root of [".advent-page", ".advent-dialog", ".advent-overlay"]) assert.ok(selectors.includes(root), root + " hiányzik a változók gyökerei közül: " + selectors.join(" | "));
  // Minden használt változónak van definíciója.
  const used = new Set([...css.matchAll(/var\((--advent-[a-z0-9-]+)/g)].map((m) => m[1]!).filter((name) => name !== "--advent-drift"));
  for (const name of used) assert.match(css, new RegExp(name + ":"), name + " nincs definiálva");
  // A párbeszédablakok valóban portálban vannak (ezért kell a fenti).
  assert.match(read("client/src/pages/AdventCalendar.tsx"), /<Dialog\.Portal>/);
});

test("hibaszöveg a gyereknek: nyers szerverválasz (HTML, JSON, angol hibanév, 5xx, időtúllépés) SOHA nem megy ki — csak a naptár saját magyar 4xx üzenete (vak ellenőr K1)", () => {
  const err = (message: string, status?: number) => Object.assign(new Error(message), status === undefined ? {} : { status });
  const fallback = "Most nem sikerült kinyitni az ablakot. Próbáld meg újra!";
  // A naptár saját üzenetei megmaradnak.
  assert.equal(adventErrorText(err("Ez az ablak még nem nyitható.", 403), fallback), "Ez az ablak még nem nyitható.");
  assert.equal(adventErrorText(err("Előbb add meg, hányadikos vagy.", 409), fallback), "Előbb add meg, hányadikos vagy.");
  // Minden más az alapszöveg.
  for (const [message, status] of [
    ["<html> <head><title>502 Bad Gateway</title></head> <body><center>cloudflare</center></body> </html>", 502],
    ["Internal Server Error", 500],
    ["relation \"advent_progress\" does not exist", 500],
    ["{\"error\":\"Forbidden\",\"code\":\"EBADTOKEN\"}", 403],
    ["Forbidden", 403],
    ["", 500],
    ["Service Unavailable", 503],
    ["x".repeat(400), 409],
    ["A kérés túllépte az időkorlátot (15s). Kérlek ellenőrizd az internetkapcsolatot!", undefined],
    ["Failed to fetch", undefined],
  ] as const) assert.equal(adventErrorText(err(message, status), fallback), fallback, String(status) + ": " + message.slice(0, 30));
  assert.equal(adventErrorText(null, fallback), fallback);
  assert.equal(adventErrorText({ status: 500 }, fallback), fallback);
});

test("kapcsoló KI mellett a fő csomagban nincs adventi kód és CSS, és a /adventi-naptar útvonal sem él (vak ellenőr K1, KICSI-5)", () => {
  // Statikusan csak a lusta (külön darabba kerülő) adventi modulok emelhetik be a kártyát, az oldalt és a CSS-t.
  const lazyOnly = /^import[^;]*["'](@\/components\/AdventHomeCard|@\/advent\/advent\.css|@\/pages\/AdventCalendar)["'];?$/m;
  const allowed = new Set(["client/src/components/AdventHomeCard.tsx", "client/src/pages/AdventCalendar.tsx"]);
  const walk = (dir: string): string[] => readdirSync(fileURLToPath(new URL(`../${dir}`, import.meta.url)), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(tsx?|css)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  const offenders = walk("client/src").filter((f) => !allowed.has(f) && !f.startsWith("client/src/advent/") && lazyOnly.test(read(f)));
  assert.deepEqual(offenders, [], "statikus adventi import a fő csomag felé");
  // A főoldal a kis helyfoglaló foglalatot emeli be; a kártya csak bekapcsolt build-kapcsolónál, lustán töltődik.
  const slot = read("client/src/components/AdventHomeSlot.tsx");
  assert.match(slot, /ADVENT_BUILD_FLAG \? lazy\(\(\) => import\("@\/components\/AdventHomeCard"\)\) : null/);
  assert.match(read("client/src/components/UserFileList.tsx"), /import AdventHomeSlot from "@\/components\/AdventHomeSlot";/);
  // Az útvonal is a build-kapcsolóhoz kötött: KI mellett nincs naptároldal (és így eszközazonosító-írás sem).
  const app = read("client/src/App.tsx");
  assert.match(app, /const AdventCalendar = ADVENT_BUILD_FLAG \? lazy\(\(\) => import\("@\/pages\/AdventCalendar"\)\) : null;/);
  assert.match(app, /\{AdventCalendar \? <Route path="\/adventi-naptar" component=\{AdventCalendar\} \/> : null\}/);
});

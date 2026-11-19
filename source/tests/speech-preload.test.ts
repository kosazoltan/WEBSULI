import assert from "node:assert/strict";
import test from "node:test";
import { chainVoiceOrder, nextSpeechStep, sizesFromManifest, speechPlan, ASSUMED_AUDIO_BYTES, FALLBACK_AUDIO_START_TIMEOUT_MS, type SpeechStep } from "../shared/speech-chain";
import {
  constrainedConnection, engineAfter, engineAfterRound, engineAged, engineSilent, failureActive, manifestRetryDelayMs, mergeStoredManifest, nextPreloads, preloadPlan, prioritized,
  readStoredManifest, retryDelayMs, voiceKey, voiceSkipped, NEGATIVE_VERDICT_TAPS, SPEECH_PRELOAD, STORED_MANIFEST_MAX_ENTRIES, UNKNOWN_ENGINE,
} from "../shared/speech-preload";
import type { RankableVoice } from "../shared/voice-rank";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8d: az előtöltés rendje és korlátai, a hangmotor munkamenet-szintű ismerete — tiszta logika.
const id = (n: number) => n.toString(16).padStart(32, "0");
const ids = (count: number) => Array.from({ length: count }, (_, i) => id(i + 1));
const sizesOf = (list: string[], size: number) => Object.fromEntries(list.map((key) => [key, size]));
const HAZEL: RankableVoice = { name: "Microsoft Hazel Desktop - English (Great Britain)", lang: "en-GB", localService: true };
const SONIA: RankableVoice = { name: "Microsoft Sonia Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false };
const ARIA: RankableVoice = { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false };
const WINDOWS = [HAZEL, ARIA, SONIA];

test("az előtöltés korlátai: 3 párhuzamos letöltés, 3,5 MB és 60 hangelem leckénként, szűk kapcsolaton az első 12 szöveg", () => {
  assert.deepEqual({ ...SPEECH_PRELOAD }, {
    concurrency: 3, maxBytes: 3.5 * 1024 * 1024, maxElements: 60, firstSectionTexts: 12, retryDelaysMs: [4000, 15_000],
    failureTtlMs: 60_000, manifestRefreshMs: 60_000, loadTimeoutMs: 20_000, manifestRetryMaxMs: 120_000, manifestRetries: 2,
  });
  assert.equal(manifestRetryDelayMs(900_000), 120_000, "a 15 perces Retry-After felső korlátja 2 perc");
  assert.equal(manifestRetryDelayMs(30_000), 30_000);
  assert.equal(manifestRetryDelayMs(1), 5000, "legalább 5 mp");
  for (const missing of [null, 0, -5, Number.NaN]) assert.equal(manifestRetryDelayMs(missing), 60_000, "Retry-After nélkül 1 perc");
});

test("előtöltési terv: a szószedet sorrendjében, csak a jegyzék szerint meglévő hang, ismétlés nélkül", () => {
  const lesson = ids(6);
  assert.deepEqual(preloadPlan({ ids: lesson, sizes: sizesOf(lesson, 20_000) }), lesson, "az első szakasz szavai elöl: a lecke sorrendje");
  assert.deepEqual(preloadPlan({ ids: lesson, sizes: sizesOf([id(5), id(2)], 20_000) }), [id(2), id(5)], "ami nincs a tárban, kimarad");
  assert.deepEqual(preloadPlan({ ids: [id(1), id(1), id(2)], sizes: sizesOf(ids(2), 1) }), [id(1), id(2)]);
  assert.deepEqual(preloadPlan({ ids: lesson, sizes: {} }), [], "üres tár: nincs előtöltés");
  assert.deepEqual(preloadPlan({ ids: lesson, sizes: { [id(1)]: 0, [id(2)]: -5, [id(3)]: Number.NaN, [id(4)]: 10 } }), [id(4)], "érvénytelen méretű hang kimarad");
});

test("mutáció: az összméret- és a darabszám-plafon pontosan a határig enged; a plafon fölötti rész nem töltődik elő", () => {
  const lesson = ids(200);
  const quarter = SPEECH_PRELOAD.maxBytes / 4;
  assert.equal(preloadPlan({ ids: lesson, sizes: sizesOf(lesson, quarter) }).length, 4, "négy negyed még belefér");
  assert.equal(preloadPlan({ ids: lesson, sizes: sizesOf(lesson, quarter + 1) }).length, 3, "egy bájttal nagyobb hangokból már csak három");
  assert.deepEqual(preloadPlan({ ids: lesson, sizes: sizesOf(lesson, 30_000) }), lesson.slice(0, 60), "100 tételes (200 szöveges) lecke: legfeljebb 60 hangelem");
  assert.equal(preloadPlan({ ids: lesson, sizes: sizesOf(lesson, 30_000) }).length * 30_000 <= SPEECH_PRELOAD.maxBytes, true);
  // Az első be nem férő hangnál megáll (a sorrend nem törik meg): a kis fájl a nagy mögül sem ugrik előre.
  const mixed = { [id(1)]: 3_000_000, [id(2)]: 1_000_000, [id(3)]: 10 };
  assert.deepEqual(preloadPlan({ ids: ids(3), sizes: mixed }), [id(1)]);
});

test("adatkímélő mód és lassú kapcsolat: csak az első szakasz (a lecke első 12 szövege) töltődik elő", () => {
  const lesson = ids(40);
  const sizes = sizesOf(lesson, 20_000);
  assert.deepEqual(preloadPlan({ ids: lesson, sizes, connection: { saveData: true } }), lesson.slice(0, 12));
  assert.deepEqual(preloadPlan({ ids: lesson, sizes, connection: { effectiveType: "2g" } }), lesson.slice(0, 12));
  assert.deepEqual(preloadPlan({ ids: lesson, sizes, connection: { effectiveType: "slow-2g" } }), lesson.slice(0, 12));
  assert.equal(preloadPlan({ ids: lesson, sizes, connection: { effectiveType: "3g" } }).length, 40);
  assert.equal(preloadPlan({ ids: lesson, sizes, connection: { effectiveType: "4g", saveData: false } }).length, 40);
  // Az első szakasz a LECKE első 12 szövege — ha azokhoz nincs hang, a későbbiek sem töltődnek elő helyettük.
  assert.deepEqual(preloadPlan({ ids: lesson, sizes: sizesOf(lesson.slice(20), 1), connection: { saveData: true } }), []);
  assert.equal(constrainedConnection(undefined), false);
  assert.equal(constrainedConnection({}), false);
});

test("a sor: legfeljebb 3 letöltés fut; a koppintott szó előre ugrik; hibánál visszatartásos újrapróba, legfeljebb kettő", () => {
  const queue = ids(6);
  assert.deepEqual(nextPreloads(queue, 0), queue.slice(0, 3));
  assert.deepEqual(nextPreloads(queue, 2), [id(1)]);
  assert.deepEqual(nextPreloads(queue, 3), []);
  assert.deepEqual(nextPreloads(queue, 7), []);
  assert.deepEqual(prioritized(queue, id(5)), [id(5), id(1), id(2), id(3), id(4), id(6)]);
  assert.deepEqual(prioritized(queue, id(99)), [id(99), ...queue], "a plafon fölötti (sorban nem lévő) szó is előre kerül");
  assert.equal(retryDelayMs(1), 4000);
  assert.equal(retryDelayMs(2), 15_000);
  assert.equal(retryDelayMs(3), null, "a harmadik hiba után nincs több próba");
  assert.equal(failureActive(null, 5000), false);
  assert.equal(failureActive(1000, 60_999), true, "a hiba 60 mp-ig tart");
  assert.equal(failureActive(1000, 61_000), false, "utána a szó újra próbálható — a 429 nem zár ki a munkamenet végéig");
});

test("hangmotor-ismeret valódi koppintásokból: a megszólalt hang igazolt; a negatív ítélet LEJÁR (2 koppintás), soha nem végleges", () => {
  assert.deepEqual(UNKNOWN_ENGINE, { verified: null, skip: {}, silentTaps: 0 });
  assert.equal(NEGATIVE_VERDICT_TAPS, 2);
  const sonia = voiceKey(SONIA), hazel = voiceKey(HAZEL);
  assert.notEqual(sonia, hazel);
  assert.equal(voiceKey(undefined), "");
  // Pozitív bizonyíték: a `start` esemény igazolja a hangot, és minden negatív ítéletét törli (a néma ítéletet is).
  assert.deepEqual(engineAfter(UNKNOWN_ENGINE, sonia, "started"), { verified: sonia, skip: {}, silentTaps: 0 });
  assert.deepEqual(engineAfter({ verified: null, skip: { [sonia]: 2, [hazel]: 1 }, silentTaps: 2 }, sonia, "started"), { verified: sonia, skip: { [hazel]: 1 }, silentTaps: 0 }, "az elindult hang törli a saját és a „néma motor” ítéletet");
  // Negatív ítélet: a kemény hiba és az esemény nélküli lejárat a hangot a következő 2 koppintásra kihagyja.
  const afterTimeout = engineAfter(UNKNOWN_ENGINE, sonia, "timeout");
  assert.deepEqual(afterTimeout, { verified: null, skip: { [sonia]: 2 }, silentTaps: 0 });
  assert.deepEqual(engineAfter(UNKNOWN_ENGINE, sonia, "error").skip, { [sonia]: 2 });
  assert.deepEqual(engineAfter({ verified: sonia, skip: {}, silentTaps: 0 }, sonia, "error"), { verified: null, skip: { [sonia]: 2 }, silentTaps: 0 }, "az igazolt hang későbbi bukása visszavonja az igazolást");
  assert.equal(engineAfter({ verified: hazel, skip: {}, silentTaps: 0 }, sonia, "error").verified, hazel, "más hang bukása az igazolt hangot nem érinti");
  assert.equal(voiceSkipped(afterTimeout, sonia), true);
  assert.equal(voiceSkipped(afterTimeout, hazel), false);
  // Lejárat: két koppintás után a hang újra próbálható.
  const once = engineAged(afterTimeout), twice = engineAged(once);
  assert.deepEqual([voiceSkipped(once, sonia), voiceSkipped(twice, sonia)], [true, false]);
  assert.deepEqual(twice, UNKNOWN_ENGINE);
  assert.equal(engineAged({ verified: sonia, skip: {}, silentTaps: 0 }).verified, sonia, "az igazolás nem jár le");
  // Néma motor: minden próbált hang esemény nélkül járt le — ez is csak 2 koppintásra szól.
  const silent = engineAfterRound(afterTimeout, ["timeout", "timeout"]);
  assert.equal(silent.silentTaps, 2);
  assert.deepEqual([engineSilent(silent), engineSilent(engineAged(silent)), engineSilent(engineAged(engineAged(silent)))], [true, true, false], "a harmadik koppintás újra megpróbálja a böngészőhangot");
  assert.equal(engineSilent(engineAfterRound(afterTimeout, ["timeout", "error"])), false, "hibaeseményt adó motor él — nem néma");
  assert.equal(engineSilent(engineAfterRound({ verified: hazel, skip: {}, silentTaps: 0 }, ["timeout", "timeout"])), false, "igazolt hang mellett nem néma");
  assert.equal(engineSilent(engineAfterRound(UNKNOWN_ENGINE, [])), false, "kimondás nélkül nincs ítélet");
});

const kinds = (steps: SpeechStep[]) => steps.map((s) => s.kind === "voice" ? `voice:${s.voiceIndex === null ? "lang" : WINDOWS[s.voiceIndex].name.split(" ")[1]}` : s.kind);
const plan = (over: Partial<Parameters<typeof speechPlan>[0]> = {}) => speechPlan({ language: "en-GB", voices: WINDOWS, synthAvailable: true, prepared: null, fallbackAvailable: true, ...over });
const SILENT = { verified: null, skip: {}, silentTaps: 2 };

test("a terv a munkamenet-ismerettel: igazolt hang előre, lejáró ítéletű hang kimarad, néma motornál nincs böngészőhang-lépés", () => {
  assert.deepEqual(kinds(plan()), ["voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  const hazelVerified = { verified: voiceKey(HAZEL), skip: { [voiceKey(SONIA)]: 2 }, silentTaps: 0 };
  assert.deepEqual(kinds(plan({ engine: hazelVerified })), ["voice:Hazel", "voice:Aria", "fallback"], "a néma hálózati hang most nem várat: az igazolt helyi hang szól azonnal");
  assert.deepEqual(chainVoiceOrder(WINDOWS, "en-GB", false, hazelVerified), [0, 1]);
  assert.deepEqual(kinds(plan({ engine: engineAged(engineAged(hazelVerified)) })), ["voice:Hazel", "voice:Sonia", "voice:Aria", "fallback"], "lejárat után a hálózati brit hang visszakerül a tervbe");
  assert.deepEqual(kinds(plan({ engine: { verified: voiceKey(ARIA), skip: {}, silentTaps: 0 } })), ["voice:Aria", "voice:Hazel", "voice:Sonia", "fallback"], "az igazolt hang az első, akkor is, ha nem a rangsor legjobbja");
  assert.deepEqual(kinds(plan({ engine: SILENT })), ["fallback"], "néma motor: a következő koppintás nem vár");
  assert.deepEqual(kinds(plan({ engine: engineAged(engineAged(SILENT)) })), ["voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"], "…de a néma ítélet is lejár");
  assert.deepEqual(kinds(plan({ engine: { verified: null, skip: Object.fromEntries(WINDOWS.map((v) => [voiceKey(v), 1])), silentTaps: 0 } })), ["fallback"], "minden hang ítélet alatt");
  assert.deepEqual(kinds(plan({ voices: [], engine: { verified: null, skip: { "": 1 }, silentTaps: 0 } })), ["fallback"], "üres listánál a „lang dönt” kimondás is kaphat ítéletet");
  assert.deepEqual(kinds(plan({ voices: [] })), ["voice:lang", "fallback"]);
});

test("a terv az előtöltéssel: kész hang elöl; nem kész hangnál a böngészőhang szól azonnal, böngészőhang híján kérésre töltődik", () => {
  const ready = { id: id(1), ready: true }, loading = { id: id(1), ready: false };
  assert.deepEqual(kinds(plan({ prepared: ready })), ["prepared", "voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  assert.deepEqual(kinds(plan({ prepared: loading })), ["voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"], "koppintás az előtöltés közben: nem vár a letöltésre");
  assert.deepEqual(kinds(plan({ prepared: loading, engine: SILENT })), ["prepared", "fallback"], "néma motor: az előre gyártott hang kérésre töltődik");
  assert.deepEqual(kinds(plan({ prepared: loading, synthAvailable: false })), ["prepared", "fallback"]);
  assert.deepEqual(kinds(plan({ prepared: ready, engine: SILENT })), ["prepared", "fallback"]);
  assert.equal(FALLBACK_AUDIO_START_TIMEOUT_MS, 8000);
});

test("megszakított / nem engedett kimondás után a lánc a böngészőhang-szakaszt átugorja: gyengébb hang nem szól a legjobb helyett", () => {
  const steps = plan({ prepared: { id: id(1), ready: true } });
  assert.deepEqual(kinds(steps), ["prepared", "voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  assert.deepEqual(nextSpeechStep(steps, 1, "failed"), { next: 2, exhausted: false }, "valódi hiba: a következő hang");
  assert.deepEqual(nextSpeechStep(steps, 1, "failed", { skipVoices: true }), { next: 4, exhausted: false }, "megszakítás / not-allowed: egyenesen a tartalék");
  assert.deepEqual(nextSpeechStep(steps, 0, "failed", { skipVoices: true }), { next: 4, exhausted: false });
  assert.deepEqual(nextSpeechStep(steps.slice(0, 4), 1, "failed", { skipVoices: true }), { next: null, exhausted: true }, "tartalék híján a lánc véget ér");
  assert.deepEqual(nextSpeechStep(steps, 1, "done", { skipVoices: true }), { next: null, exhausted: false });
});
test("a jegyzék méretei: csak a kért kulcsokra; méret nélküli (régi alakú) válasznál becsült érték", () => {
  assert.deepEqual(sizesFromManifest({ available: [id(1), id(2), id(9)], sizes: { [id(1)]: 500, [id(2)]: "sok", [id(9)]: 7 } }, [id(1), id(2)]), { [id(1)]: 500, [id(2)]: ASSUMED_AUDIO_BYTES });
  assert.deepEqual(sizesFromManifest({ available: [id(1)] }, [id(1)]), { [id(1)]: ASSUMED_AUDIO_BYTES });
  assert.deepEqual(sizesFromManifest({ sizes: { [id(1)]: 5 } }, [id(1)]), {}, "ami nincs az `available` listán, nem elérhető");
  assert.deepEqual(sizesFromManifest(null, [id(1)]), {});
});

test("a helyben megőrzött jegyzék: csak az aktuális hangverzió, csak érvényes kulcs és méret; a legrégebbi bejegyzések esnek ki", () => {
  const stored = mergeStoredManifest(null, "gb-1", { [id(1)]: 10 });
  assert.deepEqual(stored, { v: "gb-1", sizes: { [id(1)]: 10 } });
  assert.deepEqual(readStoredManifest(stored, "gb-1"), { [id(1)]: 10 });
  assert.deepEqual(readStoredManifest(stored, "gb-2"), {}, "hangcsere után a régi jegyzék érvénytelen");
  assert.deepEqual(mergeStoredManifest(stored, "gb-1", { [id(2)]: 20 }).sizes, { [id(1)]: 10, [id(2)]: 20 });
  assert.deepEqual(mergeStoredManifest(stored, "gb-2", { [id(2)]: 20 }).sizes, { [id(2)]: 20 });
  for (const junk of [undefined, "x", 5, [], { v: "gb-1" }, { v: "gb-1", sizes: "x" }]) assert.deepEqual(readStoredManifest(junk, "gb-1"), {}, JSON.stringify(junk));
  assert.deepEqual(readStoredManifest({ v: "gb-1", sizes: { [id(1)]: 10, "nem-kulcs": 5, [id(2)]: "x", [id(3)]: 0, __proto__x: 1 } }, "gb-1"), { [id(1)]: 10 });
  const many = sizesOf(ids(STORED_MANIFEST_MAX_ENTRIES + 5), 1);
  const capped = mergeStoredManifest(stored, "gb-1", many).sizes;
  assert.equal(Object.keys(capped).length, STORED_MANIFEST_MAX_ENTRIES);
  assert.equal(capped[id(STORED_MANIFEST_MAX_ENTRIES + 5)], 1, "a legfrissebb megmarad");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  availableFromManifest, chainVoiceOrder, hasLaterLocalVoice, nextSpeechStep, preparedAudioCandidate, rememberPreparedFailure, silenceBeforeFallbackMs,
  speechPlan, voicePhaseBudgetMs, voiceStepTimeoutMs, MAX_BROWSER_VOICE_ATTEMPTS, PREPARED_AUDIO_START_TIMEOUT_MS, type SpeechStep, type StepOutcome,
} from "../shared/speech-chain";
import { rankVoices, voiceLanguageKey, type RankableVoice } from "../shared/voice-rank";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8b-2 (E33; az S8a review K1 / K2 feltétele; S8b-2 review B1, J1–J3): a felolvasás lánca.
const ID = "7e7f2ba7194d719aa506cefd97009da4";
const HAZEL: RankableVoice = { name: "Microsoft Hazel Desktop - English (Great Britain)", lang: "en-GB", localService: true };
const SONIA: RankableVoice = { name: "Microsoft Sonia Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false };
const ARIA: RankableVoice = { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false };
const ZIRA: RankableVoice = { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US", localService: true };
const SZABOLCS: RankableVoice = { name: "Microsoft Szabolcs - Hungarian (Hungary)", lang: "hu-HU", localService: true };
const WINDOWS = [SZABOLCS, ZIRA, HAZEL, ARIA, SONIA];
const online = (name: string): RankableVoice => ({ name: `Microsoft ${name} Online (Natural) - English (United Kingdom)`, lang: "en-GB", localService: false });
/** A review B1 példája: Edge — két telepített helyi hang és öt hálózati brit hang. */
const EDGE = [HAZEL, { name: "Microsoft David Desktop - English (United States)", lang: "en-US", localService: true }, online("Libby"), online("Maisie"), online("Ryan"), online("Sonia"), online("Thomas")];
const CHROME: RankableVoice[] = [{ name: "Google UK English Female", lang: "en-GB", localService: false }, { name: "Google UK English Male", lang: "en-GB", localService: false }, HAZEL];
const ANDROID: RankableVoice[] = [{ name: "English United Kingdom", lang: "en_GB", localService: true }, { name: "English United States", lang: "en_US", localService: true }, { name: "English India", lang: "en_IN", localService: true }];
const plan = (over: Partial<Parameters<typeof speechPlan>[0]> = {}) => speechPlan({ language: "en-GB", voices: WINDOWS, synthAvailable: true, preparedId: ID, fallbackAvailable: true, ...over });
const kinds = (steps: SpeechStep[], voices: RankableVoice[] = WINDOWS) => steps.map((s) => s.kind === "voice" ? `voice:${s.voiceIndex === null ? "lang" : voices[s.voiceIndex]?.name.split(" ")[1]}` : s.kind);

test("a teljes lánc: előre gyártott hang → böngészőhangok (legfeljebb három) → szerveres tartalék", () => {
  assert.deepEqual(plan(), [{ kind: "prepared", id: ID }, { kind: "voice", voiceIndex: 4 }, { kind: "voice", voiceIndex: 2 }, { kind: "voice", voiceIndex: 3 }, { kind: "fallback" }]);
  assert.deepEqual(kinds(plan()), ["prepared", "voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  assert.equal(MAX_BROWSER_VOICE_ATTEMPTS, 3);
  assert.equal(plan().filter((s) => s.kind === "voice").length, 3, "a negyedik angol hang (Zira) már nem kerül sorra");
});

test("J1–J2: előre gyártott hang CSAK a jegyzék szerint elérhető kulcsra; jegyzék nélkül a lánc azonnal a böngészőhanggal indul", () => {
  assert.deepEqual(kinds(plan({ preparedId: null })), ["voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  assert.deepEqual(kinds(plan({ preparedId: undefined })), ["voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  const base = { languageSupported: true, id: ID, available: true, knownMissing: false };
  assert.equal(preparedAudioCandidate(base), ID);
  assert.equal(preparedAudioCandidate({ ...base, available: false }), null, "a jegyzék szerint nincs (vagy a jegyzék még nem jött meg / hibázott): nincs hangfájl-kérés");
  assert.equal(preparedAudioCandidate({ ...base, languageSupported: false }), null, "más nyelvű lecke");
  assert.equal(preparedAudioCandidate({ ...base, id: undefined }), null, "a kulcs még nincs kiszámolva");
  assert.equal(preparedAudioCandidate({ ...base, knownMissing: true }), null, "a munkamenetben már hibázott: nincs újabb kérés");
  // A jegyzék-válasz értelmezése: csak a kért, szöveges kulcsok; hibás alakú válasz üres.
  const other = "0".repeat(32);
  assert.deepEqual(availableFromManifest({ available: [ID, other, 5, null] }, [ID]), [ID]);
  for (const bad of [null, undefined, "x", [], { available: "all" }, { other: [ID] }, { available: { 0: ID } }]) assert.deepEqual(availableFromManifest(bad, [ID]), [], JSON.stringify(bad));
});

test("K1: az első böngészőhang hibája után a következő hang jön, a szerver (nem brit) hangja csak a legvégén", () => {
  const steps = plan();
  const walk = (outcomes: StepOutcome[]) => {
    const visited: string[] = [];
    let index: number | null = 0, exhausted = false;
    for (const outcome of outcomes) {
      if (index === null) break;
      visited.push(kinds(steps)[index]);
      ({ next: index, exhausted } = nextSpeechStep(steps, index, outcome));
    }
    return { visited, index, exhausted };
  };
  assert.deepEqual(walk(["done"]), { visited: ["prepared"], index: null, exhausted: false });
  assert.deepEqual(walk(["failed", "done"]), { visited: ["prepared", "voice:Sonia"], index: null, exhausted: false });
  assert.deepEqual(walk(["failed", "failed", "done"]).visited, ["prepared", "voice:Sonia", "voice:Hazel"]);
  assert.deepEqual(walk(["failed", "failed", "failed", "failed", "done"]).visited, ["prepared", "voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  assert.deepEqual(walk(["failed", "failed", "failed", "failed", "failed"]), { visited: ["prepared", "voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"], index: null, exhausted: true });
  assert.equal(steps.findIndex((s) => s.kind === "fallback"), steps.length - 1);
  assert.equal(nextSpeechStep(steps, 1, "failed").next, 2);
  assert.deepEqual(nextSpeechStep([], 0, "failed"), { next: null, exhausted: true });
});

// Review B1: tiltott hangszolgáltatású hálózaton a telepített helyi hang is sorra kerül — nem csak három hálózati hang.
test("B1: a próbált hangok között ott a legjobb TELEPÍTETT HELYI hang, másodikként; a rangsor legjobbja marad az első", () => {
  assert.deepEqual(rankVoices(EDGE, "en-GB").slice(0, 5).map((i) => EDGE[i].name.split(" ")[1]), ["Libby", "Maisie", "Ryan", "Sonia", "Thomas"], "a rangsor első öt helye hálózati");
  assert.deepEqual(kinds(plan({ voices: EDGE, preparedId: null }), EDGE), ["voice:Libby", "voice:Hazel", "voice:Maisie", "fallback"]);
  assert.deepEqual(kinds(plan({ voices: CHROME, preparedId: null }), CHROME), ["voice:UK", "voice:Hazel", "voice:UK", "fallback"]);
  assert.deepEqual(chainVoiceOrder(CHROME, "en-GB"), [0, 2, 1]);
  assert.deepEqual(chainVoiceOrder(ANDROID, "en-GB"), [0, 1, 2], "ha a legjobb hang helyi, a rangsor változatlan");
  const networkOnly = [online("Libby"), online("Maisie"), online("Ryan"), online("Sonia")];
  assert.deepEqual(chainVoiceOrder(networkOnly, "en-GB"), [0, 1, 2], "helyi hang híján a rangsor első három hangja");
});

test("K2: hálózat nélkül a helyi hangok a hálózatiak elé kerülnek (a rangsoruk megtartásával); hálózattal a rangsor dönt", () => {
  assert.deepEqual(chainVoiceOrder(WINDOWS, "en-GB").map((i) => WINDOWS[i]), [SONIA, HAZEL, ARIA]);
  assert.deepEqual(chainVoiceOrder(WINDOWS, "en-GB", true).map((i) => WINDOWS[i]), [HAZEL, ZIRA, SONIA]);
  assert.deepEqual(kinds(plan({ offline: true })), ["prepared", "voice:Hazel", "voice:Zira", "voice:Sonia", "fallback"]);
  assert.deepEqual(kinds(plan({ offline: false })), kinds(plan()));
  const unknown: RankableVoice[] = [{ name: "Android brit", lang: "en_GB" }, SONIA];
  assert.deepEqual(chainVoiceOrder(unknown, "en-GB", true), [0, 1], "jelzés nélküli hang helyinek számít");
});

// Review B1 (spec 2026-11-09-felolvasas-tartalek A2): a böngészőhang-szakasz ÖSSZESÍTETT csendkerete — hamis órával számolva.
test("B1: néma motornál a csend nem nő a próbált hangok számával — helyi első hangnál 3 mp, hálózatinál 6 mp a tartalékig", () => {
  const silent = (voices: RankableVoice[], preparedId: string | null = null) => silenceBeforeFallbackMs(plan({ voices, preparedId }), voices);
  assert.equal(silent(ANDROID), 3000, "három helyi hangot listázó néma motor: 3 mp (a javítás előtt 3 × 3 = 9 mp)");
  assert.equal(silent(EDGE), 6000, "Edge, tiltott hangszolgáltatás: 3 mp a hálózati, 3 mp a helyi hangra (a javítás előtt 3 × 6 = 18 mp)");
  assert.equal(silent(CHROME), 6000);
  assert.equal(silent([online("Libby"), online("Maisie")]), 6000, "csak hálózati hangok: az első a teljes 6 mp-et kapja, a második már nem nyújtja");
  assert.equal(silent([]), 3000, "üres hanglista (még tölt): egyetlen lépés, 3 mp");
  assert.equal(silent([SZABOLCS]), 0, "nincs angol hang: azonnal a tartalék");
  assert.equal(silent(EDGE, ID), 7500, "el nem induló előre gyártott hanggal együtt: 1,5 + 6 mp (a javítás előtt 19,5 mp)");
  assert.equal(silent(ANDROID, ID), 4500, "a javítás előtt 10,5 mp");
  // Lépésenként: a hálózati hang, amely után helyi jön, legfeljebb 3 mp-et kap; a keret elfogytával a további hang kimarad (0).
  assert.equal(voicePhaseBudgetMs(HAZEL), 3000);
  assert.equal(voicePhaseBudgetMs(SONIA), 6000);
  assert.equal(voicePhaseBudgetMs(undefined), 3000);
  assert.equal(voiceStepTimeoutMs({ budgetMs: 6000, elapsedMs: 0, network: true, laterLocalVoice: true }), 3000);
  assert.equal(voiceStepTimeoutMs({ budgetMs: 6000, elapsedMs: 0, network: true, laterLocalVoice: false }), 6000);
  assert.equal(voiceStepTimeoutMs({ budgetMs: 6000, elapsedMs: 3000, network: false, laterLocalVoice: false }), 3000);
  assert.equal(voiceStepTimeoutMs({ budgetMs: 6000, elapsedMs: 6000, network: true, laterLocalVoice: false }), 0, "a keret elfogyott: a hang nem próbálkozik");
  assert.equal(voiceStepTimeoutMs({ budgetMs: 3000, elapsedMs: 3500, network: false, laterLocalVoice: false }), 0);
  // Hibaeseménynél a következő hang azonnal jön: az eltelt idő kicsi, a helyi hang a keret szinte egészét megkapja.
  assert.equal(voiceStepTimeoutMs({ budgetMs: 6000, elapsedMs: 20, network: false, laterLocalVoice: false }), 5980);
  const edgePlan = plan({ voices: EDGE, preparedId: null });
  assert.equal(hasLaterLocalVoice(edgePlan, 0, EDGE), true);
  assert.equal(hasLaterLocalVoice(edgePlan, 1, EDGE), false, "a Hazel után már csak hálózati hang és a tartalék jön");
});

test("szélső esetek: üres hanglista (még tölt), nincs angol hang, nincs beszédmotor, nincs tartalék, más nyelv", () => {
  assert.deepEqual(plan({ voices: [] }), [{ kind: "prepared", id: ID }, { kind: "voice", voiceIndex: null }, { kind: "fallback" }], "üres lista: a `lang` dönt");
  assert.deepEqual(plan({ voices: [SZABOLCS] }), [{ kind: "prepared", id: ID }, { kind: "fallback" }], "van lista, de angol hang nincs: böngészőhang nem szól");
  assert.deepEqual(plan({ synthAvailable: false }), [{ kind: "prepared", id: ID }, { kind: "fallback" }]);
  assert.deepEqual(kinds(plan({ fallbackAvailable: false })), ["prepared", "voice:Sonia", "voice:Hazel", "voice:Aria"]);
  assert.deepEqual(plan({ preparedId: null, synthAvailable: false, fallbackAvailable: false }), [], "üres terv: a hívó azonnal hibát jelez");
  assert.deepEqual(speechPlan({ language: "de-DE", voices: WINDOWS, synthAvailable: true, preparedId: null, fallbackAvailable: true }), [{ kind: "fallback" }], "német lecke nem kap angol hangot");
});

test("J3: a munkamenetre csak a HIBA jegyződik meg (404 / 429 / hálózat); időtúllépés, lejátszási tiltás és megszakítás nem", () => {
  assert.equal(rememberPreparedFailure("error"), true);
  assert.equal(rememberPreparedFailure("timeout"), false, "egy lassú pillanat ne rontsa el a szót az egész munkamenetre");
  assert.equal(rememberPreparedFailure("not-allowed"), false, "a böngésző tiltása nem a hang hibája");
  assert.equal(rememberPreparedFailure("aborted"), false, "a tanuló megszakítása nem hiány");
  assert.equal(PREPARED_AUDIO_START_TIMEOUT_MS, 1500);
});

// S8a review K3 / K4 / K7 (kanban #150).
test("rangsor-pontosítások: altagos brit kód pontos régió; a névegyezés szóhatáros", () => {
  assert.equal(voiceLanguageKey("en-GB-x-rp"), "en-gb");
  assert.equal(voiceLanguageKey("en_GB_scotland"), "en-gb");
  assert.equal(voiceLanguageKey("en-scotland"), "en");
  assert.equal(voiceLanguageKey("es-419"), "es-419");
  assert.equal(voiceLanguageKey("EN"), "en");
  const subtags: RankableVoice[] = [{ name: "US", lang: "en-US" }, { name: "RP", lang: "en-GB-x-rp" }, { name: "Scots", lang: "en-GB-scotland" }];
  assert.deepEqual(rankVoices(subtags, "en-GB"), [1, 2, 0], "az altagos brit hang megelőzi az amerikait");
  // Szóhatár: a „Bryan” nem „Ryan”, a „Skate” nem „Kate”, az „Onlinee” nem „Online”.
  const names: RankableVoice[] = [{ name: "Bryan", lang: "en-GB", localService: true }, { name: "Skate Onlinee", lang: "en-GB", localService: true }, { name: "Ryan", lang: "en-GB", localService: true }, { name: "Voice (Online)", lang: "en-GB", localService: true }];
  assert.deepEqual(rankVoices(names, "en-GB"), [3, 2, 0, 1]);
});

// A lejátszó a tiszta láncot hajtja végre — forrásőr: a döntések nem másolódnak vissza a komponensbe.
test("forrásőr: a lejátszó a lánc függvényei szerint lép; a kattintáskezelő szinkron dönt, a jegyzék a lecke betöltésekor érkezik", () => {
  const source = readFileSync(new URL("../client/src/lesson-runtime/ExperienceSpeech.tsx", import.meta.url), "utf8");
  assert.match(source, /const plan = speechPlan\(\{/);
  assert.match(source, /nextSpeechStep\(plan, index, outcome\)/);
  assert.match(source, /preparedAudioCandidate\(\{ languageSupported: hasPreparedAudio\(language\), id, available: !!id && availablePrepared\.has\(id\), knownMissing: !!id && failedPrepared\.has\(id\) \}\)/);
  assert.match(source, /if \(failure && rememberPreparedFailure\(failure\)\) failedPrepared\.add\(id\);/);
  assert.match(source, /voicePhase \?\?= \{ startedAt: Date\.now\(\), budgetMs: voicePhaseBudgetMs\(voice\) \};/);
  assert.match(source, /voiceStepTimeoutMs\(\{ budgetMs: voicePhase\.budgetMs, elapsedMs: Date\.now\(\) - voicePhase\.startedAt, network: voice\?\.localService === false, laterLocalVoice: hasLaterLocalVoice\(plan, index, voices\) \}\)/);
  assert.match(source, /if \(startTimeoutMs <= 0\) \{ done\("failed"\); return \(\) => \{\}; \}/);
  assert.match(source, /for \(const id of availableFromManifest\(await response\.json\(\), ids\)\) availablePrepared\.add\(id\);/);
  assert.match(source, /audio\.preservesPitch = true;/);
  const speak = source.slice(source.indexOf("export function speakText("), source.indexOf("export function SpeakButton("));
  assert.doesNotMatch(speak, /\bawait\b|\.then\(|fetch\(/, "a kattintástól a lejátszás indításáig nincs aszinkron várakozás");
  const view = readFileSync(new URL("../client/src/lesson-runtime/LessonExperienceView.tsx", import.meta.url), "utf8");
  assert.match(view, /useEffect\(\(\) => \{ if \(e\.language\) prepareLessonSpeech\(e\.glossary\.flatMap\(entry => \[entry\.word, entry\.example\]\), e\.language\); \}, \[e\.language, e\.glossary\]\);/);
});

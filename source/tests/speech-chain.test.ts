import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  chainVoiceOrder, nextSpeechStep, preparedAudioCandidate, rememberPreparedFailure, speechPlan,
  MAX_BROWSER_VOICE_ATTEMPTS, PREPARED_AUDIO_START_TIMEOUT_MS, type SpeechStep, type StepOutcome,
} from "../shared/speech-chain";
import { rankVoices, voiceLanguageKey, type RankableVoice } from "../shared/voice-rank";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8b-2 (E33; az S8a review K1 / K2 feltétele): a felolvasás lánca — tiszta döntési logika.
const ID = "7e7f2ba7194d719aa506cefd97009da4";
const HAZEL: RankableVoice = { name: "Microsoft Hazel Desktop - English (Great Britain)", lang: "en-GB", localService: true };
const SONIA: RankableVoice = { name: "Microsoft Sonia Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false };
const ARIA: RankableVoice = { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false };
const ZIRA: RankableVoice = { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US", localService: true };
const SZABOLCS: RankableVoice = { name: "Microsoft Szabolcs - Hungarian (Hungary)", lang: "hu-HU", localService: true };
const WINDOWS = [SZABOLCS, ZIRA, HAZEL, ARIA, SONIA];
const plan = (over: Partial<Parameters<typeof speechPlan>[0]> = {}) => speechPlan({ language: "en-GB", voices: WINDOWS, synthAvailable: true, preparedId: ID, fallbackAvailable: true, ...over });
const kinds = (steps: SpeechStep[]) => steps.map((s) => s.kind === "voice" ? `voice:${s.voiceIndex === null ? "lang" : WINDOWS[s.voiceIndex]?.name.split(" ")[1]}` : s.kind);

test("a teljes lánc: előre gyártott hang → rangsorolt böngészőhangok (legfeljebb három) → szerveres tartalék", () => {
  assert.deepEqual(plan(), [{ kind: "prepared", id: ID }, { kind: "voice", voiceIndex: 4 }, { kind: "voice", voiceIndex: 2 }, { kind: "voice", voiceIndex: 3 }, { kind: "fallback" }]);
  assert.deepEqual(kinds(plan()), ["prepared", "voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  assert.equal(MAX_BROWSER_VOICE_ATTEMPTS, 3);
  assert.equal(plan().filter((s) => s.kind === "voice").length, 3, "a negyedik angol hang (Zira) már nem kerül sorra");
});

test("az előre gyártott hang csak akkor az első lépés, ha kérhető; a többi lépés sorrendje ettől nem változik", () => {
  assert.deepEqual(kinds(plan({ preparedId: null })), ["voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  assert.deepEqual(kinds(plan({ preparedId: undefined })), ["voice:Sonia", "voice:Hazel", "voice:Aria", "fallback"]);
  assert.equal(preparedAudioCandidate({ languageSupported: true, id: ID, knownMissing: false }), ID);
  assert.equal(preparedAudioCandidate({ languageSupported: false, id: ID, knownMissing: false }), null, "más nyelvű lecke: a lánc a böngészőhanggal indul");
  assert.equal(preparedAudioCandidate({ languageSupported: true, id: undefined, knownMissing: false }), null, "a kulcs még nincs kiszámolva");
  assert.equal(preparedAudioCandidate({ languageSupported: true, id: ID, knownMissing: true }), null, "a munkamenetben már hiányzott: nincs újabb kérés");
});

test("K1: az első böngészőhang hibája után a rangsor következő hangja jön, a szerver (nem brit) hangja csak a legvégén", () => {
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
  // A tartalék az utolsó, és minden böngészőhang megelőzi.
  assert.equal(steps.findIndex((s) => s.kind === "fallback"), steps.length - 1);
  assert.equal(nextSpeechStep(steps, 1, "failed").next, 2);
  assert.deepEqual(nextSpeechStep([], 0, "failed"), { next: null, exhausted: true });
});

test("K2: hálózat nélkül a telepített helyi brit hang a hálózati elé kerül (a rangsoruk megtartásával); hálózattal a rangsor dönt", () => {
  assert.deepEqual(chainVoiceOrder(WINDOWS, "en-GB"), rankVoices(WINDOWS, "en-GB"));
  assert.deepEqual(chainVoiceOrder(WINDOWS, "en-GB", true).map((i) => WINDOWS[i]), [HAZEL, ZIRA, SONIA, ARIA]);
  assert.deepEqual(kinds(plan({ offline: true })), ["prepared", "voice:Hazel", "voice:Zira", "voice:Sonia", "fallback"]);
  assert.deepEqual(kinds(plan({ offline: false })), kinds(plan()));
  const unknown: RankableVoice[] = [{ name: "Android brit", lang: "en_GB" }, SONIA];
  assert.deepEqual(chainVoiceOrder(unknown, "en-GB", true), [0, 1], "jelzés nélküli hang helyinek számít");
});

test("szélső esetek: üres hanglista (még tölt), nincs angol hang, nincs beszédmotor, nincs tartalék, más nyelv", () => {
  assert.deepEqual(plan({ voices: [] }), [{ kind: "prepared", id: ID }, { kind: "voice", voiceIndex: null }, { kind: "fallback" }], "üres lista: a `lang` dönt");
  assert.deepEqual(plan({ voices: [SZABOLCS] }), [{ kind: "prepared", id: ID }, { kind: "fallback" }], "van lista, de angol hang nincs: böngészőhang nem szól");
  assert.deepEqual(plan({ synthAvailable: false }), [{ kind: "prepared", id: ID }, { kind: "fallback" }]);
  assert.deepEqual(kinds(plan({ fallbackAvailable: false })), ["prepared", "voice:Sonia", "voice:Hazel", "voice:Aria"]);
  assert.deepEqual(plan({ preparedId: null, synthAvailable: false, fallbackAvailable: false }), [], "üres terv: a hívó azonnal hibát jelez");
  assert.deepEqual(speechPlan({ language: "de-DE", voices: WINDOWS, synthAvailable: true, preparedId: null, fallbackAvailable: true }), [{ kind: "fallback" }], "német lecke nem kap angol hangot");
});

test("mit jegyez meg a kliens hiányként: hiba (404 / 429 / hálózat) és időtúllépés igen; lejátszási tiltás és megszakítás nem", () => {
  assert.equal(rememberPreparedFailure("error"), true);
  assert.equal(rememberPreparedFailure("timeout"), true);
  assert.equal(rememberPreparedFailure("not-allowed"), false, "a böngésző tiltása nem a hang hibája");
  assert.equal(rememberPreparedFailure("aborted"), false, "a tanuló megszakítása nem hiány");
  assert.equal(PREPARED_AUDIO_START_TIMEOUT_MS, 1500);
  assert.ok(PREPARED_AUDIO_START_TIMEOUT_MS < 3000, "rövidebb, mint a böngészőhang indulási őre");
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
test("forrásőr: a lejátszó a `speechPlan` / `nextSpeechStep` szerint lép, és az előre gyártott hangot a gesztusban indítja", () => {
  const source = readFileSync(new URL("../client/src/lesson-runtime/ExperienceSpeech.tsx", import.meta.url), "utf8");
  assert.match(source, /const plan = speechPlan\(\{/);
  assert.match(source, /nextSpeechStep\(plan, index, outcome\)/);
  assert.match(source, /preparedAudioCandidate\(\{ languageSupported: hasPreparedAudio\(language\), id, knownMissing: !!id && missingPrepared\.has\(id\) \}\)/);
  assert.match(source, /if \(failure && rememberPreparedFailure\(failure\)\) missingPrepared\.add\(id\);/);
  assert.match(source, /useEffect\(\(\) => \{ prepareSpeech\(text, language\); \}, \[text, language\]\);/);
  assert.doesNotMatch(source, /await ttsAudioHash/, "a kattintáskezelőben nincs várakozás a lejátszás előtt");
  assert.match(source, /audio\.preservesPitch = true;/);
});

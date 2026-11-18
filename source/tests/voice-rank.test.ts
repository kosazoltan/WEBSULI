import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { KNOWN_BRITISH_VOICES, rankVoices, type RankableVoice } from "../shared/voice-rank";
import { hasVoiceFor } from "../shared/speech-fallback";
import { LESSON_HTML_SPEC_V74 } from "../server/ai/lesson-html-spec";

// Spec 2026-11-18-tananyag-gyartas-minoseg, S8a (E31, E32).
const HAZEL: RankableVoice = { name: "Microsoft Hazel Desktop - English (Great Britain)", lang: "en-GB", localService: true, default: true };
const SONIA: RankableVoice = { name: "Microsoft Sonia Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false };
const ARIA: RankableVoice = { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false };
const ZIRA: RankableVoice = { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US", localService: true };
const SZABOLCS: RankableVoice = { name: "Microsoft Szabolcs - Hungarian (Hungary)", lang: "hu-HU", localService: true };
const GOOGLE_UK: RankableVoice = { name: "Google UK English Female", lang: "en-GB", localService: false };
const WINDOWS = [SZABOLCS, ZIRA, HAZEL, ARIA, SONIA];
const names = (voices: RankableVoice[], language: string) => rankVoices(voices, language).map(i => voices[i].name);

test("Windows-szerű lista: a természetes brit hang az első, a gépies brit a második, amerikai hang csak utánuk", () => {
  assert.deepEqual(names(WINDOWS, "en-GB"), [SONIA.name, HAZEL.name, ARIA.name, ZIRA.name]);
  assert.equal(WINDOWS[rankVoices(WINDOWS, "en-GB")[0]], SONIA, "a böngésző sorrendje (Hazel előbb áll) nem dönt");
});

test("a teljes fokozatsor: minőségjelző > ismert brit név > hálózati > helyi > gépies helyi; pontos régió minden más előtt", () => {
  const plainNetwork: RankableVoice = { name: "British voice 3", lang: "en-GB", localService: false };
  const plainLocal: RankableVoice = { name: "English United Kingdom", lang: "en_GB", localService: true };
  const daniel: RankableVoice = { name: "Daniel", lang: "en-GB", localService: true };
  const list = [ARIA, HAZEL, plainLocal, plainNetwork, daniel, GOOGLE_UK, SONIA];
  assert.deepEqual(names(list, "en-GB"), [SONIA.name, GOOGLE_UK.name, daniel.name, plainNetwork.name, plainLocal.name, HAZEL.name, ARIA.name]);
});

test("csak amerikai hang → az amerikai (a természetes előre); üres lista → üres; más nyelvű hang nem kerül be", () => {
  assert.deepEqual(names([SZABOLCS, ZIRA, ARIA], "en-GB"), [ARIA.name, ZIRA.name]);
  assert.deepEqual(rankVoices([], "en-GB"), []);
  assert.deepEqual(rankVoices([SZABOLCS], "en-GB"), []);
  assert.deepEqual(rankVoices(WINDOWS, ""), []);
});

test("aláhúzásos és kisbetűs nyelvkód is egyezik (Android: en_GB); régió nélküli `en` hang azonos nyelvnek számít", () => {
  const android: RankableVoice[] = [{ name: "English United States", lang: "en_US" }, { name: "English", lang: "en" }, { name: "English United Kingdom", lang: "en_GB" }];
  assert.deepEqual(rankVoices(android, "en-GB"), [2, 0, 1]);
  assert.deepEqual(rankVoices(android, "en_gb"), [2, 0, 1]);
});

test("német lecke nem kap angol hangot; a brit névlista más nyelvre nem hat; azonos pontnál az eredeti sorrend", () => {
  const anna: RankableVoice = { name: "Anna", lang: "de-DE", localService: true };
  const katja: RankableVoice = { name: "Microsoft Katja Online (Natural) - German (Germany)", lang: "de-DE", localService: false };
  const danielAt: RankableVoice = { name: "Daniel", lang: "de-AT", localService: true };
  assert.deepEqual(names([SONIA, anna, danielAt, katja], "de-DE"), [katja.name, anna.name, danielAt.name]);
  assert.deepEqual(rankVoices([SONIA, HAZEL], "de-DE"), []);
  const twins: RankableVoice[] = [{ name: "A", lang: "en-GB" }, { name: "B", lang: "en-GB" }, { name: "C", lang: "en-GB" }];
  assert.deepEqual(rankVoices(twins, "en-GB"), [0, 1, 2]);
  // Az amerikai leckénél a „Daniel” (brit névlista) nem kap előnyt: csak a pontos régió és a minőségjelző dönt.
  assert.deepEqual(names([{ name: "Daniel", lang: "en-GB", localService: true }, ZIRA, ARIA], "en-US"), [ARIA.name, ZIRA.name, "Daniel"]);
});

// Mutációs ellenpróbák (0.6): az elrontott bemenet a várt irányba mozdítja a rangsort — a szabály egyetlen lába sem dísz.
test("mutáció: minőségjelző nélkül a természetes brit hang elveszti az elsőségét az ismert nevű hálózati hang mögött", () => {
  const stripped = { ...SONIA, name: "Microsoft Hang - English (United Kingdom)" };
  assert.deepEqual(names([stripped, GOOGLE_UK], "en-GB"), [GOOGLE_UK.name, stripped.name]);
  assert.deepEqual(names([SONIA, GOOGLE_UK], "en-GB"), [SONIA.name, GOOGLE_UK.name], "ellenpróba: jelzővel elöl marad");
});

test("mutáció: ha a brit hang régiója amerikaira romlik, a gépies brit hang mögé kerül (a régió erősebb a minőségnél)", () => {
  assert.deepEqual(names([{ ...SONIA, lang: "en-US" }, HAZEL], "en-GB"), [HAZEL.name, SONIA.name]);
});

test("mutáció: ha a brit hang kiesik a listából, amerikai lesz az első — a teszt ezt a romlást észreveszi", () => {
  const withoutBritish = WINDOWS.filter(v => v.lang !== "en-GB");
  const first = withoutBritish[rankVoices(withoutBritish, "en-GB")[0]];
  assert.equal(first, ARIA);
  assert.notEqual(first.lang, WINDOWS[rankVoices(WINDOWS, "en-GB")[0]].lang);
});

test("mutáció: a gépies jelző („Desktop”) a jelzés nélküli helyi hang mögé tesz; hálózati hang a helyi elé kerül", () => {
  const local: RankableVoice = { name: "Hang", lang: "en-GB", localService: true };
  assert.deepEqual(names([{ ...local, name: "Hang Desktop" }, local], "en-GB"), ["Hang", "Hang Desktop"]);
  assert.deepEqual(names([local, { ...local, name: "Halo", localService: false }], "en-GB"), ["Halo", "Hang"]);
  assert.deepEqual(names([local, { ...local, name: "Halo" }], "en-GB"), ["Hang", "Halo"], "ellenpróba: jelzés nélkül marad a sorrend");
});

test("az ismert brit hangnevek listája kisbetűs és ismétlés nélküli (az egyezés kisbetűs névvel történik)", () => {
  assert.ok(KNOWN_BRITISH_VOICES.length >= 5);
  assert.equal(new Set(KNOWN_BRITISH_VOICES).size, KNOWN_BRITISH_VOICES.length);
  for (const name of KNOWN_BRITISH_VOICES) assert.equal(name, name.toLowerCase());
});

// S8a 4. lépés, (b) ág — mérve 2026-11-09 (`en-GB`) és 2026-11-18 (`en-uk`): a szerveres tartalék nem fogad el brit kódot, ezért `en-GB`
// leckénél a kliens azonnal csak akkor megy a szerver (nem brit) hangjához, ha a böngészőben egyetlen angol hang sincs.
test("a szerveres tartalék azonnali hívása és a rangsor egybevág: van rangsorolt hang ⇔ a böngésző szól", () => {
  const lists: RankableVoice[][] = [WINDOWS, [SZABOLCS], [SZABOLCS, ZIRA], [{ name: "English", lang: "en" }], [{ name: "Android", lang: "en_GB" }], [{ name: "Anna", lang: "de-DE" }]];
  for (const list of lists) for (const language of ["en-GB", "de-DE", "hu-HU"]) {
    assert.equal(rankVoices(list, language).length > 0, hasVoiceFor(list, language), `${list.map(v => v.lang).join(",")} → ${language}`);
  }
  assert.equal(hasVoiceFor([SZABOLCS], "en-GB"), false, "egyetlen angol hang sincs → azonnal a szerver hangja");
  assert.equal(names([SZABOLCS, ZIRA], "en-GB")[0], ZIRA.name, "amerikai hang is jobb a szerver hangjánál: a böngésző szól");
  assert.deepEqual(rankVoices([], "en-GB"), []);
  assert.equal(hasVoiceFor([], "en-GB"), true, "üres lista: még tölt — a böngésző a `lang` szerint próbálkozik");
});

// E32 + S8a 3. lépés: a HTML-leckék előírásának beágyazott (önálló) kódja — a mintakódot valóban lefuttatjuk.
function runSpecSpeak(voices: RankableVoice[], lang?: string) {
  const code = /```javascript\n(var ttsRate[\s\S]*?)```/.exec(LESSON_HTML_SPEC_V74)?.[1];
  assert.ok(code, "a TTS-mintakód megvan az előírásban");
  const spoken: Array<{ lang: string; rate: number; pitch?: number; voice?: RankableVoice }> = [];
  class SpeechSynthesisUtterance { lang = ""; rate = 1; pitch?: number; voice?: RankableVoice; constructor(public text: string) {} }
  const window = { speechSynthesis: { cancel() {}, getVoices: () => voices, speak: (u: SpeechSynthesisUtterance) => { spoken.push(u); } } };
  runInNewContext(`${code}\nspeak("apple"${lang ? `, ${JSON.stringify(lang)}` : ""});`, { window, SpeechSynthesisUtterance });
  assert.equal(spoken.length, 1);
  return spoken[0];
}

test("HTML-előírás: nincs hangmagasság-állítás; a mintakód a természetes brit hangot választja, annak híján azonos nyelvűt", () => {
  assert.doesNotMatch(LESSON_HTML_SPEC_V74, /pitch/i);
  const british = runSpecSpeak(WINDOWS);
  assert.equal(british.lang, "en-GB");
  assert.equal(british.pitch, undefined, "természetes hangmagasság");
  assert.equal(british.rate, 0.85);
  assert.equal(british.voice, SONIA);
  assert.equal(runSpecSpeak([SZABOLCS, HAZEL, ZIRA, ARIA]).voice, HAZEL, "pontos régió a természetes amerikai előtt");
  assert.equal(runSpecSpeak([SZABOLCS, ZIRA, ARIA]).voice, ARIA, "brit hang híján azonos nyelvű, a természetes előre");
  assert.equal(runSpecSpeak([SZABOLCS, { name: "Android", lang: "en_GB" }]).voice?.name, "Android");
  assert.equal(runSpecSpeak([SZABOLCS]).voice, undefined, "más nyelvű hangot nem választ: a `lang` dönt");
  assert.equal(runSpecSpeak([SONIA, { name: "Anna", lang: "de-DE" }], "de-DE").voice?.name, "Anna");
  assert.equal(runSpecSpeak([]).voice, undefined);
});

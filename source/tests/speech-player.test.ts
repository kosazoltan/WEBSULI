import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createSpeechPlayer, type AudioLike, type SpeechEnv, type SynthLike, type UtteranceLike, type VoiceLike } from "../client/src/lesson-runtime/speech-player";
import { voiceKey, UNKNOWN_ENGINE } from "../shared/speech-preload";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8d: a lejátszó BEKÖTÉSE ál-órával és ál-környezettel (hangelem, beszédmotor, jegyzék).
// A valódi `createSpeechPlayer` fut; a böngésző felületeit a teszt adja, az időt a teszt lépteti.
const SONIA: VoiceLike = { name: "Microsoft Sonia Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false };
const HAZEL: VoiceLike = { name: "Microsoft Hazel Desktop - English (Great Britain)", lang: "en-GB", localService: true };
const ZIRA: VoiceLike = { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US", localService: true };
const hashOf = (text: string, language: string) => createHash("md5").update(`${language}\n${text}`).digest("hex");
const pathOf = (text: string) => `/api/tts/lesson-audio/${hashOf(text, "en-GB")}`;
const words = (count: number) => Array.from({ length: count }, (_, i) => `word ${i + 1}`);

type FakeAudio = AudioLike & { plays: number; pauses: number; loads: number; paused: boolean; playResult: () => Promise<void>; released: boolean };
type FakeUtterance = UtteranceLike & { text: string };
function harness(options: { voices?: VoiceLike[]; manifest?: "all" | "none" | ((keys: string[]) => unknown); synth?: boolean; connection?: { saveData?: boolean; effectiveType?: string; online?: boolean } } = {}) {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const audios: FakeAudio[] = [];
  const spoken: FakeUtterance[] = [];
  const idle: Array<() => void> = [];
  const live: FakeUtterance[] = [];
  const state = { cancels: 0, timerEarlyMs: 0, activated: true, retryAfterMs: null as number | null, signals: [] as AbortSignal[], manifestCalls: [] as string[], manifestMode: options.manifest ?? "all" as "all" | "none" | "reject" | "limited" | ((keys: string[]) => unknown), connection: { online: true, ...options.connection } as { saveData?: boolean; effectiveType?: string; online: boolean }, stored: null as unknown, voices: options.voices ?? [HAZEL, ZIRA, SONIA], size: 20_000 };
  // Az ál-motor a valódi szabályokat utánozza: felhasználói aktiváció nélkül `not-allowed` hibaeseményt ad; a kimondás a közös
  // beszédsorba kerül (`speaking`), amelyet a `cancel()` ürít — így látszik, ha a lejátszó idegen kimondást szakít meg.
  const synth: SynthLike = {
    speaking: false, pending: false, getVoices: () => state.voices,
    speak(utterance) {
      spoken.push(utterance as FakeUtterance);
      if (!state.activated) { utterance.onerror?.({ error: "not-allowed" }); return; }
      synth.speaking = true;
      live.push(utterance as FakeUtterance);
    },
    // A valódi motorok a megszakított kimondásnak hibaeseményt küldenek (`interrupted` / `canceled`).
    cancel() { state.cancels += 1; synth.speaking = false; synth.pending = false; for (const utterance of live.splice(0)) utterance.onerror?.({ error: "interrupted" }); },
  };
  const env: SpeechEnv = {
    now: () => now,
    setTimeout: (callback, ms) => { const handle = nextTimer++; timers.set(handle, { at: now + ms, callback }); return handle; },
    clearTimeout: (handle) => { if (typeof handle === "number") timers.delete(handle); },
    idle: (callback) => { idle.push(callback); },
    createAudio: () => {
      const audio: FakeAudio = {
        src: "", preload: "", playbackRate: 1, preservesPitch: false, currentTime: 7, plays: 0, pauses: 0, loads: 0, paused: true, released: false,
        playResult: () => Promise.resolve(),
        play() { audio.plays += 1; audio.paused = false; return audio.playResult(); },
        pause() { audio.pauses += 1; audio.paused = true; },
        load() { audio.loads += 1; },
        removeAttribute(name) { if (name === "src") { audio.src = ""; audio.released = true; } },
        oncanplaythrough: null, onerror: null, onplaying: null,
      };
      audios.push(audio);
      return audio;
    },
    synth: () => options.synth === false ? undefined : synth,
    createUtterance: (text) => options.synth === false ? undefined : { text, lang: "", rate: 1, volume: 1, voice: null, onstart: null, onboundary: null, onend: null, onerror: null } as FakeUtterance,
    hash: async (text, language) => hashOf(text, language),
    fetchManifest: async (url, signal) => {
      state.manifestCalls.push(url);
      state.signals.push(signal);
      const keys = new URL(url, "http://x").searchParams.get("keys")!.split(",");
      if (state.manifestMode === "reject") throw new Error("offline");
      if (state.manifestMode === "limited") return { ok: false as const, retryAfterMs: state.retryAfterMs };
      if (signal.aborted) throw new Error("aborted");
      if (typeof state.manifestMode === "function") return { ok: true as const, body: await state.manifestMode(keys) };
      const available = state.manifestMode === "all" ? keys : [];
      return { ok: true as const, body: { available, sizes: Object.fromEntries(available.map((key) => [key, state.size])) } };
    },
    connection: () => state.connection,
    storage: { read: () => state.stored, write: (value) => { state.stored = value; } },
  };
  const player = createSpeechPlayer(env);
  /** A függő ígéretek (lenyomat, jegyzék) lefutása. */
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };
  const runIdle = () => { for (const callback of idle.splice(0)) callback(); };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]);
      // `timerEarlyMs`: a böngésző időzítője a tört ezredmásodperces órához képest a határidő ELŐTT is lejárhat.
      now = Math.max(now, due[1].at - state.timerEarlyMs);
      due[1].callback();
    }
    now = end;
  };
  /** Lecke megnyitása a jegyzék megérkezéséig és az üresjárati ütemezésig. */
  const open = async (texts: string[], language = "en-GB") => { player.prepareLesson(texts, language); await settle(); runIdle(); };
  const loading = () => { const ids = new Set(player.inspect().entries.filter((item) => item.state === "loading").map((item) => item.id)); return audios.filter((audio) => !audio.released && ids.has(audio.src.split("/").pop() ?? "")); };
  const audioFor = (text: string) => [...audios].reverse().find((audio) => audio.src === pathOf(text));
  const ready = (text: string) => { const audio = audioFor(text); assert.ok(audio?.oncanplaythrough, `nincs töltődő hangelem: ${text}`); audio.oncanplaythrough(); return audio; };
  const errors: string[] = [];
  const say = (text: string, rate = 0.85, language = "en-GB") => player.speak(text, language, rate, () => errors.push(text));
  const entry = (text: string) => player.inspect().entries.find((item) => item.id === hashOf(text, "en-GB"));
  return { player, env, state, audios, spoken, synth, timers, advance, settle, runIdle, open, loading, audioFor, ready, say, errors, entry, now: () => now };
}

test("megnyitáskor: egy jegyzék-kérés, majd előtöltés üresjáratban, legfeljebb 3 párhuzamos letöltéssel, a szószedet sorrendjében", async () => {
  const h = harness();
  const texts = words(8);
  h.player.prepareLesson(texts, "en-GB");
  await h.settle();
  assert.equal(h.state.manifestCalls.length, 1);
  assert.equal(h.audios.length, 0, "a letöltés nem a megjelenítés útjában indul: üresjáratra vár");
  h.runIdle();
  assert.deepEqual(h.audios.map((audio) => audio.src), texts.slice(0, 3).map(pathOf));
  assert.ok(h.audios.every((audio) => audio.preload === "auto" && audio.plays === 0), "pufferel, nem játszik");
  h.ready("word 1");
  assert.deepEqual(h.audios.map((audio) => audio.src), texts.slice(0, 4).map(pathOf), "felszabadult hely → a következő szó");
  for (const text of texts.slice(1)) h.ready(text);
  assert.equal(h.audios.length, 8);
  assert.ok(h.player.inspect().entries.every((item) => item.state === "ready"));
  assert.equal(h.spoken.length, 0);
});

test("koppintás előtöltött hangra: a pufferelt elem AZONNAL, szinkron indul — új hangelem, hálózati kör és böngészőhang nélkül", async () => {
  const h = harness();
  await h.open(words(2));
  const audio = h.ready("word 1");
  h.ready("word 2");
  const before = h.audios.length;
  h.say("word 1", 0.65);
  assert.equal(audio.plays, 1, "a lejátszás a koppintás hívásán belül indult");
  assert.equal(h.audios.length, before, "nem készült új hangelem (nincs hálózati kör)");
  assert.deepEqual([audio.playbackRate, audio.preservesPitch, audio.currentTime], [0.65, true, 0], "a csúszka sebessége, hangmagasság-tartással, az elejéről");
  assert.equal(h.spoken.length, 0);
  audio.onplaying?.();
  h.advance(10_000);
  assert.deepEqual(h.errors, []);
  assert.equal(h.spoken.length, 0, "a megszólalt hang után egyik őr sem indít mást");
  // Újrajátszás ugyanarról az elemről.
  audio.currentTime = 3;
  h.say("word 1");
  assert.deepEqual([audio.plays, audio.currentTime, audio.playbackRate], [2, 0, 0.85]);
});

test("koppintás az előtöltés KÖZBEN: a böngészőhang szól azonnal, a szó előre ugrik a sorban, és a később megérkező letöltés nem szólal meg", async () => {
  const h = harness();
  const texts = words(8);
  await h.open(texts);
  assert.equal(h.loading().length, 3);
  h.say("word 7");
  assert.equal(h.spoken.length, 1, "nem vár a sor végéig: a böngészőhang a koppintásban indul");
  assert.equal(h.spoken[0].text, "word 7");
  assert.equal(h.spoken[0].voice, SONIA);
  assert.equal(h.player.inspect().pending[0], hashOf("word 7", "en-GB"), "a koppintott szó a sor elejére került");
  h.spoken[0].onstart?.();
  h.spoken[0].onend?.();
  h.ready("word 1");
  const seventh = h.audioFor("word 7");
  assert.ok(seventh, "a felszabadult helyen a koppintott szó töltődik");
  seventh.oncanplaythrough?.();
  assert.equal(seventh.plays, 0, "a megérkezett letöltés magától nem szólal meg — egy koppintásra egy hang");
  h.advance(10_000);
  assert.equal(h.spoken.length, 1);
  h.say("word 7");
  assert.equal(seventh.plays, 1, "a következő koppintásra már a pufferelt hang szól");
  assert.equal(h.spoken.length, 1);
});

test("plafon fölötti szó: nem töltődik elő; koppintásra a böngészőhang szól, a hang kérésre töltődik", async () => {
  const h = harness();
  h.state.size = 1_500_000;
  const texts = words(5);
  await h.open(texts);
  assert.deepEqual(h.player.inspect().entries.map((item) => item.id), texts.slice(0, 2).map((text) => hashOf(text, "en-GB")), "3,5 MB-ba két 1,5 MB-os hang fér");
  h.ready("word 1"); h.ready("word 2");
  assert.equal(h.audios.length, 2);
  h.say("word 5");
  assert.equal(h.spoken.length, 1);
  assert.equal(h.audioFor("word 5")?.preload, "auto", "a koppintás elindította a letöltést");
  h.spoken[0].onstart?.(); h.spoken[0].onend?.();
  h.ready("word 5");
  h.say("word 5");
  assert.equal(h.audioFor("word 5")?.plays, 1);
});

test("hibás letöltés: visszatartásos újrapróba (4 mp, 15 mp), utána a szó 60 mp-ig nem elérhető — a koppintás szinkron a böngészőhangra megy", async () => {
  const h = harness();
  await h.open(["word 1"]);
  const first = h.audioFor("word 1")!;
  first.onerror?.();
  assert.equal(first.released, true, "a hibás elem felszabadul");
  assert.equal(h.entry("word 1")?.state, "waiting");
  h.advance(3999);
  assert.equal(h.audios.length, 1);
  h.advance(1);
  assert.equal(h.audios.length, 2, "4 mp után első újrapróba");
  h.audios[1].onerror?.();
  h.advance(14_999);
  assert.equal(h.audios.length, 2);
  h.advance(1);
  assert.equal(h.audios.length, 3, "15 mp után második újrapróba");
  h.audios[2].onerror?.();
  assert.equal(h.entry("word 1")?.state, "failed");
  h.advance(30_000);
  assert.equal(h.audios.length, 3, "nincs több automatikus próba");
  // K3: a hiba már megnyitáskor kiderült — koppintáskor az előre gyártott lépés nincs a tervben, a böngészőhang a gesztusban szól.
  h.say("word 1");
  assert.equal(h.spoken.length, 1);
  assert.equal(h.audios.length, 3, "a lejáratig nem megy újabb kérés");
  h.spoken[0].onstart?.(); h.spoken[0].onend?.();
  // K5: a hiba nem zárja ki a szót a munkamenet végéig — 60 mp után a koppintás újra megpróbálja.
  h.advance(30_001);
  h.say("word 1");
  assert.equal(h.spoken.length, 2, "most még a böngészőhang szól");
  assert.equal(h.audios.length, 4, "…és a hang újra töltődik");
  h.audios[3].oncanplaythrough?.();
  assert.equal(h.entry("word 1")?.state, "ready");
});

test("lógó letöltés: 20 mp után hibának számít (újrapróba), a sor nem akad meg rajta", async () => {
  const h = harness();
  await h.open(words(5));
  h.advance(20_000);
  assert.deepEqual(h.player.inspect().entries.slice(0, 3).map((item) => item.state), ["waiting", "waiting", "waiting"]);
  assert.equal(h.loading().length, 2, "a felszabadult helyeken a következő szavak töltődnek");
});

test("leckeváltás futó előtöltés közben: a letöltések megszakadnak, az elemek felszabadulnak, a régi lecke hangja nem szólalhat meg", async () => {
  const h = harness();
  await h.open(words(6));
  const old = [...h.audios];
  const first = old[0];
  const lateReady = first.oncanplaythrough;
  h.ready("word 2");
  h.say("word 2");
  assert.equal(h.audioFor("word 2")?.plays, 1);
  h.player.prepareLesson(["other 1", "other 2"], "en-GB");
  assert.ok(old.every((audio) => audio.released && audio.loads >= 1 && audio.oncanplaythrough === null && audio.paused), "megszakítva és felszabadítva");
  assert.deepEqual(h.player.inspect().entries, []);
  lateReady?.();
  await h.settle(); h.runIdle();
  assert.deepEqual(h.loading().map((audio) => audio.src), ["other 1", "other 2"].map(pathOf));
  h.advance(60_000);
  assert.ok(old.every((audio) => audio.plays <= 1), "a régi lecke elemei nem indulnak újra");
  // A lecke elhagyása: minden felszabadul, függő letöltés és időzítő nem marad.
  h.player.release();
  assert.ok(h.audios.every((audio) => audio.released));
  assert.equal(h.timers.size, 0, "elárvult időzítő nincs");
  assert.equal(h.player.inspect().lessonLanguage, null);
});

test("leckeváltás a jegyzék megérkezése ELŐTT: a régi lecke késve érkező jegyzéke nem indít letöltést", async () => {
  const h = harness();
  let release: (value: unknown) => void = () => {};
  h.state.manifestMode = (keys) => new Promise((resolve) => { release = () => resolve({ available: keys, sizes: Object.fromEntries(keys.map((key) => [key, 1000])) }); });
  h.player.prepareLesson(words(3), "en-GB");
  await h.settle();
  h.player.release();
  release(null);
  await h.settle(); h.runIdle();
  assert.equal(h.audios.length, 0);
  assert.deepEqual(h.player.inspect().entries, []);
});

test("100 tételes lecke (200 szöveg): legfeljebb 60 hangelem, egyszerre legfeljebb 3 letöltés; a többi kérésre töltődik", async () => {
  const h = harness();
  const texts = words(200);
  await h.open(texts);
  assert.equal(h.state.manifestCalls.length, 1);
  assert.equal(h.player.inspect().entries.length, 60);
  let rounds = 0;
  while (h.loading().length) {
    assert.ok(h.loading().length <= 3, "soha nem fut 3-nál több letöltés");
    h.loading()[0].oncanplaythrough?.();
    assert.ok(++rounds <= 60);
  }
  assert.equal(h.audios.length, 60);
  assert.equal(h.player.inspect().entries.filter((item) => item.state === "ready").length, 60);
});

test("a lap háttérbe kerül: új letöltés nem indul; visszatéréskor folytatódik, és a jegyzék legfeljebb percenként frissül", async () => {
  const h = harness();
  h.state.manifestMode = "none";
  const texts = words(5);
  await h.open(texts);
  assert.equal(h.audios.length, 0, "üres tár: hangfájl-kérés nincs");
  h.player.setVisible(false);
  h.advance(30_000);
  h.player.setVisible(true);
  await h.settle();
  assert.equal(h.state.manifestCalls.length, 1, "30 mp után még nem frissít");
  h.player.setVisible(false);
  h.advance(30_000);
  // Közben a hangok elkészültek (S8c): a visszatéréskor a jegyzék frissül — a „nincs” nem ragad be a munkamenetre.
  h.state.manifestMode = "all";
  h.player.setVisible(true);
  await h.settle(); h.runIdle();
  assert.equal(h.state.manifestCalls.length, 2);
  assert.equal(h.loading().length, 3);
  h.player.setVisible(false);
  h.ready("word 1");
  assert.equal(h.loading().length, 2, "háttérben a felszabadult helyre nem indul új letöltés");
  h.player.setVisible(true);
  assert.equal(h.loading().length, 3, "visszatéréskor folytatódik");
});

test("két gyors koppintás két különböző szóra: az első hang leáll, csak a második szól", async () => {
  const h = harness();
  await h.open(words(2));
  const first = h.ready("word 1"), second = h.ready("word 2");
  h.say("word 1");
  h.say("word 2");
  assert.deepEqual([first.plays, first.paused, second.plays, second.paused], [1, true, 1, false]);
  first.onplaying?.(); second.onplaying?.();
  h.advance(10_000);
  assert.deepEqual(h.errors, []);
  assert.equal(h.spoken.length, 0, "az elvetett első koppintás őre nem indít böngészőhangot");
});

test("más nyelvű lecke: nincs lenyomat, jegyzék és előtöltés; a lánc a böngészőhanggal indul", async () => {
  const h = harness({ voices: [{ name: "Anna", lang: "de-DE", localService: true }] });
  await h.open(["Dreieck", "Das ist ein Dreieck."], "de-DE");
  assert.deepEqual([h.state.manifestCalls.length, h.audios.length], [0, 0]);
  h.say("Dreieck", 0.85, "de-DE");
  assert.equal(h.spoken.length, 1);
  assert.equal(h.audios.length, 0);
});

test("üres tár és hibás jegyzék (429, hálózati hiba): hangfájl-kérés egyáltalán nem megy, a böngészőhang a koppintásban szól", async () => {
  for (const mode of ["none", "limited", "reject"] as const) {
    const h = harness();
    h.state.manifestMode = mode;
    await h.open(words(4));
    h.advance(60_000);
    assert.equal(h.audios.length, 0, mode);
    h.say("word 1");
    assert.equal(h.spoken.length, 1, mode);
    assert.equal(h.audios.length, 0, mode);
  }
});

test("elutasított jegyzék-kérés (429): a szerver Retry-After értéke szerint, felső korláttal, legfeljebb kétszer próbál újra — addig a böngészőhang szól", async () => {
  const h = harness();
  h.state.manifestMode = "limited";
  h.state.retryAfterMs = 900_000;
  await h.open(words(2));
  assert.equal(h.state.manifestCalls.length, 1);
  h.say("word 1");
  assert.equal(h.spoken.length, 1, "addig a böngészőhang szól");
  h.spoken[0].onstart?.(); h.spoken[0].onend?.();
  h.advance(119_999);
  await h.settle();
  assert.equal(h.state.manifestCalls.length, 1, "a 15 perces Retry-After felső korlátja 2 perc — addig nem zaklatja a szervert");
  h.advance(1);
  await h.settle();
  assert.equal(h.state.manifestCalls.length, 2);
  h.advance(120_000);
  await h.settle();
  assert.equal(h.state.manifestCalls.length, 3);
  h.advance(600_000);
  await h.settle();
  assert.equal(h.state.manifestCalls.length, 3, "legfeljebb két újrapróba");
  // Rövid Retry-After: a szerver kérése szerint (de legalább 5 mp múlva); sikeres újrapróba után indul az előtöltés.
  const g = harness();
  g.state.manifestMode = "limited";
  g.state.retryAfterMs = 10_000;
  await g.open(words(2));
  g.state.manifestMode = "all";
  g.advance(9999);
  await g.settle();
  assert.equal(g.state.manifestCalls.length, 1);
  g.advance(1);
  await g.settle(); g.runIdle();
  assert.equal(g.state.manifestCalls.length, 2);
  assert.equal(g.loading().length, 2, "a megérkezett jegyzék után az előtöltés elindul");
  // A lecke elhagyása a függő újrapróbát is törli.
  const k = harness();
  k.state.manifestMode = "limited";
  await k.open(words(1));
  k.player.release();
  assert.equal(k.timers.size, 0);
});

test("hálózat nélküli újranyitás: a helyben megőrzött jegyzékből indul az előtöltés (a hangok a tartós gyorsítótárból jönnek)", async () => {
  const h = harness();
  await h.open(words(2));
  assert.ok(h.state.stored, "a friss jegyzék helyben megmarad");
  h.player.release();
  h.state.manifestMode = "reject";
  h.state.connection.online = false;
  const before = h.audios.length;
  await h.open(words(2));
  assert.deepEqual(h.audios.slice(before).map((audio) => audio.src), words(2).map(pathOf));
  const audio = h.ready("word 1");
  h.say("word 1");
  assert.equal(audio.plays, 1);
});

test("adatkímélő mód: csak az első szakasz (12 szöveg) töltődik elő", async () => {
  const h = harness({ connection: { saveData: true } });
  await h.open(words(40));
  assert.equal(h.player.inspect().entries.length, 12);
});

test("pozitív bizonyíték: az első koppintás `start` eseménye igazolja a hangot — a következő koppintásokra közvetlenül az szól", async () => {
  const h = harness();
  h.state.manifestMode = "none";
  await h.open(words(2));
  h.advance(60_000);
  assert.equal(h.spoken.length, 0, "koppintás nélkül semmi nem mond ki (kéretlen próba nincs)");
  assert.deepEqual(h.player.inspect().knowledge, UNKNOWN_ENGINE);
  h.say("word 1");
  assert.deepEqual([h.spoken[0].voice, h.spoken[0].volume], [SONIA, 1]);
  h.spoken[0].onstart?.();
  assert.equal(h.player.inspect().knowledge.verified, voiceKey(SONIA));
  h.spoken[0].onend?.();
  for (let tap = 0; tap < 4; tap++) { h.say("word 2"); h.spoken.at(-1)?.onstart?.(); h.spoken.at(-1)?.onend?.(); }
  assert.deepEqual(h.spoken.map((u) => u.voice), [SONIA, SONIA, SONIA, SONIA, SONIA]);
  assert.equal(h.audios.length, 0);
});

test("részleges ítélet: a néma hálózati hang 2 koppintásra kimarad, a megszólaló helyi hang igazolt — a következő koppintás nem vár 3 mp-et", async () => {
  const h = harness();
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  const cancelsBefore = h.state.cancels;
  h.advance(3000);
  assert.equal(h.state.cancels, cancelsBefore + 1, "az el nem indult SAJÁT kimondás nem marad a beszédsorban");
  assert.deepEqual(h.spoken.map((u) => u.voice), [SONIA, HAZEL]);
  h.spoken[1].onstart?.();
  assert.deepEqual(h.player.inspect().knowledge, { verified: voiceKey(HAZEL), skip: { [voiceKey(SONIA)]: 2 }, silentTaps: 0 });
  h.spoken[1].onend?.();
  h.say("word 1");
  assert.equal(h.spoken.at(-1)?.voice, HAZEL, "az igazolt hang szól azonnal");
});

test("néma motor: az első koppintás kivárja a csendkeretet, a következő KETTŐ nem — a harmadik újra megpróbálja a böngészőhangot (az ítélet lejár)", async () => {
  const h = harness({ voices: [HAZEL, ZIRA] });
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  h.advance(3000);
  assert.equal(h.audios.length, 1, "3 mp után a tartalék");
  assert.equal(h.player.inspect().knowledge.silentTaps, 2);
  h.audios[0].onplaying?.();
  for (const expected of [2, 3]) {
    h.say("word 1");
    assert.equal(h.spoken.length, 1, "néma ítélet alatt nincs böngészőhang-kör");
    assert.equal(h.audios.length, expected, "a tartalék a koppintásban, várakozás nélkül indul");
    h.audios.at(-1)?.onplaying?.();
  }
  h.say("word 1");
  assert.equal(h.spoken.length, 2, "a negyedik koppintás újra a böngészőhangot próbálja — nem marad örökre a szerverhangon");
  h.spoken[1].onstart?.();
  assert.deepEqual(h.player.inspect().knowledge, { verified: voiceKey(HAZEL), skip: {}, silentTaps: 0 }, "a megszólalt hang minden negatív ítéletet töröl");
});

// Vak review B3 (a repó A2 esete: Android Chrome a `cancel()` utáni azonnali `speak()`-et megszakítottnak jelzi).
test("B3: az el sem indult, megszakítottnak jelzett kimondás NEM a hang hibája — ugyanaz a brit hang kap újrapróbát, az ismeret tiszta marad", async () => {
  const h = harness();
  h.state.manifestMode = "none";
  await h.open(words(2));
  h.say("word 1");
  h.spoken[0].onstart?.();
  h.say("word 2");
  h.spoken[1].onerror?.({ error: "interrupted" });
  assert.deepEqual(h.spoken.map((u) => u.voice), [SONIA, SONIA, SONIA], "gyors két koppintás: nem az amerikai, hanem újra a brit hang");
  assert.deepEqual(h.player.inspect().knowledge.skip, {}, "a megszakítás nem ír negatív ítéletet");
  h.spoken[2].onstart?.(); h.spoken[2].onend?.();
  // Ha az újrapróba is megszakad: a lánc a tartalékra lép (mint a főágon) — gyengébb böngészőhang nem szól a brit helyett.
  h.say("word 1");
  h.spoken[3].onerror?.({ error: "canceled" });
  h.spoken[4].onerror?.({ error: "interrupted" });
  assert.deepEqual(h.spoken.map((u) => u.voice), [SONIA, SONIA, SONIA, SONIA, SONIA]);
  assert.equal(h.audios.length, 1, "a tartalék szól");
  assert.deepEqual(h.player.inspect().knowledge, { verified: voiceKey(SONIA), skip: {}, silentTaps: 0 });
  h.audios[0].onplaying?.();
  h.say("word 2");
  assert.equal(h.spoken.at(-1)?.voice, SONIA, "a következő koppintásra is a brit hang");
});

// Vak review B2: felhasználói aktiváció nélkül a böngésző `not-allowed` hibával utasítja el a kimondást.
test("B2: a `not-allowed` nem a hang hibája — nem próbál végig más hangokat, és a hangválasztást nem rontja el", async () => {
  const h = harness();
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.state.activated = false;
  h.say("word 1");
  assert.deepEqual(h.spoken.map((u) => u.voice), [SONIA], "a többi hang ugyanígy járna: nincs próbalánc");
  assert.equal(h.audios.length, 1, "a lánc a tartalékra lép");
  assert.deepEqual(h.player.inspect().knowledge, UNKNOWN_ENGINE, "az ismeret érintetlen");
  h.audios[0].onplaying?.();
  h.state.activated = true;
  h.say("word 1");
  assert.equal(h.spoken.at(-1)?.voice, SONIA, "aktivációval a rangsor legjobb hangja szól");
});

// Vak review B1: a közös beszédmotoron a lecke „Felolvasás” gombja és a kisfilm narrációja is beszél.
test("B1: idegen kimondás közben a lejátszó a gyerek koppintása nélkül semmit nem mond ki és semmit nem szakít meg", async () => {
  const h = harness();
  h.synth.speaking = true;
  await h.open(words(4));
  h.ready("word 1");
  h.player.noteUserActivation();
  h.player.setVisible(false);
  h.advance(120_000);
  h.player.setVisible(true);
  await h.settle();
  h.player.voicesChanged();
  h.player.prepareLesson(words(2), "en-GB");
  await h.settle(); h.runIdle();
  h.player.release();
  h.advance(120_000);
  assert.equal(h.state.cancels, 0, "megnyitás, előtöltés, feloldás, háttér / előtér, leckeváltás, elhagyás: egyik sem hív cancel()-t");
  assert.equal(h.spoken.length, 0, "…és egyik sem áll a beszédsorba");
  assert.equal(h.synth.speaking, true, "a „Felolvasás” tovább szól");
  // A kifejezett „Meghallgatás” koppintás viszont — mint eddig — leállítja az éppen szóló hangot (egyszerre egy hang szól).
  await h.open(words(1));
  h.say("word 1");
  assert.equal(h.state.cancels, 1);
  // A lejátszó SAJÁT, még szóló kimondását a lecke elhagyása leállítja.
  h.spoken[0].onstart?.();
  h.player.release();
  assert.equal(h.state.cancels, 2);
});

test("K1: az ítélet nyelvenként él — a német lecke néma hangja nem némítja el az angol leckét", async () => {
  const h = harness({ voices: [{ name: "Katja Online", lang: "de-DE", localService: false }, HAZEL] });
  h.state.manifestMode = "none";
  await h.open(["Dreieck"], "de-DE");
  h.say("Dreieck", 0.85, "de-DE");
  h.advance(6000);
  assert.equal(h.player.inspect().knowledgeFor("de-DE").silentTaps, 2);
  h.audios.at(-1)?.onplaying?.();
  assert.deepEqual(h.player.inspect().knowledgeFor("en-GB"), UNKNOWN_ENGINE);
  const before = h.spoken.length;
  h.say("triangle");
  assert.equal(h.spoken.length, before + 1, "az angol leckében a böngészőhang szól");
  assert.equal(h.spoken.at(-1)?.voice, HAZEL);
});

test("szóhatár-eseményt adó motor (`onstart` nélkül): a kimondás elindultnak számít — nincs tartalék, a hang igazolt", async () => {
  const h = harness({ voices: [HAZEL] });
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  h.spoken[0].onboundary?.();
  h.advance(10_000);
  assert.equal(h.audios.length, 0, "az indulási őr nem vált a tartalékra");
  assert.equal(h.player.inspect().knowledge.verified, voiceKey(HAZEL));
});

test("megszakított előre gyártott lépés: a leállítás az 1,5 mp-es őrt is törli — utána sem böngészőhang, sem üzenet", async () => {
  const h = harness();
  await h.open(words(1));
  const audio = h.ready("word 1");
  h.say("word 1");
  h.player.stop();
  assert.equal(audio.paused, true);
  assert.equal(h.timers.size, 0, "függő őr nem marad");
  h.advance(5000);
  assert.equal(h.spoken.length, 0);
  assert.deepEqual(h.errors, []);
});

test("a lecke elhagyása megszakítja a még úton lévő jegyzék-kérést", async () => {
  const h = harness();
  h.state.manifestMode = () => new Promise(() => {});
  h.player.prepareLesson(words(2), "en-GB");
  await h.settle();
  assert.equal(h.state.signals[0]?.aborted, false);
  h.player.release();
  assert.equal(h.state.signals[0]?.aborted, true);
});
test("védőháló próba nélkül: néma motornál az összesített csendkeret (3 mp helyi, 6 mp hálózati első hangnál) után a tartalék szól, és az ismeret megmarad", async () => {
  const h = harness({ voices: [HAZEL, ZIRA] });
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  h.advance(2999);
  assert.equal(h.audios.length, 0);
  h.advance(1);
  assert.equal(h.audios.length, 1, "3 mp-nél a tartalék");
  assert.equal(h.spoken.length, 1, "a keret elfogytával a második hang nem próbálkozik");
  assert.equal(h.player.inspect().knowledge.silentTaps, 2, "a valódi kimondás kimenetele adja az ismeretet");
  h.audios[0].onplaying?.();
  h.say("word 1");
  assert.equal(h.spoken.length, 1, "a következő koppintás már nem vár 3 mp-et");
  assert.equal(h.audios.length, 2);
});

test("hibaeseményt adó hang: a következő hang AZONNAL jön, a szerveres tartalék csak a legvégén; a rossz hang a munkamenetben kimarad", async () => {
  const h = harness();
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  h.spoken[0].onerror?.({ error: "synthesis-failed" });
  assert.deepEqual(h.spoken.map((u) => u.voice), [SONIA, HAZEL]);
  assert.equal(h.audios.length, 0);
  h.spoken[1].onstart?.(); h.spoken[1].onend?.();
  h.say("word 1");
  assert.equal(h.spoken.at(-1)?.voice, HAZEL, "a hibás hálózati hangot nem próbálja újra");
  // Megszakítás (új koppintás) nem hiba: a megszakított kimondás `interrupted` eseménye után sem jön másik hang vagy üzenet.
  const interrupted = h.spoken.at(-1)!;
  interrupted.onstart?.();
  interrupted.onerror?.({ error: "interrupted" });
  h.advance(10_000);
  assert.equal(h.audios.length, 0);
  assert.deepEqual(h.errors, []);
});

test("néma motor + még nem kész hang: az előre gyártott hang kérésre töltődik (1,5 mp-es őrrel), utána a tartalék", async () => {
  const h = harness({ synth: false });
  await h.open(words(5));
  h.say("word 5");
  const audio = h.audioFor("word 5")!;
  assert.ok(audio, "a párhuzamossági korláttól függetlenül azonnal töltődik");
  assert.equal(audio.plays, 1);
  h.advance(1499);
  assert.equal(h.audios.filter((a) => a.src.startsWith("/api/tts/audio")).length, 0);
  h.advance(1);
  assert.equal(audio.paused, true, "az el nem induló hang leáll");
  assert.equal(h.audios.filter((a) => a.src.startsWith("/api/tts/audio")).length, 1, "1,5 mp után a tartalék");
  assert.equal(h.entry("word 5")?.state, "loading", "az időtúllépés nem hiba: a pufferelés folytatódik");
  audio.onplaying?.();
  assert.equal(h.audios.filter((a) => a.src.startsWith("/api/tts/audio")).length, 1, "a késve érkező hang nem indít semmit");
});

test("a pufferelt hang hibája lejátszáskor: a kulcs nem elérhető-re vált, a böngészőhang jön; a lejátszási tiltás és az időtúllépés nem hiba", async () => {
  const h = harness();
  await h.open(words(3));
  const first = h.ready("word 1"), second = h.ready("word 2"), third = h.ready("word 3");
  h.say("word 1");
  first.onerror?.();
  assert.equal(h.spoken.length, 1, "hibaesemény → azonnal a böngészőhang");
  assert.equal(h.entry("word 1")?.state, "failed");
  h.spoken[0].onstart?.(); h.spoken[0].onend?.();
  h.say("word 1");
  assert.equal(first.plays, 1, "a hibás hangot a lejáratig nem próbálja újra");
  h.spoken[1].onstart?.(); h.spoken[1].onend?.();
  // A böngésző lejátszási tiltása nem a hang hibája.
  second.playResult = () => Promise.reject(Object.assign(new Error("tiltva"), { name: "NotAllowedError" }));
  h.say("word 2");
  await h.settle();
  assert.equal(h.spoken.length, 3);
  assert.equal(h.entry("word 2")?.state, "ready");
  h.spoken[2].onstart?.(); h.spoken[2].onend?.();
  // Az 1,5 mp-es őr: a kész hang mégsem indul → böngészőhang; a hang kész marad.
  h.say("word 3");
  h.advance(1500);
  assert.equal(h.spoken.length, 4);
  assert.deepEqual([third.paused, h.entry("word 3")?.state], [true, "ready"]);
});

test("a szerveres tartalék betöltési őre: lógó válasznál 8 mp után hibaüzenet jön, nem csend; megszólaló tartaléknál nincs üzenet", async () => {
  const h = harness({ voices: [{ name: "Szabolcs", lang: "hu-HU", localService: true }] });
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  assert.equal(h.audios.length, 1, "angol hang híján azonnal a tartalék");
  h.advance(7999);
  assert.deepEqual(h.errors, []);
  h.advance(1);
  assert.deepEqual(h.errors, ["word 1"]);
  assert.equal(h.audios[0].paused, true);
  h.audios[0].onerror?.();
  assert.deepEqual(h.errors, ["word 1"], "pontosan egy hibaüzenet");
  h.say("word 1");
  h.audios[1].onplaying?.();
  h.advance(20_000);
  assert.deepEqual(h.errors, ["word 1"]);
  // Elutasított lejátszás és hibaesemény: azonnali üzenet.
  h.audios.at(-1)!.pause();
  const g = harness({ voices: [{ name: "Szabolcs", lang: "hu-HU", localService: true }] });
  g.state.manifestMode = "none";
  await g.open(words(1));
  g.say("word 1");
  g.audios[0].onerror?.();
  assert.deepEqual(g.errors, ["word 1"]);
});

test("megszakítás: a szinkron továbblépett lánc is megszakítható — leállítás után sem hang, sem hibaüzenet, sem függő őr", async () => {
  // Két helyi hang, a keret (3 mp) az első hangnál elfogy → a második lépés szinkron bukik, a tartalék indul (vak review A5).
  const h = harness({ voices: [HAZEL, ZIRA] });
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  h.advance(3000);
  const fallback = h.audios[0];
  assert.equal(fallback.plays, 1);
  h.player.stop();
  assert.equal(fallback.paused, true);
  assert.equal(h.timers.size, 0, "a leállítás a szinkron továbblépett lépés (a tartalék) őrét is törli");
  fallback.onerror?.();
  h.advance(30_000);
  assert.deepEqual(h.errors, [], "a megszakított tartalék őre és hibaeseménye nem ad üzenetet");
  assert.equal(h.timers.size, 0);
  // Fülváltás futó kimondás közben: a leállított lánc őre nem indít tartalékot.
  h.player.voicesChanged();
  h.say("word 1");
  h.player.stop();
  h.advance(30_000);
  assert.equal(h.audios.length, 1);
  assert.deepEqual(h.errors, []);
});

test("minden lépés elbukik: pontosan egy hibaüzenet; hang nélküli eszközön (se motor, se tartalékolható nyelv) azonnali üzenet", async () => {
  const h = harness();
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  for (let i = 0; i < 3; i++) h.spoken[i].onerror?.({ error: "synthesis-failed" });
  assert.equal(h.audios.length, 1);
  h.audios[0].onerror?.();
  assert.deepEqual(h.errors, ["word 1"]);
  const g = harness({ synth: false });
  g.say("konnichiwa", 1, "ja-JP");
  assert.deepEqual(g.errors, ["konnichiwa"]);
});

test("iOS-feloldás: a felhasználói mozdulat a már elindított, még nem kész letöltéseket hang nélkül „megérinti”; a kész és a szóló hangot nem", async () => {
  const h = harness();
  await h.open(words(4));
  const ready = h.ready("word 1");
  const loading = h.loading();
  assert.equal(loading.length, 3);
  h.player.noteUserActivation();
  assert.ok(loading.every((audio) => audio.plays === 1 && audio.paused), "lejátszás + azonnali szünet: hang nem szól");
  assert.equal(ready.plays, 0);
  assert.equal(h.spoken.length, 0, "a feloldás a beszédmotorhoz nem nyúl");
  // A koppintásra éppen (kérésre töltődve) szóló hangot a feloldás nem érinti meg.
  const g = harness({ synth: false });
  await g.open(words(5));
  g.say("word 5");
  const active = g.audioFor("word 5")!;
  g.player.noteUserActivation();
  assert.deepEqual([active.plays, active.paused], [1, false]);
});

test("a hanglista megváltozása (voiceschanged) után a munkamenet-ismeret újraépül a következő koppintásokból", async () => {
  const h = harness({ voices: [] });
  h.state.manifestMode = "none";
  await h.open(words(1));
  // Üres listával a „lang dönt” kimondás néma marad → lejáró néma ítélet.
  h.say("word 1");
  assert.equal(h.spoken[0].voice, null);
  h.advance(3000);
  assert.equal(h.player.inspect().knowledge.silentTaps, 2);
  h.audios.at(-1)?.onplaying?.();
  h.state.voices = [HAZEL];
  h.player.voicesChanged();
  assert.deepEqual(h.player.inspect().knowledge, UNKNOWN_ENGINE, "az addigi ismeret a régi listára szólt");
  h.say("word 1");
  assert.deepEqual([h.spoken.at(-1)?.voice, h.spoken.at(-1)?.volume], [HAZEL, 1]);
  h.spoken.at(-1)?.onstart?.();
  assert.equal(h.player.inspect().knowledge.verified, voiceKey(HAZEL));
});

// Vak visszaellenőrzés (kliens) B1: a szülő újrarenderelése ÚJ objektumokkal hívja a megnyitást — ugyanarra a leckére ez nem teendő.
test("B1: azonos tartalmú leckével (új tömbbel) ismételt megnyitás NO-OP — nincs új jegyzék-kérés, a pufferek megmaradnak, a szóló hang nem szakad meg", async () => {
  const h = harness();
  await h.open(words(4));
  const first = h.ready("word 1");
  h.say("word 1");
  first.onplaying?.();
  const audiosBefore = h.audios.length;
  for (let render = 0; render < 5; render++) { h.player.prepareLesson([...words(4)], "en-GB"); await h.settle(); h.runIdle(); }
  assert.equal(h.state.manifestCalls.length, 1, "egyetlen jegyzék-kérés");
  assert.deepEqual([first.paused, first.released], [false, false], "a szóló hang nem szakadt meg, a puffer megmaradt");
  assert.equal(h.audios.length, audiosBefore, "új letöltés nem indult");
  assert.equal(h.entry("word 1")?.state, "ready");
  // Böngészőhang közben ugyanez: a kimondás nem szakad meg.
  h.say("word 4");
  const cancels = h.state.cancels;
  h.spoken.at(-1)?.onstart?.();
  h.player.prepareLesson([...words(4)], "en-GB");
  assert.equal(h.state.cancels, cancels, "az újrarenderelés nem hív cancel()-t");
  assert.deepEqual(h.errors, []);
  // Eltérő tartalom (más szöveg vagy más nyelv): teljes csere.
  h.player.prepareLesson([...words(3), "other"], "en-GB");
  assert.equal(first.released, true, "valódi leckeváltásnál a régi pufferek felszabadulnak");
  await h.settle();
  assert.equal(h.state.manifestCalls.length, 2);
  h.player.prepareLesson([...words(3), "other"], "en-US");
  await h.settle();
  assert.equal(h.player.inspect().lessonLanguage, "en-US");
  // Lecsatolás után ugyanaz a lecke újra megnyitva: új előkészítés.
  h.player.release();
  h.player.prepareLesson(words(4), "en-GB");
  await h.settle();
  assert.equal(h.state.manifestCalls.length, 3);
});

// Vak visszaellenőrzés (kliens) J2: a háttérbe került lapon a böngésző visszafoghatja a kimondást — az ottani lejárat nem a hang hibája.
test("J2: a lap háttérbe kerülése alatti indulási lejárat nem negatív ítélet — visszatérés után a koppintás újra a brit hangot próbálja", async () => {
  const h = harness();
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  h.player.setVisible(false);
  h.advance(6000);
  h.player.setVisible(true);
  assert.deepEqual(h.player.inspect().knowledge, UNKNOWN_ENGINE, "sem a hang, sem a motor nem kapott ítéletet");
  h.audios.at(-1)?.onplaying?.();
  h.say("word 1");
  assert.equal(h.spoken.at(-1)?.voice, SONIA, "nem a szerverhang és nem egy gyengébb hang szól");
  // Ellenpróba: előtérben ugyanez a lejárat ítélet.
  const g = harness();
  g.state.manifestMode = "none";
  await g.open(words(1));
  g.say("word 1");
  g.advance(3000);
  assert.deepEqual(g.player.inspect().knowledge.skip, { [voiceKey(SONIA)]: 2 });
});

// Vak visszaellenőrzés (kliens) J10: a túlélő mutánsok esetei.
test("J10: leállítás után a kimondás késői eseménye és őre hatástalan; nyugvó motoron a leállítás nem hív cancel()-t", async () => {
  const h = harness();
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  assert.equal(h.state.cancels, 0, "nyugvó motoron nincs cancel() a speak() előtt (Android: megszakítaná az új kimondást)");
  h.player.stop();
  assert.equal(h.timers.size, 0, "a megszakító a hanglépés indulási őrét is törli");
  h.spoken[0].onerror?.({ error: "synthesis-failed" });
  h.advance(10_000);
  assert.equal(h.spoken.length, 1, "a leállított lépés késői hibaeseménye nem indít másik hangot");
  assert.equal(h.audios.length, 0);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.player.inspect().knowledge, UNKNOWN_ENGINE, "…és ítéletet sem ír");
});

test("J10: hálózat nélkül a koppintás terve a helyi hanggal indul; tartalék híján a csendes kör a végén is néma ítéletet ad", async () => {
  const h = harness({ connection: { online: false } });
  h.state.manifestMode = "none";
  await h.open(words(1));
  h.say("word 1");
  assert.equal(h.spoken[0].voice, HAZEL, "hálózat nélkül nem a hálózati hang az első");
  // 300 karakternél hosszabb szöveghez nincs szerveres tartalék: a lánc a böngészőhang-szakasszal ér véget.
  const g = harness({ voices: [HAZEL] });
  g.state.manifestMode = "none";
  await g.open(words(1));
  const long = "word ".repeat(70).trim();
  g.say(long);
  g.advance(3000);
  assert.deepEqual(g.errors, [long], "nincs több lépés: hibaüzenet");
  assert.equal(g.audios.length, 0);
  assert.equal(g.player.inspect().knowledge.silentTaps, 2, "a csendes kör a lánc végén is ítélet");
});

// CI-hiba (#516): a csendkeret végi versenyhelyzet — a 2. hang őre a keret vége előtt 0,7 ms-mal jár le.
test("a csendkeret vége: töredék ezredmásodperccel korábban lejáró őr után a harmadik hang NEM kap kimondást és hamis ítéletet — a tartalék jön", async () => {
  for (const early of [0.7, 0.001, 3]) {
    const h = harness();
    h.state.manifestMode = "none";
    h.state.timerEarlyMs = early;
    await h.open(words(1));
    h.say("word 1");
    h.advance(3000);
    assert.deepEqual(h.spoken.map((u) => u.voice), [SONIA, HAZEL], `3 mp-nél a helyi hang (${early} ms)`);
    h.advance(3000);
    assert.deepEqual(h.spoken.map((u) => u.voice), [SONIA, HAZEL], `a keret végén további hang nem próbálkozik (${early} ms)`);
    assert.equal(h.audios.length, 1, "a szerveres tartalék szól");
    assert.deepEqual(Object.keys(h.player.inspect().knowledge.skip).sort(), [voiceKey(HAZEL), voiceKey(SONIA)].sort(), "a ki sem próbált harmadik hang nem kap ítéletet");
    assert.equal(h.player.inspect().knowledge.silentTaps, 2);
  }
});
import {
  hasLaterLocalVoice, nextSpeechStep, preparedAudioCandidate, sizesFromManifest, speechPlan, voicePhaseBudgetMs, voiceStepTimeoutMs,
  chainVoiceOrder, FALLBACK_AUDIO_START_TIMEOUT_MS, PREPARED_AUDIO_START_TIMEOUT_MS, type StepOutcome,
} from "../../../shared/speech-chain";
import { isSoftSpeechError, ttsAudioUrl } from "../../../shared/speech-fallback";
import {
  engineAfter, engineAfterRound, failureActive, mergeStoredManifest, nextPreloads, preloadPlan, prioritized, probeTimeoutMs, readStoredManifest,
  retryDelayMs, voiceKey, SPEECH_PRELOAD, UNKNOWN_ENGINE, type EngineKnowledge, type VoiceOutcome,
} from "../../../shared/speech-preload";
import { hasPreparedAudio, ttsAudioAvailabilityUrl, ttsAudioPath, TTS_AUDIO_AVAILABILITY_MAX_KEYS, TTS_VOICE_VERSION } from "../../../shared/tts-audio-key";

/**
 * Terv 2026-11-18-tananyag-gyartas-minoseg, S8d: a lecke felolvasásának lejátszója — React és közvetlen böngésző-hívás nélkül. A
 * környezet (óra, időzítő, hangelem-gyár, beszédmotor, jegyzék-lekérés, kapcsolat, tár) befecskendezett, így a lánc BEKÖTÉSE ál-órával
 * tesztelhető (tests/speech-player.test.ts). A döntéseket a tiszta modulok adják (`shared/speech-chain.ts`, `shared/speech-preload.ts`).
 *
 * Működés: a lecke megnyitásakor a jegyzék szerint meglévő hangok a háttérben, korlátozott párhuzamossággal `preload="auto"`
 * hangelemekbe töltődnek; koppintásra a pufferelt hang hálózati kör nélkül szól. A böngészőhang kiválasztása és a néma motor
 * felismerése munkamenetenként egyszer, az első felhasználói mozdulatnál lefutó, nulla hangerejű próbával dől el.
 */
export type AudioLike = {
  src: string; preload: string; playbackRate: number; preservesPitch: boolean; currentTime: number;
  play(): Promise<void>; pause(): void; load(): void; removeAttribute(name: string): void;
  oncanplaythrough: (() => void) | null; onerror: (() => void) | null; onplaying: (() => void) | null;
};
export type VoiceLike = { name: string; lang: string; localService?: boolean };
export type UtteranceLike = {
  lang: string; rate: number; volume: number; voice: unknown;
  onstart: (() => void) | null; onboundary: (() => void) | null; onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null;
};
export type SynthLike = { speaking: boolean; pending: boolean; getVoices?: () => VoiceLike[] | null | undefined; speak(utterance: UtteranceLike): void; cancel(): void };
export type SpeechEnv = {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Üresjárati ütemezés: az előtöltés nem blokkolhatja a lecke megjelenítését és az interakciót. */
  idle(callback: () => void): void;
  createAudio(): AudioLike;
  synth(): SynthLike | undefined;
  /** undefined: nincs `SpeechSynthesisUtterance`. */
  createUtterance(text: string): UtteranceLike | undefined;
  hash(text: string, language: string): Promise<string>;
  /** A jegyzék JSON-ja; null: nem sikeres válasz (pl. 429). Hálózati hibára elutasít. */
  fetchManifest(url: string, signal: AbortSignal): Promise<unknown | null>;
  connection(): { saveData?: boolean; effectiveType?: string; online: boolean };
  /** A helyben megőrzött utolsó jegyzék (csak lenyomatok és méretek). */
  storage?: { read(): unknown; write(value: unknown): void };
};

type Entry = { id: string; audio: AudioLike | null; state: "queued" | "loading" | "ready" | "waiting" | "failed"; attempts: number; failedAt: number | null; timer: unknown };
type Lesson = { language: string; ids: string[]; controller: AbortController; manifestUrl: string | null; manifestAt: number | null };
type StepDone = (outcome: StepOutcome) => void;
type PreparedFailure = "error" | "timeout" | "not-allowed" | "aborted";
/** Az első felhasználói mozdulat után ennyivel indul a hangmotor próbája (hogy a mozdulat saját kimondása elé ne álljon be). */
export const PROBE_DELAY_MS = 600;

export function createSpeechPlayer(env: SpeechEnv) {
  const preparedIds = new Map<string, string>();
  const availableSizes = new Map<string, number>();
  const entries = new Map<string, Entry>();
  let pending: string[] = [];
  let lesson: Lesson | null = null;
  let visible = true;
  let knowledge: EngineKnowledge = UNKNOWN_ENGINE;
  let probe: { cancel(): void } | null = null;
  let probed = false;
  let probeTimer: unknown = null;
  let activeAudio: AudioLike | null = null;
  let cancelActive: (() => void) | null = null;
  const preparedKey = (text: string, language: string) => `${language}\n${text}`;
  const voices = (): VoiceLike[] => { const synth = env.synth(); return synth && typeof synth.getVoices === "function" ? synth.getVoices() ?? [] : []; };

  // ---- Előtöltés --------------------------------------------------------------------------------------------------------------
  const activeLoads = () => { let count = 0; entries.forEach((entry) => { if (entry.state === "loading") count += 1; }); return count; };
  function detach(entry: Entry): void {
    env.clearTimeout(entry.timer);
    entry.timer = null;
    const audio = entry.audio;
    if (!audio) return;
    audio.oncanplaythrough = null; audio.onerror = null; audio.onplaying = null;
    audio.pause();
    // A forrás elvétele megszakítja a futó letöltést és felszabadítja a pufferelt hangot.
    audio.removeAttribute("src");
    audio.load();
    entry.audio = null;
  }
  function startLoad(entry: Entry): void {
    const owner = lesson;
    const audio = env.createAudio();
    entry.audio = audio;
    entry.state = "loading";
    const settle = (ready: boolean) => {
      if (entry.audio !== audio || entry.state !== "loading" || lesson !== owner) return;
      env.clearTimeout(entry.timer);
      entry.timer = null;
      if (ready) { entry.state = "ready"; entry.attempts = 0; entry.failedAt = null; pump(); return; }
      loadFailed(entry);
    };
    audio.oncanplaythrough = () => settle(true);
    audio.onerror = () => settle(false);
    entry.timer = env.setTimeout(() => settle(false), SPEECH_PRELOAD.loadTimeoutMs);
    audio.preload = "auto";
    audio.src = ttsAudioPath(entry.id);
  }
  /** Hibás letöltés (429, hálókiesés, lógó válasz): visszatartásos újrapróba; utána a szó a lejáratig nem elérhető — a böngészőhang szól. */
  function loadFailed(entry: Entry): void {
    const owner = lesson;
    detach(entry);
    entry.attempts += 1;
    const delay = retryDelayMs(entry.attempts);
    if (delay === null) { entry.state = "failed"; entry.failedAt = env.now(); pump(); return; }
    entry.state = "waiting";
    entry.timer = env.setTimeout(() => {
      if (lesson !== owner || entry.state !== "waiting") return;
      entry.timer = null;
      entry.state = "queued";
      pending = [...pending.filter((id) => id !== entry.id), entry.id];
      pump();
    }, delay);
    pump();
  }
  function pump(): void {
    // Háttérben lévő lapon új letöltés nem indul; a láthatóvá váláskor folytatódik.
    if (!lesson || !visible) return;
    for (const id of nextPreloads(pending, activeLoads())) {
      pending = pending.filter((other) => other !== id);
      const entry = entries.get(id);
      if (entry && entry.state === "queued") startLoad(entry);
    }
  }
  function enqueue(ids: readonly string[]): void {
    for (const id of ids) {
      if (entries.has(id)) continue;
      entries.set(id, { id, audio: null, state: "queued", attempts: 0, failedAt: null, timer: null });
      pending.push(id);
    }
  }
  /** A koppintott, még nem pufferelt szó előre ugrik a sorban (plafon fölötti szó is: kérésre töltődik); a lejárt hiba újra próbálható. */
  function prioritize(id: string): void {
    let entry = entries.get(id);
    if (!entry) { entry = { id, audio: null, state: "queued", attempts: 0, failedAt: null, timer: null }; entries.set(id, entry); }
    if (entry.state === "failed") { entry.state = "queued"; entry.attempts = 0; entry.failedAt = null; }
    if (entry.state !== "queued") return;
    pending = prioritized(pending, id);
    pump();
  }
  function applyManifest(owner: Lesson, sizes: Record<string, number>, fresh: boolean): void {
    for (const [id, size] of Object.entries(sizes)) availableSizes.set(id, size);
    if (fresh && env.storage) { try { env.storage.write(mergeStoredManifest(env.storage.read(), TTS_VOICE_VERSION, sizes)); } catch { /* a tár nem írható: hálózat nélkül nem lesz jegyzék */ } }
    if (lesson !== owner) return;
    const known: Record<string, number> = {};
    for (const id of owner.ids) { const size = availableSizes.get(id); if (size) known[id] = size; }
    enqueue(preloadPlan({ ids: owner.ids, sizes: known, connection: env.connection() }));
    env.idle(() => { if (lesson === owner) pump(); });
  }
  async function loadManifest(owner: Lesson): Promise<void> {
    if (!owner.manifestUrl) return;
    owner.manifestAt = env.now();
    try {
      const body = await env.fetchManifest(owner.manifestUrl, owner.controller.signal);
      if (body !== null) applyManifest(owner, sizesFromManifest(body, owner.ids), true);
    } catch { /* hálózati hiba vagy megszakítás: a helyben megőrzött jegyzék marad érvényben */ }
  }

  /** A lecke megnyitása: kulcsok, jegyzék (egy kérés), majd előtöltés üresjáratban. Más nyelvű leckénél nincs hangtár-forgalom. */
  function prepareLesson(texts: readonly string[], language: string): void {
    release();
    const owner: Lesson = { language, ids: [], controller: new AbortController(), manifestUrl: null, manifestAt: null };
    lesson = owner;
    if (!hasPreparedAudio(language)) return;
    const unique = Array.from(new Set(texts.filter((text) => text.trim()))).slice(0, TTS_AUDIO_AVAILABILITY_MAX_KEYS);
    if (!unique.length) return;
    Promise.all(unique.map(async (text) => { const id = await env.hash(text, language); preparedIds.set(preparedKey(text, language), id); return id; }))
      .then((ids) => {
        if (lesson !== owner) return;
        owner.ids = ids;
        owner.manifestUrl = ttsAudioAvailabilityUrl(ids);
        // Előbb a helyben megőrzött utolsó jegyzék: hálózat nélkül is tudjuk, mi szól a tartós gyorsítótárból.
        let stored: Record<string, number> = {};
        try { stored = env.storage ? readStoredManifest(env.storage.read(), TTS_VOICE_VERSION) : {}; } catch { /* nincs tár */ }
        const known = Object.fromEntries(ids.flatMap((id) => stored[id] ? [[id, stored[id]] as const] : []));
        if (Object.keys(known).length) applyManifest(owner, known, false);
        return loadManifest(owner);
      })
      .catch(() => { /* nincs kulcs (WebCrypto híján): a böngészőhang szól */ });
  }

  /** A lecke elhagyása / leckeváltás: a letöltések megszakadnak, a hangelemek felszabadulnak, a régi lecke hangja nem szólalhat meg. */
  function release(): void {
    stop();
    cancelProbe();
    lesson?.controller.abort();
    lesson = null;
    entries.forEach(detach);
    entries.clear();
    pending = [];
  }

  /** A lap láthatósága: háttérben új letöltés nem indul; visszatéréskor folytatódik, és a jegyzék (ritkítva) frissül. */
  function setVisible(next: boolean): void {
    visible = next;
    if (!visible || !lesson) return;
    if (lesson.manifestAt !== null && env.now() - lesson.manifestAt >= SPEECH_PRELOAD.manifestRefreshMs) void loadManifest(lesson);
    pump();
  }

  // ---- A hangmotor munkamenet-szintű próbája -------------------------------------------------------------------------------------
  function cancelProbe(): void { env.clearTimeout(probeTimer); probeTimer = null; probe?.cancel(); probe = null; }
  /** A hanglista megváltozott (`voiceschanged`): az addigi ismeret a régi listára szólt — a következő mozdulatnál új próba fut. */
  function voicesChanged(): void { cancelProbe(); knowledge = UNKNOWN_ENGINE; probed = false; }
  function startProbe(): void {
    const synth = env.synth();
    const language = lesson?.language;
    // Ha éppen valódi kimondás fut, annak a kimenetele adja az ismeretet (próba nem kell); a következő mozdulat újra ütemezhet.
    if (probed || probe || !synth || !language || cancelActive) return;
    if (knowledge.verified !== null || knowledge.silent) { probed = true; return; }
    const list = voices();
    // Üres hanglistánál (Android: később töltődik) a próba vár: a `voiceschanged` után, a következő mozdulatnál fut. Hang nélküli
    // („a lang dönt”) próbát nem indítunk — arról a valódi kimondás kimenetele ad ismeretet.
    if (!list.length) return;
    const candidates: VoiceLike[] = chainVoiceOrder(list, language, !env.connection().online).map((index) => list[index]);
    if (!candidates.length) { probed = true; return; }
    probed = true;
    const outcomes: VoiceOutcome[] = [];
    let cancelled = false;
    let timer: unknown = null;
    const finish = () => { env.clearTimeout(timer); if (probe === handle) probe = null; };
    const handle = { cancel() { cancelled = true; env.clearTimeout(timer); if (synth.speaking || synth.pending) synth.cancel(); } };
    probe = handle;
    const attempt = (at: number) => {
      const voice = candidates[at];
      // Nulla hangerejű, rövid próba: a `start` esemény a hangerőtől függetlenül megjön, a gyerek semmit nem hall.
      const utterance = env.createUtterance("a");
      if (!utterance) { finish(); return; }
      utterance.lang = language;
      utterance.volume = 0;
      utterance.rate = 1;
      if (voice) { try { utterance.voice = voice; } catch { /* a lang dönt */ } }
      let settled = false;
      const settle = (outcome: VoiceOutcome) => {
        if (settled || cancelled) return;
        settled = true;
        env.clearTimeout(timer);
        outcomes.push(outcome);
        knowledge = engineAfter(knowledge, voiceKey(voice), outcome);
        if (outcome !== "started" && (synth.speaking || synth.pending)) synth.cancel();
        if (outcome === "started" || at + 1 >= candidates.length) { knowledge = engineAfterRound(knowledge, outcomes); finish(); return; }
        attempt(at + 1);
      };
      utterance.onstart = () => settle("started");
      utterance.onboundary = () => settle("started");
      utterance.onend = () => settle("started");
      utterance.onerror = (event) => { if (!isSoftSpeechError(event?.error)) settle("error"); };
      // A próba a háttérben fut: itt a hálózati hang megkapja a teljes türelmét (6 mp), a gyerek erre nem vár.
      timer = env.setTimeout(() => settle("timeout"), probeTimeoutMs(voice));
      try { synth.speak(utterance); } catch { settle("error"); }
    };
    attempt(0);
  }
  /**
   * Az első felhasználói mozdulat: (1) a hangmotor próbája; (2) iOS: a böngésző a hangelem letöltését gesztushoz kötheti — a már
   * elindított, még nem kész letöltések „feloldása” (lejátszás + azonnali szünet: hang nem szól, a letöltés elindul).
   */
  function noteUserGesture(): void {
    entries.forEach((entry) => {
      if (entry.state !== "loading" || !entry.audio || entry.audio === activeAudio) return;
      const audio = entry.audio;
      try { audio.play().catch(() => { /* a feloldás nem hiba */ }); audio.pause(); } catch { /* hiányos felület */ }
    });
    // A próba nem a mozdulat pillanatában indul: ha a mozdulat maga egy „Meghallgatás” koppintás, a valódi kimondás elé nem állhat
    // be (Android: a `cancel()` utáni azonnali `speak()` megszakadhat). A beszédmotorhoz elég, hogy a lapon már volt felhasználói mozdulat.
    if (!probed && !probe && probeTimer === null) probeTimer = env.setTimeout(() => { probeTimer = null; startProbe(); }, PROBE_DELAY_MS);
  }

  // ---- Lejátszás ------------------------------------------------------------------------------------------------------------------
  /** Minden hang leállítása: böngészőhang, előre gyártott hang, tartalék MP3 és az indulási őrök (új koppintás, fülváltás, a lecke elhagyása). */
  function stop(): void {
    cancelActive?.();
    cancelActive = null;
    if (activeAudio) { activeAudio.pause(); activeAudio = null; }
    const synth = env.synth();
    // Android Chrome: a feltétel nélküli cancel() közvetlenül a speak() előtt az új kimondást is megszakíthatja.
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  }

  /** 1. lépés: az előre gyártott hang. Kész (pufferelt) elemnél a lejátszás azonnal indul; nem késznél kérésre töltődik. */
  function playPrepared(id: string, rate: number, done: StepDone): () => void {
    let entry = entries.get(id);
    if (!entry) { entry = { id, audio: null, state: "queued", attempts: 0, failedAt: null, timer: null }; entries.set(id, entry); }
    if (entry.state === "queued" || entry.state === "waiting" || entry.state === "failed") {
      env.clearTimeout(entry.timer);
      pending = pending.filter((other) => other !== id);
      entry.state = "queued";
      startLoad(entry);
    }
    const audio = entry.audio;
    if (!audio) { done("failed"); return () => {}; }
    let settled = false;
    const settle = (outcome: StepOutcome, failure?: PreparedFailure) => {
      if (settled) return;
      settled = true;
      env.clearTimeout(watchdog);
      audio.onplaying = null;
      if (outcome === "failed") {
        audio.pause();
        if (activeAudio === audio) activeAudio = null;
        // A hang hibája: a kulcs „nem elérhető”-re vált (a következő koppintás szinkron a böngészőhangra megy). Az időtúllépés és a
        // böngésző lejátszási tiltása nem a hang hibája — a pufferelés folytatódhat.
        if (failure === "error" && entry.audio === audio && entry.state !== "ready") loadFailed(entry);
        else if (failure === "error" && entry.audio === audio) { detach(entry); entry.state = "failed"; entry.failedAt = env.now(); }
      }
      done(outcome);
    };
    const watchdog = env.setTimeout(() => settle("failed", "timeout"), PREPARED_AUDIO_START_TIMEOUT_MS);
    audio.onplaying = () => settle("done");
    const previousError = audio.onerror;
    audio.onerror = () => { audio.onerror = previousError; settle("failed", "error"); };
    try { audio.currentTime = 0; } catch { /* még nincs pufferelt adat */ }
    audio.preservesPitch = true;
    audio.playbackRate = rate;
    activeAudio = audio;
    audio.play().catch((error: unknown) => {
      const name = error instanceof Error ? error.name : "";
      settle("failed", name === "NotAllowedError" ? "not-allowed" : name === "AbortError" ? "aborted" : "error");
    });
    return () => { settled = true; env.clearTimeout(watchdog); audio.onplaying = null; };
  }

  /** 2. lépés: a böngésző egy hangja. A kimenetel a munkamenet-ismeretbe kerül (igazolt / elbukott hang). */
  function speakWithVoice(synth: SynthLike, text: string, language: string, rate: number, voice: VoiceLike | undefined, startTimeoutMs: number, outcomes: VoiceOutcome[], done: StepDone): () => void {
    // A szakasz csendkerete elfogyott: ez a hang már nem próbálkozik (a lánc a tartalékra lép).
    if (startTimeoutMs <= 0) { done("failed"); return () => {}; }
    const utterance = env.createUtterance(text);
    if (!utterance) { done("failed"); return () => {}; }
    utterance.lang = language;
    utterance.rate = rate;
    // A motor a nem saját hangobjektumot elutasítja: ilyenkor a `lang` beállítás dönt.
    if (voice) { try { utterance.voice = voice; } catch { /* a lang dönt */ } }
    let settled = false;
    let started = false;
    const note = (outcome: VoiceOutcome) => { outcomes.push(outcome); knowledge = engineAfter(knowledge, voiceKey(voice), outcome); };
    const finish = (outcome: StepOutcome, failure?: VoiceOutcome) => {
      if (settled) return;
      settled = true;
      env.clearTimeout(watchdog);
      if (failure) note(failure);
      if (outcome === "failed" && (synth.speaking || synth.pending)) synth.cancel();
      done(outcome);
    };
    const begin = () => { if (!started) { started = true; note("started"); } };
    // Védőháló: ha a kimondás a kapott időn belül nem indul el, a következő lépés jön (igazolt hangnál ez ritka — a próba már lefutott).
    const watchdog = env.setTimeout(() => { if (!started) finish("failed", "timeout"); }, startTimeoutMs);
    utterance.onstart = begin;
    // Egyes motorok `onstart` nélkül szólnak: a szóhatár-esemény is indulás.
    utterance.onboundary = begin;
    utterance.onend = () => finish("done");
    utterance.onerror = (e: { error?: string }) => {
      if (settled) return;
      // A megszakítás (új koppintás, fülváltás) nem hiba: se másik hang, se üzenet. Ide csak a motor saját megszakítása jut: ha a kimondás
      // el sem indult (Android Chrome: a `cancel()` utáni azonnali `speak()`), a tanuló semmit sem hallott — a következő lépés szól.
      if (isSoftSpeechError(e?.error) && started) { finish("done"); return; }
      finish("failed", started ? undefined : "error");
    };
    try { synth.speak(utterance); } catch { finish("failed", "error"); }
    return () => { settled = true; env.clearTimeout(watchdog); };
  }

  /** 3. lépés: a szerver MP3-a azonos eredetről (/api/tts/audio). Lógó válasznál az őr hibára visz — üzenet jön, nem csend. */
  function playFallback(text: string, language: string, rate: number, done: StepDone): () => void {
    const url = ttsAudioUrl(text, language);
    if (!url) { done("failed"); return () => {}; }
    const audio = env.createAudio();
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      env.clearTimeout(watchdog);
      audio.pause();
      if (activeAudio === audio) activeAudio = null;
      done("failed");
    };
    const watchdog = env.setTimeout(fail, FALLBACK_AUDIO_START_TIMEOUT_MS);
    // A megszólalt tartalék lezárja a láncot (az őr és a későbbi hibaesemény már nem ad üzenetet).
    audio.onplaying = () => { if (settled) return; settled = true; env.clearTimeout(watchdog); done("done"); };
    audio.onerror = fail;
    audio.src = url;
    audio.playbackRate = rate;
    activeAudio = audio;
    audio.play().catch(fail);
    return () => { settled = true; env.clearTimeout(watchdog); };
  }

  /** Az előre gyártott hang állapota a koppintás pillanatában (szinkron). A még nem kész szó letöltése előre ugrik. */
  function preparedFor(text: string, language: string): { id: string; ready: boolean } | null {
    const id = preparedIds.get(preparedKey(text, language));
    const entry = id ? entries.get(id) : undefined;
    const candidate = preparedAudioCandidate({
      languageSupported: hasPreparedAudio(language), id, available: !!id && availableSizes.has(id),
      knownMissing: !!entry && entry.state === "failed" && failureActive(entry.failedAt, env.now()), ready: entry?.state === "ready",
    });
    if (candidate && !candidate.ready) prioritize(candidate.id);
    return candidate;
  }

  /**
   * A felolvasás lánca: a sorrendet a tiszta `speechPlan` adja, a lejátszó csak végrehajt — minden elbukott lépés után a terv következő
   * lépése jön. A koppintástól az első lépés indításáig nincs aszinkron várakozás (a hang a kattintás gesztusában indul).
   */
  function speak(text: string, language: string, rate: number, onError?: () => void): void {
    stop();
    cancelProbe();
    const synth = env.synth();
    const list = voices();
    const synthAvailable = !!synth && env.createUtterance("") !== undefined;
    const plan = speechPlan({
      language, voices: list, synthAvailable, prepared: preparedFor(text, language), engine: knowledge,
      offline: !env.connection().online, fallbackAvailable: !!ttsAudioUrl(text, language),
    });
    let cancelled = false;
    let cancelStep: () => void = () => {};
    const cancel = () => { cancelled = true; cancelStep(); };
    cancelActive = cancel;
    // A böngészőhang-szakasz összesített csendkerete az első hanglépés indulásától számít.
    let voicePhase: { startedAt: number; budgetMs: number } | null = null;
    const voiceOutcomes: VoiceOutcome[] = [];
    // A böngészőhang-szakasz lezárása (a tartalék indulásakor vagy a lánc végén): ha egyik hang sem adott eseményt, a motor néma —
    // a következő koppintás már nem várja végig a csendkeretet.
    const closeVoicePhase = () => { if (voiceOutcomes.length) knowledge = engineAfterRound(knowledge, voiceOutcomes.splice(0)); };
    const end = (failed: boolean) => {
      if (cancelActive === cancel) cancelActive = null;
      closeVoicePhase();
      if (failed) onError?.();
    };
    const run = (index: number) => {
      const step = plan[index];
      if (!step) { end(true); return; }
      // A lépés a `done`-t szinkron is hívhatja (pl. elfogyott csendkeret): a következő lépés csak a megszakító beállítása UTÁN indul,
      // különben a külső értékadás felülírná az új lépés megszakítóját.
      let started = false;
      let early: StepOutcome | null = null;
      const proceed = (outcome: StepOutcome) => {
        if (cancelled) return;
        const { next, exhausted } = nextSpeechStep(plan, index, outcome);
        if (next !== null) { run(next); return; }
        end(exhausted);
      };
      const done: StepDone = (outcome) => { if (started) proceed(outcome); else early = outcome; };
      if (step.kind === "prepared") cancelStep = playPrepared(step.id, rate, done);
      else if (step.kind === "voice") {
        const voice = step.voiceIndex === null ? undefined : list[step.voiceIndex];
        voicePhase ??= { startedAt: env.now(), budgetMs: voicePhaseBudgetMs(voice) };
        const startTimeoutMs = voiceStepTimeoutMs({ budgetMs: voicePhase.budgetMs, elapsedMs: env.now() - voicePhase.startedAt, network: voice?.localService === false, laterLocalVoice: hasLaterLocalVoice(plan, index, list) });
        cancelStep = speakWithVoice(synth!, text, language, rate, voice, startTimeoutMs, voiceOutcomes, done);
      } else { closeVoicePhase(); cancelStep = playFallback(text, language, rate, done); }
      started = true;
      if (early !== null) proceed(early);
    };
    run(0);
  }

  return {
    prepareLesson, release, setVisible, voicesChanged, noteUserGesture, speak, stop,
    /** Állapot a tesztekhez és a méréshez. */
    inspect: () => ({
      knowledge, probing: probe !== null, lessonLanguage: lesson?.language ?? null, pending: [...pending],
      entries: Array.from(entries.values(), (entry) => ({ id: entry.id, state: entry.state, attempts: entry.attempts })),
      available: Array.from(availableSizes.keys()),
    }),
  };
}
export type SpeechPlayer = ReturnType<typeof createSpeechPlayer>;

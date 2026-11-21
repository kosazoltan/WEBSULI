import {
  hasLaterLocalVoice, nextSpeechStep, preparedAudioCandidate, sizesFromManifest, speechPlan, voicePhaseBudgetMs, voiceStepTimeoutMs,
  FALLBACK_AUDIO_START_TIMEOUT_MS, PREPARED_AUDIO_START_TIMEOUT_MS, type StepOutcome,
} from "../../../shared/speech-chain";
import { isSoftSpeechError, ttsAudioUrl } from "../../../shared/speech-fallback";
import {
  engineAfter, engineAfterRound, engineAged, failureActive, manifestRetryDelayMs, mergeStoredManifest, nextPreloads, preloadPlan, prioritized, readStoredManifest,
  retryDelayMs, voiceKey, SPEECH_PRELOAD, UNKNOWN_ENGINE, type EngineKnowledge, type VoiceOutcome,
} from "../../../shared/speech-preload";
import { hasPreparedAudio, ttsAudioAvailabilityUrl, ttsAudioPath, TTS_AUDIO_AVAILABILITY_MAX_KEYS, TTS_VOICE_VERSION } from "../../../shared/tts-audio-key";

/**
 * Terv 2026-11-18-tananyag-gyartas-minoseg, S8d: a lecke felolvasásának lejátszója — React és közvetlen böngésző-hívás nélkül. A
 * környezet (óra, időzítő, hangelem-gyár, beszédmotor, jegyzék-lekérés, kapcsolat, tár) befecskendezett, így a lánc BEKÖTÉSE ál-órával
 * tesztelhető (tests/speech-player.test.ts). A döntéseket a tiszta modulok adják (`shared/speech-chain.ts`, `shared/speech-preload.ts`).
 *
 * Működés: a lecke megnyitásakor a jegyzék szerint meglévő hangok a háttérben, korlátozott párhuzamossággal `preload="auto"`
 * hangelemekbe töltődnek; koppintásra a pufferelt hang hálózati kör nélkül szól. A hangmotorról a lejátszó kizárólag a gyerek valódi
 * koppintásaiból tanul (kéretlen kimondás nincs): a megszólalt hang igazolt, a negatív ítélet nyelvenkénti és lejár.
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
  /** A jegyzék JSON-ja; nem sikeres válasznál (pl. 429) a szerver `Retry-After` értéke (ms), ha adott. Hálózati hibára elutasít. */
  fetchManifest(url: string, signal: AbortSignal): Promise<{ ok: true; body: unknown } | { ok: false; retryAfterMs: number | null }>;
  connection(): { saveData?: boolean; effectiveType?: string; online: boolean };
  /** A helyben megőrzött utolsó jegyzék (csak lenyomatok és méretek). */
  storage?: { read(): unknown; write(value: unknown): void };
};

type Entry = { id: string; audio: AudioLike | null; state: "queued" | "loading" | "ready" | "waiting" | "failed"; attempts: number; failedAt: number | null; timer: unknown };
type Lesson = { signature: string; language: string; ids: string[]; controller: AbortController; manifestUrl: string | null; manifestAt: number | null; retries: number; retryTimer: unknown };
type StepDone = (outcome: StepOutcome) => void;
type PreparedFailure = "error" | "timeout" | "not-allowed" | "aborted";

export function createSpeechPlayer(env: SpeechEnv) {
  const preparedIds = new Map<string, string>();
  const availableSizes = new Map<string, number>();
  const entries = new Map<string, Entry>();
  let pending: string[] = [];
  let lesson: Lesson | null = null;
  let visible = true;
  /** Hányszor került a lap háttérbe — a háttérben a böngésző a kimondást és az időzítőket visszafoghatja: az ilyen lejárat nem a hang hibája. */
  let hiddenCount = 0;
  /** A hangmotor ismerete a lecke NYELVE szerint (egy német lecke néma hangja nem némíthatja el az angol leckét). */
  const knowledge = new Map<string, EngineKnowledge>();
  /** Van-e a beszédsorban a lejátszó SAJÁT, még le nem zárt kimondása. */
  let ownUtterance = false;
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
      const reply = await env.fetchManifest(owner.manifestUrl, owner.controller.signal);
      if (reply.ok) { applyManifest(owner, sizesFromManifest(reply.body, owner.ids), true); return; }
      // Elutasított kérés (429): a szerver `Retry-After` értékét tiszteletben tartva, felső korláttal próbálunk újra — addig a böngészőhang szól.
      if (lesson !== owner || owner.retries >= SPEECH_PRELOAD.manifestRetries) return;
      owner.retries += 1;
      owner.retryTimer = env.setTimeout(() => { owner.retryTimer = null; if (lesson === owner) void loadManifest(owner); }, manifestRetryDelayMs(reply.retryAfterMs));
    } catch { /* hálózati hiba vagy megszakítás: a helyben megőrzött jegyzék marad érvényben */ }
  }

  /** A lecke megnyitása: kulcsok, jegyzék (egy kérés), majd előtöltés üresjáratban. Más nyelvű leckénél nincs hangtár-forgalom. */
  function prepareLesson(texts: readonly string[], language: string): void {
    // Ugyanaz a lecke (azonos nyelv és szövegek) újra: NINCS teendő — a szülő újrarenderelése új objektumokkal hívhat, de ettől sem a
    // szóló hang nem szakadhat meg, sem a pufferek nem dobódhatnak el, sem új jegyzék-kérés nem mehet. Csere csak valódi leckeváltáskor.
    const signature = `${language}\n${texts.join("\n")}`;
    if (lesson?.signature === signature) return;
    release();
    const owner: Lesson = { signature, language, ids: [], controller: new AbortController(), manifestUrl: null, manifestAt: null, retries: 0, retryTimer: null };
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
    // A lecke megnyitása / elhagyása nem a gyerek kifejezett „hallgass el” mozdulata: idegen kimondást nem szakít meg.
    stop(false);
    if (lesson) env.clearTimeout(lesson.retryTimer);
    lesson?.controller.abort();
    lesson = null;
    entries.forEach(detach);
    entries.clear();
    pending = [];
  }

  /** A lap láthatósága: háttérben új letöltés nem indul; visszatéréskor folytatódik, és a jegyzék (ritkítva) frissül. */
  function setVisible(next: boolean): void {
    if (visible && !next) hiddenCount += 1;
    visible = next;
    if (!visible || !lesson) return;
    if (lesson.manifestAt !== null && env.now() - lesson.manifestAt >= SPEECH_PRELOAD.manifestRefreshMs) void loadManifest(lesson);
    pump();
  }

  // ---- A hangmotor munkamenet-szintű ismerete (kizárólag valódi koppintásokból) ----------------------------------------------------
  const knowledgeFor = (language: string): EngineKnowledge => knowledge.get(language.toLowerCase()) ?? UNKNOWN_ENGINE;
  const learn = (language: string, update: (current: EngineKnowledge) => EngineKnowledge) => { knowledge.set(language.toLowerCase(), update(knowledgeFor(language))); };
  /** A hanglista megváltozott (`voiceschanged`): az addigi ismeret a régi listára szólt — újraépül a következő koppintásokból. */
  function voicesChanged(): void { knowledge.clear(); }
  /**
   * Valódi koppintás (`click`) a lapon — iOS: a böngésző a hangelem letöltését felhasználói aktivációhoz kötheti, ezért a már elindított,
   * még nem kész letöltéseket „megérintjük” (lejátszás + azonnali szünet: hang nem szól, a letöltés elindul). Itt SEMMI nem mond ki,
   * nem áll a beszédsorba és nem szakít meg kimondást — a beszédmotorhoz a lejátszó csak a „Meghallgatás” koppintására nyúl.
   */
  function noteUserActivation(): void {
    entries.forEach((entry) => {
      if (entry.state !== "loading" || !entry.audio || entry.audio === activeAudio) return;
      const audio = entry.audio;
      try { audio.play().catch(() => { /* a feloldás nem hiba */ }); audio.pause(); } catch { /* hiányos felület */ }
    });
  }
  // ---- Lejátszás ------------------------------------------------------------------------------------------------------------------
  /**
   * Minden hang leállítása: böngészőhang, előre gyártott hang, tartalék MP3 és az indulási őrök. `foreignSpeech`: a közös beszédmotor
   * más kimondását (a lecke „Felolvasás” gombja, a kisfilm narrációja) CSAK a gyerek kifejezett mozdulata állíthatja le (új
   * „Meghallgatás” koppintás, fülváltás — egyszerre egy hang szól). A lecke megnyitása / elhagyása és a háttérmunka csak a lejátszó
   * SAJÁT kimondását szakítja meg.
   */
  function stop(foreignSpeech = true): void {
    cancelActive?.();
    cancelActive = null;
    if (activeAudio) { activeAudio.pause(); activeAudio = null; }
    const synth = env.synth();
    const own = ownUtterance;
    ownUtterance = false;
    // Android Chrome: a feltétel nélküli cancel() közvetlenül a speak() előtt az új kimondást is megszakíthatja.
    if (synth && (foreignSpeech || own) && (synth.speaking || synth.pending)) synth.cancel();
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

  /**
   * 2. lépés: a böngésző egy hangja. A kimenetel a nyelv munkamenet-ismeretébe kerül: a `start` esemény igazolja a hangot; a kemény
   * hiba és az esemény nélküli lejárat LEJÁRÓ negatív ítélet. A megszakítás és a hiányzó aktiváció nem a hang hibája.
   */
  function speakWithVoice(synth: SynthLike, text: string, language: string, rate: number, voice: VoiceLike | undefined, startTimeoutMs: number, outcomes: VoiceOutcome[], done: (outcome: StepOutcome, skipVoices?: boolean) => void): () => void {
    // A szakasz csendkerete elfogyott: ez a hang már nem próbálkozik (a lánc a tartalékra lép).
    if (startTimeoutMs <= 0) { done("failed"); return () => {}; }
    let settled = false;
    let started = false;
    let retried = false;
    const hiddenAtStart = visible ? hiddenCount : -1;
    const note = (outcome: VoiceOutcome) => { outcomes.push(outcome); learn(language, (current) => engineAfter(current, voiceKey(voice), outcome)); };
    const finish = (outcome: StepOutcome, failure?: VoiceOutcome, skipVoices?: boolean) => {
      if (settled) return;
      settled = true;
      env.clearTimeout(watchdog);
      ownUtterance = false;
      if (failure) note(failure);
      // Az el nem indult / elbukott SAJÁT kimondás nem maradhat a beszédsorban (különben a következő lépés alatt megszólalna).
      if (outcome === "failed" && (synth.speaking || synth.pending)) synth.cancel();
      done(outcome, skipVoices);
    };
    const begin = () => { if (!started) { started = true; note("started"); } };
    // Védőháló: ha a kimondás a kapott időn belül nem indul el, a következő lépés jön (igazolt hangnál ez ritka).
    // Ha a lap a lépés alatt háttérben volt, a lejárat nem ítélet (visszatérés után a következő koppintás újra a legjobb hangot próbálja).
    const watchdog = env.setTimeout(() => { if (!started) finish("failed", hiddenAtStart === hiddenCount ? "timeout" : undefined); }, startTimeoutMs);
    const say = (): boolean => {
      const utterance = env.createUtterance(text);
      if (!utterance) return false;
      utterance.lang = language;
      utterance.rate = rate;
      // A motor a nem saját hangobjektumot elutasítja: ilyenkor a `lang` beállítás dönt.
      if (voice) { try { utterance.voice = voice; } catch { /* a lang dönt */ } }
      utterance.onstart = begin;
      // Egyes motorok `onstart` nélkül szólnak: a szóhatár-esemény is indulás.
      utterance.onboundary = begin;
      utterance.onend = () => finish("done");
      utterance.onerror = (e: { error?: string }) => {
        if (settled) return;
        // A megszakítás (új koppintás, fülváltás) nem hiba: se másik hang, se üzenet.
        if (isSoftSpeechError(e?.error) && started) { finish("done"); return; }
        if (started) { finish("failed"); return; }
        // El sem indult, a motor mégis megszakítottnak jelzi (Android Chrome: a `cancel()` utáni azonnali `speak()`): NEM a hang hibája —
        // ugyanaz a hang kap egy újrapróbát; ha az is megszakad, a lánc a tartalékra lép (más, gyengébb hang nem szól helyette).
        if (isSoftSpeechError(e?.error)) { if (!retried) { retried = true; if (say()) return; } finish("failed", undefined, true); return; }
        // Hiányzó felhasználói aktiváció: a böngésző nem engedi a kimondást — ez sem a hang hibája, és másik hang ugyanígy járna.
        if (e?.error === "not-allowed") { finish("failed", undefined, true); return; }
        finish("failed", "error");
      };
      ownUtterance = true;
      try { synth.speak(utterance); } catch { return false; }
      return true;
    };
    if (!say()) finish("failed", "error");
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
    const synth = env.synth();
    const list = voices();
    const synthAvailable = !!synth && env.createUtterance("") !== undefined;
    // A terv a koppintás ELŐTTI ismeretből készül; a koppintás a lejáró negatív ítéletek egy egységét „elhasználja”.
    const engine = knowledgeFor(language);
    learn(language, engineAged);
    const plan = speechPlan({
      language, voices: list, synthAvailable, prepared: preparedFor(text, language), engine,
      offline: !env.connection().online, fallbackAvailable: !!ttsAudioUrl(text, language),
    });
    let cancelled = false;
    let cancelStep: () => void = () => {};
    const cancel = () => { cancelled = true; cancelStep(); };
    cancelActive = cancel;
    // A böngészőhang-szakasz összesített csendkerete az első hanglépés indulásától számít.
    let voicePhase: { startedAt: number; budgetMs: number } | null = null;
    const voiceOutcomes: VoiceOutcome[] = [];
    // A böngészőhang-szakasz lezárása (a tartalék indulásakor vagy a lánc végén): ha egyik hang sem adott eseményt, a motor a következő
    // koppintásokra némának számít — azok nem várják végig újra a csendkeretet.
    const closeVoicePhase = () => { const outcomes = voiceOutcomes.splice(0); if (outcomes.length) learn(language, (current) => engineAfterRound(current, outcomes)); };
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
      let early: { outcome: StepOutcome; skipVoices?: boolean } | null = null;
      const proceed = (outcome: StepOutcome, skipVoices?: boolean) => {
        if (cancelled) return;
        const { next, exhausted } = nextSpeechStep(plan, index, outcome, { skipVoices });
        if (next !== null) { run(next); return; }
        end(exhausted);
      };
      const done = (outcome: StepOutcome, skipVoices?: boolean) => { if (started) proceed(outcome, skipVoices); else early = { outcome, skipVoices }; };
      if (step.kind === "prepared") cancelStep = playPrepared(step.id, rate, done);
      else if (step.kind === "voice") {
        const voice = step.voiceIndex === null ? undefined : list[step.voiceIndex];
        voicePhase ??= { startedAt: env.now(), budgetMs: voicePhaseBudgetMs(voice) };
        const startTimeoutMs = voiceStepTimeoutMs({ budgetMs: voicePhase.budgetMs, elapsedMs: env.now() - voicePhase.startedAt, network: voice?.localService === false, laterLocalVoice: hasLaterLocalVoice(plan, index, list) });
        cancelStep = speakWithVoice(synth!, text, language, rate, voice, startTimeoutMs, voiceOutcomes, done);
      } else { closeVoicePhase(); cancelStep = playFallback(text, language, rate, done); }
      started = true;
      const pendingEarly = early as { outcome: StepOutcome; skipVoices?: boolean } | null;
      if (pendingEarly) proceed(pendingEarly.outcome, pendingEarly.skipVoices);
    };
    run(0);
  }
  return {
    prepareLesson, release, setVisible, voicesChanged, noteUserActivation, speak, stop,
    /** Állapot a tesztekhez és a méréshez. */
    inspect: () => ({
      knowledge: knowledgeFor(lesson?.language ?? ""), knowledgeFor, lessonLanguage: lesson?.language ?? null, pending: [...pending],
      entries: Array.from(entries.values(), (entry) => ({ id: entry.id, state: entry.state, attempts: entry.attempts })),
      available: Array.from(availableSizes.keys()),
    }),
  };
}
export type SpeechPlayer = ReturnType<typeof createSpeechPlayer>;

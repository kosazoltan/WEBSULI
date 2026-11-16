/**
 * J0c — React-kötés a kérdés-ütemezőhöz és a nem blokkoló kérdés-sávhoz (végrehajtás J0c „Szerződés”; terv 4.1/2–4, J1,
 * J4, J5, J14; K.2 „Kérdés-életciklus”).
 *
 * Két réteg:
 *  - `useQuestionDirector` — a szerződés szerinti kötés: laponként EGY ismétlési sor (`createReviewQueue(safeLocalStorage())`),
 *    menetenként egy director (`reset()` → új director → `review.startRun()`, J0b 9. eltérés). Seedelt:
 *    `createRng(seedFrom(gameId, seed, "q"))`.
 *  - `usePlayQuestion` — a játéklap EGYETLEN horga: a fenti directort (vagy a játék sim-magjának saját directorát) köti a
 *    kérdés-sávhoz. Ő hívja képkockánként a `tick` / `expire`-t, kezeli a hibás válasz utáni megoldás-kijelzést
 *    (≥ 1,8 mp), a „Miért?” ablakát (a kijelzés + 4 mp), a hangot, a rezgést és a felolvasást, és a React-állapotot
 *    legfeljebb ~10 Hz-cel frissíti (KSZ-9: a képkocka-hurokban nincs képkockánkénti `setState`).
 *
 * IDŐ: minden `clockMs` a LASSÍTATLAN kérdés-óra (J0b 7. eltérés): szünetben áll, a `slowMo` nem lassítja. A szimulációt a
 * játék a `q.timeScale()`-lel lépteti (`loop.setTimeScale(q.timeScale())`): nyitott kérdésnél `presentation.slowMo`
 * (≥ 0,35), egyébként 1 — a megoldás-kijelzés alatt is 1 (J5: hibás válasz után teljes sebesség).
 *
 * Bekötés (játéklap, vázlat):
 *
 *   const speech = useGameSpeech();
 *   const q = usePlayQuestion({
 *     setup: { config, provider, startBand, seed: readGameSeed() ?? seedFrom(GAME_ID, dayKey) },
 *     speech,
 *     onOutcome: (o, p) => world.applyAnswer(o.result === "correct", p),   // ≤ 2 s játékbeli következmény (K.4/23)
 *   });
 *   // képkockánként, a játékhurokban (questionClockMs: a nem szüneteltetett valós idő összege):
 *   q.frame(questionClockMs, { calm: intensity.calm() });
 *   loop.setTimeScale(paused ? 0 : q.timeScale());
 *   // a világban rajzolt célpont eltalálva:  q.pick(optionIndex);   boss-fázis:  q.request("boss", questionClockMs);
 *   // render:
 *   <InlineQuestion {...q.bind} mode="bar" skin="ocean" disabled={paused} onWhy={openWhy}
 *     testId="ts-quiz" promptTestId="ts-prompt" optionTestId={(i) => `ts-option-${i}`}
 *     pauseTestId="ts-quiz-pause" onPause={pauseGame} />
 *   // MENETVÉG (győzelem, vereség, időlejárat, utolsó hullám) — a képkockában a frame ELŐTT, idempotens:
 *   if (runOver && !q.finished()) q.finish();   // új kérdés nem indul; nyitott kérdés „aborted” (nem hiba, nem ismétlés)
 *   q.frame(questionClockMs, { calm });          // a futó megoldás-kijelzés (≥ 1,8 mp) még kifut
 *   if (q.settled()) showResult();               // csak a kijelzés után az eredményképernyő
 *   // eredmény:  <ResultReview items={q.director!.wrongList()} />   új menet:  q.reset(newSeed, startBand);
 *   // „Miért?”:  const item = q.view().whyItem → buildFeedback({ quiz: item.quiz, chosenIndex: item.pickedOriginalIndex, … })
 *   // sim-magos játék: új kérdést csak `q.canAsk()` mellett kérjen a directortól; unmountkor a horog maga zár (dispose → finish).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { createRng, seedFrom } from "@shared/game-rng";
import { sfxStumble, sfxSuccess, sfxWhoosh } from "@/lib/audioEngine";
import type { StorageLike } from "@/game-engine/vocab";
import type { FourChoiceQuiz } from "@/types/gameQuiz";
import { safeLocalStorage } from "@/game-engine/vocab";
import { useHaptics } from "@/game-engine/mobile/haptics";

import { createQuestionDirector, type DirectorConfig, type QuestionDirector, type QuestionProvider } from "./questionDirector";
import { createReviewQueue, type ReviewQueue } from "./reviewQueue";
import type { GameSpeech } from "./speech";
import type { QuestionOutcome, QuestionPresentation } from "./types";

/* ------------------------------------------------------------------------------------------------------------------ */
/* useQuestionDirector (szerződés)                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export type UseQuestionDirectorOptions = {
  config: DirectorConfig;
  provider: QuestionProvider;
  startBand: number;
  /** `readGameSeed() ?? seedFrom(gameId, …)`; szám vagy szöveg (a `seedFrom` szöveget ad). */
  seed: number | string;
  /** Alap: `safeLocalStorage()`. A próbaoldal memória-tárat ad, hogy a valódi ismétlési sort ne szennyezze. */
  storage?: StorageLike | null;
};

function makeDirector(o: UseQuestionDirectorOptions, review: ReviewQueue, seed: number | string, startBand: number): QuestionDirector {
  return createQuestionDirector({
    config: o.config,
    provider: o.provider,
    review,
    rng: createRng(seedFrom(o.config.gameId, seed, "q")),
    startBand,
  });
}

export function useQuestionDirector(opts: UseQuestionDirectorOptions): { director: QuestionDirector; reset(seed: number | string, startBand: number): void };
export function useQuestionDirector(opts: UseQuestionDirectorOptions | null): { director: QuestionDirector | null; reset(seed: number | string, startBand: number): void };
export function useQuestionDirector(opts: UseQuestionDirectorOptions | null): { director: QuestionDirector | null; reset(seed: number | string, startBand: number): void } {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const reviewRef = useRef<ReviewQueue | null>(null);
  const review = (): ReviewQueue => {
    if (!reviewRef.current) {
      const o = optsRef.current;
      reviewRef.current = createReviewQueue(o && o.storage !== undefined ? o.storage : safeLocalStorage());
    }
    return reviewRef.current;
  };
  const [director, setDirector] = useState<QuestionDirector | null>(() => (opts ? makeDirector(opts, review(), opts.seed, opts.startBand) : null));
  // Ha a lap később kapja meg a beállítást (pl. a szóbank betöltése után), egyszer létrejön.
  useEffect(() => {
    if (!director && opts) setDirector(makeDirector(opts, review(), opts.seed, opts.startBand));
  }, [director, opts === null]);
  const reset = useCallback((seed: number | string, startBand: number) => {
    const o = optsRef.current;
    if (!o) return;
    setDirector(makeDirector(o, review(), seed, startBand));
  }, []);
  return { director, reset };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A kérdés-sáv vezérlője (tiszta, React nélkül tesztelhető)                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Hibás / lejárt válasz után ennyi kérdés-óra ms-ig látszik a megoldás (terv 4.1/2, J4: ≥ 1,8 mp). */
export const REVEAL_WRONG_MS = 2000;
/** Helyes válasz visszajelzése (rövid: a lendület ne törjön meg). */
export const REVEAL_CORRECT_MS = 900;
/** A „Miért?” a megoldás-kijelzés VÉGE után még ennyi ideig elérhető (végrehajtás J0c `onWhy`) — a következő kérdéstől függetlenül. */
export const WHY_LINGER_MS = 4000;
/** A sáv hátralévő idejének React-frissítési lépcsője (≈ 10 Hz, KSZ-9). */
export const VIEW_STEP_MS = 100;

export type QuestionReveal = { correctOptionIndex: number; pickedOptionIndex: number | null };
export type QuestionRequestReason = "trigger" | "boss" | "rescue";
/** A „Miért?” tárgya: a legutóbbi hibás / lejárt tétel (a `buildFeedback` bemenete). */
export type QuestionWhyItem = { quiz: FourChoiceQuiz; pickedOriginalIndex: number | null; presentationId: number };

export type QuestionUiView = {
  /** A nyitott kérdés, vagy megoldás-kijelzés közben a kijelzett kérdés. */
  presentation: QuestionPresentation | null;
  remainingMs: number;
  /** Csak megoldás-kijelzés közben nem null (nyitott kérdés mellett mindig null). */
  reveal: QuestionReveal | null;
  whyVisible: boolean;
  /** „current”: a kijelzett kérdéshez; „previous”: az előző hibához, miközben már az új kérdés látszik. */
  whyFor: "current" | "previous" | null;
  whyItem: QuestionWhyItem | null;
  lastOutcome: QuestionOutcome | null;
  /** Kijelzés alatt beérkezett, a kijelzés végén induló kérés. */
  pending: QuestionRequestReason | null;
};

export const EMPTY_VIEW: QuestionUiView = {
  presentation: null, remainingMs: 0, reveal: null, whyVisible: false, whyFor: null, whyItem: null, lastOutcome: null, pending: null,
};

export type QuestionUi = {
  /**
   * Képkockánként. `tick: false` → a director `tick`-jét nem hívja (a játék sim-magja ütemez), csak megjelenít.
   * `hold: true` → új kérdés NEM indul (se ütemezett, se függő): menet vége, főellenfél-bevezető; a futó kijelzés lejár.
   */
  frame(clockMs: number, ctx?: { calm?: boolean; tick?: boolean; hold?: boolean }): void;
  /**
   * Azonnali kérdés-kérés. Nyitott kérdésnél null. Megoldás-kijelzés alatt NEM vágja el a kijelzést: a kérés várakozik
   * (egy függő kérés, a legsürgősebb nyer: rescue > boss > trigger), és a kijelzés végén indul — ilyenkor null.
   */
  request(reason: QuestionRequestReason, clockMs: number): QuestionPresentation | null;
  /** A `presentation.options` indexe. Kijelzés közben / kérdés nélkül null; az ablak lejárta után (clock ≥ határidő) lejárat. */
  pick(optionIndex: number, clockMs?: number): QuestionOutcome | null;
  /** Kilépés / kuponlejárat: a nyitott kérdés „aborted”, a kijelzés és a függő kérés törlődik. */
  abort(): QuestionOutcome | null;
  /**
   * Menet vége (győzelem, vereség, időlejárat, utolsó hullám) — idempotens. Utána sem ütemezett, sem kért, sem függő
   * kérdés nem indul (a `reset()` nyit új menetet). A már látszó megoldás-kijelzés a szabály szerint kifut (≥ 1,8 mp).
   * Nyitott kérdés „aborted” kimenettel záródik: nem számít hibának, nem kerül az ismétlési sorba (a `reviewQueue.record`
   * az „aborted”-et figyelmen kívül hagyja) és nem kerül a „Gyakorold még” listába. Visszaadja a megszakított kérdés
   * kimenetét (vagy null). Unmountkor (`dispose`) is lefut, visszahívás nélkül.
   */
  finish(): QuestionOutcome | null;
  /** Lezárt-e a menet (`finish` után, `reset`-ig). */
  finished(): boolean;
  /** Lezárt ÉS a kijelzés is lefutott: a lap most mutathatja az eredményképernyőt. */
  settled(): boolean;
  timeScale(): number;
  /** A director nyitott kérdése (megoldás-kijelzés közben már null). */
  active(): QuestionPresentation | null;
  /** Indíthat-e most új kérdést a játék sim-magja (nincs nyitott kérdés és nincs megoldás-kijelzés). */
  canAsk(): boolean;
  view(): QuestionUiView;
  /** Új menet: minden állapot törlődik (függő kérés, „Miért?” is). */
  reset(): void;
  /** Leválasztás (unmount): utána minden hívás hatástalan, állapotírás nincs. `attach()` visszakapcsol. */
  dispose(): void;
  attach(): void;
};

const URGENCY: Record<QuestionRequestReason, number> = { trigger: 0, boss: 1, rescue: 2 };

/**
 * A kérdés-sáv állapotgépe (tiszta, DOM / React nélkül — a hét játék ugyanazt a bizonyított viselkedést kapja,
 * `T/game-play-question-ui.test.ts`). Állapotok: üres → nyitott (`open`) → kijelzés (`rev`, ≥ 1,8 mp hibánál) → üres.
 * Szabályok:
 *  - kijelzés alatt új kérdés nem jelenik meg (se ütemezett, se kért, se boss / rescue): a kérés függőben vár;
 *  - a „Miért?” határideje a hibához tartozik (kijelzés vége + 4 mp), az új kérdés megjelenése nem nullázza;
 *  - minden idő a kérdés-óra (szünetben áll): a kijelzés és a „Miért?” ablaka is megáll szünetben;
 *  - válasz csak a határidő előtt számít; utána a válasz lejáratként záródik.
 */
export function createQuestionUi(opts: {
  director: () => QuestionDirector | null;
  onView: (v: QuestionUiView) => void;
  onShow?: (p: QuestionPresentation) => void;
  onOutcome?: (o: QuestionOutcome, p: QuestionPresentation) => void;
  revealWrongMs?: number;
  revealCorrectMs?: number;
  whyMs?: number;
}): QuestionUi {
  const revealWrongMs = Math.max(1800, opts.revealWrongMs ?? REVEAL_WRONG_MS);
  const revealCorrectMs = opts.revealCorrectMs ?? REVEAL_CORRECT_MS;
  const whyMs = opts.whyMs ?? WHY_LINGER_MS;

  let open: QuestionPresentation | null = null;
  let rev: { p: QuestionPresentation; reveal: QuestionReveal; until: number; frozenMs: number } | null = null;
  let pending: QuestionRequestReason | null = null;
  let why: { item: QuestionWhyItem; until: number } | null = null;
  let lastOutcome: QuestionOutcome | null = null;
  let clock = 0;
  let disposed = false;
  let ended = false;
  let emitted: QuestionUiView = EMPTY_VIEW;

  const deadline = (p: QuestionPresentation) => p.startedAtSimMs + p.windowMs;

  function snapshot(): QuestionUiView {
    const presentation = open ?? rev?.p ?? null;
    const whyLive = why !== null && clock < why.until;
    const whyFor = !whyLive || !why ? null : rev && rev.p.id === why.item.presentationId ? "current" : "previous";
    return {
      presentation,
      remainingMs: open ? Math.max(0, deadline(open) - clock) : rev ? rev.frozenMs : 0,
      reveal: open ? null : rev?.reveal ?? null,
      whyVisible: whyLive,
      whyFor,
      whyItem: whyLive && why ? why.item : null,
      lastOutcome,
      pending,
    };
  }

  function emit(force = false): void {
    if (disposed) return;
    const v = snapshot();
    const changed =
      force ||
      v.presentation !== emitted.presentation ||
      v.reveal !== emitted.reveal ||
      v.whyVisible !== emitted.whyVisible ||
      v.whyFor !== emitted.whyFor ||
      v.lastOutcome !== emitted.lastOutcome ||
      v.pending !== emitted.pending ||
      Math.abs(v.remainingMs - emitted.remainingMs) >= VIEW_STEP_MS ||
      (v.remainingMs === 0) !== (emitted.remainingMs === 0);
    if (!changed) return;
    emitted = v;
    opts.onView(v);
  }

  function show(p: QuestionPresentation): void {
    open = p;
    rev = null;
    opts.onShow?.(p);
  }

  function settle(o: QuestionOutcome | null, p: QuestionPresentation): QuestionOutcome | null {
    if (!o) return null;
    lastOutcome = o;
    open = null;
    if (o.result === "aborted") {
      rev = null;
    } else {
      const correctIdx = p.options.findIndex((opt) => opt.correct);
      const pickedIdx = o.pickedOriginalIndex === null ? -1 : p.options.findIndex((opt) => opt.originalIndex === o.pickedOriginalIndex);
      const dur = o.result === "correct" ? revealCorrectMs : revealWrongMs;
      rev = {
        p,
        reveal: { correctOptionIndex: correctIdx, pickedOptionIndex: pickedIdx === -1 ? null : pickedIdx },
        until: clock + dur,
        frozenMs: Math.max(0, deadline(p) - clock),
      };
      if (o.result === "wrong" || o.result === "timeout") {
        why = { item: { quiz: p.question.quiz, pickedOriginalIndex: o.pickedOriginalIndex, presentationId: p.id }, until: clock + dur + whyMs };
      }
    }
    opts.onOutcome?.(o, p);
    emit(true);
    return o;
  }

  const api: QuestionUi = {
    frame(clockMs, ctx) {
      if (disposed) return;
      clock = clockMs;
      const d = opts.director();
      if (!d) {
        emit();
        return;
      }
      if (open) {
        const act = d.active();
        if (!act || act.id !== open.id) open = null; // a sim-mag maga válaszolt / szakította meg
        else if (clockMs >= deadline(open)) settle(d.expire(clockMs), open);
      }
      if (rev && clockMs >= rev.until) rev = null;
      // A menetvég / tartás ellenőrzése az új kérdés indítása ELŐTT (review #446).
      if (!open && !rev && !ended && !ctx?.hold) {
        let next = d.active();
        if (!next && pending) {
          next = d.request(pending, clockMs);
          if (next) pending = null;
        }
        if (!next && ctx?.tick !== false) next = d.tick(clockMs, { calm: ctx?.calm ?? true });
        if (next) show(next);
      }
      emit();
    },
    request(reason, clockMs) {
      if (disposed || ended) return null;
      clock = clockMs;
      const d = opts.director();
      if (!d || open) return null;
      if (rev) {
        if (pending === null || URGENCY[reason] > URGENCY[pending]) pending = reason;
        emit(true);
        return null;
      }
      const p = d.request(reason, clockMs);
      if (p) {
        pending = null;
        show(p);
        emit(true);
      }
      return p;
    },
    pick(optionIndex, clockMs) {
      if (disposed) return null;
      if (clockMs !== undefined) clock = clockMs;
      const d = opts.director();
      if (!d || !open) return null;
      const p = open;
      if (clock >= deadline(p)) return settle(d.expire(clock), p);
      return settle(d.answer(p.id, optionIndex, clock), p);
    },
    abort() {
      if (disposed) return null;
      pending = null;
      const d = opts.director();
      let o: QuestionOutcome | null = null;
      if (d && open) o = settle(d.abort(), open);
      open = null;
      rev = null;
      emit(true);
      return o;
    },
    finish() {
      if (ended) return null;
      ended = true;
      pending = null;
      const d = opts.director();
      if (disposed) {
        // Unmount: a director ne maradjon nyitott kérdéssel, de visszahívás / állapotírás nincs.
        if (d && open) d.abort();
        open = null;
        return null;
      }
      const o = d && open ? settle(d.abort(), open) : null;
      open = null;
      emit(true);
      return o;
    },
    finished: () => ended,
    settled: () => ended && !open && !rev,
    timeScale: () => (open ? open.slowMo : 1),
    active: () => opts.director()?.active() ?? null,
    canAsk: () => !ended && !open && !rev,
    view: () => emitted,
    reset() {
      ended = false;
      open = null;
      rev = null;
      pending = null;
      why = null;
      lastOutcome = null;
      emit(true);
    },
    dispose() {
      disposed = true;
      api.finish();
    },
    attach() {
      disposed = false;
      ended = false;
    },
  };
  return api;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* usePlayQuestion — a játéklap egyetlen horga                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export type UsePlayQuestionOptions = {
  /** A lap saját directora (pl. a sim-mag hozza létre). Ha nincs, a `setup` alapján a horog hozza létre. */
  director?: QuestionDirector | null;
  setup?: UseQuestionDirectorOptions | null;
  /** Felolvasás: új nyelvi kérdésnél automatikusan (ha a kapu enged), és a 🔊 gombra. */
  speech?: GameSpeech | null;
  /** Hang (alap: igen) és rezgés (alap: igen) a megjelenésre / kimenetre; a némítást mindkettő tiszteli. */
  sound?: boolean;
  haptics?: boolean;
  revealWrongMs?: number;
  onShow?: (p: QuestionPresentation) => void;
  /** A játékbeli következmény (fegyver, horgony, sáv …) helye — ≤ 2 s-on belül (K.4/23). */
  onOutcome?: (o: QuestionOutcome, p: QuestionPresentation) => void;
};

export type PlayQuestionBind = {
  presentation: QuestionPresentation | null;
  remainingMs: number;
  reveal: QuestionReveal | null;
  whyVisible: boolean;
  whyFor: "current" | "previous" | null;
  onPick: (optionIndex: number) => void;
  onSpeak?: () => void;
};

export type PlayQuestionApi = QuestionUi & {
  director: QuestionDirector | null;
  /** Új menet: új director (ha a horog hozta létre) és tiszta sáv. */
  reset(seed?: number | string, startBand?: number): void;
  /** React-állapot (≈ 10 Hz + eseményre). */
  state: QuestionUiView;
  /** Az `InlineQuestion`-be terítendő propok. */
  bind: PlayQuestionBind;
};

export function usePlayQuestion(opts: UsePlayQuestionOptions): PlayQuestionApi {
  const own = useQuestionDirector(opts.setup ?? null);
  const director = opts.director !== undefined ? opts.director : own.director;
  const directorRef = useRef(director);
  directorRef.current = director;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const vibrate = useHaptics();
  const vibrateRef = useRef(vibrate);
  vibrateRef.current = vibrate;

  const store = useMemo(() => {
    let view: QuestionUiView = EMPTY_VIEW;
    const listeners = new Set<() => void>();
    return {
      get: () => view,
      set: (v: QuestionUiView) => {
        view = v;
        for (const l of listeners) l();
      },
      subscribe: (l: () => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
  }, []);

  const ui = useMemo(
    () =>
      createQuestionUi({
        director: () => directorRef.current,
        onView: store.set,
        revealWrongMs: optsRef.current.revealWrongMs,
        onShow: (p) => {
          const o = optsRef.current;
          if (o.sound !== false) sfxWhoosh();
          const q = p.question;
          if (o.speech && q.speakText && q.lang) o.speech.say(q.speakText, q.lang);
          o.onShow?.(p);
        },
        onOutcome: (out, p) => {
          const o = optsRef.current;
          if (out.result !== "aborted") {
            const good = out.result === "correct";
            if (o.sound !== false) (good ? sfxSuccess : sfxStumble)();
            if (o.haptics !== false) vibrateRef.current(good ? "success" : "error");
          }
          o.onOutcome?.(out, p);
        },
      }),
    [store],
  );

  const state = useSyncExternalStore(store.subscribe, store.get, store.get);

  // Unmount után nincs állapotírás / hang / visszahívás (a StrictMode kettős futtatása miatt mountkor visszakapcsol).
  useEffect(() => {
    ui.attach();
    return () => ui.dispose();
  }, [ui]);

  // Director-csere (új menet): a sáv tiszta lappal indul.
  useEffect(() => {
    ui.reset();
  }, [director, ui]);

  const onPick = useCallback((i: number) => {
    ui.pick(i);
  }, [ui]);

  const p = state.presentation;
  const speech = opts.speech;
  const canSpeak = !!(p && p.question.speakText && p.question.lang && speech && speech.available());
  const onSpeak = useCallback(() => {
    const cur = store.get().presentation;
    const s = optsRef.current.speech;
    if (!cur || !s || !cur.question.speakText || !cur.question.lang) return;
    s.arm(); // a 🔊 koppintás maga is felhasználói gesztus
    s.say(cur.question.speakText, cur.question.lang);
  }, [store]);

  const ownReset = own.reset;
  const reset = useCallback(
    (seed?: number | string, startBand?: number) => {
      const setup = optsRef.current.setup;
      if (setup && optsRef.current.director === undefined) ownReset(seed ?? setup.seed, startBand ?? setup.startBand);
      ui.reset();
    },
    [ownReset, ui],
  );

  const bind: PlayQuestionBind = {
    presentation: state.presentation,
    remainingMs: state.remainingMs,
    reveal: state.reveal,
    whyVisible: state.whyVisible,
    whyFor: state.whyFor,
    onPick,
    ...(canSpeak ? { onSpeak } : {}),
  };

  return { ...ui, director, reset, state, bind };
}

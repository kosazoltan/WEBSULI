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
 *   // új menet:  q.reset(newSeed, startBand);   eredmény:  <ResultReview items={q.director.wrongList()} />
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { createRng, seedFrom } from "@shared/game-rng";
import { sfxStumble, sfxSuccess, sfxWhoosh } from "@/lib/audioEngine";
import type { StorageLike } from "@/game-engine/vocab";
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
/** A „Miért?” a megoldás-kijelzés után még ennyi ideig elérhető (végrehajtás J0c `onWhy`). */
export const WHY_LINGER_MS = 4000;
/** A sáv hátralévő idejének React-frissítési lépcsője (≈ 10 Hz, KSZ-9). */
export const VIEW_STEP_MS = 100;

export type QuestionReveal = { correctOptionIndex: number; pickedOptionIndex: number | null };

export type QuestionUiView = {
  presentation: QuestionPresentation | null;
  remainingMs: number;
  reveal: QuestionReveal | null;
  whyVisible: boolean;
  lastOutcome: QuestionOutcome | null;
};

export const EMPTY_VIEW: QuestionUiView = { presentation: null, remainingMs: 0, reveal: null, whyVisible: false, lastOutcome: null };

export type QuestionUi = {
  /** Képkockánként; `tick: false` → a director `tick`-jét nem hívja (a játék sim-magja ütemez), csak megjelenít. */
  frame(clockMs: number, ctx?: { calm?: boolean; tick?: boolean }): void;
  request(reason: "trigger" | "boss" | "rescue", clockMs: number): QuestionPresentation | null;
  /** A `presentation.options` indexe. Megoldás-kijelzés közben / kérdés nélkül null. */
  pick(optionIndex: number, clockMs?: number): QuestionOutcome | null;
  abort(): QuestionOutcome | null;
  timeScale(): number;
  /** A director nyitott kérdése (megoldás-kijelzés közben már null). */
  active(): QuestionPresentation | null;
  view(): QuestionUiView;
  reset(): void;
};

export function createQuestionUi(opts: {
  director: () => QuestionDirector | null;
  onView: (v: QuestionUiView) => void;
  onShow?: (p: QuestionPresentation) => void;
  onOutcome?: (o: QuestionOutcome, p: QuestionPresentation) => void;
  revealWrongMs?: number;
  revealCorrectMs?: number;
  whyMs?: number;
}): QuestionUi {
  const revealWrongMs = opts.revealWrongMs ?? REVEAL_WRONG_MS;
  const revealCorrectMs = opts.revealCorrectMs ?? REVEAL_CORRECT_MS;
  const whyMs = opts.whyMs ?? WHY_LINGER_MS;

  let shown: QuestionPresentation | null = null;
  let reveal: QuestionReveal | null = null;
  let revealUntil = 0;
  let whyUntil = Number.NEGATIVE_INFINITY;
  let lastOutcome: QuestionOutcome | null = null;
  let clock = 0;
  let emitted: QuestionUiView = EMPTY_VIEW;

  function remaining(): number {
    if (!shown) return 0;
    if (reveal) return emitted.remainingMs;
    return Math.max(0, shown.startedAtSimMs + shown.windowMs - clock);
  }

  function snapshot(): QuestionUiView {
    const wrong = !!lastOutcome && (lastOutcome.result === "wrong" || lastOutcome.result === "timeout");
    return {
      presentation: shown,
      remainingMs: remaining(),
      reveal,
      whyVisible: wrong && (reveal !== null || clock < whyUntil),
      lastOutcome,
    };
  }

  function emit(force = false): void {
    const v = snapshot();
    const changed =
      force ||
      v.presentation !== emitted.presentation ||
      v.reveal !== emitted.reveal ||
      v.whyVisible !== emitted.whyVisible ||
      v.lastOutcome !== emitted.lastOutcome ||
      Math.abs(v.remainingMs - emitted.remainingMs) >= VIEW_STEP_MS ||
      (v.remainingMs === 0) !== (emitted.remainingMs === 0);
    if (!changed) return;
    emitted = v;
    opts.onView(v);
  }

  function show(p: QuestionPresentation): void {
    shown = p;
    reveal = null;
    whyUntil = Number.NEGATIVE_INFINITY;
    opts.onShow?.(p);
  }

  function settle(o: QuestionOutcome | null, p: QuestionPresentation): QuestionOutcome | null {
    if (!o) return null;
    lastOutcome = o;
    if (o.result === "aborted") {
      shown = null;
      reveal = null;
    } else {
      const correctIdx = p.options.findIndex((opt) => opt.correct);
      const pickedIdx = o.pickedOriginalIndex === null ? null : p.options.findIndex((opt) => opt.originalIndex === o.pickedOriginalIndex);
      reveal = { correctOptionIndex: correctIdx, pickedOptionIndex: pickedIdx === -1 ? null : pickedIdx };
      revealUntil = clock + (o.result === "correct" ? revealCorrectMs : revealWrongMs);
    }
    opts.onOutcome?.(o, p);
    emit(true);
    return o;
  }

  return {
    frame(clockMs, ctx) {
      clock = clockMs;
      const d = opts.director();
      if (!d) {
        emit();
        return;
      }
      if (shown && !reveal) {
        const act = d.active();
        if (!act || act.id !== shown.id) {
          // A játék sim-magja maga válaszolt / szakította meg: a sáv elengedi (a kimenetet a sim kezeli).
          shown = null;
        } else if (clockMs >= shown.startedAtSimMs + shown.windowMs) {
          settle(d.expire(clockMs), shown);
        }
      }
      if (reveal && clockMs >= revealUntil) {
        const wrong = !!lastOutcome && lastOutcome.result !== "correct";
        whyUntil = wrong ? clockMs + whyMs : Number.NEGATIVE_INFINITY;
        reveal = null;
        shown = null;
      }
      if (!shown) {
        let next = d.active();
        if (!next && ctx?.tick !== false) next = d.tick(clockMs, { calm: ctx?.calm ?? true });
        if (next) show(next);
      }
      emit();
    },
    request(reason, clockMs) {
      clock = clockMs;
      const d = opts.director();
      if (!d || (shown && !reveal)) return null;
      const p = d.request(reason, clockMs);
      if (p) {
        show(p);
        emit(true);
      }
      return p;
    },
    pick(optionIndex, clockMs) {
      if (clockMs !== undefined) clock = clockMs;
      const d = opts.director();
      if (!d || !shown || reveal) return null;
      return settle(d.answer(shown.id, optionIndex, clock), shown);
    },
    abort() {
      const d = opts.director();
      if (!d || !shown || reveal) return null;
      return settle(d.abort(), shown);
    },
    timeScale: () => (shown && !reveal ? shown.slowMo : 1),
    active: () => opts.director()?.active() ?? null,
    view: () => emitted,
    reset() {
      shown = null;
      reveal = null;
      lastOutcome = null;
      whyUntil = Number.NEGATIVE_INFINITY;
      emit(true);
    },
  };
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
    onPick,
    ...(canSpeak ? { onSpeak } : {}),
  };

  return { ...ui, director, reset, state, bind };
}

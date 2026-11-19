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
import { sfxStumble, sfxSuccess, sfxWhoosh, useAudioPrewarm } from "@/lib/audioEngine";
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
  // A hangkontextus a menü / betöltés alatt, tétlen időben jön létre — minden, a közös directort használó játékban (C-75: lusta
  // létrehozásnál az első kérdés suhogására 0,8–2 s-os megakadás esett).
  useAudioPrewarm();
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

/* A kérdés-sáv React-mentes állapotgépe a `questionUi.ts`-ben él (közös utójavítás b); a meglévő importok miatt innen is elérhető. */
export {
  EMPTY_VIEW,
  REVEAL_CORRECT_MS,
  REVEAL_WRONG_MS,
  VIEW_STEP_MS,
  WHY_LINGER_MS,
  createQuestionUi,
  speechAfterOutcome,
  speechOnShow,
  type QuestionRequestReason,
  type QuestionReveal,
  type QuestionUi,
  type QuestionUiView,
  type QuestionWhyItem,
} from "./questionUi";
import { EMPTY_VIEW, createQuestionUi, speechAfterOutcome, speechOnShow, type QuestionReveal, type QuestionUi, type QuestionUiView } from "./questionUi";

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
          const show = speechOnShow(p); // a választ el nem áruló szöveg (vagy semmi)
          if (o.speech && show && q.lang) o.speech.say(show, q.lang);
          o.onShow?.(p);
        },
        onOutcome: (out, p) => {
          const o = optsRef.current;
          if (out.result !== "aborted") {
            const good = out.result === "correct";
            if (o.sound !== false) (good ? sfxSuccess : sfxStumble)();
            if (o.haptics !== false) vibrateRef.current(good ? "success" : "error");
            // A helyes szó CSAK a kimenetel után hangzik el (megerősítés / a megoldás kijelzése).
            const after = speechAfterOutcome(p, out);
            if (o.speech && after && p.question.lang) o.speech.say(after, p.question.lang);
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
  const canSpeak = !!(p && speechOnShow(p) && p.question.lang && speech && speech.available());
  const onSpeak = useCallback(() => {
    const cur = store.get().presentation;
    const s = optsRef.current.speech;
    const text = cur ? speechOnShow(cur) : null;
    if (!cur || !s || !text || !cur.question.lang) return;
    s.arm(); // a 🔊 koppintás maga is felhasználói gesztus
    s.say(text, cur.question.lang);
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

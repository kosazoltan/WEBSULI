/**
 * A kérdés-sáv állapotgépe — React NÉLKÜL (J0c; közös utójavítás b, kanban #51). A `usePlayQuestion` (`useQuestionDirector.ts`)
 * erre épül, és a játékok node-szimulációja (pl. `lib/speedMath/sim.ts`) is ezt hívja, hogy a lap reveal-kapuját (≥ 1,8 mp
 * megoldás-kijelzés, alatta nincs új kérdés) hűen utánozza. A régi helyről (`useQuestionDirector.ts`) re-exportálva.
 */
import type { FourChoiceQuiz } from "@/types/gameQuiz";

import type { QuestionDirector } from "./questionDirector";
import type { QuestionOutcome, QuestionPresentation } from "./types";

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
 *  - válasz csak a határidő előtt számít; utána a válasz lejáratként záródik;
 *  - a kijelzés (és a „Miért?” ablaka) a válasz utáni ELSŐ képkockától számít, nem a válasz pillanatának órájától: a
 *    koppintás két képkocka közé esik (az óra az előző képkockáé), a zöld drón pedig csak a következő képkockán látszik —
 *    lassú gépen (~200 ms-os képkocka) a látható kijelzés így a 2 mp helyett 1,8 mp alá csúszhatott (main CI 43943054869).
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
  let rev: { p: QuestionPresentation; reveal: QuestionReveal; until: number; frozenMs: number; dur: number; armed: boolean } | null = null;
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
        dur,
        armed: false,
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
      if (rev && !rev.armed) {
        // Az első képkocka a válasz után: innen számít a kijelzés (és a hozzá tartozó „Miért?”-ablak) — csak hosszabbodhat.
        rev.armed = true;
        const until = Math.max(rev.until, clockMs + rev.dur);
        if (why && why.item.presentationId === rev.p.id) why.until += until - rev.until;
        rev.until = until;
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
/* Felolvasás-terv (közös utójavítás, #454 / #455 review): MIT mondhat a gép, és MIKOR                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

function norm(t: string): string {
  return t.trim().toLocaleLowerCase("hu").replace(/\s+/g, " ");
}

/**
 * A kérdés MEGJELENÉSEKOR felolvasható szöveg, vagy null. Szabály (mind a hét játékra): nem egyezhet a helyes opcióval és
 * nem tartalmazhatja azt (különben a gép kimondaná a választ), és csak célnyelvi tételnél (van `lang`). Biztonsági háló a
 * forrás hibájára is: ha a `speakText` mégis elárulná a választ, nem hangzik el.
 */
export function speechOnShow(p: QuestionPresentation): string | null {
  const q = p.question;
  if (!q.lang || !q.speakText) return null;
  const said = norm(q.speakText);
  const correct = norm(q.quiz.options[q.quiz.correctIndex] ?? "");
  if (said.length === 0) return null;
  if (correct.length > 0 && (said === correct || said.includes(correct))) return null;
  return q.speakText;
}

/** A KIMENETEL UTÁN felolvasható helyes szó (helyes, hibás és lejárt válasznál), vagy null (megszakítva: semmi). */
export function speechAfterOutcome(p: QuestionPresentation, o: QuestionOutcome): string | null {
  if (o.result === "aborted") return null;
  const q = p.question;
  return q.lang && q.speakAfter ? q.speakAfter : null;
}

import { Check, Mountain, Pause, Pickaxe, Rocket, Swords, Tornado, Volume2, VolumeX, Waves, X, Zap, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { correctDataAttrs } from "@/game-engine/game-test-hooks";

import { useGameSettings } from "./gameSettings";
import { LONG_PROMPT_CHARS, OPTION_MAX_LINES, optionColumns } from "./promptFit";
import type { QuestionPresentation } from "./types";
import WhyButton from "./WhyButton";

/**
 * J0c — a nem blokkoló kérdés-sáv, mind a hét játék közös komponense (végrehajtás J0c „Szerződés”, K.2; terv 4.1/2–4,
 * 8.9–8.11, 9.; J1, J5).
 *
 * NEM modális: nincs `useModalLayer`, nincs inert háttér, nincs fókuszlopás — a játék alatta lassítva fut, a saját
 * vezérlői (joystick, akciógombok, szünet) elérhetők maradnak. Rétegrend: a HUD fölött, a `--game-z-overlay` (80) alatt
 * (`--game-z-question` 60). Portálon a `body`-ba kerül, így a szünet menü / eredmény `useModalLayer`-e inertté teszi, a
 * kupon-réteg (95) pedig mindenképp fölötte marad.
 *
 * Elrendezés (index.css `.play-question*`, `@layer components`, C-32):
 *  - álló nézet, `mode="buttons"`: a kártya és a 2×2 (hosszú válasznál 1 oszlopos) gombrács az alsó harmadban, a
 *    játék vezérlősávja FÖLÖTT (`--play-question-bottom`, alap: akciógomb + biztonsági sáv) — hüvelykujjal elérhető;
 *  - fekvő nézet, `mode="buttons"`: a kártya fent középen, a válaszok a két szélen (bal: 1–2., jobb: 3–4.);
 *  - `mode="bar"`: csak a kártya (prompt + időcsík) fent, a HUD alatt (`--play-question-top`); a válaszcélok a
 *    játékvilágban vannak, a DOM-gombsor vizuálisan rejtett, de fókuszálható (billentyűzetre megjelenik — terv 8.11).
 * A játék a CSS-változókkal igazíthat: `--play-question-top`, `--play-question-bottom`.
 *
 * Visszajelzés: szín + ikon (✓ / ✗) + szöveg + hang + rezgés (a hang / rezgés a `usePlayQuestion`-ben) — nem csak szín.
 * Hibánál a helyes válasz `data-state="correct"` (zöld + ✓), a választott `data-state="wrong"` (narancs, nem telített
 * piros — K.4/20) + a státuszsorban „A jó válasz: …”, bántó szó nélkül. Billentyű: 1–4 választ (8.11). `aria-live` a
 * promptra és a státuszra. Csökkentett mozgásnál nincs belépő / pattanó animáció (CSS media query).
 *
 * Testid-ek (K.2, terv 9.): gyökér `testId` (alap `play-question`), prompt `promptTestId` (alap `play-question-prompt`),
 * gombok `optionTestId(i)` (alap `play-option-<i>`) + `correctDataAttrs`, `data-state`; szünet `pauseTestId`;
 * további: `play-question-timer`, `play-question-status`, `play-question-more`, `play-speak`, `play-why`.
 *
 * Bekötés: lásd `useQuestionDirector.ts` fejkommentje (`usePlayQuestion` + `<InlineQuestion {...q.bind} … />`).
 */

export type InlineQuestionSkin = "ocean" | "rock" | "mine" | "neon" | "arena" | "space" | "storm";

export const INLINE_QUESTION_SKINS: readonly InlineQuestionSkin[] = ["ocean", "rock", "mine", "neon", "arena", "space", "storm"];

export type InlineQuestionProps = {
  presentation: QuestionPresentation | null;
  remainingMs: number;
  /** "bar": csak prompt + időcsík (a válaszcélok a játékvilágban); "buttons": + 3/4 nagy gomb (mentőöv, kraft, kalibrálás). */
  mode: "bar" | "buttons";
  /** A világban rajzolt célokhoz is kötelező akadálymentes gombsor: "bar" módban vizuálisan rejtett (sr-only), de fókuszálható. */
  onPick: (optionIndex: number) => void;
  reveal: { correctOptionIndex: number; pickedOptionIndex: number | null } | null;
  skin: InlineQuestionSkin;
  onSpeak?: () => void;      // 🔊 gomb, ha a tétel nyelvi és a beszéd elérhető
  onWhy?: () => void;        // „Miért?” — csak reveal közben és utána 4 mp-ig látszik
  disabled?: boolean;        // szünetben
  testId?: string;           // alap "play-question"; a játékok a régi azonosítójukat adják (K.2), pl. "ts-quiz"
  promptTestId?: string;     // pl. "ts-prompt", "wl-prompt", "bc-prompt"
  optionTestId?: (i: number) => string; // alap i => `play-option-${i}`; pl. i => `ts-option-${i}`
  pauseTestId?: string;      // ha megadva, a sávban szünetgomb (onPause), pl. "ts-quiz-pause"
  onPause?: () => void;
  /* ---- additív (a szerződésen túl) ---- */
  /** A „Miért?” láthatósága (a `usePlayQuestion` `whyVisible`-je); hiányában: reveal közben, hibás válasznál. */
  whyVisible?: boolean;
  /** „previous”: a „Miért?” az előző hibához tartozik, miközben már az új kérdés látszik (felirat: „Előző: miért?”). */
  whyFor?: "current" | "previous" | null;
  /** „Mutasd” (a két sorra vágott prompt teljes szövege): a lap itt szünetet kér (terv 8.9). */
  onExpand?: () => void;
  /** A kinyitott prompt bezárása: a lap folytatja a játékot. */
  onCollapse?: () => void;
  /** 1–4 billentyű (alap: igen). */
  keyboard?: boolean;
  /** Alap: portál a `body`-ba. */
  portal?: boolean;
};

const SKIN_ICON: Record<InlineQuestionSkin, LucideIcon> = {
  ocean: Waves,
  rock: Mountain,
  mine: Pickaxe,
  neon: Zap,
  arena: Swords,
  space: Rocket,
  storm: Tornado,
};

/** Bátorító, determinisztikus dicséret (a kérdés-azonosító szerint váltakozik; nincs `Math.random`). */
const PRAISE = ["Telitalálat!", "Szuper!", "Ügyes!", "Így van!", "Pontosan!"];

/** A gombfelirat sormagassága a szülő betűméretéhez képest (`.play-question-label` line-height). */
const LABEL_LH = 1.2;

function viewportNow(): { width: number; height: number } {
  return typeof window === "undefined" ? { width: 390, height: 844 } : { width: window.innerWidth, height: window.innerHeight };
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

function modalOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.gamePaused === "true" || document.querySelector('[aria-modal="true"]') !== null;
}

export default function InlineQuestion({
  presentation,
  remainingMs,
  mode,
  onPick,
  reveal,
  skin,
  onSpeak,
  onWhy,
  disabled = false,
  testId = "play-question",
  promptTestId = "play-question-prompt",
  optionTestId = (i) => `play-option-${i}`,
  pauseTestId,
  onPause,
  whyVisible,
  whyFor,
  onExpand,
  onCollapse,
  keyboard = true,
  portal = true,
}: InlineQuestionProps) {
  const promptRef = useRef<HTMLParagraphElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const qid = presentation?.id ?? null;
  /**
   * J0c-b (kanban #46): a kérdés KOPPINTÁS NÉLKÜL végigolvasható. Valódi mérés, kérdésenként: 0 = legfeljebb 5 sor a
   * saját betűméreten; 1 = 15 px-en legfeljebb 7 sor (a kártya nő); 2 = még ez sem elég → végső tartalék a „Mutasd”.
   * A válaszgomboknál: 0 = alap; 1 = egy oszlop (álló) / kisebb betű (fekvő), ha egy felirat 2 sornál hosszabb.
   */
  const [fit, setFit] = useState<{ id: number | null; prompt: 0 | 1 | 2; options: 0 | 1; epoch: number }>({ id: null, prompt: 0, options: 0, epoch: 0 });
  const promptFit = fit.id === qid ? fit.prompt : 0;
  const optionFit = fit.id === qid ? fit.options : 0;
  const clamped = promptFit === 2;

  // Új kérdésnél a prompt kibontatlanul indul.
  useEffect(() => {
    setExpanded(false);
  }, [qid]);

  /**
   * Átméretezés / elforgatás / webfont-betöltés → újramérés az alapról (review #450): az `epoch` nő, ez a mérő effekt
   * függősége, így a mérés akkor is lefut, ha a szintek értéke nem változik. Végtelen hurok nincs: egy epochon belül a
   * szint csak nőhet (0 → 1 → 2, legfeljebb 3 mérés), új epoch csak valódi nézetméret-változásra / betűkészlet-betöltésre jön.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let last = `${window.innerWidth}x${window.innerHeight}`;
    let alive = true;
    const remeasure = () => setFit((cur) => ({ id: cur.id, prompt: 0, options: 0, epoch: cur.epoch + 1 }));
    const onResize = () => {
      const now = `${window.innerWidth}x${window.innerHeight}`;
      if (now === last) return;
      last = now;
      remeasure();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (alive) remeasure();
      });
    }
    return () => {
      alive = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Mérés a festés ELŐTT (nincs villanás).
  useLayoutEffect(() => {
    const el = promptRef.current;
    if (!el || expanded || qid === null) return;
    const measure = () => {
      const overflow = el.scrollHeight > el.clientHeight + 1;
      let optOverflow = false;
      const box = optionsRef.current;
      if (box && getComputedStyle(box).opacity !== "0") {
        for (const label of Array.from(box.querySelectorAll<HTMLElement>(".play-question-label"))) {
          const lh = parseFloat(getComputedStyle(label).fontSize) * LABEL_LH;
          if (label.getBoundingClientRect().height > lh * OPTION_MAX_LINES + 2) optOverflow = true;
        }
      }
      setFit((cur) => {
        const base = cur.id === qid ? cur : { id: qid, prompt: 0 as const, options: 0 as const, epoch: cur.epoch };
        const prompt = overflow && base.prompt < 2 ? ((base.prompt + 1) as 1 | 2) : base.prompt;
        const options = optOverflow ? 1 : base.options;
        return prompt === base.prompt && options === base.options && cur.id === qid ? cur : { id: qid, prompt, options, epoch: base.epoch };
      });
    };
    measure();
  }, [qid, expanded, promptFit, optionFit, fit.epoch, presentation?.question.quiz.prompt]);

  const answering = !!presentation && !reveal && !disabled && !expanded;
  const pick = useCallback(
    (i: number) => {
      if (!answering) return;
      onPick(i);
    },
    [answering, onPick],
  );

  // 1–4 billentyű (terv 8.11). Gépelés, nyitott modális réteg és szünet alatt nem.
  useEffect(() => {
    if (!keyboard || !answering || !presentation) return;
    const count = presentation.options.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat || isTypingTarget(e.target) || modalOpen()) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= count) {
        e.preventDefault();
        pick(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, answering, presentation, pick]);

  const showWhy = !!onWhy && (whyVisible ?? (!!reveal && reveal.pickedOptionIndex !== reveal.correctOptionIndex));
  if (!presentation && !showWhy) return null;

  const Icon = SKIN_ICON[skin] ?? Waves;

  // Csak a „Miért?” maradt (a megoldás-kijelzés után még 4 mp).
  if (!presentation) {
    const chip = (
      <div className="play-question" data-testid={`${testId}-why`} data-skin={skin} data-mode={mode} data-state="why" role="group" aria-label="Magyarázat">
        <div className="play-question-card play-question-card-mini">
          <WhyButton visible onOpen={onWhy!} />
        </div>
      </div>
    );
    return portal && typeof document !== "undefined" ? createPortal(chip, document.body) : chip;
  }

  const quiz = presentation.question.quiz;
  const options = presentation.options;
  const total = Math.max(1, presentation.windowMs);
  const ratio = Math.max(0, Math.min(1, remainingMs / total));
  const secs = Math.ceil(Math.max(0, remainingMs) / 1000);
  const low = !reveal && ratio <= 0.35;
  const longPrompt = quiz.prompt.length > LONG_PROMPT_CHARS;
  const showMore = (clamped || expanded) && !reveal;
  // Az előző hiba „Miért?”-je az új kérdés mellett is elérhető marad (a kijelzés vége + 4 mp), külön felirattal.
  const previousWhy = showWhy && (whyFor === "previous" || (whyFor === undefined && !reveal));
  const cols = optionFit === 1 ? 1 : optionColumns(options.map((o) => o.label), viewportNow());

  let status = "";
  let tone: "good" | "bad" | "" = "";
  if (reveal) {
    const correctLabel = options[reveal.correctOptionIndex]?.label ?? "";
    if (reveal.pickedOptionIndex !== null && reveal.pickedOptionIndex === reveal.correctOptionIndex) {
      status = PRAISE[presentation.id % PRAISE.length]!;
      tone = "good";
    } else if (reveal.pickedOptionIndex === null) {
      status = `Lejárt az idő. A jó válasz: ${correctLabel}`;
      tone = "bad";
    } else {
      status = `A jó válasz: ${correctLabel}`;
      tone = "bad";
    }
  }

  const stateOf = (i: number): "idle" | "correct" | "wrong" | "dim" => {
    if (!reveal) return "idle";
    if (i === reveal.correctOptionIndex) return "correct";
    if (i === reveal.pickedOptionIndex) return "wrong";
    return "dim";
  };

  const renderOption = (i: number) => {
    const opt = options[i]!;
    const st = stateOf(i);
    const inactive = !answering;
    return (
      <button
        key={i}
        type="button"
        className="play-question-option game-answer-btn"
        data-testid={optionTestId(i)}
        data-state={st}
        data-option-index={i}
        aria-disabled={inactive ? "true" : undefined}
        aria-keyshortcuts={String(i + 1)}
        onClick={() => pick(i)}
        {...correctDataAttrs(opt.correct)}
      >
        <span className="play-question-key" aria-hidden="true">
          {st === "correct" ? <Check strokeWidth={3} /> : st === "wrong" ? <X strokeWidth={3} /> : i + 1}
        </span>
        <span className="play-question-label">{opt.label}</span>
        {st === "correct" && <span className="sr-only"> — a jó válasz</span>}
        {st === "wrong" && <span className="sr-only"> — ezt választottad</span>}
      </button>
    );
  };

  // Fekvő nézetben a két szélre kerülnek (bal: 1–2., jobb: a többi); álló nézetben a CSS egy rácsba teríti őket.
  const left = options.slice(0, 2).map((_, k) => k);
  const right = options.slice(2).map((_, k) => k + 2);

  const node = (
    <div
      className="play-question"
      data-testid={testId}
      data-skin={skin}
      data-mode={mode}
      data-state={reveal ? "reveal" : "open"}
      data-question-id={presentation.id}
      data-disabled={disabled ? "true" : "false"}
      data-expanded={expanded ? "true" : "false"}
      data-cols={cols}
      data-fit={promptFit}
      data-option-fit={optionFit}
      data-count={options.length}
      role="group"
      aria-label={presentation.isReview ? "Ismétlő kérdés" : "Kérdés"}
    >
      <div className="play-question-card" key={presentation.id} data-tone={tone || undefined}>
        <div className="play-question-head">
          <span className="play-question-badge" data-compact={showMore ? "true" : "false"}>
            <Icon aria-hidden="true" />
            <span className="play-question-badge-text">{presentation.isReview ? "Ismétlés" : "Kérdés"}</span>
          </span>
          <div className="play-question-timer" data-testid="play-question-timer" data-low={low ? "true" : "false"} aria-hidden="true">
            <span className="play-question-timer-fill" style={{ transform: `scaleX(${ratio})` } as CSSProperties} />
          </div>
          <span className="play-question-secs" aria-hidden="true">{secs} mp</span>
          {showMore && (
            <button
              type="button"
              className="play-question-more"
              data-testid="play-question-more"
              aria-expanded={expanded}
              aria-label={expanded ? "Vissza a játékhoz" : "Mutasd az egész kérdést (a játék megáll)"}
              onClick={() => {
                if (expanded) {
                  setExpanded(false);
                  onCollapse?.();
                } else {
                  setExpanded(true);
                  onExpand?.();
                }
              }}
            >
              {expanded ? "Tovább" : "Mutasd"}
            </button>
          )}
          {onSpeak && (
            <button type="button" className="play-question-icon-btn" data-testid="play-speak" aria-label="Felolvasás" onClick={onSpeak}>
              <Volume2 aria-hidden="true" />
            </button>
          )}
          {pauseTestId && onPause && (
            <button type="button" className="play-question-icon-btn" data-testid={pauseTestId} aria-label="Szünet" onClick={onPause}>
              <Pause fill="currentColor" strokeWidth={0} aria-hidden="true" />
            </button>
          )}
        </div>
        <p
          ref={promptRef}
          className="play-question-prompt"
          data-testid={promptTestId}
          data-long={longPrompt ? "true" : "false"}
          aria-live="polite"
        >
          {quiz.prompt}
        </p>
        <div className="play-question-foot">
          <p className="play-question-status" data-testid="play-question-status" role="status" aria-live="polite" data-tone={tone || undefined}>
            {status && (tone === "good" ? <Check aria-hidden="true" /> : <span className="play-question-status-dot" aria-hidden="true">!</span>)}
            {status && <span>{status}</span>}
          </p>
          {showWhy && <WhyButton visible onOpen={onWhy!} label={previousWhy ? "Előző: miért?" : undefined} />}
        </div>
      </div>
      <div className="play-question-options" ref={optionsRef} role="group" aria-label="Válaszok">
        <div className="play-question-col" data-side="left">{left.map(renderOption)}</div>
        <div className="play-question-col" data-side="right">{right.map(renderOption)}</div>
      </div>
    </div>
  );
  return portal && typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

/**
 * Felolvasás be / ki — egy koppintással (terv D4 (a)). A szünet menü `children`-jébe vagy a kezdőképernyőre tehető;
 * a beállítás tartós (`websuli.gameSettings.v1`) és minden kérdés-sávra azonnal érvényes.
 */
export function PlaySpeechToggle() {
  const [settings, update] = useGameSettings();
  const on = settings.tts;
  return (
    <button
      type="button"
      className="game-btn game-btn-secondary play-speech-toggle"
      data-testid="play-speech-toggle"
      aria-pressed={on}
      onClick={() => update({ tts: !on })}
    >
      {on ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      <span>{on ? "Felolvasás: be" : "Felolvasás: ki"}</span>
    </button>
  );
}

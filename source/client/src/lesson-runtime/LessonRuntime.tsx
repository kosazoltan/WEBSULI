import { createContext, useContext, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Leaf,
  Lightbulb,
  ListChecks,
  Sparkles,
  Target,
  Volume2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ageBandForClassroom,
  type AgeBand,
  type Block,
  type Lesson,
  type Section,
} from "@shared/lesson-schema";
import { BAND_THEME } from "@shared/lesson-band";
import { lessonFontPair } from "@shared/lesson-typography";

import { SectionProba } from "./SectionProba";
import { ANIMATE_REGISTRY } from "./blocks/animate-blocks";
import { TRY_REGISTRY } from "./blocks/try-blocks";
import { prefersReducedMotion, readAloudEnabled, speak, speechSupported } from "@/lib/tts";
import {
  useLessonProgress,
  type TrySnapshot,
} from "./useLessonProgress";
import "./lesson-theme.css";
import { LessonExperienceView } from "./LessonExperienceView";
import { experienceFingerprint } from "./useExperienceRound";

/**
 * The Lesson Runtime: one audited renderer for every lesson.
 *
 * Lessons used to be generated HTML pages, so each one shipped its own layout, its own
 * behaviour and its own scripts — which is why the CSP had to stay loose and why nothing
 * could be checked. Rendering structured data instead means the markup is ours: no
 * foreign script executes, the age-band styling is consistent, and every tap target can
 * be held to 44 px in one place rather than in a hundred generated files.
 *
 * LS-2 renders explain / example / check / recap; LS-4 lands the 8 animate and 3 try
 * kinds from the registries in ./blocks (a static guard test pins full coverage).
 *
 * LS-9 (2026-09-06): the band now drives the whole visual system, not just font size.
 * Measured before: kid/teen/senior rendered the same white card list. The root carries
 * `data-band`, `lesson-theme.css` keys every colour token on it, and the structure gained
 * a hero header, a sticky section progress bar, typed block headers and an infographic
 * recap. Owner picked the dark "C · divergent" direction from the variant board.
 */

const FullTeachingContext = createContext(false);
const OPTION_KEYS = "ABCDEFGH";

function BlockHead({ icon: Icon, label }: { icon: typeof BookOpen; label: string }) {
  return (
    <span className="lesson-block-head">
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {label}
    </span>
  );
}

function ExplainBlock({ block, band }: { block: Extract<Block, { kind: "explain" }>; band: AgeBand }) {
  const theme = BAND_THEME[band];
  // The gate is computed once per mount: reduced motion and speech support do not
  // change mid-page in practice, and the button is the ONLY call site of speak() —
  // so speech can never start without a user gesture (LS-4 TTS contract).
  const [canSpeak] = useState(() =>
    readAloudEnabled({
      readAloud: block.readAloud,
      reducedMotion: prefersReducedMotion(),
      supported: speechSupported(),
    }),
  );

  return (
    <div className={cn("lesson-block space-y-1", theme.body)} data-block="explain">
      <BlockHead icon={BookOpen} label={theme.labels.explain} />
      {block.depth !== "core" && (
        <span className="lesson-muted inline-flex items-center gap-1 text-xs">
          <Lightbulb className="w-3 h-3" />
          {block.depth === "why" ? "Miért?" : "Mélyebben"}
        </span>
      )}
      <p>{block.text}</p>
      {canSpeak && (
        <Button
          variant="ghost"
          size="sm"
          className="lesson-ghost-btn min-h-11"
          data-testid="read-aloud"
          onClick={() => speak(block.text)}
        >
          <Volume2 className="w-4 h-4 mr-1" /> Felolvasás
        </Button>
      )}
    </div>
  );
}

function ExampleBlock({ block, band }: { block: Extract<Block, { kind: "example" }>; band: AgeBand }) {
  const theme = BAND_THEME[band];
  const fullTeaching = useContext(FullTeachingContext);
  const [shown, setShown] = useState(fullTeaching ? block.steps.length : 0);
  const allShown = shown >= block.steps.length;

  return (
    <div className="lesson-block space-y-3" data-block="example">
      <BlockHead icon={Sparkles} label={theme.labels.example} />
      <p className={cn("font-medium", theme.body)}>{block.problem}</p>

      <ol className="space-y-1 list-decimal list-inside text-sm">
        {block.steps.slice(0, shown).map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      {/* Legacy stepper stays available; the fusion teaching page shows the worked example in full. */}
      {!allShown ? (
        <Button
          variant="outline"
          className="lesson-outline-btn min-h-11 min-w-11"
          onClick={() => setShown((s) => s + 1)}
          data-testid="example-next-step"
        >
          <ChevronRight className="w-4 h-4 mr-1" />
          {shown === 0 ? "Első lépés" : "Következő lépés"}
        </Button>
      ) : (
        <p className="lesson-answer">Eredmény: {block.answer}</p>
      )}
    </div>
  );
}

function CheckBlock({
  block,
  band,
  onPick,
  picked: controlledPicked,
}: {
  block: Extract<Block, { kind: "check" }>;
  band: AgeBand;
  onPick?: (pickedIndex: number) => void;
  /** B7: restored pick from localStorage (controlled when provided). */
  picked?: number | null;
}) {
  const theme = BAND_THEME[band];
  const [localPicked, setLocalPicked] = useState<number | null>(controlledPicked ?? null);
  const picked = controlledPicked !== undefined ? controlledPicked : localPicked;
  const [hintOpen, setHintOpen] = useState(false);
  const correct = picked !== null && picked === block.correctIndex;

  const pick = (i: number) => {
    setLocalPicked(i);
    // The section's Próba is graded on the server from these indices (LS-3b).
    onPick?.(i);
  };

  return (
    <div className="lesson-block space-y-3" data-block="check">
      <BlockHead icon={HelpCircle} label={theme.labels.check} />
      <p className={cn("font-medium", theme.body)}>{block.question}</p>

      <div className="grid gap-2">
        {block.options.map((option, i) => {
          const isPicked = picked === i;
          const isRight = i === block.correctIndex;
          const state = isPicked ? (isRight ? "right" : "wrong") : undefined;
          return (
            <button
              key={i}
              onClick={() => pick(i)}
              disabled={correct}
              data-testid={`check-option-${i}`}
              data-state={state}
              className="lesson-option transition-colors disabled:cursor-default"
            >
              <span className="lesson-option-key" aria-hidden>
                {OPTION_KEYS[i] ?? i + 1}
              </span>
              <span className="flex items-start gap-2">
                {isPicked &&
                  (isRight ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ))}
                <span>{option}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Feedback is written per option, so a wrong pick teaches instead of just failing. */}
      {picked !== null && (
        <p className="lesson-feedback" data-state={correct ? "right" : "wrong"} data-testid="check-feedback">
          {block.feedbackPerOption[picked]}
        </p>
      )}

      {block.hint && !correct && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="lesson-ghost-btn min-h-11 gap-1"
            onClick={() => setHintOpen((h) => !h)}
          >
            <HelpCircle className="w-4 h-4" />
            {hintOpen ? "Tipp elrejtése" : "Kérek egy tippet"}
          </Button>
          {hintOpen && <p className="lesson-muted text-sm mt-1">{block.hint}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Recap as an infographic: one card per idea. A bullet list reads as homework; a card
 * with its own mark reads as something the child now owns (LS-9).
 */
function RecapBlock({ block, band }: { block: Extract<Block, { kind: "recap" }>; band: AgeBand }) {
  const theme = BAND_THEME[band];
  return (
    <div className="lesson-block" data-block="recap">
      <BlockHead icon={ListChecks} label={theme.labels.recap} />
      <div className="lesson-recap-cards">
        {block.bullets.map((b, i) => (
          <div key={i} className="lesson-recap-card" data-recap-item>
            <span className="lesson-recap-ico" aria-hidden>
              <Target className="w-4 h-4" />
            </span>
            <span>{b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LessonBlock({
  block,
  band,
  onPick,
  picked,
  tryPersisted,
  onTryPersist,
}: {
  block: Block;
  band: AgeBand;
  onPick?: (pickedIndex: number) => void;
  picked?: number | null;
  tryPersisted?: TrySnapshot;
  onTryPersist?: (snap: TrySnapshot) => void;
}) {
  switch (block.kind) {
    case "explain":
      return <ExplainBlock block={block} band={band} />;
    case "example":
      return <ExampleBlock block={block} band={band} />;
    case "check":
      return <CheckBlock block={block} band={band} onPick={onPick} picked={picked} />;
    case "recap":
      return <RecapBlock block={block} band={band} />;
    case "animate": {
      const Anim = ANIMATE_REGISTRY[block.animKind];
      return <Anim params={block.params} caption={block.caption} />;
    }
    case "try": {
      const Try = TRY_REGISTRY[block.tryKind];
      return <Try spec={block.spec} persisted={tryPersisted} onPersist={onTryPersist} />;
    }
  }
}

/**
 * One section, plus its Próba.
 *
 * The picked answers are collected here rather than in each block, because the Próba is
 * a section-level thing: the server is asked once, about the whole section, and answers
 * with the score and whatever play time it is worth (LS-3b).
 */
function LessonSection({
  section,
  sectionIdx,
  band,
  lessonId,
  conceptLabel,
  onProbaSuccess,
  sectionRef,
  initialAnswers,
  tryBlocks,
  onAnswersChange,
  onTryPersist,
}: {
  section: Section;
  sectionIdx: number;
  band: AgeBand;
  lessonId: string | null;
  conceptLabel: (id: string) => string;
  onProbaSuccess: () => void;
  sectionRef: (el: HTMLElement | null) => void;
  initialAnswers: Record<number, number>;
  tryBlocks: Record<string, TrySnapshot>;
  onAnswersChange: (answers: Record<number, number>) => void;
  onTryPersist: (blockIdx: number, snap: TrySnapshot) => void;
}) {
  const theme = BAND_THEME[band];
  const [answers, setAnswers] = useState<Record<number, number>>(initialAnswers);

  const pick = useCallback(
    (bi: number, pickedIndex: number) => {
      setAnswers((prev) => {
        const next = { ...prev, [bi]: pickedIndex };
        onAnswersChange(next);
        return next;
      });
    },
    [onAnswersChange],
  );

  return (
    <section
      ref={sectionRef}
      className="space-y-4"
      id={`section-${sectionIdx + 1}`}
      data-testid={`lesson-section-${sectionIdx}`}
    >
      <h2 className={cn("lesson-heading flex items-center gap-3", theme.heading)}>
        <span className="lesson-section-no" aria-hidden>
          {sectionIdx + 1}
        </span>
        {section.heading}
      </h2>
      {section.blocks.map((block, bi) => (
        <LessonBlock
          key={bi}
          block={block}
          band={band}
          picked={answers[bi] ?? null}
          onPick={(pickedIndex) => pick(bi, pickedIndex)}
          tryPersisted={tryBlocks[String(bi)]}
          onTryPersist={(snap) => onTryPersist(bi, snap)}
        />
      ))}

      {/* Without a lesson id (the render probe, a preview) there is nothing to submit to. */}
      {lessonId && (
        <SectionProba
          lessonId={lessonId}
          sectionIdx={sectionIdx}
          section={section}
          answers={answers}
          conceptLabel={conceptLabel}
          onSuccess={onProbaSuccess}
        />
      )}
    </section>
  );
}

/**
 * Section progress. Shown only for 2+ sections: one step is not a journey.
 * `current` tracks the section the learner is looking at (IntersectionObserver)
 * or has just cleared via Próba.
 */
function LessonProgress({ sections, band, current }: { sections: Section[]; band: AgeBand; current: number }) {
  if (sections.length < 2) return null;
  return (
    <div className="lesson-progress" data-testid="lesson-progress" aria-label={BAND_THEME[band].labels.progress}>
      <span>
        {Math.min(current + 1, sections.length)} / {sections.length} szakasz
      </span>
      <div className="lesson-progress-steps">
        {sections.map((s, i) => (
          <a
            key={i}
            href={`#section-${i + 1}`}
            className="lesson-progress-step"
            data-progress-step
            data-state={i < current ? "done" : i === current ? "now" : "todo"}
            title={s.heading}
            aria-label={s.heading}
          />
        ))}
      </div>
    </div>
  );
}

function conceptLabel(lesson: Lesson, conceptId: string): string {
  for (const section of lesson.sections) {
    for (const block of section.blocks) {
      if (block.kind === "explain" && block.coversConceptIds.includes(conceptId)) {
        const sentence = block.text.split(/[.!?]/)[0]?.trim();
        if (sentence && sentence.length >= 3) {
          return sentence.length > 72 ? `${sentence.slice(0, 69)}…` : sentence;
        }
      }
    }
  }
  const misconception = lesson.misconceptions.find((m) => m.conceptId === conceptId);
  if (misconception?.text) {
    const t = misconception.text.trim();
    return t.length > 72 ? `${t.slice(0, 69)}…` : t;
  }
  return conceptId;
}

export function LessonRuntime({
  lesson,
  lessonId,
  persistId,
}: {
  lesson: Lesson;
  lessonId?: string;
  /** B7 storage key when there is no publish id (probe / offline preview). */
  persistId?: string;
}) {
  const band = ageBandForClassroom(lesson.classroom);
  const theme = BAND_THEME[band];
  const fonts = lessonFontPair(lesson.classroom, lesson.subject);
  const headingFont = lesson.experience?.theme === "paper" && lesson.classroom > 4 ? "Source Serif 4" : fonts.heading;
  const typography = {
    "--lesson-font-body": `"${fonts.body}", sans-serif`,
    "--lesson-font-heading": `"${headingFont}", ${headingFont === "Source Serif 4" ? "serif" : "sans-serif"}`,
  } as CSSProperties;
  // B7: persist under htmlFileId when present; probe uses persistId for reload round-trips.
  const progress = useLessonProgress(persistId ?? lessonId);
  const current = progress.snapshot.current;
  const setCurrent = progress.setCurrent;
  const sectionEls = useRef<(HTMLElement | null)[]>([]);
  const experienceKey = `${persistId ?? lessonId ?? lesson.mapId}:${experienceFingerprint(lesson.experience ?? {})}`;

  useEffect(() => {
    const nodes = sectionEls.current.filter((n): n is HTMLElement => n !== null);
    if (nodes.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const idx = nodes.indexOf(visible.target as HTMLElement);
        if (idx >= 0) setCurrent(idx);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [lesson.sections.length, setCurrent]);

  return (
    // #197 + LS-9: the lesson brings its OWN surface AND ink via [data-band] tokens
    // (lesson-theme.css). Measured live before #197: inheriting the app foreground gave
    // 67/115 text elements a 1.00–1.05 contrast in both app modes. The band root pairs
    // every background with its ink, so the app theme cannot break it.
    <div className="min-h-full" data-band={band} data-experience={lesson.experience?.theme} style={typography}>
      <article className="max-w-3xl mx-auto px-4 py-6 space-y-6" data-testid="lesson-runtime">
        <header className="lesson-hero">
          <div className="lesson-emblem" aria-hidden>
            <Leaf className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <h1 className={cn("lesson-heading leading-tight break-words", theme.heading)}>{lesson.title}</h1>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <span className="lesson-chip">{lesson.subject}</span>
              <span className="lesson-chip">{lesson.classroom}. osztály</span>
            </div>
          </div>
        </header>

        {lesson.experience ? <LessonExperienceView key={experienceKey} experience={lesson.experience} storageKey={`websuli:fusion:${experienceKey}`}>
          <FullTeachingContext.Provider value={true}>
          <LessonProgress sections={lesson.sections} band={band} current={current} />
          {lesson.sections.map((section, si) => <LessonSection key={si} section={section} sectionIdx={si} band={band} lessonId={lessonId ?? null} conceptLabel={id => conceptLabel(lesson, id)} initialAnswers={progress.snapshot.sections[String(si)]?.answers ?? {}} tryBlocks={progress.snapshot.sections[String(si)]?.tryBlocks ?? {}} onAnswersChange={answers => progress.setSectionAnswers(si, answers)} onTryPersist={(bi, snap) => progress.setTrySnapshot(si, bi, snap)} onProbaSuccess={() => setCurrent(c => Math.max(c, Math.min(si + 1, lesson.sections.length - 1)))} sectionRef={el => { sectionEls.current[si] = el; }} />)}
        </FullTeachingContext.Provider></LessonExperienceView> : <>
        <LessonProgress sections={lesson.sections} band={band} current={current} />

        {lesson.sections.map((section, si) => {
          const stored = progress.snapshot.sections[String(si)];
          const initialAnswers: Record<number, number> = {};
          if (stored?.answers) {
            for (const [k, v] of Object.entries(stored.answers)) {
              if (typeof v === "number") initialAnswers[Number(k)] = v;
            }
          }
          return (
            <LessonSection
              key={si}
              section={section}
              sectionIdx={si}
              band={band}
              lessonId={lessonId ?? null}
              conceptLabel={(id) => conceptLabel(lesson, id)}
              initialAnswers={initialAnswers}
              tryBlocks={stored?.tryBlocks ?? {}}
              onAnswersChange={(answers) => progress.setSectionAnswers(si, answers)}
              onTryPersist={(bi, snap) => progress.setTrySnapshot(si, bi, snap)}
              onProbaSuccess={() => setCurrent((c) => Math.max(c, Math.min(si + 1, lesson.sections.length - 1)))}
              sectionRef={(el) => {
                sectionEls.current[si] = el;
              }}
            />
          );
        })}
        </>}
      </article>
    </div>
  );
}

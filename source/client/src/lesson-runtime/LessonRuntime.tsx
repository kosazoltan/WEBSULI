import { useState } from "react";
import { CheckCircle2, ChevronRight, HelpCircle, Lightbulb, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ageBandForClassroom,
  type AgeBand,
  type Block,
  type Lesson,
  type Section,
} from "@shared/lesson-schema";

import { SectionProba } from "./SectionProba";

/**
 * The Lesson Runtime: one audited renderer for every lesson.
 *
 * Lessons used to be generated HTML pages, so each one shipped its own layout, its own
 * behaviour and its own scripts — which is why the CSP had to stay loose and why nothing
 * could be checked. Rendering structured data instead means the markup is ours: no
 * foreign script executes, the age-band styling is consistent, and every tap target can
 * be held to 44 px in one place rather than in a hundred generated files.
 *
 * LS-2 renders explain / example / check / recap. `animate` and `try` blocks are part of
 * the schema but land in LS-4; until then they render as a visible placeholder rather
 * than silently disappearing — a lesson that is missing a third of itself must look
 * missing, not fine.
 */

const BAND_STYLES: Record<AgeBand, { body: string; heading: string }> = {
  kid: { body: "text-lg leading-relaxed", heading: "text-2xl font-bold" },
  teen: { body: "text-base leading-relaxed", heading: "text-xl font-semibold" },
  senior: { body: "text-base leading-normal", heading: "text-lg font-semibold" },
};

function ExplainBlock({ block, band }: { block: Extract<Block, { kind: "explain" }>; band: AgeBand }) {
  return (
    <div className={cn("space-y-1", BAND_STYLES[band].body)} data-block="explain">
      {block.depth !== "core" && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Lightbulb className="w-3 h-3" />
          {block.depth === "why" ? "Miért?" : "Mélyebben"}
        </span>
      )}
      <p>{block.text}</p>
    </div>
  );
}

function ExampleBlock({ block, band }: { block: Extract<Block, { kind: "example" }>; band: AgeBand }) {
  const [shown, setShown] = useState(0);
  const allShown = shown >= block.steps.length;

  return (
    <Card data-block="example">
      <CardContent className="pt-4 space-y-3">
        <p className={cn("font-medium", BAND_STYLES[band].body)}>{block.problem}</p>

        <ol className="space-y-1 list-decimal list-inside text-sm">
          {block.steps.slice(0, shown).map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>

        {/* Steps reveal one at a time: seeing the whole solution at once teaches nothing. */}
        {!allShown ? (
          <Button
            variant="outline"
            className="min-h-11 min-w-11"
            onClick={() => setShown((s) => s + 1)}
            data-testid="example-next-step"
          >
            <ChevronRight className="w-4 h-4 mr-1" />
            {shown === 0 ? "Első lépés" : "Következő lépés"}
          </Button>
        ) : (
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">
            Eredmény: {block.answer}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CheckBlock({
  block,
  band,
  onPick,
}: {
  block: Extract<Block, { kind: "check" }>;
  band: AgeBand;
  onPick?: (pickedIndex: number) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const correct = picked !== null && picked === block.correctIndex;

  const pick = (i: number) => {
    setPicked(i);
    // The section's Próba is graded on the server from these indices (LS-3b).
    onPick?.(i);
  };

  return (
    <Card data-block="check">
      <CardContent className="pt-4 space-y-3">
        <p className={cn("font-medium", BAND_STYLES[band].body)}>{block.question}</p>

        <div className="grid gap-2">
          {block.options.map((option, i) => {
            const isPicked = picked === i;
            const isRight = i === block.correctIndex;
            return (
              <button
                key={i}
                onClick={() => pick(i)}
                disabled={correct}
                data-testid={`check-option-${i}`}
                className={cn(
                  "text-left rounded-lg border p-3 min-h-11 transition-colors",
                  "hover:bg-accent disabled:cursor-default",
                  isPicked && isRight && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950",
                  isPicked && !isRight && "border-red-400 bg-red-50 dark:bg-red-950",
                  !isPicked && "border-border",
                )}
              >
                <span className="flex items-start gap-2">
                  {isPicked &&
                    (isRight ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    ))}
                  <span>{option}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Feedback is written per option, so a wrong pick teaches instead of just failing. */}
        {picked !== null && (
          <p
            className={cn(
              "text-sm rounded p-2",
              correct
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
            )}
            data-testid="check-feedback"
          >
            {block.feedbackPerOption[picked]}
          </p>
        )}

        {block.hint && !correct && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 gap-1"
              onClick={() => setHintOpen((h) => !h)}
            >
              <HelpCircle className="w-4 h-4" />
              {hintOpen ? "Tipp elrejtése" : "Kérek egy tippet"}
            </Button>
            {hintOpen && <p className="text-sm text-muted-foreground mt-1">{block.hint}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecapBlock({ block }: { block: Extract<Block, { kind: "recap" }> }) {
  return (
    <Card data-block="recap">
      <CardContent className="pt-4">
        <p className="text-sm font-semibold mb-2">Amit megtanultunk</p>
        <ul className="space-y-1 list-disc list-inside text-sm">
          {block.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Blocks the schema allows but LS-4 will render. Visible on purpose — see file header. */
function PendingBlock({ label }: { label: string }) {
  return (
    <div
      className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground"
      data-block="pending"
    >
      {label} — ez az elem a következő fejlesztési szakaszban jelenik meg.
    </div>
  );
}

export function LessonBlock({
  block,
  band,
  onPick,
}: {
  block: Block;
  band: AgeBand;
  onPick?: (pickedIndex: number) => void;
}) {
  switch (block.kind) {
    case "explain":
      return <ExplainBlock block={block} band={band} />;
    case "example":
      return <ExampleBlock block={block} band={band} />;
    case "check":
      return <CheckBlock block={block} band={band} onPick={onPick} />;
    case "recap":
      return <RecapBlock block={block} />;
    case "animate":
      return <PendingBlock label={`Animáció (${block.animKind})`} />;
    case "try":
      return <PendingBlock label={`Gyakorlat (${block.tryKind})`} />;
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
}: {
  section: Section;
  sectionIdx: number;
  band: AgeBand;
  lessonId: string | null;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  return (
    <section
      className="space-y-4"
      id={`section-${sectionIdx + 1}`}
      data-testid={`lesson-section-${sectionIdx}`}
    >
      <h2 className={cn("border-b pb-1", BAND_STYLES[band].heading)}>{section.heading}</h2>
      {section.blocks.map((block, bi) => (
        <LessonBlock
          key={bi}
          block={block}
          band={band}
          onPick={(pickedIndex) => setAnswers((prev) => ({ ...prev, [bi]: pickedIndex }))}
        />
      ))}

      {/* Without a lesson id (the render probe, a preview) there is nothing to submit to. */}
      {lessonId && (
        <SectionProba
          lessonId={lessonId}
          sectionIdx={sectionIdx}
          section={section}
          answers={answers}
        />
      )}
    </section>
  );
}

export function LessonRuntime({ lesson, lessonId }: { lesson: Lesson; lessonId?: string }) {
  const band = ageBandForClassroom(lesson.classroom);

  return (
    <article className="max-w-3xl mx-auto px-4 py-6 space-y-8" data-testid="lesson-runtime">
      <header className="space-y-1">
        <h1 className={BAND_STYLES[band].heading}>{lesson.title}</h1>
        <p className="text-sm text-muted-foreground">
          {lesson.subject} · {lesson.classroom}. osztály
        </p>
      </header>

      {lesson.sections.map((section, si) => (
        <LessonSection
          key={si}
          section={section}
          sectionIdx={si}
          band={band}
          lessonId={lessonId ?? null}
        />
      ))}
    </article>
  );
}

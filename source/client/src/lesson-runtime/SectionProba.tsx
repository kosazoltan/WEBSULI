import { useState } from "react";
import { Link } from "wouter";
import { Gamepad2, RefreshCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFingerprint } from "@/lib/fingerprintCache";
import { apiRequest } from "@/lib/queryClient";
import type { Section } from "@shared/lesson-schema";

/**
 * LS-3b — the section Próba, which is where play time is earned.
 *
 * What this component deliberately does NOT do is decide the score. It sends the indices
 * the child tapped and renders whatever the server answers. Grading here would put the
 * reward in reach of anyone who opens the dev tools, and the reward is real: minutes of
 * Tsunami, negotiated with a parent.
 *
 * A failed Próba is not a dead end either — the weak concepts come back from the server
 * and are named, so the child knows which part to read again.
 */

export type ProbaResult = {
  score: number;
  correctCount: number;
  total: number;
  weakConceptIds: string[];
  isLessonFinal: boolean;
  coupon: { id: string; minutes: number } | null;
};

type Props = {
  lessonId: string;
  sectionIdx: number;
  section: Section;
  /** Which option the child picked per block index, collected by the runtime. */
  answers: Record<number, number>;
};

export function SectionProba({ lessonId, sectionIdx, section, answers }: Props) {
  const [result, setResult] = useState<ProbaResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questionCount = section.blocks.filter((b) => b.kind === "check").length;
  if (!section.probaEnabled || questionCount === 0) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const fingerprint = await getFingerprint().catch(() => undefined);
      // apiRequest, not a bare fetch: mutating routes are CSRF-protected, and the
      // token is attached there. A raw fetch here would 403 in production while
      // passing every local test that never crosses the guard.
      const data = await apiRequest<ProbaResult>("POST", `/api/lessons/${lessonId}/proba`, {
        sectionIdx,
        // No score field: the server marks this from the stored lesson.
        answers: Object.entries(answers).map(([blockIndex, pickedIndex]) => ({
          blockIndex: Number(blockIndex),
          pickedIndex,
        })),
        fingerprint,
      });
      setResult(data);
    } catch {
      setError("Most nem sikerült beküldeni. Próbáld újra egy pillanat múlva.");
    } finally {
      setBusy(false);
    }
  };

  if (!result) {
    return (
      <Card data-testid={`section-proba-${sectionIdx}`}>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Kész vagy a szakasszal? A próba {questionCount} kérdésből áll, és játékidőt ér.
          </p>
          <Button
            className="min-h-11 w-full sm:w-auto"
            onClick={() => void submit()}
            disabled={busy}
            data-testid={`section-proba-submit-${sectionIdx}`}
          >
            <Sparkles className="w-4 h-4 mr-1" />
            {busy ? "Javítás…" : "Próba beküldése"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid={`section-proba-result-${sectionIdx}`}>
      <CardContent className="pt-4 space-y-3">
        <p className="font-semibold">
          {result.correctCount}/{result.total} — {result.score}%
        </p>

        {result.coupon ? (
          <div
            className="rounded-lg bg-emerald-50 dark:bg-emerald-950 p-3 space-y-2"
            data-testid="coupon-banner"
          >
            <p className="text-sm text-emerald-900 dark:text-emerald-200">
              Szereztél <strong>{result.coupon.minutes} perc</strong> játékidőt!
            </p>
            <Link href="/games">
              <Button className="min-h-11 w-full sm:w-auto" data-testid="coupon-play">
                <Gamepad2 className="w-4 h-4 mr-1" />
                Irány a játék
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3 space-y-2">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Ez még nem elég a játékidőhöz. Nézd át ezeket, aztán próbáld újra:
            </p>
            <ul className="text-sm list-disc list-inside">
              {result.weakConceptIds.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => setResult(null)}
              data-testid={`section-proba-retry-${sectionIdx}`}
            >
              <RefreshCcw className="w-4 h-4 mr-1" />
              Újra
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

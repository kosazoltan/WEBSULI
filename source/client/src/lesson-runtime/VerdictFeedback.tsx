import { useContext, type ReactNode } from "react";
import { VERDICT_TEXT } from "@shared/lesson-ui-text";
import { feedbackOpenerKey, feedbackView } from "@shared/lesson-feedback-openers";
import { FeedbackVarietyContext } from "./feedback-variety";

/**
 * Arculati bank S4 (docs/specs/2026-10-18-arculati-bank-s4.md): a visszajelzés ítélete a kódszótárból, utána a modell indoklása
 * az ítélet-előtag nélkül (a régi leckékben is — megjelenítéskor vágva, adatmódosítás nélkül).
 *
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a): a változatossági jelölővel mentett leckén (`FeedbackVarietyContext`)
 * és ismert kérdésnél az ítélet után a kódszótári, kérdésenként változó nyitás áll, a modell régi bátorító előtagja levágva.
 * Jelöletlen leckén a kimenet a korábbival azonos.
 */
export function VerdictFeedback({ right, text, className = "lesson-feedback", testId, question, children }: {
  right: boolean; text: string; className?: string; testId?: string;
  /** A kérdés szövege és opciói — ebből a nyitás kulcsa (csak jelölt leckén hat). */
  question?: { text: string; options: readonly string[] };
  children?: ReactNode;
}) {
  const variety = useContext(FeedbackVarietyContext);
  // Review #285: a csak ítéletből álló szöveg („Igen.”) üres — ilyenkor nincs elválasztó és nincs ismétlés.
  const view = feedbackView({
    right, text,
    variety: variety && question ? { marker: variety.marker, band: variety.band, key: feedbackOpenerKey(variety.mapId, question.text, question.options) } : undefined,
  });
  return <p className={className} data-state={right ? "right" : "wrong"} data-testid={testId}>
    <strong className="lesson-verdict">{right ? VERDICT_TEXT.right : VERDICT_TEXT.wrong}</strong>
    {view.opener ? <> <span className="lesson-verdict-opener" data-testid="verdict-opener">{view.opener}</span></> : null}
    {view.reason ? <> {view.reason}</> : null}{children}
  </p>;
}

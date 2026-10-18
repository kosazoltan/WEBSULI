import type { ReactNode } from "react";
import { VERDICT_TEXT, stripVerdictPrefix } from "@shared/lesson-ui-text";

/**
 * Arculati bank S4 (docs/specs/2026-10-18-arculati-bank-s4.md): a visszajelzés ítélete a kódszótárból, utána a modell indoklása
 * az ítélet-előtag nélkül (a régi leckékben is — megjelenítéskor vágva, adatmódosítás nélkül).
 */
export function VerdictFeedback({ right, text, className = "lesson-feedback", testId, children }: { right: boolean; text: string; className?: string; testId?: string; children?: ReactNode }) {
  // Review #285: a csak ítéletből álló szöveg („Igen.”) üres — ilyenkor nincs elválasztó és nincs ismétlés.
  const reason = stripVerdictPrefix(text);
  return <p className={className} data-state={right ? "right" : "wrong"} data-testid={testId}>
    <strong className="lesson-verdict">{right ? VERDICT_TEXT.right : VERDICT_TEXT.wrong}</strong>{reason ? <> {reason}</> : null}{children}
  </p>;
}

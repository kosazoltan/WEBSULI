import { createContext } from "react";
import type { AgeBand } from "@shared/lesson-schema";
import type { LessonVarietyMarker } from "@shared/lesson-feedback-openers";

/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a): a változatossági jelölővel mentett lecke adatai a visszajelzéshez.
 * `null` (jelöletlen lecke vagy a leckén kívüli nézet) → a visszajelzés a mai módon jelenik meg.
 */
export const FeedbackVarietyContext = createContext<{
  marker: LessonVarietyMarker; band: AgeBand; mapId: string;
  /** S5a vak kör 1 (L3): a friss visszajelzés szövege az élő régióba (a lejátszó adja; hiányában nincs bejelentés). */
  announce?: (text: string) => void;
} | null>(null);

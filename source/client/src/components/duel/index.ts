/**
 * A párbaj újrahasznosítható megjelenítő komponensei (JM1r, D20): az egyeszközös aréna megszűnésekor kiemelve, egy játékos
 * nézőpontjára átírva. A JM3a online meccsképernyője és a gépi ellenfél ugyanezt a megjelenítőt használja.
 */
export { DUEL_VIEW_CSS } from "./duel-css";
export { DUEL_FIT_LEVELS, fmt1, fmtSec, hpView, praiseFor, timerRatio, verdictTitle, type HpTone, type VerdictKind } from "./format";
export { DamagePop, PlayerHud, type PlayerHudProps } from "./PlayerHud";
export { QuestionCard, optionStateFor, type QuestionCardProps, type QuestionCardState } from "./QuestionCard";
export { ResultCard, type ResultCardProps, type ResultCardStats } from "./ResultCard";
export { TimerBar, writeTimerBar } from "./TimerBar";
export { VerdictBanner, type VerdictBannerProps } from "./VerdictBanner";
export { useDuelFeedback, type DuelFeedback } from "./useDuelFeedback";

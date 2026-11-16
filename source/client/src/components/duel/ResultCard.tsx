/**
 * Eredménykártya a győzteshirdetéshez (JM1r: az aréna `StatCard`-ja, egy játékos nézőpontjára): érem, hely, dicséret,
 * pontosság, helyes / feltett, leggyorsabb helyes, legjobb sorozat. Rangsor-szégyenítés nincs: a vesztes is elismerést kap.
 */
import { fmtSec, praiseFor } from "./format";

export type ResultCardStats = { accuracy: number; correct: number; asked: number; fastestMs: number | null; bestStreak: number };

export type ResultCardProps = {
  name: string;
  /** Pl. „5. évfolyam” vagy „Gép · Közepes”. */
  subtitle?: string | null;
  place: number;
  won: boolean;
  coWin: boolean;
  stats: ResultCardStats;
  tone: "self" | "rival";
  badge?: string | null;
  /** Kicsi változat (a többiek kártyája): csak név, hely, pontosság. */
  compact?: boolean;
  testId?: string;
};

export function ResultCard({ name, subtitle, place, won, coWin, stats, tone, badge, compact = false, testId }: ResultCardProps) {
  const medal = won ? "🏆" : place === 2 ? "🥈" : place === 3 ? "🥉" : "🎖️";
  return (
    <section
      className={`duel-card duel-card--${tone}${won ? " duel-card--win" : ""}${compact ? " duel-card--compact" : ""}`}
      data-testid={testId}
      aria-label={`${name} eredménye`}
    >
      <header className="duel-card-head">
        <span className="duel-medal" aria-hidden="true">
          {medal}
        </span>
        <div className="min-w-0">
          <p className="duel-card-name">
            {name}
            {badge ? <span className="duel-hud-badge">{badge}</span> : null}
          </p>
          <p className="duel-card-place">
            {place}. hely{subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
      </header>
      {compact ? null : <p className="duel-card-praise">{praiseFor({ won, coWin, correct: stats.correct })}</p>}
      <dl className="duel-card-stats">
        <div>
          <dt>Pontosság</dt>
          <dd data-testid={testId ? `${testId}-acc` : undefined}>{Math.round(stats.accuracy * 100)}%</dd>
        </div>
        {compact ? null : (
          <>
            <div>
              <dt>Helyes</dt>
              <dd>
                {stats.correct}/{stats.asked}
              </dd>
            </div>
            <div>
              <dt>Leggyorsabb helyes</dt>
              <dd data-testid={testId ? `${testId}-fast` : undefined}>{stats.fastestMs === null ? "—" : fmtSec(stats.fastestMs)}</dd>
            </div>
            <div>
              <dt>Legjobb sorozat</dt>
              <dd>{stats.bestStreak}</dd>
            </div>
          </>
        )}
      </dl>
    </section>
  );
}

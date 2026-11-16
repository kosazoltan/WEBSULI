/** Ítélet-sáv a kör után (JM1r: az aréna `duel-verdict`-je): helyes / majdnem / lejárt + magyarázat + opcionális megjegyzés. */
import { verdictTitle, type VerdictKind } from "./format";

export type VerdictBannerProps = {
  kind: VerdictKind;
  correctText: string;
  bonus?: number;
  explanation?: string | null;
  /** Egy rövid kiegészítő sor (pl. „Bátor Róka volt a gyorsabb”). */
  note?: string | null;
  testId?: string;
};

export function VerdictBanner({ kind, correctText, bonus, explanation, note, testId }: VerdictBannerProps) {
  return (
    <div className={`duel-verdict ${kind === "correct" ? "duel-verdict--ok" : "duel-verdict--miss"}`} data-kind={kind} data-testid={testId}>
      <p className="duel-verdict-title">{verdictTitle(kind, { correctText, bonus })}</p>
      {note ? <p className="duel-verdict-note">{note}</p> : null}
      {explanation ? <p className="duel-verdict-why">{explanation}</p> : null}
    </div>
  );
}

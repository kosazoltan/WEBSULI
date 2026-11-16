/**
 * Játékos-fejléc életerő-sávval (JM1r: az aréna `PlayerPane` fejléce, egy játékos nézőpontjára átírva).
 * `variant="self"`: a saját sáv nagyban (név, évfolyam, sorozat-jelvény, életerő-szám, sáv); `variant="rival"`: az ellenfél
 * kicsinyített chipje (név, vékony sáv, szám, „válaszolt” pötty, kapcsolat-állapot, opcionális „Gép” jelvény).
 */
import type { ReactNode } from "react";

import { DUEL_HP } from "@shared/duel/rules";

import { fmt1, hpView } from "./format";

export type PlayerHudProps = {
  variant: "self" | "rival";
  name: string;
  hp: number;
  maxHp?: number;
  /** Csak a saját sávon: „5. évf.”. */
  grade?: number | null;
  /** ≥ 2 → sorozat-jelvény (csak a saját sávon). */
  streak?: number;
  /** Az ellenfél már válaszolt ebben a körben (csak azt jelzi, HOGY válaszolt — mit, azt a felfedés). */
  answered?: boolean;
  /** Megszakadt kapcsolat (a 60 s-os helymegtartás alatt) / kilépett. */
  status?: "online" | "away" | "left";
  /** Jelvény a név mellett (pl. „Gép”). */
  badge?: string | null;
  /** Lebegő csapás-szám / kombó (a `DamagePop`). */
  children?: ReactNode;
  testId?: string;
};

export function PlayerHud({ variant, name, hp, maxHp = DUEL_HP, grade, streak = 0, answered = false, status = "online", badge, children, testId }: PlayerHudProps) {
  const { pct, tone } = hpView(hp, maxHp);
  const statusText = status === "away" ? "Kapcsolódik…" : status === "left" ? "Kilépett" : null;
  return (
    <div className={`duel-hud duel-hud--${variant}`} data-testid={testId} data-status={status} data-answered={answered ? "true" : "false"}>
      <div className="duel-hud-head">
        <span className="duel-hud-name">
          {name}
          {badge ? <span className="duel-hud-badge">{badge}</span> : null}
          {variant === "self" && grade ? <span className="duel-hud-grade"> {grade}. évf.</span> : null}
        </span>
        {variant === "self" && streak >= 2 ? (
          <span className="duel-hud-streak" data-testid={testId ? `${testId}-streak` : undefined}>
            🔥 {streak}× sorozat
          </span>
        ) : null}
        {variant === "rival" ? (
          <span
            className="duel-hud-dot"
            data-on={answered ? "true" : "false"}
            role="img"
            aria-label={answered ? "Már válaszolt" : "Még gondolkodik"}
            title={answered ? "Már válaszolt" : "Még gondolkodik"}
          />
        ) : null}
        {statusText ? <span className="duel-hud-status">{statusText}</span> : null}
        <span className="duel-hud-hp" data-testid={testId ? `${testId}-hp` : undefined}>
          {fmt1(hp)} ❤
        </span>
      </div>
      <div className="duel-hp" role="meter" aria-label={`${name} életereje`} aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp}>
        <div className={`duel-hp-fill duel-hp-fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {children}
    </div>
  );
}

/** Lebegő csapás-szám (−x) vagy kombó-felirat; a `keyId` körönként új, így az animáció újraindul. */
export function DamagePop({ amount, kind = "hit", keyId, testId }: { amount: number; kind?: "hit" | "combo"; keyId: string | number; testId?: string }) {
  return (
    <span key={keyId} className={`duel-dmg${kind === "combo" ? " duel-combo" : ""}`} data-testid={testId} aria-hidden="true">
      {kind === "combo" ? `🔥 ${amount}× kombó!` : `−${fmt1(amount)}`}
    </span>
  );
}

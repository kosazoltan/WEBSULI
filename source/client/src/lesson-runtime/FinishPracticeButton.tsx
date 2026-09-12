import { useState } from "react";

/** An unfinished exercise is not silently turned into a failing grade. */
export function FinishPracticeButton({ unanswered, total, onFinish, onContinue, children, className, disabled }: {
  unanswered: number; total: number; onFinish: () => void; onContinue?: () => void;
  children: string; className?: string; disabled?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  return <div className="practice-finish">
    <p>{total - unanswered} megválaszolt · {unanswered} megválaszolatlan kérdés</p>
    <button className={className} disabled={disabled} onClick={() => unanswered ? setConfirm(true) : onFinish()}>{children}</button>
    {confirm && !disabled && <div role="group" aria-label="Hiányos kör lezárása">
      <p>Még {unanswered} kérdésre nem válaszoltál. Lezáráskor ezek nulla pontot érnek. Folytatod a kitöltést?</p>
      <button className={className} onClick={() => { setConfirm(false); onContinue?.(); }}>Folytatom a kitöltést</button>
      <button className={className} onClick={() => { setConfirm(false); onFinish(); }}>Lezárom a kihagyásokkal</button>
    </div>}
  </div>;
}

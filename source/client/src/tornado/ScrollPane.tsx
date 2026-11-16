import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useScrollHint } from "@/components/useScrollHint";

/**
 * Saját görgetésű hasáb a rögzített keretű meta-képernyőkhöz (fekvő Vihargarázs, Szintek — docs/specs/
 * 2026-11-16-jatek-telefonos-reszponzivitas.md). A túlcsordulás LÁTSZIK: amíg a hasáb alja nincs elérve, alul átúszó sáv
 * + lefelé mutató nyíl jelzi, hogy van még tartalom; az aljára érve eltűnik. A görgető elem `data-scroll-hint="more" |
 * "end"` attribútuma ugyanezt adja a mérőnek (`game-meta-quality` X8).
 */
export default function ScrollPane(props: {
  /** A külső (keret) elem osztályai — pl. `flex-1`, rácscella. */
  className?: string;
  /** A tartalom osztályai — pl. `flex flex-col gap-2`. */
  innerClassName?: string;
  testId?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const more = useScrollHint(scrollEl, contentEl);

  return (
    <div className={`relative min-h-0 flex flex-col ${props.className ?? ""}`}>
      <div
        ref={setScrollEl}
        data-testid={props.testId}
        data-scroll-hint={more ? "more" : "end"}
        aria-label={props.ariaLabel}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
      >
        <div ref={setContentEl} className={props.innerClassName}>
          {props.children}
        </div>
      </div>
      {more && <ScrollFade />}
    </div>
  );
}

/** Az alsó átúszó jelzés (díszítés, `aria-hidden`; nem fogja el az érintést). */
export function ScrollFade(props: { sticky?: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-scroll-fade="true"
      className={`pointer-events-none inset-x-0 bottom-0 h-7 flex items-end justify-center bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent ${
        props.sticky ? "sticky -mt-7" : "absolute"
      }`}
    >
      <ChevronDown className="w-4 h-4 text-lime-200/90 animate-bounce motion-reduce:animate-none" />
    </div>
  );
}

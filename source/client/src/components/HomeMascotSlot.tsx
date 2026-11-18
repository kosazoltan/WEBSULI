import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClassroomGrade } from "@/lib/classroomStore";
import {
  DEFAULT_MASCOT_PREFS, MASCOT_BOX_CLASS, MASCOT_HIDDEN_CLASS, homeMascotEnabled, loadMascotPrefs, mascotPicks, saveMascotPrefs,
  type MascotMode, type MascotPrefs,
} from "@/lib/home-mascot";
import type { MascotFile } from "@/mascot/HomeMascot";

/**
 * A Websuli makija a főoldalon — a HELY lefoglalása a fő darabban (terv: docs/specs/2026-11-18-kabala-fooldal.md, 4.4, 4.6).
 * A sáv rögzített magasságú doboz, a tartalma (figura, buborék, három link) lustán, a lista megjelenése után tétlen időben töltődik
 * be — a főoldal fő JS-darabja és az első rajzolás így érdemben nem változik, elrendezés-ugrás nincs.
 * Kikapcsolt `HOME_MASCOT` kapcsolónál a hook `enabled: false`-t ad, és a hívó semmit nem rajzol (a DOM a régi).
 */
export type HomeMascotState = {
  enabled: boolean;
  /** A sáv teljes méretben látszik (bekapcsolva és nincs bezárva) — ilyenkor az üdvözlő kártya saját hármas listája elmarad. */
  open: boolean;
  prefs: MascotPrefs;
  /** Járt-e már itt a látogató a lap betöltésekor. */
  returning: boolean;
  setMode: (mode: MascotMode) => void;
  markSeen: () => void;
};

export function useHomeMascot(): HomeMascotState {
  const [enabled] = useState(() => homeMascotEnabled());
  const [prefs, setPrefs] = useState<MascotPrefs>(() => (enabled ? loadMascotPrefs() : DEFAULT_MASCOT_PREFS));
  const returning = useRef(prefs.seen > 0).current;
  const update = useCallback((change: (current: MascotPrefs) => MascotPrefs) => {
    setPrefs((current) => {
      const next = change(current);
      saveMascotPrefs(next);
      return next;
    });
  }, []);
  const setMode = useCallback((mode: MascotMode) => update((current) => ({ ...current, mode })), [update]);
  const markSeen = useCallback(() => update((current) => ({ ...current, seen: current.seen + 1 })), [update]);
  return { enabled, open: enabled && prefs.mode !== "hidden", prefs, returning, setMode, markSeen };
}

type LazyProps = {
  picks: MascotFile[];
  isNew: (file: MascotFile) => boolean;
  returning: boolean;
  mode: Exclude<MascotMode, "hidden">;
  onMode: (mode: MascotMode) => void;
  onSeen: () => void;
  onViewFile: (file: MascotFile) => void;
};
const LazyMascot = lazy(() => import("@/mascot/HomeMascot")) as unknown as ComponentType<LazyProps>;

/** Ha a lusta darab nem tölthető be vagy hibázik, a lefoglalt doboz üres marad — a lista használható. */
class MascotBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function HomeMascotSlot<T extends MascotFile>({ files, mascot, onViewFile }: { files: readonly T[]; mascot: HomeMascotState; onViewFile: (file: T) => void }) {
  const { isAdmin } = useAuth();
  const { grade } = useClassroomGrade();
  // Az admin (szülő) az összes évfolyam újdonságait kapja — mint az üdvözlő kártyán.
  const picks = useMemo(() => mascotPicks(files, isAdmin ? null : grade, new Date()), [files, grade, isAdmin]);
  const count = picks.files.length;

  // A tartalom a lista megjelenése UTÁN, tétlen időben töltődik (a fő tartalom az első).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!mascot.open || ready) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void });
    if (typeof idle.requestIdleCallback === "function") {
      const id = idle.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => idle.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 200);
    return () => window.clearTimeout(id);
  }, [mascot.open, ready]);

  if (!mascot.enabled || count === 0) return null;

  if (!mascot.open) {
    return (
      <div className={`mx-auto mb-3 flex max-w-3xl justify-end ${MASCOT_HIDDEN_CLASS}`} data-testid="home-mascot" data-mode="hidden">
        <button
          type="button"
          onClick={() => mascot.setMode("on")}
          className="h-11 rounded-full border border-white/25 bg-white/10 px-4 text-xs font-bold text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-amber-200"
          data-testid="home-mascot-recall"
        >
          Maki visszahívása
        </button>
      </div>
    );
  }

  const mode = mascot.prefs.mode === "quiet" ? "quiet" : "on";
  return (
    <section
      className={`home-panel mx-auto mb-3 max-w-3xl text-white ${MASCOT_BOX_CLASS[count as 1 | 2 | 3]}`}
      aria-labelledby="home-mascot-title"
      data-testid="home-mascot"
      data-mode={mode}
      data-count={count}
    >
      <h2 id="home-mascot-title" className="sr-only">A maki ajánlja</h2>
      {ready && (
        <MascotBoundary>
          <Suspense fallback={null}>
            <LazyMascot
              picks={picks.files}
              isNew={picks.isNew as (file: MascotFile) => boolean}
              returning={mascot.returning}
              mode={mode}
              onMode={mascot.setMode}
              onSeen={mascot.markSeen}
              onViewFile={onViewFile as (file: MascotFile) => void}
            />
          </Suspense>
        </MascotBoundary>
      )}
    </section>
  );
}

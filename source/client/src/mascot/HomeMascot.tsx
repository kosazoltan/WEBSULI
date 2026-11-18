import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Pause, Play, X } from "lucide-react";
import { getClassroomLabel } from "@shared/classrooms";
import { coverIdFor } from "@shared/home-card-theme";
import type { MascotMode } from "@/lib/home-mascot";
import {
  MASCOT_DWELL_MS, daySeed, fillPhrase, mascotHref, nextStep, phraseGroupFor, pickPhrase, stepIndex,
  type MascotEvent, type MascotStep,
} from "./mascot-script";
import { createSpritePlayer, sheetRows, type SpritePlayer } from "./sprite-player";
import manifest from "./home-mascot.manifest.json";
import "./home-mascot.css";

/**
 * A Websuli makija a főoldalon — a sáv tartalma (terv: docs/specs/2026-11-18-kabala-fooldal.md). Lustán betöltött darab: a
 * helyet a `HomeMascotSlot` foglalja le. A figura díszítő elem; az ajánló tartalma a három link.
 */
export type MascotFile = {
  id: string; title: string; classroom: number; createdAt: string; contentType?: string; cover?: string | null; coverThumb?: string;
};

type Props<T extends MascotFile> = {
  picks: T[];
  isNew: (file: T) => boolean;
  /** Járt-e már itt a látogató (a betöltéskori érték): visszatérőnél nincs körbevezetés. */
  returning: boolean;
  mode: Exclude<MascotMode, "hidden">;
  onMode: (mode: MascotMode) => void;
  /** Egyszer hívódik, amikor a maki ténylegesen köszön — a látogatás megjegyzéséhez. */
  onSeen: () => void;
  onViewFile: (file: T) => void;
};

const SHEET_URL = `/mascot/${manifest.sheet.file}`;
const POSTER_URL = `/mascot/${manifest.poster.file}`;
/** A mutató kéz magassága a cellában (felülről, a cella magasságának hányada) — ehhez igazodik a sor közepe. */
const HAND_AT = 0.47;
/** Ennyivel lóghat a figura a sorok területe fölé / alá (px), hogy a szélső sorokra is rámutasson. */
const OVER_TOP = 8;
const OVER_BOTTOM = 10;

const reducedMotionQuery = () => (typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null);
const saveDataOn = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
const canAnimate = () => typeof Element !== "undefined" && typeof Element.prototype.animate === "function";

type View = { step: MascotStep; template: string; turn: number };

export default function HomeMascot<T extends MascotFile>({ picks, isNew, returning, mode, onMode, onSeen, onViewFile }: Props<T>) {
  const count = picks.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const makiRef = useRef<HTMLButtonElement>(null);
  const liftRef = useRef<HTMLSpanElement>(null);
  const sheetRef = useRef<HTMLImageElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const playerRef = useRef<SpritePlayer | null>(null);
  const seed = useMemo(() => daySeed(new Date()), []);

  const [reduced, setReduced] = useState(() => reducedMotionQuery()?.matches ?? false);
  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  /** Mozoghat-e a figura: a látogató nem csendesítette le, nincs csökkentett mozgás, nincs adatkímélő mód, a böngésző tudja. */
  const animated = mode === "on" && !reduced && !saveDataOn() && canAnimate();

  // A képkocka-lapot csak akkor kérjük le, ha a sáv a képernyő közelében van, és a figura mozoghat.
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const nearObserver = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: "300px 0px" });
    const screenObserver = new IntersectionObserver((entries) => { setOnScreen(entries[entries.length - 1].isIntersecting); });
    nearObserver.observe(el);
    screenObserver.observe(el);
    return () => { nearObserver.disconnect(); screenObserver.disconnect(); };
  }, []);
  const [sheetReady, setSheetReady] = useState(false);
  useEffect(() => {
    if (!animated || !near || sheetReady) return;
    let alive = true;
    const image = new Image();
    image.decoding = "async";
    image.src = SHEET_URL;
    // A dekódolás a háttérben történik; hiba esetén az álló kép marad (a buborék és a linkek működnek).
    image.decode().then(() => { if (alive) setSheetReady(true); }, () => undefined);
    return () => { alive = false; };
  }, [animated, near, sheetReady]);
  const moving = animated && sheetReady;

  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  /** Fut-e bármi: háttérbe tett lapon és kigördített sávnál minden áll. */
  const active = moving && pageVisible && onScreen;

  // ── állapotgép ──
  // Mozgás nélkül (csökkentett mozgás, adatkímélő mód, csendesítés) a maki az első ajánlásnál áll, időzítés nincs.
  const initial = (): View => {
    const step: MascotStep = animated ? { kind: "enter" } : { kind: "present", index: 0, auto: false };
    return { step, template: pickPhrase(phraseGroupFor(step, returning), seed), turn: 0 };
  };
  const [view, setView] = useState<View>(initial);
  const dispatch = useCallback((event: MascotEvent) => {
    setView((current) => {
      const step = nextStep(current.step, event, { count, returning });
      if (step.kind === current.step.kind && stepIndex(step) === stepIndex(current.step) && step.kind === "rest") return current;
      const turn = current.turn + 1;
      return { step, turn, template: pickPhrase(phraseGroupFor(step, returning), seed + turn, current.template) };
    });
  }, [count, returning, seed]);

  // A csendesítés / mozgás váltásakor és az ajánlatok cseréjekor (a lista percenként frissül) a maki az első ajánlásra áll.
  const ids = picks.map((p) => p.id).join("|");
  const resetKey = `${ids}#${animated ? "a" : "s"}`;
  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    setView((current) => {
      const step: MascotStep = { kind: "present", index: 0, auto: false };
      const turn = current.turn + 1;
      return { step, turn, template: pickPhrase("pick", seed + turn, current.template) };
    });
  }, [resetKey, seed]);

  const { step } = view;
  const index = Math.min(stepIndex(step), count - 1);
  const current = picks[index];
  const bubble = fillPhrase(view.template, current?.title);

  // A látogatás megjegyzése: egyszer, amikor a köszönés ténylegesen elindul (mozgással) vagy megjelenik (mozgás nélkül).
  const seenSent = useRef(false);
  useEffect(() => {
    if (seenSent.current || (animated && !moving)) return;
    seenSent.current = true;
    onSeen();
  }, [animated, moving, onSeen]);

  // Időzítés: csak futó állapotban; megállás után a lépés ideje elölről indul.
  useEffect(() => {
    if (!active) return;
    const dwell = step.kind === "rest" ? null : MASCOT_DWELL_MS[step.kind];
    if (dwell == null) return;
    const id = window.setTimeout(() => dispatch({ type: "done" }), dwell);
    return () => window.clearTimeout(id);
  }, [active, step, dispatch]);

  // ── a figura helye: az ajánlott sor magasságában ──
  const [tops, setTops] = useState<number[]>([]);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const maki = makiRef.current;
    if (!stage || !maki) return;
    const measure = () => {
      const height = maki.offsetHeight;
      const max = Math.max(0, stage.clientHeight - height + OVER_BOTTOM);
      setTops(rowRefs.current.slice(0, count).map((row) => {
        if (!row) return 0;
        return Math.round(Math.min(max, Math.max(-OVER_TOP, row.offsetTop + row.offsetHeight / 2 - HAND_AT * height)));
      }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [count]);
  const top = tops[index] ?? 0;

  // ── lejátszás ──
  useEffect(() => {
    if (!moving || !sheetRef.current || !liftRef.current) return;
    const player = createSpritePlayer(sheetRef.current, liftRef.current, manifest, () => makiRef.current?.offsetHeight ?? 0);
    playerRef.current = player;
    return () => { player.stop(); playerRef.current = null; };
  }, [moving]);
  const shownTop = useRef<number | null>(null);
  useEffect(() => {
    const player = playerRef.current;
    if (!moving || !player) return;
    const moved = shownTop.current !== null && shownTop.current !== top;
    shownTop.current = top;
    if (step.kind === "enter") player.play(["wave", "idle"]);
    else if (step.kind === "present") player.play(moved ? ["hop", "point-in", "point"] : ["point-in", "point"]);
    else if (step.kind === "cheer") player.play(["cheer", "idle"]);
    else player.play(["idle", "idle", "idle", "blink"], { repeat: true });
    // a `view.turn` minden lépésváltáskor nő: ugyanarra a sorra újra koppintva is újraindul a mozdulat
  }, [moving, step, top, view.turn]);

  // Megállítás / folytatás: a sáv ÖSSZES animációja (képkocka, emelkedés, helyváltoztatás, lélegzés).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !moving || typeof root.getAnimations !== "function") return;
    for (const animation of root.getAnimations({ subtree: true })) {
      if (active) {
        if (animation.playState === "paused") animation.play();
      } else if (animation.playState === "running") animation.pause();
    }
  }, [active, moving, view.turn]);

  // ── kezelők ──
  const [announce, setAnnounce] = useState("");
  const onTap = () => {
    const next = nextStep(step, { type: "tap" }, { count, returning });
    const target = picks[Math.min(stepIndex(next), count - 1)];
    // Csak a látogató által kért váltást mondjuk be (az önműködő körbevezetés nem beszél).
    if (target) setAnnounce(`Ajánlat: ${target.title}`);
    dispatch({ type: "tap" });
  };
  const open = (event: MouseEvent<HTMLAnchorElement>, file: T) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onViewFile(file);
  };

  const rows = sheetRows(manifest);
  return (
    <div ref={rootRef} className="hm-root" data-testid="home-mascot-body" data-motion={moving ? "on" : "off"} data-step={step.kind} data-index={index} data-running={active ? "true" : "false"}>
      <div className="hm-top">
        <p className="hm-bubble" data-testid="home-mascot-bubble">
          <span className="hm-bubble-text">{bubble}</span>
        </p>
        <button
          type="button"
          className="hm-btn"
          aria-pressed={mode === "quiet"}
          aria-label="A maki lecsendesítése"
          title={mode === "quiet" ? "A maki újra mozoghat" : "A maki lecsendesítése"}
          onClick={() => onMode(mode === "quiet" ? "on" : "quiet")}
          data-testid="home-mascot-quiet"
        >
          {mode === "quiet" ? <Play className="w-4 h-4" aria-hidden /> : <Pause className="w-4 h-4" aria-hidden />}
        </button>
        <button type="button" className="hm-btn" aria-label="A maki elrejtése" title="A maki elrejtése" onClick={() => onMode("hidden")} data-testid="home-mascot-close">
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
      <div ref={stageRef} className="hm-stage">
        <div className="hm-track">
          <button
            ref={makiRef}
            type="button"
            className="hm-maki"
            // a sorok a figurától jobbra állnak; "left" értéknél a CSS tükrözi a képsort (balra mutat)
            data-facing="right"
            style={{ transform: `translateY(${top}px)` }}
            aria-label="Következő ajánlat"
            onClick={onTap}
            data-testid="home-mascot-maki"
          >
            <span className="hm-shadow" aria-hidden />
            <span ref={liftRef} className="hm-lift" aria-hidden>
              <span className="hm-cell">
                {moving ? (
                  <img ref={sheetRef} className="hm-sheet" src={SHEET_URL} alt="" draggable={false} style={{ width: `${manifest.cols * 100}%`, height: `${rows * 100}%` }} data-testid="home-mascot-sheet" />
                ) : (
                  <img className="hm-poster" src={POSTER_URL} alt="" width={manifest.poster.width} height={manifest.poster.height} decoding="async" draggable={false} data-testid="home-mascot-poster" />
                )}
              </span>
            </span>
          </button>
        </div>
        <ul className="hm-picks" data-testid="home-mascot-picks">
          {picks.map((file, i) => (
            <li key={file.id} ref={(el) => { rowRefs.current[i] = el; }}>
              <a
                href={mascotHref(file)}
                className="welcome-pick hm-pick"
                data-active={i === index ? "true" : "false"}
                aria-current={i === index ? "true" : undefined}
                onClick={(event) => open(event, file)}
                data-testid={`home-mascot-pick-${file.id}`}
              >
                <img
                  className="welcome-pick-thumb"
                  src={file.coverThumb ?? `/api/design-assets/${coverIdFor(file.cover, file.classroom ?? 1)}/thumb`}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                  onLoad={(e) => { e.currentTarget.style.visibility = ""; }}
                />
                <span className="flex-1 min-w-0">
                  <span className="welcome-pick-meta">
                    {isNew(file) && <span className="welcome-pick-new">Új</span>}
                    <span>{getClassroomLabel(file.classroom ?? 1)}</span>
                  </span>
                  <span className="welcome-pick-title">{file.title}</span>
                </span>
                <ArrowRight className="w-4 h-4 shrink-0 text-amber-200" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only" aria-live="polite" data-testid="home-mascot-live">{announce}</p>
    </div>
  );
}

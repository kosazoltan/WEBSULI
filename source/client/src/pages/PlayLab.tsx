/**
 * J0c — „play-lab” próbaoldal a közös kérdés-sávhoz (végrehajtás J0c 6. lépés). CSAK teszt-kampós buildben él
 * (`VITE_ENABLE_GAME_TEST_HOOKS=1`, `App.tsx` feltételes lusta útvonala: `/__play-lab`) — a diákok éles buildjében az
 * útvonal és ez a kód nincs benne (`T/game-test-hooks-guard.test.ts` prod-ága).
 *
 * Egyszerű 2D „játék”: háromsávos futó pötty, lehulló akadályok, a HUD és a vezérlők a közös mobilkeretből. A kérdés-sávot
 * a valódi `usePlayQuestion` + `InlineQuestion` hajtja egy 8 tételes kézi bankkal; a „Miért?” a valódi `buildFeedback` +
 * `QuizFeedbackCard` (szünettel), a menet végén `ResultReview` a `ResultScreen` `extra` slotjában.
 *
 * URL-paraméterek: `skin` (ocean|rock|mine|neon|arena|space|storm), `mode` (buttons|bar), `long=1` (hosszú kérdéssel
 * kezd), `slow` (0.35..1, alap 0.5), `opts` (3|4), `seed`, `auto=1` (azonnal indul, a képernyőképekhez).
 * Teszt-API: `forceState({ question: true })` / `{ phase: "quiz" }` → azonnali kérdés; `{ phase: "result" }` → eredmény.
 * `probe()`: simTime, questionOpen, questionsAnswered, questionsCorrect, fps, band, intensity (+ questionId, questionKey,
 * reveal, paused).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { createRng, seedFrom } from "@shared/game-rng";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { installGameTestApi, readGameSeed } from "@/game-engine/game-test-hooks";
import { GameHud, GameShell, PauseMenu, ResultScreen, StartScreen } from "@/game-engine/mobile";
import type { GameScreenState } from "@/game-engine/mobile";
import {
  INLINE_QUESTION_SKINS,
  InlineQuestion,
  PlaySpeechToggle,
  ResultReview,
  bankPlayQuestion,
  createFixedLoop,
  restoreReviewQuestion,
  useGameSpeech,
  usePlayQuestion,
  type DirectorConfig,
  type InlineQuestionSkin,
  type PlayQuestion,
  type QuestionProvider,
} from "@/game-engine/play";
import type { StorageLike } from "@/game-engine/vocab";
import type { FourChoiceQuiz } from "@/types/gameQuiz";

const GAME_ID = "speed-quiz-math" as const;
const RUN_QUESTIONS = 12;

/** 8 tétel: rövid, hosszú (tananyag-szerű), hosszú válaszú és nyelvi (felolvasható) kérdés. */
const BANK: Array<{ quiz: FourChoiceQuiz; lang?: "en"; speakText?: string }> = [
  { quiz: { id: "lab-1", prompt: "Mennyi 7 × 8?", options: ["56", "54", "63", "48"], correctIndex: 0, explanation: "7 × 8 = 56: hétszer nyolc, vagy nyolcszor hét." } },
  {
    quiz: {
      id: "lab-2",
      prompt:
        "A fotoszintézis során a növények a napfény energiáját felhasználva a szén-dioxidból és a vízből szerves anyagot állítanak elő. Melyik gáz szabadul fel közben a levegőbe?",
      options: ["oxigén", "nitrogén", "hidrogén", "szén-monoxid"],
      correctIndex: 0,
      explanation: "A fotoszintézis melléktermékeként oxigén kerül a levegőbe — ezt lélegezzük be.",
    },
  },
  { quiz: { id: "lab-3", prompt: "Mit jelent: apple?", options: ["alma", "körte", "szilva", "barack"], correctIndex: 0, explanation: "Az apple jelentése: alma." }, lang: "en", speakText: "apple" },
  { quiz: { id: "lab-4", prompt: "Melyik a legnagyobb?", options: ["0,7", "0,65", "0,07", "0,605"], correctIndex: 0, explanation: "Tizedekben: 0,7 = 0,70, ez nagyobb a 0,65-nél." } },
  {
    quiz: {
      id: "lab-5",
      prompt: "Melyik mondat helyes?",
      options: ["A kutya a kertben ugat.", "A kutya a kertben ugatt.", "A kutja a kertben ugat.", "A kutya a kertbe ugatt."],
      correctIndex: 0,
      explanation: "Az ugat egy t-vel írandó, a kutya pedig ty-nal.",
    },
  },
  { quiz: { id: "lab-6", prompt: "Hány perc 2 óra?", options: ["120", "100", "200", "60"], correctIndex: 0, explanation: "1 óra 60 perc, 2 óra 2 × 60 = 120 perc." } },
  { quiz: { id: "lab-7", prompt: "Mi Magyarország fővárosa?", options: ["Budapest", "Debrecen", "Szeged", "Pécs"], correctIndex: 0, explanation: "Magyarország fővárosa Budapest." } },
  { quiz: { id: "lab-8", prompt: "Melyik páros szám?", options: ["14", "15", "21", "9"], correctIndex: 0, explanation: "A 14 osztható 2-vel, ezért páros." } },
];

/**
 * A kézi bank után végtelen, determinisztikus számolós tételek (review #446: hibátlan menetnél a 8 tétel elfogyott a 12
 * válaszos lezárás előtt, és a menet sosem ért az eredményképernyőig).
 */
function labItem(n: number): { quiz: FourChoiceQuiz; lang?: "en"; speakText?: string } {
  if (n < BANK.length) return BANK[n]!;
  const a = 3 + ((n * 7) % 17);
  const b = 2 + ((n * 5) % 13);
  const s = a + b;
  return {
    quiz: { id: `lab-gen-${n}`, prompt: `Mennyi ${a} + ${b}?`, options: [String(s), String(s + 1), String(s - 1), String(s + 10)], correctIndex: 0, explanation: `${a} + ${b} = ${s}.` },
  };
}

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function readParams() {
  const sp = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const skin = (INLINE_QUESTION_SKINS as readonly string[]).includes(sp.get("skin") ?? "") ? (sp.get("skin") as InlineQuestionSkin) : "ocean";
  const mode = sp.get("mode") === "bar" ? "bar" : "buttons";
  const slowRaw = Number(sp.get("slow") ?? "0.5");
  const slow = Number.isFinite(slowRaw) ? Math.min(1, Math.max(0.35, slowRaw)) : 0.5;
  return { skin, mode, slow, long: sp.get("long") === "1", opts: sp.get("opts") === "3" ? 3 : 4, auto: sp.get("auto") === "1" } as const;
}

const SKIN_BG: Record<InlineQuestionSkin, [string, string, string]> = {
  ocean: ["#0b3a5c", "#0e7490", "#67e8f9"],
  rock: ["#3b2a1c", "#78522f", "#fbbf24"],
  mine: ["#121a12", "#2d3b26", "#4ade80"],
  neon: ["#1a0533", "#3b0764", "#e879f9"],
  arena: ["#1e1038", "#4c1d95", "#a3e635"],
  space: ["#050816", "#1e1b4b", "#a5b4fc"],
  storm: ["#0f172a", "#334155", "#facc15"],
};

type World = { lane: number; laneX: number; obstacles: Array<{ lane: number; y: number; alive: boolean }>; spawnIn: number; score: number; dodged: number };

export default function PlayLab() {
  const params = useMemo(readParams, []);
  const [skin, setSkin] = useState<InlineQuestionSkin>(params.skin);
  const [mode, setMode] = useState<"buttons" | "bar">(params.mode);
  const [screen, setScreen] = useState<GameScreenState>("start");
  const [menuOpen, setMenuOpen] = useState(false);
  const [why, setWhy] = useState<FeedbackCard | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hud, setHud] = useState({ score: 0, answered: 0, correct: 0 });
  const [result, setResult] = useState<{ correct: number; total: number; score: number } | null>(null);
  const seedBase = useMemo(() => readGameSeed() ?? seedFrom("play-lab", "lab"), []);
  const runRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paused = screen !== "playing" || menuOpen || why !== null || expanded;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  /* ---------------- kérdésforrás: kézi bank, sorban (determinisztikus) ---------------- */
  const cursor = useRef(params.long ? 1 : 0);
  const storage = useMemo(memoryStorage, []);
  const provider = useMemo<QuestionProvider>(
    () => ({
      couponOnly: false,
      material: () => null,
      fresh: () => {
        const item = labItem(cursor.current);
        cursor.current += 1;
        const q: PlayQuestion = bankPlayQuestion(GAME_ID, item.quiz);
        return item.lang ? { ...q, lang: item.lang, speakText: item.speakText } : q;
      },
      restore: (it) => {
        const q = restoreReviewQuestion(it, {});
        const src = q ? BANK.find((b) => `bank:${GAME_ID}:${b.quiz.id}` === q.key) : undefined;
        return q && src?.lang ? { ...q, lang: src.lang, speakText: src.speakText } : q;
      },
    }),
    [],
  );
  const config = useMemo<DirectorConfig>(
    () => ({ gameId: GAME_ID, optionCount: params.opts, minGapMs: 1500, maxGapMs: 6000, targetPerMin: 9, baseWindowMs: 4500, slowMo: params.slow, grade: 5, warmupMs: 1500 }),
    [params],
  );

  const speech = useGameSpeech();
  const worldRef = useRef<World>({ lane: 1, laneX: 1, obstacles: [], spawnIn: 900, score: 0, dodged: 0 });
  const flashRef = useRef<{ until: number; correct: boolean } | null>(null);

  const q = usePlayQuestion({
    setup: { config, provider, startBand: 0.5, seed: seedBase, storage },
    speech,
    onOutcome: (o) => {
      // Játékbeli következmény (K.4/23): jó válasz → pont + „pajzs”, hibás → a pajzs elmarad (nem büntető).
      if (o.result === "correct") worldRef.current.score += 100;
      flashRef.current = { until: performance.now() + 500, correct: o.result === "correct" };
    },
  });
  const qRef = useRef(q);
  qRef.current = q;

  /* ---------------- szimuláció: fix lépés, a kérdés alatt lassítva ---------------- */
  const worldRng = useRef(createRng(seedFrom("play-lab", seedBase, "world", 0)));
  const loop = useMemo(
    () =>
      createFixedLoop((dt) => {
        const w = worldRef.current;
        w.laneX += (w.lane - w.laneX) * Math.min(1, dt / 90);
        w.spawnIn -= dt;
        if (w.spawnIn <= 0) {
          w.spawnIn = 650 + worldRng.current.next() * 650;
          const free = w.obstacles.find((ob) => !ob.alive);
          const lane = worldRng.current.int(3);
          if (free) Object.assign(free, { lane, y: -0.1, alive: true });
          else if (w.obstacles.length < 12) w.obstacles.push({ lane, y: -0.1, alive: true });
        }
        for (const ob of w.obstacles) {
          if (!ob.alive) continue;
          ob.y += dt / 2400;
          if (ob.y > 1.1) {
            ob.alive = false;
            w.dodged += 1;
            w.score += 5;
          }
        }
      }),
    [],
  );

  const clockRef = useRef(0);
  const fpsRef = useRef(60);

  const startRun = useCallback((fromGesture = true) => {
    // LS-4: a felolvasás csak valódi koppintás után élesedik (az `auto=1` képernyőkép-mód nem gesztus).
    if (fromGesture) speech.arm();
    runRef.current += 1;
    cursor.current = params.long ? 1 : 0;
    worldRef.current = { lane: 1, laneX: 1, obstacles: [], spawnIn: 900, score: 0, dodged: 0 };
    worldRng.current = createRng(seedFrom("play-lab", seedBase, "world", runRef.current));
    clockRef.current = 0;
    loop.reset();
    if (runRef.current > 1) qRef.current.reset(seedFrom(seedBase, runRef.current), 0.5);
    setResult(null);
    setHud({ score: 0, answered: 0, correct: 0 });
    setScreen("playing");
  }, [loop, params.long, seedBase, speech]);

  const endRun = useCallback(() => {
    const st = qRef.current.director?.stats(clockRef.current);
    qRef.current.abort();
    setMenuOpen(false);
    setWhy(null);
    setExpanded(false);
    setResult({ correct: st?.correct ?? 0, total: st?.answered ?? 0, score: worldRef.current.score });
    setScreen("result");
  }, []);

  useEffect(() => {
    if (params.auto && screen === "start") startRun(false);
  }, []);

  /* ---------------- képkocka-hurok (rAF): kérdés-óra, sim, rajz ---------------- */
  useEffect(() => {
    if (screen !== "playing") return;
    let raf = 0;
    let last: number | null = null;
    let fpsAcc = 0;
    let fpsFrames = 0;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(250, Math.max(0, now - last));
      last = now;
      fpsAcc += dt;
      fpsFrames += 1;
      if (fpsAcc >= 500) {
        fpsRef.current = Math.round((fpsFrames * 1000) / fpsAcc);
        fpsAcc = 0;
        fpsFrames = 0;
      }
      const isPaused = pausedRef.current;
      if (!isPaused) clockRef.current += dt;
      const ctl = qRef.current;
      if (!isPaused) ctl.frame(clockRef.current, { calm: true });
      loop.setTimeScale(isPaused ? 0 : ctl.timeScale());
      loop.frame(now);
      draw(now);
      if ((ctl.director?.stats(clockRef.current).answered ?? 0) >= RUN_QUESTIONS && !ctl.view().reveal && !ctl.active()) {
        endRun();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [screen, loop, endRun]);

  // HUD ≤ 10 Hz (KSZ-9).
  useEffect(() => {
    if (screen !== "playing") return;
    const id = window.setInterval(() => {
      const st = qRef.current.director?.stats(clockRef.current);
      setHud((h) => {
        const next = { score: worldRef.current.score, answered: st?.answered ?? 0, correct: st?.correct ?? 0 };
        return h.score === next.score && h.answered === next.answered && h.correct === next.correct ? h : next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [screen]);

  /* ---------------- rajz ---------------- */
  const gatesRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);
  function draw(now: number) {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [c0, c1, accent] = SKIN_BG[skinRef.current];
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const sim = loop.simTimeMs();
    // Mozgó csíkok: a sebességük a sim-időt követi (a lassítás látszik).
    g.strokeStyle = `${accent}33`;
    g.lineWidth = 2;
    const laneW = Math.min(W / 3, 180);
    const left = (W - laneW * 3) / 2;
    for (let i = 0; i <= 3; i++) {
      g.beginPath();
      g.moveTo(left + i * laneW, 0);
      g.lineTo(left + i * laneW, H);
      g.stroke();
    }
    g.fillStyle = `${accent}22`;
    const off = (sim / 6) % 80;
    for (let y = -80 + off; y < H; y += 80) g.fillRect(left, y, laneW * 3, 6);
    const w = worldRef.current;
    for (const ob of w.obstacles) {
      if (!ob.alive) continue;
      const x = left + ob.lane * laneW + laneW / 2;
      const y = ob.y * H;
      g.fillStyle = "#0f172acc";
      g.strokeStyle = accent;
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(x - laneW * 0.28, y - 18, laneW * 0.56, 36, 8);
      g.fill();
      g.stroke();
    }
    // Játékos
    const px = left + w.laneX * laneW + laneW / 2;
    // A gombos módban a sáv az alsó részt foglalja: a játékos fölötte fut (a játék látható marad).
    const py = H * (modeRef.current === "buttons" && H > W ? 0.36 : 0.74);
    const flash = flashRef.current && flashRef.current.until > now ? flashRef.current : null;
    g.shadowColor = flash ? (flash.correct ? "#22c55e" : "#f97316") : accent;
    g.shadowBlur = 24;
    g.fillStyle = flash ? (flash.correct ? "#4ade80" : "#fdba74") : "#ffffff";
    g.beginPath();
    g.arc(px, py, 18, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    // „bar” mód: a válaszcélok a világban (kapuk) — koppintással választhatók.
    const view = qRef.current.view();
    gatesRef.current = [];
    if (modeRef.current === "bar" && view.presentation) {
      const opts = view.presentation.options;
      const n = opts.length;
      const gw = Math.min(150, (W - 16 - (n - 1) * 8) / n);
      const total = n * gw + (n - 1) * 8;
      const gy = H * 0.42 + Math.sin(sim / 500) * 6;
      for (let i = 0; i < n; i++) {
        const x = (W - total) / 2 + i * (gw + 8);
        const st = view.reveal ? (i === view.reveal.correctOptionIndex ? "c" : i === view.reveal.pickedOptionIndex ? "w" : "d") : "i";
        g.globalAlpha = st === "d" ? 0.45 : 1;
        g.fillStyle = st === "c" ? "#15803d" : st === "w" ? "#9a3412" : "#0f172ae6";
        g.strokeStyle = st === "c" ? "#86efac" : st === "w" ? "#fdba74" : accent;
        g.lineWidth = 3;
        g.beginPath();
        g.roundRect(x, gy, gw, 64, 12);
        g.fill();
        g.stroke();
        g.fillStyle = "#fff";
        g.font = "800 15px Nunito, system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        const label = opts[i]!.label.length > 14 ? `${opts[i]!.label.slice(0, 13)}…` : opts[i]!.label;
        g.fillText(`${st === "c" ? "✓ " : st === "w" ? "✗ " : `${i + 1}. `}${label}`, x + gw / 2, gy + 32, gw - 10);
        g.globalAlpha = 1;
        gatesRef.current.push({ x, y: gy, w: gw, h: 64 });
      }
    }
  }
  const skinRef = useRef(skin);
  skinRef.current = skin;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const onCanvasPointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (modeRef.current !== "bar" || pausedRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const hit = gatesRef.current.findIndex((gt) => x >= gt.x - 8 && x <= gt.x + gt.w + 8 && y >= gt.y - 10 && y <= gt.y + gt.h + 10);
    if (hit >= 0) q.pick(hit);
  };

  const moveLane = (d: -1 | 1) => {
    if (pausedRef.current) return;
    const w = worldRef.current;
    w.lane = Math.max(0, Math.min(2, w.lane + d));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") moveLane(-1);
      if (e.key === "ArrowRight") moveLane(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- „Miért?”: szünet + a valódi magyarázókártya ---------------- */
  const openWhy = useCallback(() => {
    const last = qRef.current.view().whyItem; // a vezérlő őrzi: az új kérdés nem írja felül (review #446)
    if (!last) return;
    setWhy(buildFeedback({ quiz: last.quiz, chosenIndex: last.pickedOriginalIndex, attempt: 1, ageBand: "kid" }));
  }, []);

  /* ---------------- teszt-kampó ---------------- */
  useEffect(
    () =>
      installGameTestApi({
        forceState: (patch) => {
          if (patch.question || patch.phase === "quiz") qRef.current.request("trigger", clockRef.current);
          if (patch.phase === "result" || patch.phase === "over") endRun();
          if (patch.phase === "playing" && screen !== "playing") startRun(false);
        },
        probe: () => {
          const ctl = qRef.current;
          const st = ctl.director?.stats(clockRef.current);
          const p = ctl.view().presentation;
          return {
            simTime: loop.simTimeMs(),
            questionOpen: ctl.active() ? 1 : 0,
            questionsAnswered: st?.answered ?? 0,
            questionsCorrect: st?.correct ?? 0,
            fps: fpsRef.current,
            band: ctl.director?.band() ?? null,
            intensity: ctl.director?.intensity() ?? null,
            questionId: p?.id ?? null,
            questionKey: p?.question.key ?? null,
            reveal: ctl.view().reveal ? 1 : 0,
            paused: pausedRef.current ? 1 : 0,
            clock: clockRef.current,
          };
        },
      }),
    [endRun, loop, screen, startRun],
  );

  const wrongItems = q.director?.wrongList() ?? [];

  return (
    <GameShell gameId="PlayLab" state={screen} onAutoPause={() => screen === "playing" && setMenuOpen(true)} style={{ background: SKIN_BG[skin][0] }}>
      {screen === "start" ? (
        <main>
          <StartScreen
            title="Kérdés-sáv próbaoldal"
            subtitle="A játék a kérdés alatt lassítva fut tovább."
            startLabel="Indítás"
            startTestId="play-lab-start"
            onStart={() => startRun()}
            settings={
              <div className="grid gap-3 text-left text-base">
                <label className="grid gap-1">
                  <span>Skin</span>
                  <select data-testid="play-lab-skin" className="min-h-12 rounded-xl bg-slate-800 px-3" value={skin} onChange={(e) => setSkin(e.target.value as InlineQuestionSkin)}>
                    {INLINE_QUESTION_SKINS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span>Mód</span>
                  <select data-testid="play-lab-mode" className="min-h-12 rounded-xl bg-slate-800 px-3" value={mode} onChange={(e) => setMode(e.target.value as "buttons" | "bar")}>
                    <option value="buttons">gombok</option>
                    <option value="bar">sáv (célok a világban)</option>
                  </select>
                </label>
                <PlaySpeechToggle />
              </div>
            }
          />
        </main>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            data-testid="play-lab-canvas"
            className="absolute inset-0 h-full w-full"
            style={{ touchAction: "none" }}
            onPointerDown={onCanvasPointer}
          />
          <GameHud
            stats={[
              { id: "score", label: "Pont", value: hud.score },
              { id: "correct", label: "Helyes", value: `${hud.correct}/${hud.answered}`, tone: "good" },
              { id: "left", label: "Hátra", value: Math.max(0, RUN_QUESTIONS - hud.answered) },
            ]}
            onPause={() => setMenuOpen(true)}
          />
          <div className="game-touch-layer" data-game-controls data-testid="play-lab-controls">
            <div className="flex gap-3">
              <button type="button" className="game-btn game-btn-secondary game-action-btn text-2xl font-black" aria-label="Balra" onClick={() => moveLane(-1)}>◀</button>
              <button type="button" className="game-btn game-btn-secondary game-action-btn text-2xl font-black" aria-label="Jobbra" onClick={() => moveLane(1)}>▶</button>
            </div>
            <button type="button" className="game-btn game-btn-primary game-action-btn text-2xl font-black" aria-label="Kérdést kérek" data-testid="play-lab-ask" onClick={() => q.request("trigger", clockRef.current)}>
              ?
            </button>
          </div>
          <InlineQuestion
            {...q.bind}
            mode={mode}
            skin={skin}
            disabled={paused}
            onWhy={openWhy}
            onExpand={() => setExpanded(true)}
            onCollapse={() => setExpanded(false)}
            pauseTestId="play-question-pause"
            onPause={() => setMenuOpen(true)}
          />
          {why && <QuizFeedbackCard card={why} onDismiss={() => setWhy(null)} />}
          <PauseMenu
            open={menuOpen && screen === "playing"}
            onResume={() => setMenuOpen(false)}
            onRestart={() => {
              setMenuOpen(false);
              startRun();
            }}
            onExit={endRun}
            exitLabel="Menet vége"
          >
            <PlaySpeechToggle />
          </PauseMenu>
          <ResultScreen
            open={screen === "result"}
            testId="play-lab-result"
            title="Menet vége"
            won
            score={result?.score ?? 0}
            best={null}
            correct={result?.correct ?? 0}
            total={result?.total ?? 0}
            onRetry={() => startRun()}
            onBack={() => setScreen("start")}
            backLabel="Vissza a beállításokhoz"
            extra={<ResultReview items={wrongItems} />}
          />
        </>
      )}
    </GameShell>
  );
}

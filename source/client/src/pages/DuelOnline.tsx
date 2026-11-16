/**
 * JM3a — Párbaj: online két főre + gépi ellenfél (terv 10.1, 10.5, 10.8, D20–D24; végrehajtás JM3a).
 *
 * Egy telefon = egy játékos. EGY megjelenítő, KÉT meghajtó (`lib/duel/session.ts`): online (Socket.IO, szerver-tekintély)
 * és gépi ellenfél (ugyanaz a `room-machine` a kliensen, hálózat nélkül). A felület mindkettőből ugyanazt a `RtRoomState`
 * pillanatképet rajzolja: saját kérdés + 2×2 saját válaszrács nagyban, az ellenfél kicsiben (becenév, életerő, „válaszolt”),
 * kör-számláló, időjelző, „Döntő kérdés!” szalag; felfedés; győzteshirdetés; visszavágó. Szünet nincs (a szerver órája megy):
 * kilépés megerősítéssel.
 *
 * Jogosultság (D21): szobát játékos-fiók / párosított tanulói profil / admin nyit (`admin` módban csak admin); csatlakozni
 * a kóddal / linkkel (`/games/parbaj/<KÓD>`) bárki tud, vendégként is. A gépi ellenfél az `MP_MODE`-tól független (nincs
 * hálózati kockázata), ezért a párbaj kikapcsolt online réteg mellett is játszható.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, Copy, Crown, DoorOpen, KeyRound, LogIn, QrCode, Share2, Swords, Trophy, Users, Wifi, WifiOff } from "lucide-react";

import AudioToggleButton from "@/components/AudioToggleButton";
import { QrImage } from "@/components/QrImage";
import {
  DUEL_VIEW_CSS,
  DamagePop,
  PlayerHud,
  QuestionCard,
  ResultCard,
  TimerBar,
  VerdictBanner,
  timerRatio,
  useDuelFeedback,
  writeTimerBar,
  type VerdictKind,
} from "@/components/duel";
import { GAME_TEST_HOOKS_ENABLED, installGameTestApi } from "@/game-engine/game-test-hooks";
import { GameShell, StartScreen, type GameScreenState } from "@/game-engine/mobile";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
import { useAuth } from "@/hooks/useAuth";
import { usePlayer } from "@/hooks/usePlayer";
import { loadClassroomGrade } from "@/lib/classroomStore";
import { createLocalQuestionProvider, ensureGradeBanks } from "@/lib/duel/localQuestions";
import { createBotSession, DuelJoinError, openOnlineSession, type DuelSession, type DuelSnapshot, type OnlineIntent } from "@/lib/duel/session";
import { getLearnerToken, useLearnerProfile } from "@/lib/learnerProfile";
import { BOT_PROFILES, BOT_SKILLS, recordBotResult, suggestBotSkill, type BotRecord, type BotSkill } from "@shared/duel/bot";
import { DUEL_ROUNDS } from "@shared/duel/rules";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_PATTERN, RT_ERROR_TEXT, RT_SUBJECTS, type RtErrorCode, type RtRoomState, type RtStatus } from "@shared/duel/protocol";

// ---------------------------------------------------------------------------------------------------------------------
// Beállítások

const GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
type SubjectId = "mixed" | (typeof RT_SUBJECTS)[number];
const SUBJECTS: ReadonlyArray<{ id: SubjectId; label: string }> = [
  { id: "mixed", label: "Vegyes" },
  { id: "math", label: "Matek" },
  { id: "hungarian", label: "Magyar" },
  { id: "english", label: "Angol" },
  { id: "science", label: "Természet" },
  { id: "history", label: "Történelem" },
];
type BandId = "easy" | "normal" | "hard";
const BANDS: ReadonlyArray<{ id: BandId; label: string; band: number }> = [
  { id: "easy", label: "Könnyű", band: 0.25 },
  { id: "normal", label: "Közepes", band: 0.55 },
  { id: "hard", label: "Nehéz", band: 0.85 },
];

type Setup = { grade: number; subject: SubjectId; band: BandId; skill: BotSkill | null };
const SETUP_KEY = "websuli.duelSetup.v2";
const BOT_RECORD_KEY = "websuli.duelBot.v1";

function clampGrade(g: unknown): number | null {
  const n = typeof g === "number" ? g : Number(g);
  return Number.isInteger(n) && n >= 3 && n <= 12 ? n : null;
}

function loadSetup(fallbackGrade: number): Setup {
  const base: Setup = { grade: fallbackGrade, subject: "mixed", band: "normal", skill: null };
  try {
    const p = JSON.parse(window.localStorage.getItem(SETUP_KEY) ?? "null") as Partial<Setup> | null;
    if (!p) return base;
    return {
      grade: clampGrade(p.grade) ?? fallbackGrade,
      subject: SUBJECTS.some((s) => s.id === p.subject) ? (p.subject as SubjectId) : "mixed",
      band: BANDS.some((b) => b.id === p.band) ? (p.band as BandId) : "normal",
      skill: p.skill && BOT_SKILLS.includes(p.skill) ? p.skill : null,
    };
  } catch {
    return base;
  }
}

function saveSetup(s: Setup): void {
  try {
    window.localStorage.setItem(SETUP_KEY, JSON.stringify(s));
  } catch {
    /* tároló nélkül is megy */
  }
}

function loadBotRecord(): BotRecord | null {
  try {
    const p = JSON.parse(window.localStorage.getItem(BOT_RECORD_KEY) ?? "null") as BotRecord | null;
    return p && BOT_SKILLS.includes(p.skill) && Array.isArray(p.results) ? p : null;
  } catch {
    return null;
  }
}

function saveBotRecord(r: BotRecord): void {
  try {
    window.localStorage.setItem(BOT_RECORD_KEY, JSON.stringify(r));
  } catch {
    /* tároló nélkül is megy */
  }
}

/** Kozmetikai / seed-véletlen a lapon (nem a szimulációban): kriptográfiai forrásból. */
function freshSeed(): string {
  try {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return `${a[0]!.toString(36)}${a[1]!.toString(36)}`;
  } catch {
    return `${Math.floor(performance.now() * 1000).toString(36)}`;
  }
}

/** A beírt kód tisztítása: nagybetű, csak a szobakód-ábécé jelei (nincs 0 / O / 1 / I), legfeljebb 6. */
export function cleanRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

const ERROR_EXTRA: Record<string, string> = {
  NETWORK: "Nem érjük el a szervert. Van internet? Próbáld újra!",
  RECONNECT_TIMEOUT: "Megszakadt a kapcsolat, és egy percen belül nem jött vissza. Nyiss új szobát, vagy csatlakozz újra!",
  DISCONNECTED: "Megszakadt a kapcsolat a szobával.",
  ROOM_CLOSED: "A szoba bezárult.",
  INVALID_CODE: "Ez nem szobakód: 6 jel, betűk és számok (0, O, 1, I nélkül).",
  NO_QUESTIONS: "Nem sikerült betölteni a kérdéseket (lehet, hogy nincs internet). Próbáld újra!",
};

function errorText(code: string): string {
  if (code in RT_ERROR_TEXT) return RT_ERROR_TEXT[code as RtErrorCode];
  return ERROR_EXTRA[code] ?? RT_ERROR_TEXT.BAD_MESSAGE;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lap

type Screen =
  | { name: "home" }
  | { name: "setup"; mode: "bot" | "create" }
  | { name: "join" }
  | { name: "connecting"; label: string }
  | { name: "session" }
  | { name: "error"; code: string; retry: (() => void) | null };

const EMPTY_SNAPSHOT: DuelSnapshot = { kind: "online", conn: "closed", closedCode: null, state: null, notice: null, clockOffsetMs: 0, botSkill: null };
const noopSubscribe = () => () => {};

/** Teszt-kampók (csak `VITE_ENABLE_GAME_TEST_HOOKS=1`): gyors gépi időzítés és csak-polling szállítás (Vercel-szimuláció). */
function readTestParams(): { fast: boolean; forcePolling: boolean } {
  if (!GAME_TEST_HOOKS_ENABLED || typeof window === "undefined") return { fast: false, forcePolling: false };
  const q = new URLSearchParams(window.location.search);
  return { fast: q.get("duelSpeed") === "fast", forcePolling: q.get("rtTransport") === "polling" };
}

export default function DuelOnline() {
  const [onCodeRoute, params] = useRoute<{ kod: string }>("/games/parbaj/:kod");
  const [{ fast, forcePolling }] = useState(readTestParams);
  const reducedMotion = useReducedMotion();
  const feedback = useDuelFeedback({ reducedMotion });
  const { isAdmin } = useAuth();
  const { player, enabled: playerAccounts } = usePlayer();
  const learner = useLearnerProfile();
  const statusQuery = useQuery<RtStatus | null>({
    queryKey: ["/api/rt/status"],
    queryFn: async () => {
      const res = await fetch("/api/rt/status", { credentials: "same-origin", headers: { accept: "application/json" } });
      return res.ok ? ((await res.json()) as RtStatus) : null;
    },
    staleTime: 30_000,
    retry: false,
  });
  const status = statusQuery.data ?? null;

  const fallbackGrade = clampGrade(learner?.grade) ?? clampGrade(loadClassroomGrade()) ?? 4;
  const [setup, setSetup] = useState<Setup>(() => loadSetup(fallbackGrade));
  useEffect(() => saveSetup(setup), [setup]);
  const [botRecord, setBotRecord] = useState<BotRecord | null>(loadBotRecord);
  const suggestedSkill = suggestBotSkill(botRecord);

  const routeCode = onCodeRoute && params?.kod ? cleanRoomCode(decodeURIComponent(params.kod)) : "";
  const [screen, setScreen] = useState<Screen>(() => (onCodeRoute ? { name: "join" } : { name: "home" }));
  const [joinCode, setJoinCode] = useState(routeCode);

  const onlineEnabled = !!status && status.enabled && status.available !== "off" && status.games.includes("parbaj");
  const canCreate = onlineEnabled && (status!.mode === "admin" ? isAdmin : isAdmin || !!player || !!learner);
  const createBlockedByAccount = onlineEnabled && status!.mode === "on" && !canCreate;
  const capacityFull = onlineEnabled && status!.available === "full";

  // --- munkamenet ----------------------------------------------------------------------------------------------------
  const [session, setSession] = useState<DuelSession | null>(null);
  const snap = useSyncExternalStore(session?.subscribe ?? noopSubscribe, session?.getSnapshot ?? (() => EMPTY_SNAPSHOT));
  const sessionRef = useRef<DuelSession | null>(null);
  sessionRef.current = session;
  // Lecsatoláskor (pl. a böngésző Vissza gombja a kapcsolódás közben) a FOLYAMATBAN lévő indítás is érvénytelen: a token
  // léptetése miatt a később visszatérő munkamenet a `startOnline` / `startBot` ellenőrzésén elbukik és lezárul (review #464).
  useEffect(
    () => () => {
      opToken.current += 1;
      // Elnavigálás = kilépés: a szobahely azonnal felszabadul (az ellenfél nem vár egy percet), utána lezárás.
      const s = sessionRef.current;
      if (s) void s.leave().finally(() => s.dispose());
    },
    [],
  );
  const lastIntent = useRef<{ kind: "bot" } | OnlineIntent | null>(null);
  const opToken = useRef(0);

  // Online: előbb kilépés (a szerver azonnal felszabadítja a helyet — az ellenfél nem lát egy percig „Kapcsolódik…”-ot,
  // review #464 A3), utána lezárás. Gépi módban a `leave` maga a lezárás.
  const endSession = useCallback(() => {
    const s = sessionRef.current;
    if (s) void s.leave().finally(() => s.dispose());
    setSession(null);
  }, []);

  const startBot = useCallback(async () => {
    const token = ++opToken.current;
    lastIntent.current = { kind: "bot" };
    endSession();
    setScreen({ name: "connecting", label: "Kérdések betöltése…" });
    const ok = await ensureGradeBanks(setup.grade);
    if (token !== opToken.current) return;
    if (!ok) {
      setScreen({ name: "error", code: "NO_QUESTIONS", retry: () => void startBot() });
      return;
    }
    const skill = setup.skill ?? suggestedSkill;
    const s = createBotSession({
      grade: setup.grade,
      band: BANDS.find((b) => b.id === setup.band)!.band,
      subjects: setup.subject === "mixed" ? [] : [setup.subject],
      skill,
      seed: freshSeed(),
      nickname: "Te",
      provider: createLocalQuestionProvider(),
      timing: fast ? { countdownMs: 900, revealMs: 1200 } : undefined,
    });
    setSession(s);
    setScreen({ name: "session" });
  }, [endSession, setup, suggestedSkill, fast]);

  const startOnline = useCallback(
    async (intent: OnlineIntent) => {
      const token = ++opToken.current;
      lastIntent.current = intent;
      endSession();
      setScreen({ name: "connecting", label: intent.intent === "create" ? "Szoba nyitása…" : "Belépés a szobába…" });
      try {
        const s = await openOnlineSession(intent, { learnerToken: getLearnerToken(), transports: forcePolling ? ["polling"] : undefined });
        if (token !== opToken.current) {
          // Közben elnavigált / mást választott: a már létrejött szobahely is felszabadul (review #464).
          void s.leave().finally(() => s.dispose());
          return;
        }
        setSession(s);
        setScreen({ name: "session" });
      } catch (err) {
        if (token !== opToken.current) return;
        const code = err instanceof DuelJoinError ? err.code : "NETWORK";
        setScreen({ name: "error", code, retry: () => void startOnline(intent) });
      }
    },
    [endSession, forcePolling],
  );

  const createRoom = () =>
    void startOnline({
      intent: "create",
      grade: setup.grade,
      settings: { band: BANDS.find((b) => b.id === setup.band)!.band, subjects: setup.subject === "mixed" ? undefined : [setup.subject] },
    });

  const joinRoom = () => {
    const code = cleanRoomCode(joinCode);
    if (!ROOM_CODE_PATTERN.test(code)) {
      setScreen({ name: "error", code: "INVALID_CODE", retry: () => setScreen({ name: "join" }) });
      return;
    }
    void startOnline({ intent: "join", code, grade: setup.grade });
  };

  const backHome = useCallback(() => {
    opToken.current += 1;
    endSession();
    setScreen({ name: "home" });
  }, [endSession]);

  // Végleges lezárás (kirúgás, megszűnt szoba, időtúllépés): hibaképernyő kiúttal — kivéve, ha van eredmény (azt mutatjuk).
  useEffect(() => {
    if (screen.name !== "session" || !session || snap.conn !== "closed") return;
    if (snap.closedCode === "LEFT") return;
    if (snap.state?.result) return;
    setScreen({ name: "error", code: snap.closedCode ?? "DISCONNECTED", retry: null });
  }, [screen.name, session, snap.conn, snap.closedCode, snap.state]);

  // Gépi meccs vége → áramlat-ajánlás frissítése (egyszer meccsenként; ember elleni győzelemnek sehol nem számít, D22).
  // A dedup kulcsa a munkamenet azonossága + a meccs sorszáma: egy új munkamenet („Új beállítás”) számlálója újra 1-ről
  // indul, így két azonos `seq`-ű meccs is külön rögzül (review #464).
  const recorded = useRef<{ session: DuelSession; seq: number } | null>(null);
  useEffect(() => {
    const st = snap.state;
    if (!session || snap.kind !== "bot" || !st?.result || !snap.botSkill) return;
    if (recorded.current && recorded.current.session === session && recorded.current.seq === st.result.seq) return;
    recorded.current = { session, seq: st.result.seq };
    const me = st.you.playerId;
    const outcome = st.result.coWin ? "co" : st.result.winners.includes(me) ? "win" : "loss";
    const next = recordBotResult(botRecord, snap.botSkill, outcome);
    setBotRecord(next);
    saveBotRecord(next);
  }, [session, snap.kind, snap.state, snap.botSkill, botRecord]);

  // Teszt-kampó (csak `VITE_ENABLE_GAME_TEST_HOOKS=1`): állapot-olvasás az e2e-hez (a játékot nem vezérli).
  useEffect(
    () =>
      installGameTestApi({
        forceState: () => {},
        probe: () => ({
          screen: screen.name,
          kind: snap.kind,
          conn: snap.conn,
          phase: snap.state?.phase ?? "none",
          round: snap.state?.round ?? 0,
          code: snap.state?.code ?? "",
          players: snap.state?.players.length ?? 0,
          answered: snap.state?.you.answeredOptionIndex ?? -1,
          winners: snap.state?.result ? snap.state.result.winners.length : 0,
        }),
      }),
    [screen.name, snap],
  );

  const st = snap.state;
  const phase = st?.phase ?? null;
  const inMatch = screen.name === "session" && !!st && (phase === "countdown" || phase === "round_open" || phase === "round_reveal");
  const shellState: GameScreenState = inMatch ? "playing" : screen.name === "session" && st?.result ? "result" : "start";

  return (
    <GameShell gameId="DuelOnline" state={shellState} fixedScreen={screen.name !== "home"}>
      <style>{DUEL_VIEW_CSS + PAGE_CSS}</style>
      {screen.name === "home" ? (
        <HomeScreen
          onlineEnabled={onlineEnabled}
          canCreate={canCreate}
          capacityFull={capacityFull}
          createBlockedByAccount={createBlockedByAccount}
          playerAccounts={playerAccounts}
          onBot={() => setScreen({ name: "setup", mode: "bot" })}
          onCreate={() => setScreen({ name: "setup", mode: "create" })}
          onJoin={() => setScreen({ name: "join" })}
        />
      ) : null}
      {screen.name === "setup" ? (
        <SetupScreen
          mode={screen.mode}
          setup={setup}
          suggestedSkill={suggestedSkill}
          onChange={setSetup}
          onBack={backHome}
          onGo={screen.mode === "bot" ? () => void startBot() : createRoom}
        />
      ) : null}
      {screen.name === "join" ? (
        <JoinScreen code={joinCode} onCode={(c) => setJoinCode(cleanRoomCode(c))} grade={setup.grade} onGrade={(g) => setSetup((s) => ({ ...s, grade: g }))} onBack={backHome} onGo={joinRoom} onlineEnabled={onlineEnabled || statusQuery.isLoading} />
      ) : null}
      {screen.name === "connecting" ? <BusyScreen label={screen.label} onCancel={backHome} /> : null}
      {screen.name === "error" ? <ErrorScreen code={screen.code} onRetry={screen.retry} onBack={backHome} /> : null}
      {screen.name === "session" && session && st ? (
        <SessionView
          session={session}
          snap={snap}
          feedback={feedback}
          onExit={backHome}
          onNewSetup={() => {
            endSession();
            setScreen({ name: "setup", mode: snap.kind === "bot" ? "bot" : "create" });
          }}
        />
      ) : null}
      {screen.name === "session" && session && !st ? <BusyScreen label="Kapcsolódás…" onCancel={backHome} /> : null}
    </GameShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Kezdő, beállítás, csatlakozás, hibák

function HomeScreen(props: {
  onlineEnabled: boolean;
  canCreate: boolean;
  capacityFull: boolean;
  createBlockedByAccount: boolean;
  playerAccounts: boolean;
  onBot: () => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const { onlineEnabled, canCreate, capacityFull, createBlockedByAccount } = props;
  const primaryOnline = onlineEnabled && canCreate && !capacityFull;
  return (
    <main className="dm-start-wrap" data-testid="duel-home">
      <StartScreen
        title="Párbaj"
        subtitle={onlineEnabled ? "Hívd ki a barátodat, vagy mérkőzz meg a géppel! Aki jól válaszol, csapást mér." : "Mérkőzz meg a géppel! Aki jól válaszol, csapást mér — a gyorsaság csak kis bónusz."}
        icon={<Swords className="h-12 w-12" aria-hidden="true" />}
        startLabel={primaryOnline ? "Szoba létrehozása" : "Játék a gép ellen"}
        startTestId={primaryOnline ? "duel-create" : "duel-bot"}
        onStart={primaryOnline ? props.onCreate : props.onBot}
        menuKey="duel"
        secondary={
          <>
            {primaryOnline ? (
              <button type="button" className="game-btn game-btn-secondary" data-testid="duel-bot" onClick={props.onBot}>
                <Bot className="h-5 w-5" aria-hidden="true" />
                Játék a gép ellen
              </button>
            ) : null}
            {onlineEnabled ? (
              <button type="button" className="game-btn game-btn-secondary" data-testid="duel-join" onClick={props.onJoin}>
                <KeyRound className="h-5 w-5" aria-hidden="true" />
                Csatlakozás kóddal
              </button>
            ) : null}
            <Link href="/games" className="game-btn game-btn-ghost">
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              Játékok
            </Link>
            <AudioToggleButton showLabel className="game-btn game-btn-secondary h-12 min-w-12 w-full [&_span]:text-base [&_span]:font-extrabold" />
          </>
        }
      >
        <ul className="dm-rules">
          <li>
            <strong>{DUEL_ROUNDS} kérdés</strong>, mindenkinek a saját évfolyamából.
          </li>
          <li>
            Helyes válasz = <strong>10 csapás</strong> + legfeljebb 2,5 gyorsasági bónusz. Rossz válaszért nincs levonás.
          </li>
          <li>Döntetlennél legfeljebb 2 döntő kérdés, utána közös győzelem.</li>
        </ul>
        {capacityFull && canCreate ? (
          <p className="dm-note" data-testid="duel-capacity">
            {RT_ERROR_TEXT.CAPACITY}
          </p>
        ) : null}
        {createBlockedByAccount ? (
          <div className="dm-note" data-testid="duel-account-needed">
            <p>Szobát nyitni belépve tudsz. A barátod kódjával csatlakozni így is lehet!</p>
            {props.playerAccounts ? (
              <Link href="/belepes" className="dm-link" data-testid="duel-login">
                <LogIn className="h-4 w-4" aria-hidden="true" /> Belépés a fiókodba
              </Link>
            ) : (
              <p className="dm-note-sub">Ha a szüleid párosították a tanulói profilodat ezen az eszközön, azzal is nyithatsz szobát.</p>
            )}
          </div>
        ) : null}
      </StartScreen>
    </main>
  );
}

function ChipRow<T extends string>(props: { label: string; value: T; items: ReadonlyArray<{ id: T; label: string }>; onPick: (v: T) => void; testPrefix: string }) {
  return (
    <>
      <p className="dm-label">{props.label}</p>
      <div className="dm-chip-row" role="group" aria-label={props.label}>
        {props.items.map((it) => (
          <button key={it.id} type="button" className="dm-chip" aria-pressed={props.value === it.id} data-testid={`${props.testPrefix}-${it.id}`} onClick={() => props.onPick(it.id)}>
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

function GradeGrid({ grade, onGrade }: { grade: number; onGrade: (g: number) => void }) {
  return (
    <>
      <p className="dm-label">Melyik évfolyamba jársz?</p>
      <div className="dm-grade-grid" role="group" aria-label="Évfolyam">
        {GRADES.map((g) => (
          <button key={g} type="button" className="dm-grade-btn" aria-pressed={grade === g} aria-label={`${g}. évfolyam`} data-testid={`duel-grade-${g}`} onClick={() => onGrade(g)}>
            {g}.
          </button>
        ))}
      </div>
    </>
  );
}

function SetupScreen(props: { mode: "bot" | "create"; setup: Setup; suggestedSkill: BotSkill; onChange: (fn: (s: Setup) => Setup) => void; onBack: () => void; onGo: () => void }) {
  const { mode, setup } = props;
  const skill = setup.skill ?? props.suggestedSkill;
  return (
    <div className="dm-page" data-testid="duel-setup">
      <header className="dm-head">
        <button type="button" className="game-btn game-btn-ghost dm-back" onClick={props.onBack}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Vissza
        </button>
        <h1 className="dm-title">{mode === "bot" ? "Párbaj a gép ellen" : "Új szoba"}</h1>
      </header>
      <section className="dm-block">
        <GradeGrid grade={setup.grade} onGrade={(g) => props.onChange((s) => ({ ...s, grade: g }))} />
        <ChipRow label="Miből kérdezzünk?" value={setup.subject} items={SUBJECTS} onPick={(v) => props.onChange((s) => ({ ...s, subject: v }))} testPrefix="duel-subject" />
        <ChipRow label="A kérdések nehézsége" value={setup.band} items={BANDS} onPick={(v) => props.onChange((s) => ({ ...s, band: v }))} testPrefix="duel-band" />
        {mode === "bot" ? (
          <>
            <ChipRow
              label="Milyen erős legyen a gép?"
              value={skill}
              items={BOT_SKILLS.map((k) => ({ id: k, label: BOT_PROFILES[k].label + (k === props.suggestedSkill ? " ★" : "") }))}
              onPick={(v) => props.onChange((s) => ({ ...s, skill: v }))}
              testPrefix="duel-skill"
            />
            <p className="dm-hint">★ = ajánlott a legutóbbi meccseid alapján. A gép elleni meccs gyakorlás: pont nem jár érte, a barátok elleni mérlegbe nem számít.</p>
          </>
        ) : (
          <p className="dm-hint">A barátod a saját évfolyamából kap kérdést, ugyanebből a nehézségből.</p>
        )}
      </section>
      <button type="button" className="game-btn game-btn-primary dm-go" data-testid="duel-go" onClick={props.onGo}>
        {mode === "bot" ? <Bot className="h-6 w-6" aria-hidden="true" /> : <Users className="h-6 w-6" aria-hidden="true" />}
        {mode === "bot" ? "Kezdődjön a párbaj!" : "Szoba nyitása"}
      </button>
    </div>
  );
}

function JoinScreen(props: { code: string; onCode: (c: string) => void; grade: number; onGrade: (g: number) => void; onBack: () => void; onGo: () => void; onlineEnabled: boolean }) {
  const valid = ROOM_CODE_PATTERN.test(props.code);
  return (
    <div className="dm-page" data-testid="duel-join-screen">
      <header className="dm-head">
        <button type="button" className="game-btn game-btn-ghost dm-back" onClick={props.onBack}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Vissza
        </button>
        <h1 className="dm-title">Csatlakozás</h1>
      </header>
      <section className="dm-block">
        <label className="dm-label" htmlFor="duel-code">
          A szoba kódja (6 jel)
        </label>
        <input
          id="duel-code"
          className="dm-code-input"
          data-testid="duel-code-input"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH + 4}
          placeholder="ABC234"
          value={props.code}
          onChange={(e) => props.onCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) props.onGo();
          }}
        />
        <p className="dm-hint">A kódban nincs 0, O, 1 és I — csak betűk és számok.</p>
        <GradeGrid grade={props.grade} onGrade={props.onGrade} />
      </section>
      {!props.onlineEnabled ? (
        <p className="dm-note" data-testid="duel-online-off">
          {RT_ERROR_TEXT.FEATURE_DISABLED} Addig játssz a gép ellen!
        </p>
      ) : null}
      <button type="button" className="game-btn game-btn-primary dm-go" data-testid="duel-join-go" disabled={!valid || !props.onlineEnabled} onClick={props.onGo}>
        <DoorOpen className="h-6 w-6" aria-hidden="true" />
        Belépek
      </button>
    </div>
  );
}

function BusyScreen({ label, onCancel }: { label: string; onCancel: () => void }) {
  // Soha nincs végtelen pörgés: 20 s után kiút („Mégse”) a pörgő mellett végig ott van.
  return (
    <div className="dm-center" data-testid="duel-busy" role="status" aria-live="polite">
      <div className="dm-spinner" aria-hidden="true" />
      <p className="dm-busy-label">{label}</p>
      <button type="button" className="game-btn game-btn-ghost" onClick={onCancel}>
        Mégse
      </button>
    </div>
  );
}

function ErrorScreen({ code, onRetry, onBack }: { code: string; onRetry: (() => void) | null; onBack: () => void }) {
  return (
    <div className="dm-center" data-testid="duel-error" data-code={code} role="alert">
      <WifiOff className="h-12 w-12 text-amber-300" aria-hidden="true" />
      <p className="dm-error-text">{errorText(code)}</p>
      <div className="dm-actions">
        {onRetry ? (
          <button type="button" className="game-btn game-btn-primary" data-testid="duel-retry" onClick={onRetry}>
            Újrapróbálom
          </button>
        ) : null}
        <button type="button" className="game-btn game-btn-secondary" data-testid="duel-error-back" onClick={onBack}>
          Vissza a párbajhoz
        </button>
        <Link href="/games" className="game-btn game-btn-ghost">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Játékok
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Munkamenet: váróterem → meccs → győzteshirdetés

function SessionView(props: { session: DuelSession; snap: DuelSnapshot; feedback: ReturnType<typeof useDuelFeedback>; onExit: () => void; onNewSetup: () => void }) {
  const { session, snap } = props;
  const st = snap.state!;
  const me = st.you.playerId;
  const rival = st.players.find((p) => p.id !== me) ?? null;
  const mine = st.players.find((p) => p.id === me) ?? null;
  const reconnecting = snap.conn === "reconnecting";
  // Visszavágó-kérés követése: az utolsó győzteshirdetés állapota, és hogy ÉN kértem-e.
  const iAskedRematch = useRef(false);
  const [rematch, setRematch] = useState<{ lastResult: RtRoomState | null; pending: boolean }>({ lastResult: null, pending: false });
  useEffect(() => {
    if (snap.kind !== "online") return;
    if (st.result && (st.phase === "finished" || st.phase === "aborted")) {
      iAskedRematch.current = false;
      setRematch((r) => (r.lastResult === st ? r : { lastResult: st, pending: false }));
    } else if (st.phase === "lobby") {
      setRematch((r) => (r.lastResult && !r.pending && !iAskedRematch.current && !r.lastResult.result?.aborted && r.lastResult.code === st.code ? { ...r, pending: true } : r));
    } else if (rematch.lastResult) {
      setRematch({ lastResult: null, pending: false });
    }
  }, [st.phase, st.seq, snap.kind]);
  // Egyoldalú kérés időkorláttal lejár: 45 s válasz nélkül „Most nem” (kilépés a szobából, az ellenfél váróterme értesül).
  useEffect(() => {
    if (!rematch.pending) return;
    const t = window.setTimeout(() => void session.leave().then(props.onExit), 45_000);
    return () => window.clearTimeout(t);
  }, [rematch.pending, session, props.onExit]);
  const banner = reconnecting ? (
    <div className="dm-banner" role="status" data-testid="duel-reconnecting">
      <Wifi className="h-4 w-4" aria-hidden="true" /> Kapcsolódás újra… A helyed egy percig megmarad.
    </div>
  ) : rival && !rival.connected && !rival.left && st.phase !== "finished" ? (
    <div className="dm-banner" role="status" data-testid="duel-rival-away">
      <WifiOff className="h-4 w-4" aria-hidden="true" /> {rival.nickname} kapcsolata megszakadt — várjuk vissza (legfeljebb 1 perc).
    </div>
  ) : null;

  // Kétoldalú visszavágó (review #464 K4): ha a MÁSIK fél kéri, a győzteshirdetés marad, és rákérdezünk.
  if (st.phase === "lobby" && rematch.pending && rematch.lastResult)
    return (
      <ResultView
        session={session}
        snap={{ ...snap, state: rematch.lastResult }}
        me={me}
        onExit={props.onExit}
        onNewSetup={props.onNewSetup}
        feedback={props.feedback}
        prompt={{
          name: rival?.nickname ?? "A barátod",
          onAccept: () => {
            setRematch({ lastResult: null, pending: false });
            void session.setReady(true);
          },
          onDecline: () => void session.leave().then(props.onExit),
        }}
      />
    );
  if (st.phase === "lobby") return <LobbyView session={session} st={st} me={me} banner={banner} onExit={props.onExit} />;
  if ((st.phase === "finished" || st.phase === "aborted") && st.result)
    return <ResultView session={session} snap={snap} me={me} onExit={props.onExit} onNewSetup={props.onNewSetup} feedback={props.feedback} onRematchClick={() => (iAskedRematch.current = true)} />;
  return <MatchView session={session} snap={snap} me={me} mine={mine} rival={rival} banner={banner} feedback={props.feedback} onExit={props.onExit} />;
}

function LobbyView({ session, st, me, banner, onExit }: { session: DuelSession; st: RtRoomState; me: string; banner: ReactNode; onExit: () => void }) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isHost = st.hostId === me;
  const self = st.players.find((p) => p.id === me);
  const present = st.players.filter((p) => !p.left);
  const canStart = isHost && present.length >= 2 && present.every((p) => p.id === st.hostId || p.ready);
  const link = `${window.location.origin}/games/parbaj/${st.code}`;

  const share = async () => {
    const data = { title: "Párbaj a WebSulin", text: `Gyere párbajozni! A szoba kódja: ${st.code}`, url: link };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
    }
    await copy();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowQr(true);
    }
  };
  const act = async (fn: () => Promise<{ ok: boolean; code?: string }>) => {
    setBusy(true);
    setErr(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok && r.code) setErr(errorText(r.code));
  };

  return (
    <div className="dm-page dm-lobby" data-testid="duel-lobby">
      {banner}
      <header className="dm-head">
        <button type="button" className="game-btn game-btn-ghost dm-back" data-testid="duel-leave" onClick={() => void session.leave().then(onExit)}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Kilépés
        </button>
        <h1 className="dm-title">Váróterem</h1>
      </header>
      <section className="dm-block dm-code-card" aria-label="Szobakód">
        <p className="dm-label">Szobakód</p>
        <p className="dm-code" data-testid="duel-room-code" aria-label={`Szobakód: ${st.code.split("").join(" ")}`}>
          <span>{st.code.slice(0, 3)}</span>
          <span>{st.code.slice(3)}</span>
        </p>
        <p className="dm-hint">Mondd be vagy küldd el a barátodnak — ő a „Csatlakozás kóddal” gombbal lép be.</p>
        <div className="dm-actions">
          <button type="button" className="game-btn game-btn-primary" data-testid="duel-share" onClick={() => void share()}>
            <Share2 className="h-5 w-5" aria-hidden="true" /> Megosztás
          </button>
          <button type="button" className="game-btn game-btn-secondary" data-testid="duel-copy" onClick={() => void copy()}>
            {copied ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
            {copied ? "Másolva!" : "Link másolása"}
          </button>
          <button type="button" className="game-btn game-btn-secondary" data-testid="duel-qr-toggle" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
            <QrCode className="h-5 w-5" aria-hidden="true" /> {showQr ? "QR elrejtése" : "QR-kód"}
          </button>
        </div>
        {showQr ? (
          <div className="dm-qr" data-testid="duel-qr">
            <QrImage link={link} alt={`A(z) ${st.code} szoba QR-kódja`} size={200} fallback={<p className="dm-hint">A QR-kód nem készült el — használd a „Link másolása” gombot.</p>} />
            <p className="dm-hint">Ha egy szobában vagytok: a barátod a telefonja kamerájával olvassa be.</p>
          </div>
        ) : null}
      </section>
      <section className="dm-block" aria-label="Játékosok">
        <p className="dm-label">Játékosok ({present.length}/2)</p>
        <ul className="dm-players" data-testid="duel-players">
          {present.map((p) => (
            <li key={p.id} className="dm-player" data-ready={p.ready || p.id === st.hostId ? "true" : "false"} data-connected={p.connected ? "true" : "false"}>
              <span className="dm-avatar" aria-hidden="true">
                {p.nickname.slice(0, 1).toUpperCase()}
              </span>
              <span className="dm-player-name">
                {p.nickname}
                {p.id === me ? " (én)" : ""}
              </span>
              {p.id === st.hostId ? <Crown className="h-5 w-5 text-amber-300" aria-label="Gazda" /> : null}
              <span className="dm-ready">{!p.connected ? "Kapcsolódik…" : p.ready || p.id === st.hostId ? "Kész ✓" : "Még nem kész"}</span>
            </li>
          ))}
          {present.length < 2 ? (
            <li className="dm-player dm-player--empty" data-testid="duel-waiting">
              <span className="dm-avatar" aria-hidden="true">
                ?
              </span>
              <span className="dm-player-name">Várjuk a barátodat…</span>
            </li>
          ) : null}
        </ul>
      </section>
      {err ? (
        <p className="dm-note" role="alert">
          {err}
        </p>
      ) : null}
      {isHost ? (
        <button type="button" className="game-btn game-btn-primary dm-go" data-testid="duel-start" disabled={!canStart || busy} onClick={() => void act(() => session.start())}>
          <Swords className="h-6 w-6" aria-hidden="true" />
          {present.length < 2 ? "Várjuk a barátodat…" : canStart ? "Indítás!" : "Várjuk, hogy kész legyen…"}
        </button>
      ) : (
        <button
          type="button"
          className="game-btn game-btn-primary dm-go"
          data-testid="duel-ready"
          aria-pressed={!!self?.ready}
          disabled={busy}
          onClick={() => void act(() => session.setReady(!self?.ready))}
        >
          <Check className="h-6 w-6" aria-hidden="true" />
          {self?.ready ? "Kész vagyok ✓ (a gazda indít)" : "Kész vagyok!"}
        </button>
      )}
    </div>
  );
}

function MatchView(props: {
  session: DuelSession;
  snap: DuelSnapshot;
  me: string;
  mine: RtRoomState["players"][number] | null;
  rival: RtRoomState["players"][number] | null;
  banner: ReactNode;
  feedback: ReturnType<typeof useDuelFeedback>;
  onExit: () => void;
}) {
  const { session, snap, me, mine, rival, feedback } = props;
  const st = snap.state!;
  const q = st.you.question;
  const reveal = st.phase === "round_reveal" ? st.lastReveal : null;
  const [pending, setPending] = useState<{ round: number; index: number } | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  // Review #464 K3: az Android „vissza” gesztus / böngésző-vissza meccs közben ne léptessen ki megerősítés nélkül —
  // egy történet-bejegyzés „csapda”: a vissza ezt veszi le, mi visszatesszük és rákérdezünk. Lap bezárásakor (online)
  // a böngésző saját megerősítése.
  useEffect(() => {
    const trap = { duelTrap: true };
    window.history.pushState(trap, "");
    const onPop = () => {
      window.history.pushState(trap, "");
      setConfirmExit(true);
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (snap.kind !== "online") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onUnload);
      if ((window.history.state as { duelTrap?: boolean } | null)?.duelTrap) window.history.back();
    };
  }, [snap.kind]);
  const shownAt = useRef<{ round: number; at: number } | null>(null);
  const lastQuestion = useRef<NonNullable<RtRoomState["you"]["question"]> | null>(null);
  const timerRef = useRef<HTMLDivElement | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  if (q) lastQuestion.current = q;
  const shownQ = q ?? (reveal && lastQuestion.current?.round === reveal.round ? lastQuestion.current : null);
  const chosen = st.you.answeredOptionIndex ?? (pending && q && pending.round === q.round ? pending.index : null) ?? (reveal ? reveal.yourOptionIndex : null);

  useEffect(() => {
    if (q && shownAt.current?.round !== q.round) shownAt.current = { round: q.round, at: performance.now() };
  }, [q]);

  // Időjelző + visszaszámlálás: DOM-írás képkockánként (React-állapot csak a másodperc-váltáskor).
  useEffect(() => {
    let raf = 0;
    let lastSec: number | null = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = Date.now() + snap.clockOffsetMs;
      if (st.phase === "round_open" && q && chosen === null) writeTimerBar(timerRef.current, timerRatio(q.deadlineTs, now, q.windowMs));
      else writeTimerBar(timerRef.current, st.phase === "countdown" ? 1 : 0);
      const sec = st.phase === "countdown" && st.deadlineTs ? Math.max(1, Math.ceil((st.deadlineTs - now) / 1000)) : null;
      if (sec !== lastSec) {
        lastSec = sec;
        setCountdown(sec);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [st.phase, st.deadlineTs, q, chosen, snap.clockOffsetMs]);

  // Hang / rezgés / rázás az állapotváltásokra (egyszer váltásonként).
  const fx = useRef({ round: -1, reveal: -1, count: -1, locked: -1 });
  useEffect(() => {
    if (countdown !== null && countdown !== fx.current.count) {
      fx.current.count = countdown;
      feedback.countdownTick();
    }
  }, [countdown, feedback]);
  useEffect(() => {
    if (q && fx.current.round !== q.round) {
      fx.current.round = q.round;
      feedback.roundOpen(q.round, q.tiebreak);
    }
    if (reveal && fx.current.reveal !== reveal.round) {
      fx.current.reveal = reveal.round;
      const my = reveal.results.find((r) => r.playerId === me);
      const dealt = my?.correct ? reveal.results.filter((r) => r.playerId !== me).reduce((n, r) => n + r.damage, 0) : 0;
      feedback.reveal({ damageTaken: my?.damage ?? 0, damageDealt: dealt });
    }
  }, [q, reveal, me, feedback]);

  const pick = (index: number, pressedAt: number | null) => {
    if (!q || chosen !== null) return;
    const round = q.round;
    const clientRtMs = shownAt.current && shownAt.current.round === round ? Math.max(0, Math.round((pressedAt ?? performance.now()) - shownAt.current.at)) : null;
    setPending({ round, index });
    if (fx.current.locked !== round) {
      fx.current.locked = round;
      feedback.locked();
    }
    void session.answer(round, index, clientRtMs).then((ack) => {
      if (!ack.ok && ack.code !== "ALREADY_ANSWERED") setPending((p) => (p && p.round === round ? null : p));
    });
  };

  const myRes = reveal?.results.find((r) => r.playerId === me) ?? null;
  const rivalRes = reveal && rival ? reveal.results.find((r) => r.playerId === rival.id) ?? null : null;
  const verdictKind: VerdictKind = myRes?.correct ? "correct" : myRes?.answered ? "wrong" : "timeout";
  const fasterNote = reveal?.fastestCorrect ? (reveal.fastestCorrect === me ? "⚡ Te voltál a gyorsabb!" : `⚡ ${rival?.nickname ?? "Az ellenfél"} volt a gyorsabb.`) : null;
  const hpMe = reveal ? reveal.hp[me] ?? mine?.hp ?? 100 : mine?.hp ?? 100;
  const hpRival = rival ? (reveal ? reveal.hp[rival.id] ?? rival.hp ?? 100 : rival.hp ?? 100) : 100;
  const roundLabel = st.tiebreak ? `⚡ Döntő ${Math.max(1, st.round - DUEL_ROUNDS)}/2` : `${Math.max(1, st.round)}/${DUEL_ROUNDS}. kör`;
  const isBot = snap.kind === "bot";

  return (
    <div className="dm-match" data-testid="duel-match" data-phase={st.phase} data-tiebreak={st.tiebreak ? "true" : "false"} data-kind={snap.kind}>
      {props.banner}
      <div className="dm-side" data-game-hud>
        <div className="dm-top">
          <span className="dm-round" data-testid="duel-round">
            {roundLabel}
          </span>
          <button type="button" className="dm-exit" aria-label="Kilépés" data-testid="duel-exit" onClick={() => setConfirmExit(true)}>
            <DoorOpen className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {rival ? (
          <PlayerHud
            variant="rival"
            name={rival.nickname}
            hp={hpRival}
            answered={st.phase === "round_open" ? rival.answered : false}
            answerLabel={st.phase === "round_open"}
            status={rival.left ? "left" : rival.connected ? "online" : "away"}
            testId="duel-rival"
          >
            {reveal && rivalRes && rivalRes.damage > 0 ? <DamagePop amount={rivalRes.damage} keyId={`r${reveal.round}`} /> : null}
          </PlayerHud>
        ) : null}
        <div ref={feedback.shakeRef} className="dm-self">
          <PlayerHud variant="self" name={isBot ? "Te" : mine?.nickname ?? "Te"} hp={hpMe} grade={st.you.grade} testId="duel-self">
            {reveal && myRes && myRes.damage > 0 ? <DamagePop amount={myRes.damage} keyId={`m${reveal.round}`} /> : null}
          </PlayerHud>
        </div>
        <TimerBar ref={timerRef} testId="duel-timer" />
      </div>
      <div className="dm-main" data-game-controls data-testid="duel-main">
        {st.phase !== "countdown" && rival ? (
          <div className="dm-vs" aria-hidden="true" data-clash={reveal && (myRes?.damage ?? 0) + (rivalRes?.damage ?? 0) > 0 ? "true" : "false"} key={`vs${reveal?.round ?? 0}`}>
            <span className="dm-vs-fighter dm-vs-fighter--self" data-hit={reveal && (myRes?.damage ?? 0) > 0 ? "true" : "false"}>
              {(isBot ? "Te" : mine?.nickname ?? "Te").slice(0, 1).toUpperCase()}
            </span>
            <span className="dm-vs-mark">
              <Swords className="h-7 w-7" />
            </span>
            <span className="dm-vs-fighter dm-vs-fighter--rival" data-hit={reveal && (rivalRes?.damage ?? 0) > 0 ? "true" : "false"}>
              {isBot ? <Bot className="h-8 w-8" /> : rival.nickname.slice(0, 1).toUpperCase()}
            </span>
          </div>
        ) : null}
        {st.phase === "countdown" ? (
          <div className="dm-countdown" data-testid="duel-countdown">
            <p className="dm-count-num" key={countdown ?? 0}>
              {countdown ?? 3}
            </p>
            <p className="dm-count-sub">{isBot ? `Ellenfeled: ${rival?.nickname ?? "Gép"}` : `Ellenfeled: ${rival?.nickname ?? ""}`}</p>
          </div>
        ) : shownQ ? (
          <QuestionCard
            roundKey={shownQ.round}
            prompt={shownQ.prompt}
            options={shownQ.options}
            state={reveal ? "reveal" : chosen !== null ? "locked" : "open"}
            chosenIndex={chosen}
            correctIndex={reveal ? reveal.correctIndex : null}
            onPick={pick}
            lockedText={`Rögzítve ✓ Várjuk ${isBot ? "a gépet" : rival?.nickname ? `őt: ${rival.nickname}` : "a többieket"}…`}
            banner={shownQ.tiebreak ? <p className="dm-tiebreak" data-testid="duel-tiebreak">⚡ Döntő kérdés! Holtverseny — ez dönthet.</p> : null}
            footer={
              reveal ? (
                <VerdictBanner
                  kind={verdictKind}
                  correctText={reveal.correctIndex >= 0 ? shownQ.options[reveal.correctIndex] ?? "" : ""}
                  bonus={myRes?.speedBonus ?? 0}
                  explanation={reveal.explanation}
                  note={fasterNote}
                  testId="duel-verdict"
                />
              ) : null
            }
          />
        ) : reveal ? (
          <div className="dm-countdown">
            <p className="dm-count-sub">A kör lezárult.</p>
          </div>
        ) : null}
      </div>
      {confirmExit ? (
        <div className="dm-modal" role="dialog" aria-modal="true" aria-labelledby="duel-exit-title" data-testid="duel-exit-confirm">
          <div className="dm-modal-card">
            <p id="duel-exit-title" className="dm-modal-title">
              Biztosan kilépsz?
            </p>
            <p className="dm-hint">
              {isBot ? "A gép elleni meccs itt véget ér." : "A meccs a barátodnak is véget ér — ő nyer."} Amíg döntesz, a meccs fut tovább
              {isBot ? "." : " (online nincs szünet)."}
            </p>
            <div className="dm-actions">
              <button type="button" className="game-btn game-btn-primary" data-testid="duel-exit-stay" onClick={() => setConfirmExit(false)}>
                Maradok
              </button>
              <button type="button" className="game-btn game-btn-secondary" data-testid="duel-exit-leave" onClick={() => void session.leave().then(props.onExit)}>
                Kilépek
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResultView(props: {
  session: DuelSession;
  snap: DuelSnapshot;
  me: string;
  onExit: () => void;
  onNewSetup: () => void;
  feedback: ReturnType<typeof useDuelFeedback>;
  onRematchClick?: () => void;
  /** A másik fél visszavágót kér (K4): a győzteshirdetés marad, a gombok helyén a kérdés. */
  prompt?: { name: string; onAccept: () => void; onDecline: () => void };
}) {
  const { session, snap, me, feedback } = props;
  const st = snap.state!;
  const r = st.result!;
  const isBot = snap.kind === "bot";
  const closed = snap.conn === "closed";
  const [busy, setBusy] = useState(false);
  const won = r.winners.includes(me);
  const place = (id: string) => r.podium.findIndex((g) => g.includes(id)) + 1 || r.podium.length + 1;
  const nameOf = (id: string) => (id === me ? (isBot ? "Te" : st.players.find((p) => p.id === id)?.nickname ?? "Te") : st.players.find((p) => p.id === id)?.nickname ?? "Ellenfél");
  const headline = r.coWin ? "Közös győzelem!" : won ? "Győztél!" : `${nameOf(r.winners[0] ?? "")} nyerte a párbajt!`;
  const reasonText =
    r.reason === "OPPONENT_LEFT"
      ? won
        ? "Az ellenfeled kilépett — a győzelem a tiéd."
        : "A meccs véget ért, mert kiléptél."
      : r.reason === "SERVER_RESTART"
        ? RT_ERROR_TEXT.SERVER_RESTART
        : r.reason === "NO_QUESTIONS"
          ? "Elfogytak a kérdések ennél a beállításnál."
          : isBot
            ? "Gyakorló meccs a gép ellen — pont nem jár érte, a mérlegbe nem számít."
            : null;
  const others = r.stats.filter((s) => s.playerId !== me);
  const mineStats = r.stats.find((s) => s.playerId === me);
  const announced = useRef<number | null>(null);
  useEffect(() => {
    if (announced.current === r.seq) return;
    announced.current = r.seq;
    feedback.finished(won && !r.coWin);
  }, [r.seq, won, r.coWin, feedback]);

  const rematch = async () => {
    props.onRematchClick?.();
    setBusy(true);
    await session.rematch();
    setBusy(false);
  };
  const canRematch = !closed && r.reason !== "SERVER_RESTART" && (isBot || (st.phase === "finished" && r.reason !== "OPPONENT_LEFT"));

  return (
    <div className="dm-page dm-result" data-testid="duel-result" data-cowin={r.coWin ? "true" : "false"} data-won={won ? "true" : "false"}>
      <section className="dm-result-head" aria-label="Győzteshirdetés">
        {r.coWin ? <span className="dm-big-emoji" aria-hidden="true">🤝</span> : won ? <Trophy className="h-12 w-12 text-amber-300 dm-trophy" aria-hidden="true" /> : <span className="dm-big-emoji" aria-hidden="true">🥈</span>}
        <h1 className="dm-headline" data-testid="duel-winner">
          {headline}
        </h1>
        {reasonText ? <p className="dm-hint" data-testid="duel-result-reason">{reasonText}</p> : null}
      </section>
      <div className="dm-result-cards">
        {mineStats ? (
          <ResultCard
            name={nameOf(me)}
            subtitle={`${st.you.grade}. évfolyam`}
            place={place(me)}
            won={won}
            coWin={r.coWin}
            stats={mineStats}
            tone="self"
            testId="duel-stats-me"
          />
        ) : null}
        {others.map((s) => (
          <ResultCard
            key={s.playerId}
            name={nameOf(s.playerId)}
            place={place(s.playerId)}
            won={r.winners.includes(s.playerId)}
            coWin={r.coWin}
            stats={s}
            tone="rival"
            showPraise={false}
            compact={others.length > 1}
            testId="duel-stats-rival"
          />
        ))}
      </div>
      <div className="dm-actions dm-result-actions">
        {props.prompt ? (
          <div className="dm-rematch-ask" role="alertdialog" aria-labelledby="duel-rematch-ask" data-testid="duel-rematch-ask">
            <p id="duel-rematch-ask" className="dm-modal-title">
              {props.prompt.name} visszavágót kér!
            </p>
            <div className="dm-actions">
              <button type="button" className="game-btn game-btn-primary" data-testid="duel-rematch-accept" onClick={props.prompt.onAccept}>
                <Swords className="h-5 w-5" aria-hidden="true" />
                Benne vagyok
              </button>
              <button type="button" className="game-btn game-btn-secondary" data-testid="duel-rematch-decline" onClick={props.prompt.onDecline}>
                Most nem
              </button>
            </div>
          </div>
        ) : null}
        {canRematch && !props.prompt ? (
          <button type="button" className="game-btn game-btn-primary" data-testid="duel-rematch" disabled={busy} onClick={() => void rematch()}>
            <Swords className="h-5 w-5" aria-hidden="true" />
            Visszavágó
          </button>
        ) : null}
        <button type="button" className="game-btn game-btn-secondary" data-testid="duel-new" onClick={props.onNewSetup}>
          {isBot ? "Új beállítás" : "Új szoba"}
        </button>
        <Link href="/games" className="game-btn game-btn-ghost" onClick={() => void session.leave()}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Játékok
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Stílus (a lap saját osztályai; a közös index.css-t ez a szelet nem módosítja)

const PAGE_CSS = `
.dm-start-wrap { flex: 1 1 auto; display: flex; flex-direction: column; }
.dm-rules { margin: 0 auto; max-width: 34ch; padding: 12px 16px 12px 28px; text-align: left; font-size: 15px; line-height: 1.45; color: #e2e8f0;
  list-style: disc; border-radius: 16px; background: #0f172acc; border: 1px solid #ffffff1f; }
.dm-rules li + li { margin-top: 6px; }
.dm-note { margin: 10px auto 0; max-width: 40ch; padding: 10px 12px; border-radius: 14px; font-size: 15px; font-weight: 700; color: #fff7ed;
  background: #7c2d12aa; border: 1px solid #fb923c88; text-align: left; }
.dm-note-sub { margin-top: 4px; font-size: 14px; font-weight: 600; color: #fed7aa; }
.dm-link { display: inline-flex; align-items: center; gap: 6px; min-height: 48px; margin-top: 6px; padding: 0 14px; border-radius: 9999px;
  font-weight: 900; color: #0b1020; background: #facc15; }
.dm-page { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 720px; margin: 0 auto; flex: 1 1 auto; min-height: 0;
  overflow-y: auto; overscroll-behavior: contain;
  padding: max(12px, var(--game-safe-top)) max(16px, var(--game-safe-right)) max(16px, var(--game-safe-bottom)) max(16px, var(--game-safe-left)); }
.dm-head { display: flex; align-items: center; gap: 12px; }
.dm-back { min-height: 48px; }
.dm-title { font-size: 24px; font-weight: 900; color: #fff; }
.dm-block { padding: 12px; border-radius: 18px; background: #0f172ad9; border: 1px solid #ffffff1f; }
.dm-label { display: block; margin: 6px 0; font-size: 13px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #cbd5e1; }
.dm-hint { margin-top: 6px; font-size: 14px; line-height: 1.35; color: #cbd5e1; }
.dm-grade-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.dm-grade-btn { min-height: 52px; min-width: 48px; border-radius: 12px; font-size: 17px; font-weight: 900; color: #fff;
  background: #1e293b; border: 1px solid #ffffff33; touch-action: manipulation; }
.dm-grade-btn[aria-pressed="true"] { background: #22d3ee; color: #0b1020; border-color: #fff; box-shadow: 0 0 16px #22d3ee88; }
.dm-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.dm-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 48px; padding: 0 14px; border-radius: 9999px; font-size: 15px;
  font-weight: 800; color: #e2e8f0; background: #1e293b; border: 1px solid #ffffff33; touch-action: manipulation; }
.dm-chip[aria-pressed="true"] { background: #facc15; color: #0b1020; border-color: #fff; }
.dm-go { position: sticky; bottom: max(8px, var(--game-safe-bottom)); z-index: 5; min-height: 60px; font-size: 19px; box-shadow: 0 8px 28px #000a; }
.dm-code-input { width: 100%; min-height: 64px; padding: 0 12px; border-radius: 16px; font: 900 34px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .3em; text-align: center; text-transform: uppercase; color: #fff; background: #0b1226; border: 2px solid #22d3ee88; }
.dm-code-input:focus { outline: 3px solid #facc15; outline-offset: 2px; }
.dm-center { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px 16px; text-align: center; }
.dm-spinner { width: 48px; height: 48px; border-radius: 9999px; border: 5px solid #ffffff22; border-top-color: #22d3ee; animation: dm-spin 1s linear infinite; }
@keyframes dm-spin { to { transform: rotate(360deg); } }
.dm-busy-label { font-size: 18px; font-weight: 800; color: #e2e8f0; }
.dm-error-text { max-width: 36ch; font-size: 18px; font-weight: 800; line-height: 1.35; color: #fff7ed; }
.dm-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
.dm-actions .game-btn { min-height: 52px; }
.dm-banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; font-size: 14px; font-weight: 800; color: #0b1020;
  background: #fcd34d; z-index: 7; }
.dm-code-card { text-align: center; }
.dm-code { display: flex; justify-content: center; gap: 14px; margin: 4px 0; font: 900 clamp(40px, 13vw, 60px)/1.05 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .12em; color: #fde047; text-shadow: 0 0 22px #f59e0b88; }
.dm-qr { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 10px; }
.dm-players { display: flex; flex-direction: column; gap: 8px; }
.dm-player { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 10px; border-radius: 14px; background: #1e293b; border: 1px solid #ffffff22; }
.dm-player[data-connected="false"] { opacity: .6; }
.dm-player--empty { border-style: dashed; color: #94a3b8; }
.dm-avatar { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; flex: none; border-radius: 9999px;
  font-size: 18px; font-weight: 900; color: #0b1020; background: linear-gradient(135deg, #22d3ee, #e879f9); }
.dm-player-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 900; color: #fff; }
.dm-player--empty .dm-player-name { color: #94a3b8; font-weight: 700; }
.dm-ready { flex: none; font-size: 14px; font-weight: 800; color: #94a3b8; }
.dm-player[data-ready="true"] .dm-ready { color: #86efac; }

.dm-match { position: relative; flex: 1 1 auto; display: flex; flex-direction: column; gap: 6px; height: 100%; min-height: 0; overflow: hidden;
  touch-action: manipulation; user-select: none; -webkit-user-select: none;
  background: radial-gradient(120% 50% at 50% 0%, #4c1d9533, transparent 60%), radial-gradient(120% 60% at 50% 100%, #0e749033, transparent 60%), #070b1d;
  padding: max(6px, var(--game-safe-top)) max(10px, var(--game-safe-right)) max(8px, var(--game-safe-bottom)) max(10px, var(--game-safe-left)); }
.dm-side { display: flex; flex-direction: column; gap: 6px; flex: none; min-width: 0; }
.dm-main { position: relative; display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
.dm-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; }
.dm-round { font-size: 16px; font-weight: 900; color: #fde68a; white-space: nowrap; }
.dm-match[data-tiebreak="true"] .dm-round { color: #fde047; }
.dm-exit { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; color: #fff;
  background: #1e293b; border: 1px solid #ffffff33; touch-action: manipulation; }
.dm-self { position: relative; padding: 6px 8px; border-radius: 14px; background: #0f172acc; border: 1px solid #22d3ee55; will-change: transform; }
.dm-main .duel-stage { justify-content: flex-end; }
.dm-main .duel-prompt { padding: 12px 14px; border-radius: 18px; background: linear-gradient(180deg, #16213fe6, #0f172ae6); border: 1px solid #ffffff22;
  box-shadow: 0 6px 24px #0008; }
/* A kérdéskártya fölötti üres sávban a két „harcos” (díszítés, a kártya alá kerül, ha a kérdés hosszú). */
.dm-vs { position: absolute; top: clamp(4px, 6vh, 64px); left: 0; right: 0; z-index: 0; display: flex; align-items: center; justify-content: center; gap: 18px;
  pointer-events: none; }
.dm-main > .duel-qcard { position: relative; z-index: 1; }
.dm-vs-fighter { display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px; border-radius: 9999px;
  font-size: 32px; font-weight: 900; color: #0b1020; box-shadow: 0 0 26px #0008; }
.dm-vs-fighter--self { background: radial-gradient(circle at 35% 30%, #ffffffaa, transparent 55%), #22d3ee; }
.dm-vs-fighter--rival { background: radial-gradient(circle at 35% 30%, #ffffffaa, transparent 55%), #e879f9; }
.dm-vs-fighter[data-hit="true"] { animation: dm-hit .5s ease-out 1; box-shadow: 0 0 0 4px #fb923c, 0 0 30px #fb923c88; }
.dm-vs-mark { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 9999px; color: #0b1020;
  background: linear-gradient(135deg, #22d3ee, #e879f9); box-shadow: 0 0 18px #a78bfa88; }
.dm-vs[data-clash="true"] .dm-vs-mark { animation: dm-clash .5s ease-out 1; }
@keyframes dm-hit { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
@keyframes dm-clash { 0% { transform: scale(1); } 40% { transform: scale(1.35) rotate(-12deg); box-shadow: 0 0 40px #fde047; } 100% { transform: scale(1); } }
@media (max-height: 700px) and (orientation: portrait) { .dm-vs-fighter { width: 56px; height: 56px; font-size: 26px; } .dm-vs-mark { width: 44px; height: 44px; } }
.dm-rematch-ask { width: 100%; padding: 12px; border-radius: 16px; text-align: center; background: #14532dcc; border: 2px solid #4ade80; }
.dm-big-emoji { font-size: 44px; line-height: 1; }
.dm-trophy { filter: drop-shadow(0 0 14px #f59e0b); animation: dm-pop .6s ease-out 1; }
.dm-tiebreak { padding: 6px 10px; border-radius: 12px; text-align: center; font-size: 15px; font-weight: 900; color: #0b1020; background: #fde047; }
.dm-countdown { margin: auto; text-align: center; }
.dm-count-num { font-size: clamp(72px, 22vmin, 130px); font-weight: 900; line-height: 1; color: #fff; text-shadow: 0 0 30px #22d3ee; animation: dm-pop .5s ease-out 1; }
.dm-count-sub { margin-top: 8px; font-size: 17px; font-weight: 800; color: #cbd5e1; }
@keyframes dm-pop { 0% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.dm-modal { position: absolute; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; padding: 16px; background: #000a; }
.dm-modal-card { width: min(420px, 100%); padding: 16px; border-radius: 18px; text-align: center; background: #0f172a; border: 1px solid #ffffff33; }
.dm-modal-title { font-size: 20px; font-weight: 900; color: #fff; }

.dm-result { justify-content: center; text-align: center; background: radial-gradient(90% 50% at 50% 40%, #f59e0b26, transparent 70%); }
.dm-result-head { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.dm-headline { font-size: clamp(24px, 7vmin, 36px); font-weight: 900; line-height: 1.15; color: #fde047; text-shadow: 0 0 24px #f59e0b88; }
.dm-result-cards { display: grid; gap: 10px; text-align: left; }
.dm-result-actions { position: sticky; bottom: max(4px, var(--game-safe-bottom)); }

/* Fekvő telefon (844×390): két oszlop — bal: kör, ellenfél, saját sáv, idő; jobb: a kérdés és a 2×2 rács teljes magasságban. */
@media (orientation: landscape) and (max-height: 560px) {
  .dm-match { display: grid; grid-template-columns: minmax(0, 38%) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); column-gap: 12px; }
  .dm-match > .dm-banner { grid-column: 1 / -1; }
  .dm-side { grid-column: 1; grid-row: 2; justify-content: flex-start; }
  .dm-main { grid-column: 2; grid-row: 2; }
  .dm-top { min-height: 44px; }
  .duel-qcard { --pfs: 18px; --ofs: 16px; --omin: 56px; }
  .dm-result-cards { grid-template-columns: 1fr 1fr; align-items: start; }
  .dm-code { font-size: 44px; }
  .dm-vs { display: none; }
  /* Review #464 A5: fekvő váróteremben a ragadós gomb ne takarja a játékoslistát (a lap végén áll). */
  .dm-lobby .dm-go { position: static; }
}
@media (prefers-reduced-motion: reduce) {
  .dm-count-num, .dm-spinner, .dm-trophy, .dm-vs-fighter, .dm-vs-mark { animation: none !important; }
}
`;

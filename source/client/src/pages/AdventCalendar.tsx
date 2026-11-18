/**
 * Adventi naptár — „Fénylő ablakok” (docs/specs/2026-11-18-adventi-naptar.md; végrehajtás: …-vegrehajtas.md „S3a”, „S3b”).
 * Havas falu 24 ablaka: minden ablak mögött egy kérdés a tanuló évfolyamáról; a megoldott ablak kivilágosodik. 2D, CSS-alapú:
 * nincs three.js és nincs képkocka-hurok. A kérdést a szerver adja és pontozza; a kliens a helyes választ a válasz előtt nem ismeri.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Check, Lock, Volume2, VolumeX, Wrench, X } from "lucide-react";
import type { AdventAnswerResult, AdventDoorView, AdventQuestion, AdventState } from "@shared/advent/contract";
import { doorArtId } from "@shared/advent/art";
import { adventDateLabel, articleFor, daySuffix, nextDoorToOpen, roundIsOver } from "@shared/advent/home-card";
import { ADVENT_MAX_GRADE, ADVENT_MIN_GRADE } from "@shared/advent/rules";
import { isMuted, sfxClick, sfxSuccess, toggleMuted } from "@/lib/audioEngine";
import AdventArt from "@/advent/AdventArt";
import Snowfall from "@/advent/Snowfall";
import { ADVENT_BUSY_WAITING_TEXT, adventErrorText, retryWhenBusy } from "@/advent/busy";
import {
  ADVENT_STATE_KEY, adventApi, adventDevice, clearPairingLost, forgetLearnerPairing, isPairingLost, markPairingLost, useAdventState,
} from "@/advent/useAdvent";
import "@/advent/advent.css";

const SUBJECT_LABEL: Record<string, string> = {
  christmas: "Karácsony", math: "Matematika", english: "Angol", hungarian: "Magyar nyelv", science: "Természetismeret", history: "Történelem",
};
const GRADES = Array.from({ length: ADVENT_MAX_GRADE - ADVENT_MIN_GRADE + 1 }, (_, i) => ADVENT_MIN_GRADE + i);
/** Élesítési idő: a kérdés megjelenése után ennyi ideig a válaszgombok nem fogadnak bemenetet (dupla koppintás, második Enter). */
export const ADVENT_ARM_MS = 400;
/** A látható üzenetsáv (zárt ablak, eltűnt kérdés) ennyi ideig marad kint. */
const NOTICE_MS = 5000;
const PAIRING_TEXT = "A személyes linked lejárt — nyisd meg újra a napi levélből, vagy folytasd vendégként.";

function doorLabel(door: AdventDoorView): string {
  const base = `${door.day}. ablak`;
  if (door.state === "locked") return `${base} — december ${door.day}${daySuffix(door.day)} nyílik`;
  if (door.state === "open") return `${base} — nyitható`;
  if (door.state === "solved") return `${base} — megoldva, világít`;
  if (door.state === "repairable") return `${base} — javítható`;
  return `${base} — ebben a körben már nem javítható`;
}

type Open = { day: number; question: AdventQuestion; result: AdventAnswerResult | null; readOnly: boolean; repair: boolean; picked: number | null };

function useLandscape(): boolean {
  const query = "(orientation: landscape)";
  const [landscape, setLandscape] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setLandscape(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return landscape;
}

export default function AdventCalendar() {
  const queryClient = useQueryClient();
  const { data: state, isLoading, isError, refetch } = useAdventState();
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Látható (és felolvasott) rövid üzenet: zárt ablak, eltűnt kérdés. Az `n` miatt ugyanaz a szöveg másodszor is megjelenik.
  const [notice, setNotice] = useState<{ text: string; n: number } | null>(null);
  // 429 („most sokan vagyunk”): rövid várakozás alatt barátságos üzenet, utána egy automatikus újrapróba.
  const [waiting, setWaiting] = useState(false);
  const patient = useCallback(<T,>(run: () => Promise<T>) => retryWhenBusy(run, { onWait: setWaiting }), []);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [muted, setMuted] = useState(() => isMuted());
  const [hidden, setHidden] = useState(false);
  const [armed, setArmed] = useState(false);
  // Lejárt tanulói link: amíg a gyerek nem választ, a naptár nem ír (A53) — akkor sem, ha a tokent közben más már törölte.
  const [mustChoose, setMustChoose] = useState(() => isPairingLost());
  const lastDoor = useRef<HTMLButtonElement | null>(null);
  const questionRef = useRef<HTMLParagraphElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const wantsAuto = useRef(false);
  const volatileDevice = useMemo(() => adventDevice().volatile, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (state?.pairing === "invalid") { markPairingLost(); setMustChoose(true); }
  }, [state?.pairing]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const say = useCallback((text: string) => setNotice((prev) => ({ text, n: (prev?.n ?? 0) + 1 })), []);

  // Élesítés: új (még meg nem válaszolt) kérdésnél a válaszok csak rövid idő után fogadnak bemenetet.
  const pendingQuestion = open && !open.result ? open.question.id : null;
  useEffect(() => {
    setArmed(false);
    if (!pendingQuestion) return;
    const timer = window.setTimeout(() => setArmed(true), ADVENT_ARM_MS);
    return () => window.clearTimeout(timer);
  }, [pendingQuestion]);

  // A visszajelzés után a „Tovább” kapja a fókuszt — így fekvő telefonon is a nézetbe gördül.
  const answeredNow = open?.result && !open.readOnly ? open.question.id : null;
  useEffect(() => { if (answeredNow) nextRef.current?.focus(); }, [answeredNow]);

  const setState = useCallback((next: AdventState) => queryClient.setQueryData(ADVENT_STATE_KEY, next), [queryClient]);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ADVENT_STATE_KEY }), [queryClient]);

  const openDoor = useCallback(async (day: number, repair = false) => {
    setError(null);
    setBusy(true);
    try {
      const res = await patient(() => adventApi.open(day));
      if (!res.question) { say("Ez a kérdés már nem érhető el, de az eredményed megmaradt."); return; }
      if (!muted) sfxClick();
      setOpen({ day, question: res.question, result: res.answered, readOnly: res.answered !== null, repair, picked: null });
    } catch (e) {
      setError(adventErrorText(e, "Nem sikerült elérni a naptárat."));
      void refresh();
    } finally {
      setBusy(false);
    }
  }, [muted, patient, refresh, say]);

  const pairingBlocks = (): boolean => {
    if (mustChoose) return true;
    if (!isPairingLost()) return false;
    setMustChoose(true);
    return true;
  };

  const onDoor = (door: AdventDoorView, el: HTMLButtonElement) => {
    lastDoor.current = el;
    if (pairingBlocks()) { say("Előbb válassz fent: nyisd meg újra a leveledből, vagy folytasd vendégként."); return; }
    if (door.state === "locked") { say(`${articleFor(door.day) === "az" ? "Az" : "A"} ${door.day}. ablak december ${door.day}${daySuffix(door.day)} nyílik.`); return; }
    if (busy) return;
    void openDoor(door.day, door.state === "repairable");
  };

  const answer = async (pick: number) => {
    if (!open || open.result || busy || !armed) return;
    const { day, question } = open;
    setBusy(true);
    setError(null);
    try {
      const result = await patient(() => adventApi.answer(day, question.id, pick));
      // Ha a gyerek közben bezárta a kérdést, az eredmény megérkezése nem nyitja újra.
      setOpen((current) => (current && current.day === day && current.question.id === question.id ? { ...current, result, picked: pick } : current));
      if (result.correct && !muted) sfxSuccess();
      // Az állapot a válasz eredményéből helyben frissül — nem megy utána külön olvasás (osztálynyi terhelésnél ez számít).
      const current = queryClient.getQueryData<AdventState | null>(ADVENT_STATE_KEY);
      if (current) setState({ ...current, doors: current.doors.map((d) => (d.day === day ? result.door : d)), summary: result.summary, closing: result.closing });
    } catch (e) {
      setError(adventErrorText(e, "Nem sikerült elküldeni a választ."));
      // 409: a kérdés már nem aktuális (pl. másik eszközön megválaszolták) — a régi kérdés bezárul, az állapot frissül.
      if ((e as { status?: unknown } | null)?.status === 409) setOpen(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const closeQuestion = () => {
    const finished = open?.result && (open.result.closing.kind === "gift" || open.result.summary.answered === open.result.summary.total);
    setOpen(null);
    if (finished && !open?.readOnly) setSummaryOpen(true);
    window.setTimeout(() => lastDoor.current?.focus(), 0);
  };

  const chooseGrade = async (grade: number) => {
    if (pairingBlocks()) { say("Előbb válassz fent: nyisd meg újra a leveledből, vagy folytasd vendégként."); return; }
    setBusy(true);
    setError(null);
    try { setState(await patient(() => adventApi.grade(grade))); }
    catch (e) { setError(adventErrorText(e, "Nem sikerült menteni az évfolyamot.")); }
    finally { setBusy(false); }
  };

  const newRound = async () => {
    setBusy(true);
    setError(null);
    try { setState(await patient(() => adventApi.round())); setSummaryOpen(false); }
    catch (e) { setError(adventErrorText(e, "Nem sikerült új kört indítani.")); }
    finally { setBusy(false); }
  };

  const continueAsGuest = () => {
    forgetLearnerPairing();
    clearPairingLost();
    setMustChoose(false);
    setError(null);
    void refresh();
  };

  // `?nyit=ma`: a főoldali kártyáról érkezve egyszer megnyitja a soron következő ablakot (ha előbb évfolyamot kell
  // választani, akkor közvetlenül utána) — végigjátszott körnél az összesítést —, a paramétert pedig azonnal eltávolítja.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("nyit") !== "ma") return;
    wantsAuto.current = true;
    url.searchParams.delete("nyit");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);
  useEffect(() => {
    if (!state || !wantsAuto.current || state.needsGrade || mustChoose) return;
    wantsAuto.current = false;
    const day = nextDoorToOpen(state);
    if (day !== null) void openDoor(day, state.doors[day - 1]?.state === "repairable");
    else if (roundIsOver(state)) setSummaryOpen(true);
  }, [state, openDoor, mustChoose]);

  if (isLoading) return <Shell><p className="advent-message" role="status">Betöltjük a naptárat…</p></Shell>;
  // Hibaoldal CSAK akkor, ha nincs mit mutatni: megtartott állapot mellett a hiba sávként jelenik meg (lent).
  if (isError && !state) {
    return (
      <Shell>
        <div className="advent-message" role="alert" data-testid="advent-load-error">
          <p>Most nem sikerült elérni a naptárat. Lehet, hogy sokan nyitják egyszerre — próbáld meg újra!</p>
          <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-error-retry" onClick={() => void refetch()}>Újra</button>
          <BackHome />
        </div>
      </Shell>
    );
  }
  if (!state) return <Shell><div className="advent-message"><p>A naptár most nem érhető el.</p><BackHome /></div></Shell>;
  if (state.phase === "before") return <Shell><div className="advent-message"><p>Még nincs itt az advent — gyere vissza december 1-jén!</p><BackHome /></div></Shell>;
  if (state.phase === "teaser") {
    return (
      <Shell>
        <div className="advent-message" data-testid="advent-teaser">
          <h2>Hamarosan!</h2>
          <p>{state.closing.text}</p>
          <p>Még {state.daysUntilStart} nap.</p>
          <BackHome />
        </div>
      </Shell>
    );
  }

  const doorsByDay = new Map(state.doors.map((d) => [d.day, d]));
  const repairTarget = state.doors.find((d) => d.state === "repairable");
  const paused = hidden || open !== null || summaryOpen;
  const closed = state.phase === "closed";

  return (
    <Shell paused={paused} snow>
      <AdventArt id="advent-garland" className="advent-garland" decorative />
      <header className="advent-hud" data-game-hud>
        <Link href="/" className="advent-icon-btn" aria-label="Vissza a főoldalra"><ArrowLeft aria-hidden="true" /></Link>
        <div className="advent-hud__title">
          <h1>Adventi naptár</h1>
          <p data-testid="advent-progress">{state.summary.solved} / {state.summary.total} világít{state.round > 1 ? ` · ${state.round}. kör` : ""}</p>
        </div>
        <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-summary-open" onClick={() => setSummaryOpen(true)}>Összesítés</button>
        <button
          type="button" className="advent-icon-btn" data-testid="advent-sound-toggle" aria-pressed={!muted}
          aria-label={muted ? "Hang bekapcsolása" : "Hang kikapcsolása"} onClick={() => setMuted(toggleMuted())}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>
      </header>

      {mustChoose ? (
        <div className="advent-banner" role="alert" data-testid="advent-pairing-invalid">
          <span>{PAIRING_TEXT}</span>
          <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-continue-guest" onClick={continueAsGuest}>Folytatom vendégként</button>
        </div>
      ) : null}
      {volatileDevice ? <p className="advent-banner" role="status">Ezen az eszközön nem tudjuk megjegyezni a naptáradat.</p> : null}
      {closed ? <p className="advent-banner" role="status" data-testid="advent-closed">{state.closing.text}</p> : null}
      {state.closing.kind === "gift" ? (
        <button type="button" className="advent-gift-banner" data-testid="advent-gift-banner" onClick={() => setSummaryOpen(true)}>{state.closing.text}</button>
      ) : null}
      {isError ? (
        <div className="advent-banner" role="status" data-testid="advent-stale">
          <span>Most nem érjük el a naptárat — amit látsz, az a legutóbbi állapot.</span>
          <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-stale-retry" onClick={() => void refetch()}>Újra</button>
        </div>
      ) : null}
      {waiting ? <p className="advent-banner" role="status" data-testid="advent-busy">{ADVENT_BUSY_WAITING_TEXT}</p> : null}
      {error && !mustChoose ? (
        <div className="advent-banner advent-banner--error" role="alert" data-testid="advent-error">
          <span>{error}</span>
          <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-error-retry" onClick={() => { setError(null); void refresh(); }}>Újra</button>
        </div>
      ) : null}
      {notice ? <p key={notice.n} className="advent-banner advent-banner--notice" role="status" data-testid="advent-notice">{notice.text}</p> : null}

      {state.needsGrade && !closed ? (
        <section className="advent-grade" data-testid="advent-grade-picker" aria-labelledby="advent-grade-title">
          <h2 id="advent-grade-title">Hányadikos vagy?</h2>
          <div className="advent-grade__grid">
            {GRADES.map((grade) => (
              <button key={grade} type="button" className="advent-btn" data-testid={`advent-grade-${grade}`} disabled={busy} onClick={() => void chooseGrade(grade)}>
                {grade}.
              </button>
            ))}
          </div>
        </section>
      ) : (
        <ol className="advent-grid" data-testid="advent-grid" aria-label="A naptár 24 ablaka">
          {state.layout.map((day) => {
            const door = doorsByDay.get(day)!;
            return (
              <li key={day}>
                <button
                  type="button" className="advent-door" data-testid={`advent-door-${day}`} data-state={door.state}
                  aria-label={doorLabel(door)} aria-disabled={door.state === "locked" || closed ? "true" : undefined}
                  onClick={(e) => { if (closed) return; onDoor(door, e.currentTarget); }}
                >
                  {door.state === "solved" ? <AdventArt id={doorArtId(day)} className="advent-door__art" decorative /> : null}
                  <span className="advent-door__num">{day}</span>
                  <span className="advent-door__mark" aria-hidden="true">
                    {door.state === "locked" ? <Lock /> : door.state === "solved" ? <Check /> : door.state === "repairable" ? <Wrench /> : door.state === "failed" ? <X /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {repairTarget && !closed && !state.needsGrade && !mustChoose ? (
        <button type="button" className="advent-btn advent-repair" data-testid="advent-repair" disabled={busy} onClick={() => void openDoor(repairTarget.day, true)}>
          Javítom {articleFor(repairTarget.day)} {repairTarget.day}. ablakot
        </button>
      ) : null}

      <Dialog.Root open={open !== null} onOpenChange={(next) => { if (!next) closeQuestion(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="advent-overlay" />
          <Dialog.Content
            className="advent-dialog" data-testid="advent-dialog" aria-describedby="advent-question-text"
            // A fókusz a KÉRDÉSRE kerül (nem az első válaszra): a képernyőolvasó felolvassa, és egy második Enter nem válaszol.
            onOpenAutoFocus={(event) => { event.preventDefault(); questionRef.current?.focus(); }}
          >
            {open ? (
              <>
                <AdventArt id="advent-frame" className="advent-dialog__frame" decorative />
                <Dialog.Title className="advent-dialog__title">
                  {open.repair ? "Javítás — " : ""}{open.day}. ablak · {SUBJECT_LABEL[open.question.subject] ?? "Kérdés"}
                </Dialog.Title>
                <p id="advent-question-text" ref={questionRef} tabIndex={-1} className="advent-question" data-testid="advent-question">{open.question.prompt}</p>
                <div className="advent-options" role="group" aria-label="Válaszlehetőségek" data-armed={armed || open.result !== null ? "true" : "false"}>
                  {open.question.options.map((option, index) => {
                    const mark = !open.result ? undefined : index === open.result.correctIndex ? "correct" : index === open.picked && !open.result.correct ? "wrong" : undefined;
                    return (
                      <button
                        key={index} type="button" className="advent-option" data-testid={`advent-option-${index}`} data-mark={mark}
                        disabled={busy || open.result !== null} aria-busy={busy} aria-disabled={!armed && open.result === null ? "true" : undefined}
                        onClick={() => void answer(index)}
                      >
                        {mark === "correct" ? <Check aria-hidden="true" /> : mark === "wrong" ? <X aria-hidden="true" /> : null}
                        <span>{option}</span>
                        {mark === "wrong" ? <span className="advent-sr"> — ezt választottad</span> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="advent-feedback" data-testid="advent-feedback" aria-live="polite">
                  {open.result ? (
                    <>
                      <p className="advent-feedback__verdict" data-correct={open.result.correct ? "true" : "false"}>
                        {open.result.correct ? "Ügyes vagy — ez az ablak már világít!" : "Most nem sikerült — nézd meg a helyes választ."}
                      </p>
                      {/* correctIndex -1: a kérdés időközben kikerült a bankból — az eredmény megvan, a helyes válasz szövege nincs. */}
                      {open.result.correctIndex >= 0 ? <p data-testid="advent-correct-answer">A helyes válasz: <strong>{open.question.options[open.result.correctIndex]}</strong></p> : null}
                      {open.result.explanation ? <p>{open.result.explanation}</p> : null}
                      {!open.result.correct && open.result.door.state === "repairable" ? <p>Ezt az ablakot egy új kérdéssel kijavíthatod.</p> : null}
                    </>
                  ) : null}
                </div>
                {waiting ? <p className="advent-banner" role="status">{ADVENT_BUSY_WAITING_TEXT}</p> : null}
                {error ? <p className="advent-banner advent-banner--error" role="alert">{error}</p> : null}
                {open.result ? (
                  <button ref={nextRef} type="button" className="advent-btn advent-btn--primary" data-testid="advent-next" onClick={closeQuestion}>Tovább</button>
                ) : (
                  <Dialog.Close asChild><button type="button" className="advent-btn advent-btn--ghost">Bezárás</button></Dialog.Close>
                )}
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={summaryOpen} onOpenChange={setSummaryOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="advent-overlay" />
          <Dialog.Content className="advent-dialog advent-summary" data-testid="advent-summary" data-kind={state.closing.kind} aria-describedby={undefined}>
            <AdventArt id="advent-frame" className="advent-dialog__frame" decorative />
            <Dialog.Title className="advent-dialog__title">Összesítés</Dialog.Title>
            {state.closing.kind === "gift" ? (
              <>
                <AdventArt id="advent-closing" className="advent-summary__art" />
                <p className="advent-gift" data-testid="advent-gift-message" data-star="lit">{state.closing.text}</p>
              </>
            ) : (
              <p className="advent-encourage" data-testid="advent-encourage">{state.closing.text}</p>
            )}
            <ul className="advent-summary__stats">
              <li><strong>{state.summary.solved} / {state.summary.total}</strong> ablak világít ({state.summary.percent}%)</li>
              <li>Elsőre jó: <strong>{state.summary.firstTry} / {state.summary.total}</strong></li>
              <li data-testid="advent-summary-date">{adventDateLabel(state.today)}{state.firstName ? ` · ${state.firstName}` : ""}{state.grade ? ` · ${state.grade}. osztály` : ""}</li>
            </ul>
            {state.closing.kind === "repair" && repairTarget ? (
              <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-repair-from-summary" disabled={busy} onClick={() => { setSummaryOpen(false); void openDoor(repairTarget.day, true); }}>Javítom</button>
            ) : null}
            {state.closing.kind === "new-round" ? (
              <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-new-round" disabled={busy} onClick={() => void newRound()}>Új naptárat kérek</button>
            ) : null}
            <Dialog.Close asChild><button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-summary-close">Bezárás</button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Shell>
  );
}

function BackHome() {
  return <Link href="/" className="advent-btn advent-btn--ghost" data-testid="advent-back-home">Vissza a főoldalra</Link>;
}

function Shell({ children, paused = false, snow = false }: { children: ReactNode; paused?: boolean; snow?: boolean }) {
  // Csak az éppen látható tájolás háttere kerül a lapra (a rejtett képet a böngésző különben is letöltené — terv 13.3).
  const landscape = useLandscape();
  return (
    <main className="advent-page" data-testid="advent-page" data-paused={paused ? "true" : "false"}>
      <AdventArt id={landscape ? "advent-bg-landscape" : "advent-bg-portrait"} className="advent-bg" eager decorative />
      {snow ? <Snowfall paused={paused} /> : null}
      <div className="advent-content">{children}</div>
    </main>
  );
}

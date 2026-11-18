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
import { articleFor, daySuffix, nextDoorToOpen } from "@shared/advent/home-card";
import { ADVENT_MAX_GRADE, ADVENT_MIN_GRADE } from "@shared/advent/rules";
import { isMuted, sfxClick, sfxSuccess, toggleMuted } from "@/lib/audioEngine";
import AdventArt from "@/advent/AdventArt";
import Snowfall from "@/advent/Snowfall";
import { ADVENT_BUSY_WAITING_TEXT, adventErrorText, retryWhenBusy } from "@/advent/busy";
import { ADVENT_STATE_KEY, adventApi, adventDevice, forgetLearnerPairing, useAdventState } from "@/advent/useAdvent";
import "@/advent/advent.css";

const SUBJECT_LABEL: Record<string, string> = {
  christmas: "Karácsony", math: "Matematika", english: "Angol", hungarian: "Magyar nyelv", science: "Természetismeret", history: "Történelem",
};
const GRADES = Array.from({ length: ADVENT_MAX_GRADE - ADVENT_MIN_GRADE + 1 }, (_, i) => ADVENT_MIN_GRADE + i);

function doorLabel(door: AdventDoorView): string {
  const base = `${door.day}. ablak`;
  if (door.state === "locked") return `${base} — december ${door.day}${daySuffix(door.day)} nyílik`;
  if (door.state === "open") return `${base} — nyitható`;
  if (door.state === "solved") return `${base} — megoldva, világít`;
  if (door.state === "repairable") return `${base} — javítható`;
  return `${base} — ebben a körben már nem javítható`;
}

type Open = { day: number; question: AdventQuestion; result: AdventAnswerResult | null; readOnly: boolean };

export default function AdventCalendar() {
  const queryClient = useQueryClient();
  const { data: state, isLoading, isError, refetch } = useAdventState();
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  // 429 („most sokan vagyunk”): rövid várakozás alatt barátságos üzenet, utána egy automatikus újrapróba.
  const [waiting, setWaiting] = useState(false);
  const patient = useCallback(<T,>(run: () => Promise<T>) => retryWhenBusy(run, { onWait: setWaiting }), []);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [muted, setMuted] = useState(() => isMuted());
  const [hidden, setHidden] = useState(false);
  const lastDoor = useRef<HTMLButtonElement | null>(null);
  const wantsAuto = useRef(false);
  const volatileDevice = useMemo(() => adventDevice().volatile, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const setState = useCallback((next: AdventState) => queryClient.setQueryData(ADVENT_STATE_KEY, next), [queryClient]);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ADVENT_STATE_KEY }), [queryClient]);

  const openDoor = useCallback(async (day: number) => {
    setError(null);
    setBusy(true);
    try {
      const res = await patient(() => adventApi.open(day));
      if (!res.question) { setNotice("Ez a kérdés már nem érhető el, de az eredményed megmaradt."); return; }
      if (!muted) sfxClick();
      setOpen({ day, question: res.question, result: res.answered, readOnly: res.answered !== null });
    } catch (e) {
      setError(adventErrorText(e, "Nem sikerült elérni a naptárat."));
      void refresh();
    } finally {
      setBusy(false);
    }
  }, [muted, patient, refresh]);

  const onDoor = (door: AdventDoorView, el: HTMLButtonElement) => {
    lastDoor.current = el;
    if (door.state === "locked") { setNotice(`${articleFor(door.day) === "az" ? "Az" : "A"} ${door.day}. ablak december ${door.day}${daySuffix(door.day)} nyílik.`); return; }
    if (busy) return;
    void openDoor(door.day);
  };

  const answer = async (pick: number) => {
    if (!open || open.result || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await patient(() => adventApi.answer(open.day, open.question.id, pick));
      setOpen({ ...open, result });
      if (result.correct && !muted) sfxSuccess();
      await refresh();
    } catch (e) {
      setError(adventErrorText(e, "Nem sikerült elküldeni a választ."));
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

  // `?nyit=ma`: a főoldali kártyáról érkezve egyszer megnyitja a soron következő ablakot (ha előbb évfolyamot kell
  // választani, akkor közvetlenül utána), a paramétert pedig azonnal eltávolítja — újratöltéskor nem nyit újra.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("nyit") !== "ma") return;
    wantsAuto.current = true;
    url.searchParams.delete("nyit");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);
  useEffect(() => {
    if (!state || !wantsAuto.current || state.needsGrade) return;
    wantsAuto.current = false;
    const day = nextDoorToOpen(state);
    if (day !== null) void openDoor(day);
  }, [state, openDoor]);

  if (isLoading) return <Shell><p className="advent-message" role="status">Betöltjük a naptárat…</p></Shell>;
  if (isError) {
    return (
      <Shell>
        <div className="advent-message" role="alert">
          <p>Nem sikerült elérni a naptárat.</p>
          <button type="button" className="advent-btn" data-testid="advent-error-retry" onClick={() => void refetch()}>Újra</button>
        </div>
      </Shell>
    );
  }
  if (!state) return <Shell><p className="advent-message">A naptár most nem érhető el.</p></Shell>;
  if (state.phase === "before") return <Shell><p className="advent-message">Még nincs itt az advent — gyere vissza december 1-jén!</p></Shell>;
  if (state.phase === "teaser") {
    return (
      <Shell>
        <div className="advent-message" data-testid="advent-teaser">
          <h2>Hamarosan!</h2>
          <p>{state.closing.text}</p>
          <p>Még {state.daysUntilStart} nap.</p>
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

      {state.pairing === "invalid" ? (
        <div className="advent-banner" role="alert" data-testid="advent-pairing-invalid">
          <span>A személyes linked lejárt — nyisd meg újra a napi levélből.</span>
          <button type="button" className="advent-btn advent-btn--ghost" onClick={() => { forgetLearnerPairing(); void refresh(); }}>Folytatom vendégként</button>
        </div>
      ) : null}
      {volatileDevice ? <p className="advent-banner" role="status">Ezen az eszközön nem tudjuk megjegyezni a naptáradat.</p> : null}
      {closed ? <p className="advent-banner" role="status" data-testid="advent-closed">{state.closing.text}</p> : null}
      {waiting ? <p className="advent-banner" role="status" data-testid="advent-busy">{ADVENT_BUSY_WAITING_TEXT}</p> : null}
      {error ? (
        <div className="advent-banner advent-banner--error" role="alert" data-testid="advent-error">
          <span>{error}</span>
          <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-error-retry" onClick={() => { setError(null); void refresh(); }}>Újra</button>
        </div>
      ) : null}
      <p className="advent-sr" role="status" aria-live="polite">{notice}</p>

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

      {repairTarget && !closed && !state.needsGrade ? (
        <button type="button" className="advent-btn advent-repair" data-testid="advent-repair" disabled={busy} onClick={() => void openDoor(repairTarget.day)}>
          Javítom {articleFor(repairTarget.day)} {repairTarget.day}. ablakot
        </button>
      ) : null}

      <Dialog.Root open={open !== null} onOpenChange={(next) => { if (!next) closeQuestion(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="advent-overlay" />
          <Dialog.Content className="advent-dialog" data-testid="advent-dialog" aria-describedby={undefined}>
            {open ? (
              <>
                <Dialog.Title className="advent-dialog__title">
                  {open.day}. ablak · {SUBJECT_LABEL[open.question.subject] ?? "Kérdés"}
                </Dialog.Title>
                <p className="advent-question" data-testid="advent-question">{open.question.prompt}</p>
                <div className="advent-options" role="group" aria-label="Válaszlehetőségek">
                  {open.question.options.map((option, index) => {
                    const mark = open.result ? (index === open.result.correctIndex ? "correct" : undefined) : undefined;
                    return (
                      <button
                        key={index} type="button" className="advent-option" data-testid={`advent-option-${index}`} data-mark={mark}
                        disabled={busy || open.result !== null} aria-busy={busy} onClick={() => void answer(index)}
                      >
                        {mark === "correct" ? <Check aria-hidden="true" /> : null}
                        <span>{option}</span>
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
                {error ? <p className="advent-banner advent-banner--error" role="alert">{error}</p> : null}
                {open.result ? (
                  <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-next" onClick={closeQuestion}>Tovább</button>
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
              <li>{state.today}{state.firstName ? ` · ${state.firstName}` : ""}{state.grade ? ` · ${state.grade}. osztály` : ""}</li>
            </ul>
            {state.closing.kind === "repair" && repairTarget ? (
              <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-repair-from-summary" disabled={busy} onClick={() => { setSummaryOpen(false); void openDoor(repairTarget.day); }}>Javítom</button>
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

function Shell({ children, paused = false, snow = false }: { children: ReactNode; paused?: boolean; snow?: boolean }) {
  return (
    <main className="advent-page" data-testid="advent-page" data-paused={paused ? "true" : "false"}>
      <AdventArt id="advent-bg-portrait" className="advent-bg advent-bg--portrait" eager decorative />
      <AdventArt id="advent-bg-landscape" className="advent-bg advent-bg--landscape" eager decorative />
      {snow ? <Snowfall paused={paused} /> : null}
      <div className="advent-content">{children}</div>
    </main>
  );
}

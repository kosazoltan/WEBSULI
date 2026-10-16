import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Flashcard } from "@shared/lesson-flashcards";
import { formatDue, nextReview, reviewQueue, type ReviewRating, type ReviewState } from "@shared/review-schedule";

/**
 * Websuli Design §3/§6/§7 — memóriakártya és ismétlés (docs/specs/2026-10-16-websuli-ismetles.md).
 * Bejelentkezve a szerver menti az értékelést (a „Mentve” csak sikeres válasz után; hibánál újrapróbálás, a kártya nem lép tovább).
 * Vendégként az állapot csak ebben a böngészőben marad — ezt a felület ki is írja; szerverre semmi nem megy.
 */
type States = Record<string, ReviewState>;
type Note = { tone: "ok" | "error"; text: string } | null;

function readGuest(key: string): States {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed as States : {};
  } catch { return {}; } // Privát mód / tiltott tároló: üres állapottal, a felület akkor is működik.
}
function writeGuest(key: string, states: States) {
  try { window.localStorage.setItem(key, JSON.stringify(states)); } catch { /* a gyakorlás memóriában folytatódik */ }
}
const short = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}…` : text);
/** Értékelésenként egyedi, újrapróbáláskor változatlan azonosító (a szerver ugyanarra az eredeti eredményt adja, review #268). */
function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("-");
}
type Pending = { rating: ReviewRating; requestId: string; retryable: boolean };

export function FlashcardReview({ cards, lessonId, storageKey, active }: { cards: Flashcard[]; lessonId?: string; storageKey: string; active: boolean }) {
  // A terv szélső esete: ha mentés közben lejár a bejelentkezés (401), vendég módra váltunk, és ezt ki is írjuk.
  const [expired, setExpired] = useState(false);
  const auth = useQuery<{ id: string } | null>({
    queryKey: ["/api/auth/user"], enabled: !!lessonId && active, retry: false,
    queryFn: async () => {
      const response = await fetch("/api/auth/user", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Az azonosítás nem sikerült.");
      return response.json();
    },
  });
  if (!lessonId || (!auth.isPending && !auth.isError && !auth.data)) return <ReviewDeck cards={cards} expired={expired} mode={{ kind: "guest", key: `websuli:review:guest:${storageKey}` }} />;
  if (auth.isPending) return <p role="status">Ismétlés betöltése…</p>;
  if (auth.isError) return <div role="alert">Az azonosítás nem sikerült. <button className="lesson-outline-btn" onClick={() => void auth.refetch()}>Újra</button></div>;
  return <SavedDeck key={`${auth.data!.id}:${lessonId}`} cards={cards} lessonId={lessonId} onExpired={() => { setExpired(true); queryClient.setQueryData(["/api/auth/user"], null); }} />;
}

function SavedDeck({ cards, lessonId, onExpired }: { cards: Flashcard[]; lessonId: string; onExpired: () => void }) {
  const url = `/api/lessons/review/${encodeURIComponent(lessonId)}`;
  const view = useQuery<{ states: States }>({
    queryKey: [url], retry: false,
    queryFn: async () => {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Az ismétlés betöltése nem sikerült.");
      return response.json();
    },
  });
  if (view.isPending) return <p role="status">Ismétlés betöltése…</p>;
  if (view.isError) return <div role="alert">Az ismétlés betöltése nem sikerült. <button className="lesson-outline-btn" onClick={() => void view.refetch()}>Újra</button></div>;
  return <ReviewDeck cards={cards} initial={view.data.states} mode={{ kind: "saved", url }} onExpired={onExpired} />;
}

type Mode = { kind: "guest"; key: string } | { kind: "saved"; url: string };

function ReviewDeck({ cards, mode, initial, expired, onExpired }: { cards: Flashcard[]; mode: Mode; initial?: States; expired?: boolean; onExpired?: () => void }) {
  const [states, setStates] = useState<States>(() => initial ?? (mode.kind === "guest" ? readGuest(mode.key) : {}));
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [failed, setFailed] = useState<Pending | null>(null);
  const [now, setNow] = useState(() => new Date());
  const statusRef = useRef<HTMLDivElement>(null);
  // A „Még gyakorlom” kártya 10 perc múlva újra esedékes — a sor percenként frissül.
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(id); }, []);
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const queue = reviewQueue(cards.map(c => c.id), states, now);
  const currentId = queue.due[0] ?? queue.fresh[0];
  const card = currentId ? byId.get(currentId) : undefined;
  useEffect(() => { setFlipped(false); setFailed(null); }, [currentId]);

  const rate = async (rating: ReviewRating, requestId = newRequestId()) => {
    if (!card || busy) return;
    const at = new Date();
    let state: ReviewState;
    if (mode.kind === "guest") {
      state = nextReview(states[card.id] ?? null, rating, at);
      const next = { ...states, [card.id]: state };
      writeGuest(mode.key, next); setStates(next);
    } else {
      setBusy(true); setFailed(null);
      try {
        // apiRequest: CSRF-token a mutáló kérésen (a nyers fetch élesben 403-at kapna); írásnál nincs automatikus ismétlés.
        state = (await apiRequest<{ state: ReviewState }>("POST", `${mode.url}/rate`, { cardId: card.id, rating, requestId })).state;
        setStates(old => ({ ...old, [card.id]: state }));
      } catch (error) {
        // 409: a lecke időközben frissült (a kártya elavult) — újrapróbálás helyett újratöltés kell.
        const status = (error as { status?: number }).status;
        if (status === 401 && onExpired) { onExpired(); return; }
        const stale = status === 409;
        setFailed({ rating, requestId, retryable: !stale });
        setNote({ tone: "error", text: stale ? "A lecke időközben frissült. Töltsd újra az oldalt, és folytasd az ismétlést!" : "Nem sikerült menteni. Az értékelésed nem veszett el: próbáld újra!" });
        return;
      } finally { setBusy(false); }
    }
    setNow(at);
    const saved = mode.kind === "saved" ? "Mentve. " : "";
    setNote({ tone: "ok", text: rating === "known"
      ? `${saved}„${short(card.front)}” — már tudod. Következő ismétlés: ${formatDue(state.dueAt)}.`
      : `${saved}„${short(card.front)}” — ismétlésre jelölve, 10 perc múlva újra előkerül.` });
    requestAnimationFrame(() => statusRef.current?.focus({ preventScroll: true }));
  };

  const doneCount = queue.later.length;
  return <section className="lesson-block ws-review" aria-label="Memorizálókártyák">
    <div className="fusion-round-head"><div><span className="fusion-eyebrow">{mode.kind === "saved" ? "Mentett ismétlés" : "Helyi ismétlés"}</span><h2>Memorizálókártya</h2>
      <p>{queue.due.length} esedékes · {queue.fresh.length} új · {doneCount} / {cards.length} kártya mára kész</p></div></div>
    <progress className="ws-review-progress" max={cards.length} value={doneCount} aria-label={`${doneCount} / ${cards.length} kártya mára kész`} />
    {mode.kind === "guest" && <p className="ws-review-guest">{expired && <strong>Lejárt a bejelentkezésed, ez az értékelés nem mentődött. </strong>}Vendégként gyakorolsz: az ismétlés csak ezen az eszközön, ebben a böngészőben marad meg.</p>}
    {card ? <>
      <button type="button" className="ws-flash" aria-pressed={flipped} aria-label={flipped ? "Válasz visszafordítása" : "Válasz megjelenítése"} onClick={() => setFlipped(v => !v)}>
        <small>{flipped ? "HELYES VÁLASZ · KOPPINTS A VISSZAFORDÍTÁSHOZ" : "KÉRDÉS · KOPPINTS A FORDÍTÁSHOZ"}</small>
        <span className="ws-flash-text">{flipped ? card.back : card.front}</span>
        {flipped && <small className="ws-flash-question">{card.front}</small>}
      </button>
      <div className="ws-review-actions">
        {/* Review #269: sikertelen mentés után csak az „Újrapróbálás” (ugyanazzal a requestId-val) küldhet — egy új értékelés új
            azonosítóval kétszer léptetné az ütemezést, ha az első mentés a szerveren mégis sikerült. */}
        <button type="button" className="lesson-outline-btn" disabled={busy || !!failed} onClick={() => void rate("again")}>Még gyakorlom</button>
        <button type="button" className="fusion-primary" disabled={busy || !!failed} onClick={() => void rate("known")}>Már tudom</button>
        {failed?.retryable && <button type="button" className="lesson-outline-btn" disabled={busy} onClick={() => void rate(failed.rating, failed.requestId)}>Újrapróbálás</button>}
      </div>
    </> : <p className="ws-review-done"><strong>Mára kész!</strong>{queue.later[0] && <> Következő esedékes kártya: {formatDue(queue.later[0].dueAt)}.</>}</p>}
    <div className="ws-review-status" role="status" aria-live="polite" tabIndex={-1} ref={statusRef} data-tone={note?.tone}>{busy ? "Mentés…" : note?.text}</div>
  </section>;
}

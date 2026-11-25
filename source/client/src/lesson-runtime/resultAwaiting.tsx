import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { getFingerprint } from "@/lib/fingerprintCache";
import { getLearnerToken } from "@/lib/learnerProfile";
import { asAwaiting, createLatest, type AwaitingPart } from "@shared/result-awaiting";

/**
 * U4d (review #591): a figyelmeztetés a szerver állapotát mutatja (`/results/status`, a beküldéssel azonos kilét) — betöltéskor, az ablak
 * fókuszakor / láthatóvá válásakor (több lap) és minden beküldés után frissül; csak a legutolsó lekérdezés válasza érvényes.
 */
const latest = createLatest();
const listeners = new Map<string, Set<(v: AwaitingPart | null) => void>>();
const current = new Map<string, AwaitingPart | null>();

function emit(lessonId: string, v: AwaitingPart | null) {
  current.set(lessonId, v);
  for (const fn of listeners.get(lessonId) ?? []) fn(v);
}

export async function refreshResultAwaiting(lessonId: string): Promise<void> {
  const ticket = latest.next(lessonId);
  try {
    const fingerprint = await getFingerprint().catch(() => undefined);
    const learner = getLearnerToken() ?? undefined;
    const res = await apiRequest<{ awaiting?: unknown }>("POST", `/api/lessons/${lessonId}/results/status`, { ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}) }, { retries: 0 });
    if (latest.isLatest(lessonId, ticket)) emit(lessonId, asAwaiting(res?.awaiting));
  } catch { /* a figyelmeztetés csak tájékoztat — hiba esetén a korábbi állapot marad */ }
}

export function useResultAwaiting(lessonId: string | undefined): AwaitingPart | null {
  const [value, setValue] = useState<AwaitingPart | null>(() => (lessonId ? current.get(lessonId) ?? null : null));
  useEffect(() => {
    if (!lessonId) { setValue(null); return; }
    const set = listeners.get(lessonId) ?? new Set(); set.add(setValue); listeners.set(lessonId, set);
    setValue(current.get(lessonId) ?? null);
    void refreshResultAwaiting(lessonId);
    const onFocus = () => { if (document.visibilityState !== "hidden") void refreshResultAwaiting(lessonId); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { set.delete(setValue); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [lessonId]);
  return value;
}

/** Beküldés (vagy a gyakorlókör lezárása) után: a szerver állapotának újrakérdezése — a válasz `awaiting`-je csak jelzés, nem forrás. */
export function noteResultResponse(lessonId: string, _response: unknown) {
  void refreshResultAwaiting(lessonId);
}

export function ResultAwaitingNotice({ awaiting, onGo }: { awaiting: AwaitingPart; onGo: (part: AwaitingPart) => void }) {
  const missing = awaiting === "tasks" ? "a szöveges feladatokat" : "a kvízt";
  const done = awaiting === "tasks" ? "A kvíz" : "A feladatok";
  return <div className="result-awaiting" role="status" data-testid="result-awaiting">
    <p><strong>Még nem ment el az eredményed.</strong> {done} eredményét a tanárod egy levélben kapja meg, amikor {missing} is befejezed. Ha 7 napon belül nem készül el, a kész rész eredménye magában megy el.</p>
    <button type="button" className="lesson-outline-btn" onClick={() => onGo(awaiting)}>{awaiting === "tasks" ? "Tovább a feladatokhoz" : "Tovább a kvízhez"}</button>
  </div>;
}

import { useEffect, useState } from "react";
import { createAwaitingStore, type AwaitingPart } from "@shared/result-awaiting";

/** U4d: a böngészős tár (localStorage, memóriás tartalékkal) és a hook a figyelmeztetéshez. */
export const resultAwaitingStore = createAwaitingStore(() => { try { return localStorage; } catch { return null; } });

export function useResultAwaiting(lessonId: string | undefined): AwaitingPart | null {
  const [value, setValue] = useState<AwaitingPart | null>(() => (lessonId ? resultAwaitingStore.get(lessonId) : null));
  useEffect(() => {
    if (!lessonId) { setValue(null); return; }
    setValue(resultAwaitingStore.get(lessonId));
    return resultAwaitingStore.subscribe(lessonId, setValue);
  }, [lessonId]);
  return value;
}

/** A szerver válaszának feldolgozása: `awaiting` → tárolás; anélküli sikeres beküldés → törlés (a hiányzó rész megérkezett). */
export function noteResultResponse(lessonId: string, response: unknown) {
  const awaiting = (response as { awaiting?: unknown; resultAwaiting?: unknown } | null)?.awaiting ?? (response as { resultAwaiting?: unknown } | null)?.resultAwaiting;
  if (awaiting === "tasks" || awaiting === "quiz") resultAwaitingStore.set(lessonId, awaiting);
  else resultAwaitingStore.clear(lessonId);
}

export function ResultAwaitingNotice({ awaiting, onGo }: { awaiting: AwaitingPart; onGo: (part: AwaitingPart) => void }) {
  const missing = awaiting === "tasks" ? "a szöveges feladatokat" : "a kvízt";
  const done = awaiting === "tasks" ? "A kvíz" : "A feladatok";
  return <div className="result-awaiting" role="status" data-testid="result-awaiting">
    <p><strong>Még nem ment el az eredményed.</strong> {done} eredményét a tanárod egy levélben kapja meg, amikor {missing} is befejezed. Ha 7 napon belül nem készül el, a kész rész eredménye magában megy el.</p>
    <button type="button" className="lesson-outline-btn" onClick={() => onGo(awaiting)}>{awaiting === "tasks" ? "Tovább a feladatokhoz" : "Tovább a kvízhez"}</button>
  </div>;
}

import { useEffect, useRef, useState } from "react";
import { apiRequest, sendKeepalive, warmCsrfToken } from "@/lib/queryClient";
import { getFingerprint, peekFingerprint } from "@/lib/fingerprintCache";
import { getLearnerToken } from "@/lib/learnerProfile";
import { answeredCount, quizRoundComplete, roundTooOld } from "@shared/quiz-round";
import { experienceFingerprint, type ExperienceRound } from "./useExperienceRound";

/**
 * Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md) — „motorháztető alatt”: a kör első lezárásakor
 * a válaszok egyszer a szerverhez mennek (az pontoz újra és küld). Nincs felület, nincs visszajelzés; a hiba csendes. Ugyanaz a kör
 * nem megy kétszer (localStorage-jelző + a szerver egyedi kulcsa).
 */
/** Review #280: a feladatok beküldése megvárja a döntőbíró ítéleteit (`ready`), hogy a levél ugyanazt a pontot kapja, amit a tanuló lát;
 *  biztonsági háló: a lezárás után legkésőbb 45 s-mal mindenképp beküld (a döntőbíró hibája esetén a pontozó ítélete marad). */
export const REPORT_FALLBACK_MS = 45_000;
export const RESULT_REPORT_RETRIES = 3;
export function useResultReport(lessonId: string | undefined, kind: "tasks" | "quiz", round: ExperienceRound, storageKey: string, ready = true) {
  const sending = useRef(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!round.finishedAt || ready) return;
    const timer = setTimeout(() => setTimedOut(true), REPORT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [round.finishedAt, ready]);
  useEffect(() => {
    // Spec 2026-11-17-eredmeny-email-kviz: a helyi kvíz kérdésenként azonnal visszajelez, a lezáró gombot sokan meg sem nyomják — a
    // teljesen megválaszolt kör lezárás nélkül is megy (körönként egyszer: a jelző és a szerver egyedi kulcsa változatlan).
    const done = !!round.finishedAt || (kind === "quiz" && quizRoundComplete(round));
    if (!lessonId || !done || sending.current || !(ready || timedOut)) return;
    // S1b (review K1): a 7 napnál régebben kezdett, LE NEM ZÁRT kör utólag nem megy el (a lezárt kör a tanuló döntése: az megy).
    if (!round.finishedAt && roundTooOld(round.startedAt, Date.now())) return;
    const roundId = `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
    const flag = `${storageKey}:${kind}:sent:${roundId}`;
    try { if (localStorage.getItem(flag)) return; } catch { /* privát módban a szerver egyedi kulcsa véd */ }
    sending.current = true;
    void (async () => {
      try {
        const fingerprint = await getFingerprint().catch(() => undefined);
        // Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S2): a párosított eszköz tokenje — a szerver ellenőrzi.
        const learner = getLearnerToken();
        const started = round.startedAt > 0 ? { startedAt: round.startedAt } : {};
        const body = kind === "tasks"
          ? { kind, roundId, answers: Object.fromEntries(round.ids.map(id => [id, round.answers[id] ?? ""])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...started }
          // Review #280: a kör minden kérdése megy; a kihagyott -1 (nulla pont), különben a levél pontszáma eltérne a képernyőétől.
          : { kind, roundId, picks: Object.fromEntries(round.ids.map(id => [id, round.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...started };
        // J5 (spec 2026-11-10-gyartas-meres): ingadozó mobilhálózaton az eredmény ne vesszen el — hálózati hibánál, időtúllépésnél
        // és 5xx-nél legfeljebb 3 újrapróbálás (növekvő várakozással). Biztonságos: a szerver a kört egyedi kulccsal egyszer rögzíti.
        await apiRequest("POST", `/api/lessons/${lessonId}/results`, body, { retries: RESULT_REPORT_RETRIES });
        try { localStorage.setItem(flag, "1"); } catch { /* elég a szerver egyedi kulcsa */ }
      } catch { /* csendes: a tanuló felülete nem függ a levéltől */ }
      finally { sending.current = false; }
    })();
  }, [lessonId, kind, round, storageKey, ready, timedOut]);

  // Spec 2026-11-17-eredmeny-email-kviz (S1b): a FÉLBEHAGYOTT helyi kvíz — a lap háttérbe kerülésekor / elhagyásakor a kör pillanatképe
  // megy a szerverhez (`partial: true`); a szerver csak akkor küld „félbehagyva” levelet, ha utána sem újabb pillanatkép, sem végleges
  // beküldés nem érkezik. Csak akkor megy, ha van válasz, és több, mint a legutóbb elküldött pillanatképben.
  const latest = useRef(round);
  latest.current = round;
  // Review #510: a memóriabeli számláló a KÖRHÖZ kötött — „Új kör” után az új kör első válaszai is mehetnek.
  const lastSnapshot = useRef<{ roundId: string; count: number }>({ roundId: "", count: 0 });
  const answered = kind === "quiz" ? answeredCount(round) : 0;
  // Review B1: a CSRF-token MELLETT az ujjlenyomat is előre töltődik — a pillanatkép ugyanazzal az azonosítóval megy, mint a végleges
  // beküldés, különben a szerver más kulcson tartaná, és a végleges nem törölné a várakozót.
  useEffect(() => { if (kind === "quiz" && answered > 0) { warmCsrfToken(); void getFingerprint().catch(() => undefined); } }, [kind, answered > 0]);
  useEffect(() => {
    if (kind !== "quiz" || !lessonId) return;
    const snapshot = () => {
      const current = latest.current;
      const count = answeredCount(current);
      if (current.finishedAt || quizRoundComplete(current) || count === 0 || roundTooOld(current.startedAt, Date.now())) return;
      const roundId = `round-${experienceFingerprint({ ids: current.ids, startedAt: current.startedAt })}`;
      const key = `${storageKey}:${kind}:partial:${roundId}`;
      let sentCount = lastSnapshot.current.roundId === roundId ? lastSnapshot.current.count : 0;
      try { if (localStorage.getItem(`${storageKey}:${kind}:sent:${roundId}`)) return; sentCount = Math.max(sentCount, Number(localStorage.getItem(key)) || 0); } catch { /* privát mód: a munkamenet számlálója marad */ }
      if (count <= sentCount) return;
      const learner = getLearnerToken();
      const fingerprint = peekFingerprint();
      const body = { kind, roundId, partial: true, picks: Object.fromEntries(current.ids.map(id => [id, current.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...(current.startedAt > 0 ? { startedAt: current.startedAt } : {}) };
      const sending = sendKeepalive(`/api/lessons/${lessonId}/results`, body);
      if (!sending) return;
      // A memóriabeli számláló azonnal nő (a `visibilitychange` és a `pagehide` ne küldje kétszer ugyanazt), de a tartós jelző csak
      // ELFOGADOTT (2xx) válasz után íródik; sikertelen küldésnél a számláló visszaáll, a következő alkalom újrapróbál (review #510).
      const previous = lastSnapshot.current;
      lastSnapshot.current = { roundId, count };
      void sending.then(ok => {
        if (ok) { try { localStorage.setItem(key, String(count)); } catch { /* elég a munkamenet számlálója */ } return; }
        if (lastSnapshot.current.roundId === roundId && lastSnapshot.current.count === count) lastSnapshot.current = previous;
      });
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") snapshot(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", snapshot);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", snapshot);
      // Review #510: a leckéből való belső (SPA) navigációkor — „Vissza”, „Következő tananyag” — nincs `pagehide`; a komponens
      // lebontásakor is megy a pillanatkép.
      snapshot();
    };
  }, [lessonId, kind, storageKey]);
}

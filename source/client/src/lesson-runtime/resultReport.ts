import { useEffect, useRef, useState } from "react";
import { apiRequest, ensureResultApi, resultApiReady, sendKeepalive, warmCsrfToken } from "@/lib/queryClient";
import { getFingerprint, peekFingerprint } from "@/lib/fingerprintCache";
import { getLearnerToken } from "@/lib/learnerProfile";
import { answeredCount, quizRoundComplete, roundActivityAt, roundTooOld, snapshotDue, type SnapshotState } from "@shared/quiz-round";
import { legacyResultBody } from "@shared/result-compat";
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
    // S1b (review K1) + R2: az a LE NEM ZÁRT kör, amelynek az UTOLSÓ VÁLASZA 7 napnál régebbi, utólag nem megy el (a lezárt kör a tanuló
    // döntése: az megy). A régen megnyitott, de ma megválaszolt kör megy — a korhatár nem a kvíz-fül első megnyitásához mér.
    if (!round.finishedAt && roundTooOld(roundActivityAt(round), Date.now())) return;
    const roundId = `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
    const flag = `${storageKey}:${kind}:sent:${roundId}`;
    try { if (localStorage.getItem(flag)) return; } catch { /* privát módban a szerver egyedi kulcsa véd */ }
    sending.current = true;
    void (async () => {
      try {
        const fingerprint = await getFingerprint().catch(() => undefined);
        // Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S2): a párosított eszköz tokenje — a szerver ellenőrzi.
        const learner = getLearnerToken();
        // Terv R12 (második vak ellenőrzés K3): az új mezők (`startedAt`, `lastAnsweredAt`, `clientNow`) CSAK akkor mennek, ha a szerver a
        // CSRF-token válaszában jelezte, hogy ismeri őket — a Vercel-kliens a Render-szerver előtt is települhet, és a régi szerver
        // szigorú sémája az ismeretlen mezőt 400-zal utasítaná el. Jelzés nélkül a régi alak megy, egyszer, ismétlés nélkül.
        const capable = await ensureResultApi();
        const fresh = capable ? { ...(round.startedAt > 0 ? { startedAt: round.startedAt } : {}), ...(kind === "quiz" && round.lastAnsweredAt ? { lastAnsweredAt: round.lastAnsweredAt } : {}), clientNow: Date.now() } : {};
        const body = kind === "tasks"
          ? { kind, roundId, answers: Object.fromEntries(round.ids.map(id => [id, round.answers[id] ?? ""])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...fresh }
          // Review #280: a kör minden kérdése megy; a kihagyott -1 (nulla pont), különben a levél pontszáma eltérne a képernyőétől.
          : { kind, roundId, picks: Object.fromEntries(round.ids.map(id => [id, round.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...fresh };
        // J5 (spec 2026-11-10-gyartas-meres): ingadozó mobilhálózaton az eredmény ne vesszen el — hálózati hibánál, időtúllépésnél
        // és 5xx-nél legfeljebb 3 újrapróbálás (növekvő várakozással). Biztonságos: a szerver a kört egyedi kulccsal egyszer rögzíti.
        // R8: a kvíz végleges kérése `keepalive` — az utolsó válasz utáni azonnali lapbezárás ne szakítsa meg. A feladatoké nem: a
        // törzsük (60 válasz × 4000 karakter) meghaladhatja a `keepalive` 64 KB-os keretét, és akkor a böngésző el sem indítaná.
        try {
          if (kind === "quiz") await apiRequest("POST", `/api/lessons/${lessonId}/results`, body, { retries: RESULT_REPORT_RETRIES, keepalive: true });
          else await apiRequest("POST", `/api/lessons/${lessonId}/results`, body, { retries: RESULT_REPORT_RETRIES });
        } catch (error) {
          // R10 (az R12 szerint csak jelzés MELLETT): ha a jelzést adó új példány mellett egy még régi példány 400-at ad, EGY ismétlés a
          // régi alakkal. Jelzés nélkül eleve a régi alak ment — ott nincs ismétlés; más hiba / új mező nélküli törzs: nincs ismétlés.
          const legacy = legacyResultBody(body);
          if (!capable || (error as { status?: unknown } | null)?.status !== 400 || !legacy) throw error;
          await apiRequest("POST", `/api/lessons/${lessonId}/results`, legacy, { retries: RESULT_REPORT_RETRIES, ...(kind === "quiz" ? { keepalive: true } : {}) });
        }
        try {
          localStorage.setItem(flag, "1");
          // A véglegesített körnek nincs több pillanatképe: a „részleges” jelzője nem marad a tárolóban.
          localStorage.removeItem(`${storageKey}:${kind}:partial:${roundId}`);
        } catch { /* elég a szerver egyedi kulcsa */ }
      } catch { /* csendes: a tanuló felülete nem függ a levéltől */ }
      finally { sending.current = false; }
    })();
  }, [lessonId, kind, round, storageKey, ready, timedOut]);

  // Spec 2026-11-17-eredmeny-email-kviz (S1b): a FÉLBEHAGYOTT helyi kvíz — a lap háttérbe kerülésekor / elhagyásakor a kör pillanatképe
  // megy a szerverhez (`partial: true`); a szerver csak akkor küld „félbehagyva” levelet, ha utána sem újabb pillanatkép, sem végleges
  // beküldés nem érkezik. Csak akkor megy, ha van válasz, és több, mint a legutóbb elküldött pillanatképben.
  // PR #510: (1) a pillanatkép a komponens LEBONTÁSAKOR és leckeváltáskor is megy (az alkalmazáson belüli navigáció nem vált ki
  // `pagehide`-ot); (2) az állapot a KÖR azonosítójához kötött (új kör tiszta lappal indul); (3) „elküldve” csak a szerver sikeres
  // válasza után rögzül — a sikertelen küldés újrapróbálható marad.
  // Vak ellenőrzés K3 (terv R3): a pillanatkép akkor is megy, ha a kör a nézeten BELÜL cserélődik le („Új kvíz” a kör közepén) — az
  // elhagyott körről, mielőtt az állapota törlődik.
  const committed = useRef(round);
  const snapshotRef = useRef<() => void>(() => {});
  const snapshotState = useRef<SnapshotState>({ sent: null, pending: null });
  const answered = kind === "quiz" ? answeredCount(round) : 0;
  // Review B1: a CSRF-token MELLETT az ujjlenyomat is előre töltődik — a pillanatkép ugyanazzal az azonosítóval megy, mint a végleges
  // beküldés, különben a szerver más kulcson tartaná, és a végleges nem törölné a várakozót.
  useEffect(() => { if (kind === "quiz" && answered > 0) { warmCsrfToken(); void getFingerprint().catch(() => undefined); } }, [kind, answered > 0]);
  useEffect(() => {
    if (kind !== "quiz" || !lessonId) return;
    // Terv R12: pillanatkép CSAK a szerver jelzése mellett — a régi szerver nem ismeri (400), és a 20-as keretét fogyasztaná. Ha még nincs
    // token (vagy a korábbi lekérés elbukott), most kér egyet, és jelzés esetén akkor küld.
    const snapshot = () => {
      if (resultApiReady()) { sendSnapshot(); return; }
      void ensureResultApi().then(capable => { if (capable) sendSnapshot(); });
    };
    const sendSnapshot = () => {
      const current = committed.current;
      const count = answeredCount(current);
      if (current.finishedAt || quizRoundComplete(current) || count === 0 || roundTooOld(roundActivityAt(current), Date.now())) return;
      const roundId = `round-${experienceFingerprint({ ids: current.ids, startedAt: current.startedAt })}`;
      const key = `${storageKey}:${kind}:partial:${roundId}`;
      const state = snapshotState.current;
      try {
        if (localStorage.getItem(`${storageKey}:${kind}:sent:${roundId}`)) return;
        const stored = Number(localStorage.getItem(key)) || 0;
        if (stored > 0 && (state.sent?.roundId !== roundId || state.sent.count < stored)) state.sent = { roundId, count: stored };
      } catch { /* privát mód: a munkamenet állapota marad */ }
      if (!snapshotDue(state, roundId, count)) return;
      const learner = getLearnerToken();
      const fingerprint = peekFingerprint();
      const body = { kind, roundId, partial: true, picks: Object.fromEntries(current.ids.map(id => [id, current.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...(current.startedAt > 0 ? { startedAt: current.startedAt } : {}), ...(current.lastAnsweredAt ? { lastAnsweredAt: current.lastAnsweredAt } : {}), clientNow: Date.now() };
      const mark = { roundId, count };
      state.pending = mark;
      void sendKeepalive(`/api/lessons/${lessonId}/results`, body).then(accepted => {
        if (state.pending === mark) state.pending = null;
        if (!accepted) return; // hálózati hiba / 429 / 5xx: nem rögzül, a következő alkalommal újra megy
        if (state.sent?.roundId !== roundId || state.sent.count < count) state.sent = mark;
        try { localStorage.setItem(key, String(count)); } catch { /* elég a munkamenet állapota */ }
      });
    };
    snapshotRef.current = snapshot;
    const onVisibility = () => { if (document.visibilityState === "hidden") snapshot(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", snapshot);
    // A lebontó ág a lecke ELHAGYÁSAKOR fut (útvonalváltás, „Következő tananyag”, a nézet lebontása): a `committed` ekkor még az
    // elhagyott lecke utolsó megjelenített körét tartja (a lebontó ágak az új állapotot rögzítő effekt előtt futnak).
    return () => { snapshotRef.current = () => {}; document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", snapshot); snapshot(); };
  }, [lessonId, kind, storageKey]);
  // R3: a kör AZONOSSÁGÁNAK (kezdés + kérdések) változásakor a lebontó ág az ELHAGYOTT körről küld pillanatképet — a `committed` ekkor
  // még a lecserélt kört tartja (a lebontó ágak az új állapotot rögzítő effekt előtt futnak). A feltételek ugyanazok, mint háttérbe
  // kerüléskor: lezárt / teljes / üres / régi körről nem megy, és ugyanaz az állapot nem megy kétszer (a lecke elhagyásakor a fenti
  // lebontó ág már elküldte, és a hivatkozást ki is ürítette).
  const roundIdentity = `${round.startedAt}|${round.ids.join(",")}`;
  useEffect(() => () => { snapshotRef.current(); }, [roundIdentity]);
  // Szándékosan a pillanatkép-effekt UTÁN és függőség nélkül: minden megjelenítés után frissül, de a fenti lebontó ág még az előző
  // (elhagyott) állapotot látja.
  useEffect(() => { committed.current = round; });
}

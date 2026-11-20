import { useEffect, useRef, useState } from "react";
import { apiRequest, ensureResultApi, resultApiReady, sendKeepalive, warmCsrfToken } from "@/lib/queryClient";
import { getFingerprint, peekFingerprint } from "@/lib/fingerprintCache";
import { getLearnerToken } from "@/lib/learnerProfile";
import { answeredCount, OUTBOX_MAX_ATTEMPTS, outboxRetryDelayMs, quizRoundComplete, RESULT_OUTBOX_KEY, roundActivityAt, roundTooOld, snapshotDue, type SnapshotState } from "@shared/quiz-round";
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
/**
 * Terv R24 (gépi vak ellenőrzés, 2. célzott kör L1 / L2): a végleges beküldések TARTÓS kimenő sora. A befejezett kör törzse a befejezés
 * pillanatában, várakozás nélkül a böngésző tárolójába kerül (körönként egy bejegyzés); a sort a lecke beküldője és az alkalmazás minden
 * indulása üríti (más nézetből és későbbi megnyitáskor is). A token és az ujjlenyomat a KÜLDÉSKOR kerül a kérésbe (a képesség-jelzés
 * szerint új mezőkkel vagy régi alakkal, R12). Siker (2xx) → jelző + kikerül a sorból; 400 → kikerül (újrapróba nincs); más hiba →
 * laponként legfeljebb OUTBOX_MAX_ATTEMPTS kísérlet, a 429 `Retry-After` idejét megtartva, egyébként növekvő késleltetéssel — azonnali
 * ismétlés (POST-hurok) nincs. Körönként egyszerre egy kérés lehet úton; különböző körök párhuzamosan mehetnek (R20).
 */
type OutboxEntry = { id: string; lessonId: string; kind: "tasks" | "quiz"; body: Record<string, unknown>; flag: string; partialKey: string };
let memoryOutbox: OutboxEntry[] = [];
/** Terv R28 (3. célzott kör L4): a tárolóba NEM írható bejegyzések memóriasora — az ürítő a tárolóból olvasottak mellett ezt is olvassa. */
let unpersistedOutbox: OutboxEntry[] = [];
const isOutboxEntry = (value: unknown): value is OutboxEntry => {
  const e = value as Partial<OutboxEntry> | null;
  return !!e && typeof e.id === "string" && typeof e.lessonId === "string" && (e.kind === "tasks" || e.kind === "quiz") && typeof e.flag === "string" && typeof e.partialKey === "string" && !!e.body && typeof e.body === "object";
};
function readOutbox(): OutboxEntry[] {
  let stored: OutboxEntry[];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RESULT_OUTBOX_KEY) ?? "[]");
    stored = Array.isArray(parsed) ? parsed.filter(isOutboxEntry) : [];
  } catch { stored = memoryOutbox; }
  return [...stored, ...unpersistedOutbox.filter(entry => !stored.some(e => e.id === entry.id))];
}
function writeOutbox(list: OutboxEntry[]): void {
  memoryOutbox = list;
  try {
    if (list.length) localStorage.setItem(RESULT_OUTBOX_KEY, JSON.stringify(list)); else localStorage.removeItem(RESULT_OUTBOX_KEY);
    unpersistedOutbox = [];
  } catch {
    // R28: az írás dobott (pl. kvóta) — a lista memóriában marad, és az ürítő onnan is olvassa (a lapon belül elmegy).
    unpersistedOutbox = list;
  }
}
const removeFromOutbox = (id: string) => writeOutbox(readOutbox().filter(entry => entry.id !== id));
const flagSet = (flag: string) => { try { return !!localStorage.getItem(flag); } catch { return false; } };
/** Kísérletek laponként (memóriában: a kimerült kör a következő oldalbetöltéskor új kísérleteket kap). */
const outboxAttempts = new Map<string, { attempts: number; nextAt: number }>();
const outboxInFlight = new Set<string>();
export function enqueueResult(entry: OutboxEntry): void {
  const list = readOutbox();
  if (!list.some(e => e.id === entry.id)) writeOutbox([...list, entry]);
}
/** A sor ürítése: minden esedékes, nem úton lévő bejegyzés elindul (nem várja meg egymást). */
export function drainResultOutbox(): void {
  const now = Date.now();
  for (const entry of readOutbox()) {
    if (flagSet(entry.flag)) { removeFromOutbox(entry.id); continue; }
    const state = outboxAttempts.get(entry.id);
    if (outboxInFlight.has(entry.id) || (state && (state.attempts >= OUTBOX_MAX_ATTEMPTS || state.nextAt > now))) continue;
    outboxInFlight.add(entry.id);
    void sendOutboxEntry(entry).finally(() => outboxInFlight.delete(entry.id));
  }
}
async function sendOutboxEntry(entry: OutboxEntry): Promise<void> {
  const { lessonId, kind } = entry;
  try {
    // Terv R12: az új mezők CSAK a szerver jelzése mellett mennek; jelzés nélkül a régi alak, egyszer, ismétlés nélkül.
    const capable = await ensureResultApi();
    const fingerprint = entry.body.fingerprint ?? await getFingerprint().catch(() => undefined);
    const full = { ...entry.body, ...(fingerprint ? { fingerprint } : {}), ...(capable ? { clientNow: Date.now() } : {}) };
    const body = capable ? full : (legacyResultBody(full) ?? full);
    // R26 (3. célzott kör L2) + J5: a hálózati / 5xx hibavárakozást CSAK a kimenő sor kezeli (laponként legfeljebb OUTBOX_MAX_ATTEMPTS
    // kísérlet) — az `apiRequest` belső újrapróbája itt 0, különben a kettő szorzódna. R8: a kvíz végleges kérése `keepalive`; a feladatoké
    // nem (a törzsük meghaladhatja a `keepalive` 64 KB-os keretét).
    try {
      if (kind === "quiz") await apiRequest("POST", `/api/lessons/${lessonId}/results`, body, { retries: 0, keepalive: true });
      else await apiRequest("POST", `/api/lessons/${lessonId}/results`, body, { retries: 0 });
    } catch (error) {
      // R10: ha a jelzést adó új példány mellett egy még régi példány 400-at ad, EGY ismétlés a régi alakkal.
      const legacy = legacyResultBody(body);
      if (!capable || (error as { status?: unknown } | null)?.status !== 400 || !legacy) throw error;
      await apiRequest("POST", `/api/lessons/${lessonId}/results`, legacy, { retries: 0, ...(kind === "quiz" ? { keepalive: true } : {}) });
    }
    try {
      localStorage.setItem(entry.flag, "1");
      // A véglegesített körnek nincs több pillanatképe: a „részleges” jelzője nem marad a tárolóban.
      localStorage.removeItem(entry.partialKey);
    } catch { /* elég a szerver egyedi kulcsa */ }
    outboxAttempts.delete(entry.id);
    removeFromOutbox(entry.id);
  } catch (error) {
    const e = error as { status?: unknown; retryAfterSec?: unknown } | null;
    // Érvénytelen kérés: újrapróbának nincs értelme (csendes — a tanuló felülete nem függ a levéltől).
    if (e?.status === 400) { outboxAttempts.delete(entry.id); removeFromOutbox(entry.id); return; }
    const attempts = (outboxAttempts.get(entry.id)?.attempts ?? 0) + 1;
    const delay = outboxRetryDelayMs(attempts, typeof e?.retryAfterSec === "number" ? e.retryAfterSec : undefined);
    outboxAttempts.set(entry.id, { attempts, nextAt: Date.now() + delay });
    if (attempts < OUTBOX_MAX_ATTEMPTS) setTimeout(drainResultOutbox, delay);
  }
}

export function useResultReport(lessonId: string | undefined, kind: "tasks" | "quiz", round: ExperienceRound, storageKey: string, ready = true) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!round.finishedAt || ready) return;
    const timer = setTimeout(() => setTimedOut(true), REPORT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [round.finishedAt, ready]);
  useEffect(() => {
    // Spec 2026-11-17-eredmeny-email-kviz: a helyi kvíz kérdésenként azonnal visszajelez, a lezáró gombot sokan meg sem nyomják — a
    // teljesen megválaszolt kör lezárás nélkül is megy (körönként egyszer: a jelző, a kimenő sor és a szerver egyedi kulcsa).
    const done = !!round.finishedAt || (kind === "quiz" && quizRoundComplete(round));
    if (!lessonId || !done || !(ready || timedOut)) return;
    // S1b (review K1) + R2: az a LE NEM ZÁRT kör, amelynek az UTOLSÓ VÁLASZA 7 napnál régebbi, utólag nem megy el (a lezárt kör a tanuló
    // döntése: az megy). A régen megnyitott, de ma megválaszolt kör megy — a korhatár nem a kvíz-fül első megnyitásához mér.
    if (!round.finishedAt && roundTooOld(roundActivityAt(round), Date.now())) return;
    const roundId = `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
    const flag = `${storageKey}:${kind}:sent:${roundId}`;
    try { if (localStorage.getItem(flag)) return; } catch { /* privát módban a szerver egyedi kulcsa véd */ }
    // Terv R24: a törzs VÁRAKOZÁS NÉLKÜL a kimenő sorba kerül (a token és — ha még nincs meg — az ujjlenyomat a küldéskor jön), így az
    // utolsó válasz utáni azonnali lapelhagyás sem veszíti el: a következő oldalbetöltés kiküldi.
    const fingerprint = peekFingerprint();
    // Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S2): a párosított eszköz tokenje — a szerver ellenőrzi.
    const learner = getLearnerToken();
    const fresh = { ...(round.startedAt > 0 ? { startedAt: round.startedAt } : {}), ...(kind === "quiz" && round.lastAnsweredAt ? { lastAnsweredAt: round.lastAnsweredAt } : {}) };
    const body = kind === "tasks"
      ? { kind, roundId, answers: Object.fromEntries(round.ids.map(id => [id, round.answers[id] ?? ""])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...fresh }
      // Review #280: a kör minden kérdése megy; a kihagyott -1 (nulla pont), különben a levél pontszáma eltérne a képernyőétől.
      : { kind, roundId, picks: Object.fromEntries(round.ids.map(id => [id, round.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...fresh };
    enqueueResult({ id: `${lessonId}|${kind}|${roundId}`, lessonId, kind, body, flag, partialKey: `${storageKey}:${kind}:partial:${roundId}` });
    drainResultOutbox();
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
    // A kör a hívás PILLANATÁBAN rögzül: ha előbb tokent kell kérni, közben a nézet már az új kört mutathatja (kör-csere, R3).
    const snapshot = () => {
      const current = committed.current;
      if (resultApiReady()) { sendSnapshot(current); return; }
      void ensureResultApi().then(capable => { if (capable) sendSnapshot(current); });
    };
    const sendSnapshot = (current: ExperienceRound) => {
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

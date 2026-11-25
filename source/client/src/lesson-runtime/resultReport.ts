import { useEffect, useRef, useState } from "react";
import { noteResultResponse } from "./resultAwaiting";
import { apiRequest, resultPartialReady, warmResultToken } from "@/lib/queryClient";
import { getFingerprint } from "@/lib/fingerprintCache";
import { getLearnerToken } from "@/lib/learnerProfile";
import { attemptDeadline } from "@shared/attempt-deadline";
import { answeredCount, quizRoundComplete, roundActivityAt, roundTooOld, snapshotDue, type SnapshotState } from "@shared/quiz-round";
import { isRetryableRequestError } from "@shared/request-retry";
import { createRoundOwners, isFreshRound, roundHasActivity } from "@shared/round-owner";
import { createOutboxStore, outboxEntryExpired, outboxFailureAction, rejectedKeyOf, type OutboxEntry } from "@shared/result-outbox";
import { resultOutboxEnabled } from "@/lib/resultOutboxFlag";
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
 * Eredmény-e-mail B2 (docs/specs/2026-11-22-eredmeny-email-bontas.md; #510 R26, dokumentált spec-változás a J5-höz képest): az
 * eredmény-POST-nak nincs beágyazott újrapróbája — az `apiRequest` belső újrapróbája 0, az újrapróbát EGYETLEN szint, ez a beküldő
 * végzi. Laponként legfeljebb 3 kérés, csak újrapróbálható hibára (hálózat, időtúllépés, 5xx; a 4xx — a 429 is — nem), azonnali ismétlés
 * nélkül (30 s, majd 60 s). Ami a lapon nem ment át, a következő betöltéskor újra megy (a „már elküldve” jelző csak 2xx után íródik).
 */
export const RESULT_REPORT_ATTEMPTS = 3;
export const RESULT_REPORT_RETRY_DELAYS_MS = [30_000, 60_000] as const;
/** PR #556 review: a kísérletek száma körönként (a „már elküldve” jelző kulcsán), a lap élete alatt — az effekt újrafutása (pl. a kör
 *  lezárása, új `round` érték) nem nyit új keretet. */
const pageAttempts = new Map<string, number>();
/**
 * B4b (#510 R47, R49 b, R50): a kör párosítási kiléte az első tevékenységkor rögzül (`…:owner:<kör>`, a token lenyomata); a beküldés minden
 * kísérlete előtt a mostani token ehhez vetődik. Írhatatlan tárolónál memóriában.
 */
const roundOwners = createRoundOwners(() => { try { return localStorage; } catch { return null; } }, getLearnerToken);
/** PR #574 review: a sikeres küldés jelzője memóriában is (ha a tároló írása hibázik, ugyanaz a kör nem kötődik újra és nem megy újra). */
const sentInMemory = new Set<string>();
const ownerKeyOf = (storageKey: string, kind: string, roundId: string) => `${storageKey}:${kind}:owner:${roundId}`;
/** B5b (#510 R44): a pillanatkép-kérés kísérletenkénti határideje — utána ugyanaz az állapot újra elküldhető. */
export const SNAPSHOT_POST_TIMEOUT_MS = 15_000;

/**
 * B7 (docs/specs/2026-11-25-eredmeny-email-b7.md; #510 R24, R28, R30, R32, R40): a végleges beküldések TARTÓS kimenő sora, kapcsoló
 * mögött (alapból KI). BE állásban a kész kör törzse várakozás nélkül a sorba kerül; a sort a beküldő, az alkalmazás indulása és az
 * `online` esemény üríti. Siker → jelző + kikerül; 400 / nem újrapróbálható 4xx (a 429 kivételével) → kikerül; újrapróbálható hiba →
 * marad (laponként legfeljebb RESULT_REPORT_ATTEMPTS kísérlet, 30 s / 60 s várakozással; a következő ürítés folytatja).
 */
const outbox = createOutboxStore(() => (resultOutboxEnabled() ? localStorage : null));
const outboxAttempts = new Map<string, { attempts: number; nextAt: number }>();
const outboxInFlight = new Set<string>();
const flagSet = (flag: string) => { if (sentInMemory.has(flag)) return true; try { return !!localStorage.getItem(flag); } catch { return false; } };
/** Review #608: a véglegesen elutasított körök (memóriában is, ha a tároló írása hibázik). */
const rejectedInMemory = new Set<string>();
const isRejected = (flag: string) => { if (rejectedInMemory.has(flag)) return true; try { return !!localStorage.getItem(rejectedKeyOf(flag)); } catch { return false; } };
const markRejected = (flag: string) => { rejectedInMemory.add(flag); try { localStorage.setItem(rejectedKeyOf(flag), "1"); } catch { /* a memóriabeli jelző véd a lapon */ } };
class OutboxEntryExpired extends Error {}
/** A sor ürítése: minden esedékes, nem úton lévő bejegyzés elindul (nem várják egymást, R20). Sosem dob. */
export function drainResultOutbox(): void {
  const now = Date.now();
  for (const entry of outbox.read()) {
    if (flagSet(entry.flag) || isRejected(entry.flag)) { outbox.remove(entry.id); continue; }
    // R30: a 7 napnál régebbi tevékenységű bejegyzés küldés nélkül kikerül.
    if (outboxEntryExpired(entry, now)) { outbox.remove(entry.id); continue; }
    const state = outboxAttempts.get(entry.id);
    if (outboxInFlight.has(entry.id) || (state && (state.attempts >= RESULT_REPORT_ATTEMPTS || state.nextAt > now))) continue;
    outboxInFlight.add(entry.id);
    void sendOutboxEntry(entry).finally(() => outboxInFlight.delete(entry.id));
  }
}
async function sendOutboxEntry(entry: OutboxEntry): Promise<void> {
  try {
    const fingerprint = await getFingerprint().catch(() => undefined);
    // R40: a korhatár a tényleges kérés előtt is (a token / ujjlenyomat várakozása alatt lejárt bejegyzés nem megy ki). B4b: a mostani
    // token csak a rögzített párosítással egyezve (kötés BE); a törzs minden tényleges kérés előtt épül.
    const body = ({ ownerBinding }: { ownerBinding: boolean }) => {
      if (outboxEntryExpired(entry, Date.now())) throw new OutboxEntryExpired();
      const learner = ownerBinding ? roundOwners.learnerFor(entry.owner) : getLearnerToken() ?? undefined;
      return { ...entry.body, ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}) };
    };
    const response = await apiRequest("POST", `/api/lessons/${entry.lessonId}/results`, body, { resultTimes: entry.times, retries: 0, keepalive: entry.kind === "quiz" });
    noteResultResponse(entry.lessonId, response);
    sentInMemory.add(entry.flag);
    try { localStorage.setItem(entry.flag, "1"); } catch { /* a memóriabeli jelző + a szerver egyedi kulcsa véd */ }
    try { localStorage.removeItem(entry.partialKey); } catch { /* nincs mit törölni */ }
    roundOwners.clear(entry.ownerKey);
    outboxAttempts.delete(entry.id);
    outbox.remove(entry.id);
  } catch (error) {
    // R30: a lejárt bejegyzés küldés nélkül kikerül. Review #608: végleges elutasítás csak ismert, végleges HTTP-4xx-nél — akkor a kör
    // elutasítás-jelzőt kap (újranyitáskor sem kerül újra sorba); minden más (besorolhatatlan hiba is) korlátos újrapróbán marad.
    if (error instanceof OutboxEntryExpired) { outboxAttempts.delete(entry.id); outbox.remove(entry.id); return; }
    if (outboxFailureAction(error) === "reject") { markRejected(entry.flag); outboxAttempts.delete(entry.id); outbox.remove(entry.id); return; }
    const attempts = (outboxAttempts.get(entry.id)?.attempts ?? 0) + 1;
    const delay = RESULT_REPORT_RETRY_DELAYS_MS[Math.min(attempts, RESULT_REPORT_RETRY_DELAYS_MS.length) - 1];
    outboxAttempts.set(entry.id, { attempts, nextAt: Date.now() + delay });
    if (attempts < RESULT_REPORT_ATTEMPTS) setTimeout(drainResultOutbox, delay);
  }
}
export function useResultReport(lessonId: string | undefined, kind: "tasks" | "quiz", round: ExperienceRound, storageKey: string, ready = true) {
  /** R20 (B5b): a végleges beküldés „úton van” őre KÖRÖNKÉNT (a „már elküldve” jelző kulcsán) — az előző kör függő beküldése mellett az
   *  új, teljes kör is elmegy. */
  const sending = useRef(new Set<string>());
  /**
   * R50: azok a körök (kérdéssor szerint), amelyeket EBBEN a dokumentumban még el NEM KEZDETT állapotban (`startedAt === 0`, tevékenység
   * nélkül) láttunk — a visszatöltött, korábban megkezdett, majd kiürített kör nem kerül ide (PR #574 review).
   */
  const seenFresh = useRef(new Set<string>());
  useEffect(() => {
    const fresh = experienceFingerprint({ ids: round.ids });
    if (isFreshRound(kind, round)) { seenFresh.current.add(fresh); return; }
    if (!roundHasActivity(kind, round)) return;
    const roundId = `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
    // L5: a már elküldött körhöz (újratöltéskor) nem keletkezik kilét-rekord.
    const sentFlag = `${storageKey}:${kind}:sent:${roundId}`;
    if (sentInMemory.has(sentFlag)) return;
    try { if (localStorage.getItem(sentFlag)) return; } catch { /* privát mód: memóriában rögzül */ }
    roundOwners.bind(ownerKeyOf(storageKey, kind, roundId), seenFresh.current.has(fresh));
  }, [kind, round, storageKey]);
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
    if (!lessonId || !done || !(ready || timedOut)) return;
    // B1b (R2): az a LE NEM ZÁRT kör, amelynek az UTOLSÓ VÁLASZA 7 napnál régebbi, utólag nem megy el (a lezárt kör a tanuló döntése: az
    // megy). A régen megnyitott, de ma megválaszolt kör megy — a korhatár nem a kvíz-fül első megnyitásához mér.
    if (!round.finishedAt && roundTooOld(roundActivityAt(round), Date.now())) return;
    const roundId = `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
    const flag = `${storageKey}:${kind}:sent:${roundId}`;
    if (sentInMemory.has(flag) || sending.current.has(flag)) return;
    try { if (localStorage.getItem(flag)) return; } catch { /* privát módban a szerver egyedi kulcsa véd */ }
    if ((pageAttempts.get(flag) ?? 0) >= RESULT_REPORT_ATTEMPTS) return;
    // R47: legkésőbb a lezáráskor rögzül (ha a tevékenység-effekt még nem futott le).
    const ownerKey = ownerKeyOf(storageKey, kind, roundId);
    const owner = roundOwners.bind(ownerKey, seenFresh.current.has(experienceFingerprint({ ids: round.ids })));
    if (resultOutboxEnabled()) {
      // Review #608: a véglegesen elutasított kör újra nem kerül sorba (a lecke újranyitásakor sem).
      if (isRejected(flag)) return;
      // B7 (R24): BE állásban a kör törzse várakozás nélkül a tartós sorba kerül, és a sor azonnal ürül (a küldést a sor végzi).
      const times = { ...(round.startedAt > 0 ? { startedAt: round.startedAt } : {}), ...(kind === "quiz" && round.lastAnsweredAt ? { lastAnsweredAt: round.lastAnsweredAt } : {}) };
      const body = kind === "tasks"
        ? { kind, roundId, answers: Object.fromEntries(round.ids.map(id => [id, round.answers[id] ?? ""])) }
        : { kind, roundId, picks: Object.fromEntries(round.ids.map(id => [id, round.picks[id] ?? -1])) };
      // R30: lezárt körnél a sorba kerülés ideje, le nem zártnál a kör utolsó tevékenysége.
      const activityAt = round.finishedAt ? Date.now() : roundActivityAt(round) || Date.now();
      outbox.add({ id: `${lessonId}|${flag}`, lessonId, kind, body, times, flag, partialKey: `${storageKey}:${kind}:partial:${roundId}`, ownerKey, owner, activityAt });
      drainResultOutbox();
      return;
    }
    sending.current.add(flag);
    void (async () => {
      try {
        const fingerprint = await getFingerprint().catch(() => undefined);
        // B1b: a kör kezdete és (kvíznél) az utolsó válasz ideje — a szerver (B1a, #532) opcionális mezőként fogadja, a levél dátumsorához.
        const times = { ...(round.startedAt > 0 ? { startedAt: round.startedAt } : {}), ...(kind === "quiz" && round.lastAnsweredAt ? { lastAnsweredAt: round.lastAnsweredAt } : {}) };
        // Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S2): a párosított eszköz tokenje — a szerver ellenőrzi. B4b (R47, R49 b):
        // ha a szerver hirdeti a kilét-kötést (`resultOwnerBinding`, a B4 kapcsolója), csak a kör rögzített párosításával egyező mostani token
        // megy; különben a főági viselkedés (a mostani token). A törzs MINDEN tényleges kérés előtt épül (a CSRF-várakozás és a 400 / 403
        // utáni belső ismétlés után is — PR #574 review), így a várakozás alatti újrapárosítás sem öröklődik.
        const learnerNow = ({ ownerBinding }: { ownerBinding: boolean }) => (ownerBinding ? roundOwners.learnerFor(owner) : getLearnerToken() ?? undefined);
        const bodyFor = (learner: string | undefined) => kind === "tasks"
          ? { kind, roundId, answers: Object.fromEntries(round.ids.map(id => [id, round.answers[id] ?? ""])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}) }
          // Review #280: a kör minden kérdése megy; a kihagyott -1 (nulla pont), különben a levél pontszáma eltérne a képernyőétől.
          : { kind, roundId, picks: Object.fromEntries(round.ids.map(id => [id, round.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}) };
        // J5 (spec 2026-11-10-gyartas-meres) + B2 (#510 R26): ingadozó mobilhálózaton az eredmény ne vesszen el — hálózati hibánál,
        // időtúllépésnél és 5xx-nél újrapróba, de egyetlen szinten (lásd RESULT_REPORT_ATTEMPTS). Biztonságos: a szerver a kört egyedi
        // kulccsal egyszer rögzíti. B2 (#510 R8): a kvíz végleges kérése `keepalive` (az utolsó válasz utáni lapbezárás nem szakítja meg);
        // a feladatoké nem, mert a törzsük meghaladhatja a `keepalive` 64 KB-os keretét.
        for (;;) {
          const attempt = (pageAttempts.get(flag) ?? 0) + 1;
          pageAttempts.set(flag, attempt);
          try {
            const response = await apiRequest("POST", `/api/lessons/${lessonId}/results`, (ctx: { ownerBinding: boolean }) => bodyFor(learnerNow(ctx)), { resultTimes: times, retries: 0, keepalive: kind === "quiz" });
            // U4d: az összevont levél várakozó része (`awaiting`) a figyelmeztetéshez; anélküli válasz törli.
            noteResultResponse(lessonId, response);
            break;
          } catch (error) {
            if (attempt >= RESULT_REPORT_ATTEMPTS || !isRetryableRequestError(error)) throw error;
            await new Promise(resolve => setTimeout(resolve, RESULT_REPORT_RETRY_DELAYS_MS[attempt - 1]));
            // PR #556 review (B1b R2): a korhatár minden kísérlet előtt újra — a várakozás alatt (pl. felfüggesztett gépen) elavult, le nem
            // zárt kör nem megy el; a lezárt és a válaszidő nélküli régi kör kivétele (roundActivityAt) változatlan.
            if (!round.finishedAt && roundTooOld(roundActivityAt(round), Date.now())) return;
          }
        }
        sentInMemory.add(flag);
        try { localStorage.setItem(flag, "1"); } catch { /* a memóriabeli jelző + a szerver egyedi kulcsa véd */ }
        // B5b (R8 takarítás): a végleges siker után a kör pillanatkép-jelzője törlődik.
        try { localStorage.removeItem(`${storageKey}:${kind}:partial:${roundId}`); } catch { /* nincs mit törölni */ }
        roundOwners.clear(ownerKey);
      } catch { /* csendes: a tanuló felülete nem függ a levéltől */ }
      finally { sending.current.delete(flag); }
    })();
  }, [lessonId, kind, round, storageKey, ready, timedOut]);

  // B5b (docs/specs/2026-11-25-eredmeny-email-b5b.md; forrás: #510 `389ea8c3`): a FÉLBEHAGYOTT helyi kvíz pillanatképe (`partial: true`)
  // a lap háttérbe kerülésekor / elhagyásakor, a nézet lebontásakor és a kör nézeten belüli cseréjekor (R3) — csak a szerver
  // `resultPartial` jelzése mellett. A szerver csak akkor küld „félbehagyva” levelet, ha utána sem újabb pillanatkép, sem végleges
  // beküldés nem érkezik. „Elfogadva” csak 2xx után rögzül; a sikertelen / határidőn túli kísérlet újrapróbálható (R44).
  const committed = useRef(round);
  const snapshotRef = useRef<() => void>(() => {});
  const snapshotState = useRef<SnapshotState>({ sent: null, pending: null });
  const hasAnswer = kind === "quiz" && answeredCount(round) > 0;
  // A token és az ujjlenyomat az első válasznál betöltődik: a lap elhagyásakor már nincs mire várni (a pillanatkép ugyanazzal az
  // azonosítóval megy, mint a végleges beküldés, így a végleges törli a várakozót).
  useEffect(() => { if (hasAnswer) { warmResultToken(); void getFingerprint().catch(() => undefined); } }, [hasAnswer]);
  useEffect(() => {
    if (kind !== "quiz" || !lessonId) return;
    // A kör a hívás PILLANATÁBAN rögzül (kör-csere alatt a nézet már az újat mutathatja, R3).
    const snapshot = () => {
      const current = committed.current;
      void resultPartialReady().then(capable => { if (capable) sendSnapshot(current); });
    };
    const sendSnapshot = (current: ExperienceRound) => {
      const count = answeredCount(current);
      if (current.finishedAt || quizRoundComplete(current) || count === 0 || roundTooOld(roundActivityAt(current), Date.now())) return;
      const roundId = `round-${experienceFingerprint({ ids: current.ids, startedAt: current.startedAt })}`;
      const sentFlag = `${storageKey}:${kind}:sent:${roundId}`;
      const key = `${storageKey}:${kind}:partial:${roundId}`;
      const state = snapshotState.current;
      if (sentInMemory.has(sentFlag)) return;
      try {
        if (localStorage.getItem(sentFlag)) return;
        const stored = Number(localStorage.getItem(key)) || 0;
        if (stored > 0 && (state.sent?.roundId !== roundId || state.sent.count < stored)) state.sent = { roundId, count: stored };
      } catch { /* privát mód: a munkamenet állapota marad */ }
      if (!snapshotDue(state, roundId, count)) return;
      // R47 (B4b): a kör rögzített kiléte — a párosítás csak egyezésnél (kötés BE), különben a mostani token.
      const owner = roundOwners.bind(ownerKeyOf(storageKey, kind, roundId), seenFresh.current.has(experienceFingerprint({ ids: current.ids })));
      const mark = { roundId, count };
      state.pending = mark;
      // Review #602: a határidő a TELJES kísérletre szól (az ujjlenyomat előkészítésétől) — lejáratkor a kísérlet saját függő jelzője
      // felszabadul, és késői beküldés nem indul.
      const deadline = attemptDeadline(SNAPSHOT_POST_TIMEOUT_MS);
      const release = setTimeout(() => { if (state.pending === mark) state.pending = null; }, SNAPSHOT_POST_TIMEOUT_MS);
      void (async () => {
        let accepted = false;
        try {
          const fingerprint = await deadline.within(getFingerprint().catch(() => undefined));
          const left = deadline.left();
          if (left <= 0) return;
          const learnerNow = ({ ownerBinding }: { ownerBinding: boolean }) => (ownerBinding ? roundOwners.learnerFor(owner) : getLearnerToken() ?? undefined);
          const body = (ctx: { ownerBinding: boolean }) => {
            const learner = learnerNow(ctx);
            return { kind, roundId, partial: true, picks: Object.fromEntries(current.ids.map(id => [id, current.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...(current.startedAt > 0 ? { startedAt: current.startedAt } : {}), ...(current.lastAnsweredAt ? { lastAnsweredAt: current.lastAnsweredAt } : {}) };
          };
          await apiRequest("POST", `/api/lessons/${lessonId}/results`, body, { retries: 0, keepalive: true, timeout: left });
          accepted = true;
        } catch { /* hálózati hiba / 429 / 5xx / határidő: nem rögzül, a következő alkalommal újra megy */ }
        finally { clearTimeout(release); if (state.pending === mark) state.pending = null; }
        if (!accepted) return;
        if (state.sent?.roundId !== roundId || state.sent.count < count) state.sent = mark;
        // A közben véglegesített kör késői 202-je nem írja vissza a jelzőt; körönként a legnagyobb elfogadott érték marad.
        try { if (!localStorage.getItem(sentFlag) && count > (Number(localStorage.getItem(key)) || 0)) localStorage.setItem(key, String(count)); } catch { /* elég a munkamenet állapota */ }
      })();
    };
    snapshotRef.current = snapshot;
    const onVisibility = () => { if (document.visibilityState === "hidden") snapshot(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", snapshot);
    // A lebontó ág a lecke ELHAGYÁSAKOR fut: a `committed` ekkor még az elhagyott lecke utolsó megjelenített körét tartja.
    return () => { snapshotRef.current = () => {}; document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", snapshot); snapshot(); };
  }, [lessonId, kind, storageKey]);
  // R3: a kör AZONOSSÁGÁNAK változásakor a lebontó ág az ELHAGYOTT körről küld (a `committed` ekkor még a lecserélt kör).
  const roundIdentity = `${round.startedAt}|${round.ids.join(",")}`;
  useEffect(() => () => { snapshotRef.current(); }, [roundIdentity]);
  // Szándékosan a pillanatkép-effekt UTÁN és függőség nélkül: minden megjelenítés után frissül, a lebontó ág még az előzőt látja.
  useEffect(() => { committed.current = round; });
}

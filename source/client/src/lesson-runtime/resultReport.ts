import { useEffect, useRef, useState } from "react";
import { apiRequest, ensureResultApi, resultApiReady, resultSubject, sendKeepalive, warmCsrfToken, type CsrfTokenInfo } from "@/lib/queryClient";
import { getFingerprint, peekFingerprint } from "@/lib/fingerprintCache";
import { getLearnerToken } from "@/lib/learnerProfile";
import { answeredCount, OUTBOX_MAX_ATTEMPTS, outboxRetryDelayMs, quizRoundComplete, roundActivityAt, roundTooOld, snapshotDue, type SnapshotState } from "@shared/quiz-round";
import { createOutboxStore, outboxEntryExpired, type OutboxEntry } from "@shared/result-outbox";
import { legacyResultBody } from "@shared/result-compat";
import { resultOutboxEnabled } from "@/lib/resultOutboxFlag";
import { experienceFingerprint, roundIdOf, type ExperienceRound } from "./useExperienceRound";

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
// Terv R28 / R30 / R32: a tárolóréteg (`shared/result-outbox.ts`) — bejegyzésenkénti kulcs (fülbiztos), memóriasor írhatatlan tárolónál,
// korhatár. A `localStorage` hozzáférése is dobhat (privát mód): ekkor csak a memóriasor él.
// Tulajdonosi döntés (2026-11-21, „Szűkítés: tartós sor külön”): a tartós sor kapcsoló mögött, alapból KI — ilyenkor a tároló nem
// érhető el a sor számára, a bejegyzés csak memóriában él (lapon belüli újrapróba), a `localStorage`-ba nem kerül.
const outbox = createOutboxStore(() => (resultOutboxEnabled() ? localStorage : null));
const flagSet = (flag: string) => { try { return !!localStorage.getItem(flag); } catch { return false; } };
/**
 * Terv R47 (9. vak kör L1–L2; tervezési szabály): a kör KILÉTE a kör első tevékenységekor (első válasz / kitöltés, legkésőbb a lezáráskor)
 * RÖGZÜL, és onnantól nem változik — a küldéskor (és a sorban várakozás alatt) sem pótolható vagy cserélhető a mostani munkamenetből:
 * - fiók: a gyorsítótárazott tokenválasz álnevesített címkéje (`resultSubject`) — ha akkor nem ismert, `null`, és a kérés `?`-lel
 *   (fiók nélküliként) megy;
 * - párosítás: a párosító token LENYOMATA (nem maga a titok) — küldéskor a mostani párosító token csak akkor megy, ha a lenyomata egyezik
 *   a rögzítettel; eltérésnél (újrapárosítás) a kérés párosítás nélkül megy, az új tanulónak nem tulajdonítható.
 * A rekord körönként a böngésző tárolójában (`…:owner:<kör>`) áll, írhatatlan tárolónál memóriában; a végleges siker után törlődik.
 */
type RoundOwner = { subject: string | null; learnerTag: string | null };
const owners = new Map<string, RoundOwner>();
const learnerTagOf = (token: string | null) => (token ? experienceFingerprint({ learner: token }) : null);
function readOwner(key: string): RoundOwner | null {
  const known = owners.get(key);
  if (known) return known;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<RoundOwner> | null;
    if (parsed && (parsed.subject === null || typeof parsed.subject === "string") && (parsed.learnerTag === null || typeof parsed.learnerTag === "string")) {
      const owner = { subject: parsed.subject, learnerTag: parsed.learnerTag };
      owners.set(key, owner);
      return owner;
    }
  } catch { /* olvashatatlan tároló: nincs tárolt rekord */ }
  return null;
}
/**
 * R47: a kör kilétének rögzítése (csak ha még nincs rögzítve); a rögzített rekordot adja — a kilét EGYETLEN keletkezési pontja a kliensen.
 * R50 (kilét-osztály leltár): a mostani kilét csak akkor rögzíthető, ha a kör első tevékenysége bizonyíthatóan EBBEN a dokumentumban
 * történt (`firstActivityHere`: a kört itt még tevékenység nélkül láttuk). Rekord nélkül helyreállított, már megkezdett kör (korábbi
 * kódverzió, privát módú újratöltés) kiléte nem igazolható: ismeretlenként rögzül (`?`, párosítás nélkül).
 */
export function bindRoundOwner(key: string, firstActivityHere: boolean): RoundOwner {
  const existing = readOwner(key);
  if (existing) return existing;
  const owner: RoundOwner = firstActivityHere ? { subject: resultSubject(), learnerTag: learnerTagOf(getLearnerToken()) } : { subject: null, learnerTag: null };
  owners.set(key, owner);
  try { localStorage.setItem(key, JSON.stringify(owner)); } catch { /* a memóriabeli rekord marad */ }
  return owner;
}
/** R47: a mostani párosító token, ha a kör rögzített párosításával egyezik — különben nincs párosítás. */
function ownerLearner(owner: Pick<RoundOwner, "learnerTag">): string | undefined {
  const token = getLearnerToken();
  return token && owner.learnerTag !== null && learnerTagOf(token) === owner.learnerTag ? token : undefined;
}
const ownerKeyOf = (storageKey: string, kind: string, roundId: string) => `${storageKey}:${kind}:owner:${roundId}`;
/**
 * Terv R51 (tulajdonosi döntés 2026-11-22, „Szerver rögzíti a kilétet”): a kör ELSŐ tevékenységekor a kliens kilét-rögzítő kérést küld; a
 * SZERVER a saját munkamenetéből (fiók) és a párosító token általa ellenőrzött állapotából rögzíti a kör kilétét, és minden későbbi
 * beküldést ehhez vet össze. A kliens fiókcímkéje nem megy (nem dönt kilétet). Körönként egyszer dokumentumonként; sikertelenségnél a
 * szerver az első beérkező kérésnél rögzít. Régi (jelzés nélküli) szervernek nem megy.
 */
const claimedHere = new Set<string>();
function claimRound(lessonId: string, kind: "tasks" | "quiz", roundId: string, owner: RoundOwner): void {
  const id = `${lessonId}|${kind}|${roundId}`;
  if (claimedHere.has(id)) return;
  claimedHere.add(id);
  void ensureResultApi().then(capable => {
    if (!capable) return;
    const learner = ownerLearner(owner);
    const fingerprint = peekFingerprint();
    return apiRequest("POST", `/api/lessons/${lessonId}/results/claim`, { kind, roundId, claim: true, ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}) }, { retries: 0 });
  }).catch(() => { /* csendes: a szerver az első beérkező kérésnél rögzít */ });
}
/**
 * Kísérletek laponként (memóriában: a kimerült kör a következő oldalbetöltéskor új kísérleteket kap). Terv R54 (12. vak kör L2): a
 * dokumentumon belüli esedékesség MONOTON órával mér (`performance.now()`), így a falióra visszaugrása nem tolja el; az ébresztő időzítő
 * nyilvántartott — ha az ürítő az esedékesség előtt fut, újraélesíti (élő, várakozó bejegyzés nem marad ébresztő nélkül). A 7 napos
 * adatlejárat (R30) külön, faliórás.
 */
const monotonicNow = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
const outboxAttempts = new Map<string, { attempts: number; nextAt: number; wake?: ReturnType<typeof setTimeout> }>();
function armOutboxWake(id: string, delayMs: number): void {
  const state = outboxAttempts.get(id);
  if (!state) return;
  if (state.wake !== undefined) clearTimeout(state.wake);
  state.wake = setTimeout(() => { state.wake = undefined; drainResultOutbox(); }, Math.max(0, delayMs));
}
const outboxInFlight = new Set<string>();
export function enqueueResult(entry: OutboxEntry): void {
  // R47 (felülírja az R31 utólagos pótlását, az R35-öt és az R43-at): a bejegyzés a LÉTREHOZÁSAKOR rögzített kilétet viszi; a már
  // sorban álló (korábbi dokumentumból megmaradt) bejegyzés nem kerül be újra, a kilétét semmi nem írja át.
  outbox.add(entry);
}
/** A sor ürítése: minden esedékes, nem úton lévő bejegyzés elindul (nem várja meg egymást). */
export function drainResultOutbox(): void {
  const now = Date.now();
  const mono = monotonicNow();
  for (const entry of outbox.read()) {
    if (flagSet(entry.flag)) { outbox.remove(entry.id); continue; }
    // R30 (review 4642268402): a 7 napnál régebbi tevékenységű bejegyzés küldés nélkül kikerül (a le nem zárt, régi kör nem megy el).
    if (outboxEntryExpired(entry, now)) { outbox.remove(entry.id); continue; }
    const state = outboxAttempts.get(entry.id);
    if (outboxInFlight.has(entry.id) || (state && state.attempts >= OUTBOX_MAX_ATTEMPTS)) continue;
    // R54: még nem esedékes (monoton óra) — ha nincs élő ébresztője, újraélesítjük, és várunk.
    if (state && state.nextAt > mono) { if (state.wake === undefined) armOutboxWake(entry.id, state.nextAt - mono); continue; }
    outboxInFlight.add(entry.id);
    void sendOutboxEntry(entry).finally(() => outboxInFlight.delete(entry.id));
  }
}
/** Terv R40 (7. vak kör L2): a bejegyzés a küldés pillanatában (a token megérkezése után) lejárt — küldés nélkül kikerül. */
class OutboxEntryExpired extends Error {}
/**
 * Terv R49 (10. vak kör L1): a bejegyzés nem mehet olyan úton, ahol a szerver a rögzítettől eltérő kilétet rendelhet hozzá. A régi (címkét
 * nem ismerő) alak csak akkor mehet, ha a kör rögzített fiókcímkéje nincs (`null`), vagy a küldés tokenválasza igazolja, hogy ugyanaz a
 * munkamenet; különben a bejegyzés VÁR (memóriában, a sor szokott kísérletszámáig, majd a lejáratig) — nem megy el.
 */
class OutboxIdentityHold extends Error {}
async function sendOutboxEntry(entry: OutboxEntry): Promise<void> {
  const { lessonId, kind } = entry;
  try {
    const fingerprint = entry.body.fingerprint ?? await getFingerprint().catch(() => undefined);
    // Terv R39 (7. vak kör L1): a törzs a token MEGÉRKEZÉSE UTÁN, ugyanabból a tokenválaszból áll össze, amelynek tokenjével a kérés megy
    // (a 403 utáni tokenfrissítéskor is újra, az eredeti bejegyzés címkéjével). Ha a token nem kérhető le (átmeneti hiba), a képesség
    // ismeretlen: a kérés NEM megy el régi alakban — a hiba a sor szokott várakozását kapja (lent), és később próbálkozik.
    let sent: { capable: boolean; body: Record<string, unknown> } | null = null;
    const build = (info: CsrfTokenInfo): Record<string, unknown> => {
      // R40: a korhatár a tényleges küldés előtt is (a token / ujjlenyomat várakozása alatt lejárt bejegyzés nem megy ki).
      if (outboxEntryExpired(entry, Date.now())) throw new OutboxEntryExpired();
      // Terv R12: az új mezők CSAK a szerver jelzése mellett mennek; jelzés nélkül a régi alak, egyszer, ismétlés nélkül.
      const capable = info.resultApi;
      // R31 + R47: a bejegyzés a létrehozásakor rögzített kilétet viszi — a címke a kérésbe kerül (ismeretlen: `?`, soha nem egyezik, a
      // kérés fiók nélküliként fut), és a szerver eltérésnél a mostani munkamenet fiókját nem használja. Utólagos pótlás nincs.
      const subject = entry.subject ?? null;
      // R49 (b): a párosító token közvetlenül a kérés előtt (a 403 utáni ismétlésnél is) vetődik össze a rögzített lenyomattal.
      const stored: Record<string, unknown> = { ...entry.body };
      delete stored.learner; // korábbi (tartós) bejegyzés nyers tokenje sem megy vakon
      const learner = ownerLearner({ learnerTag: entry.learnerTag ?? null });
      const full = { ...stored, ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}), ...(capable ? { clientNow: Date.now(), subject: subject ?? "?" } : {}) };
      if (!capable && !legacyAllowed(info)) throw new OutboxIdentityHold();
      const body = capable ? full : (legacyResultBody(full) ?? full);
      sent = { capable, body };
      return body;
    };
    // R49 (a): régi alak csak rögzített fiók nélkül, vagy a mostani tokenválasz által igazolt azonos munkamenettel.
    const legacyAllowed = (info: CsrfTokenInfo) => entry.subject == null || (info.resultApi && info.subject !== null && info.subject === entry.subject);
    // R26 (3. célzott kör L2) + J5: a hálózati / 5xx hibavárakozást CSAK a kimenő sor kezeli (laponként legfeljebb OUTBOX_MAX_ATTEMPTS
    // kísérlet) — az `apiRequest` belső újrapróbája itt 0, különben a kettő szorzódna. R8: a kvíz végleges kérése `keepalive`; a feladatoké
    // nem (a törzsük meghaladhatja a `keepalive` 64 KB-os keretét).
    const url = `/api/lessons/${lessonId}/results`;
    try {
      if (kind === "quiz") await apiRequest("POST", url, undefined, { retries: 0, keepalive: true, prepare: build });
      else await apiRequest("POST", url, undefined, { retries: 0, prepare: build });
    } catch (error) {
      // R10: ha a jelzést adó új példány mellett egy még régi példány 400-at ad, EGY ismétlés a régi alakkal.
      const last = sent as { capable: boolean; body: Record<string, unknown> } | null;
      if (!last?.capable || (error as { status?: unknown } | null)?.status !== 400 || !legacyResultBody(last.body)) throw error;
      const legacy = (info: CsrfTokenInfo) => {
        const body = build(info);
        if (!legacyAllowed(info)) throw new OutboxIdentityHold();
        return legacyResultBody(body) ?? body;
      };
      await apiRequest("POST", url, undefined, { retries: 0, prepare: legacy, ...(kind === "quiz" ? { keepalive: true } : {}) });
    }
    try {
      localStorage.setItem(entry.flag, "1");
      // A véglegesített körnek nincs több pillanatképe: a „részleges” jelzője nem marad a tárolóban.
      localStorage.removeItem(entry.partialKey);
      // R47: a kör kilét-rekordja sem marad meg a véglegesítés után.
      localStorage.removeItem(entry.partialKey.replace(":partial:", ":owner:"));
    } catch { /* elég a szerver egyedi kulcsa */ }
    owners.delete(entry.partialKey.replace(":partial:", ":owner:"));
    outboxAttempts.delete(entry.id);
    outbox.remove(entry.id);
  } catch (error) {
    const e = error as { status?: unknown; retryAfterSec?: unknown } | null;
    // Érvénytelen kérés — vagy (R40) a küldés pillanatában lejárt bejegyzés: újrapróbának nincs értelme (csendes — a tanuló felülete nem
    // függ a levéltől).
    if (e?.status === 400 || error instanceof OutboxEntryExpired) { outboxAttempts.delete(entry.id); outbox.remove(entry.id); return; }
    const attempts = (outboxAttempts.get(entry.id)?.attempts ?? 0) + 1;
    const delay = outboxRetryDelayMs(attempts, typeof e?.retryAfterSec === "number" ? e.retryAfterSec : undefined);
    const previous = outboxAttempts.get(entry.id)?.wake;
    if (previous !== undefined) clearTimeout(previous);
    outboxAttempts.set(entry.id, { attempts, nextAt: monotonicNow() + delay });
    if (attempts < OUTBOX_MAX_ATTEMPTS) armOutboxWake(entry.id, delay);
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
  // R47: a kör kiléte a kör ELSŐ tevékenységekor rögzül (a beküldő effekt ELŐTT fut, így a lezáráskor legkésőbb rögzül). A CSRF-token a
  // lecke megnyitásakor előre töltődik, hogy a fiók címkéje az első válasznál már ismert legyen.
  useEffect(() => { if (lessonId) warmCsrfToken(); }, [lessonId]);
  const ownedRoundId = roundIdOf(round);
  const roundActive = !!round.finishedAt || (kind === "quiz" ? answeredCount(round) > 0 : Object.values(round.answers).some(answer => answer.trim() !== ""));
  // R50: azok a körök, amelyeket ebben a dokumentumban még tevékenység nélkül láttunk (csak ezek kaphatják a mostani kilétet).
  const seenFresh = useRef(new Set<string>());
  if (!roundActive) seenFresh.current.add(ownedRoundId);
  useEffect(() => {
    if (!lessonId || !roundActive) return;
    // R51 / L5: a már elküldött körhöz nem keletkezik kilét-rekord és kilét-rögzítés (újratöltéskor sem).
    try { if (localStorage.getItem(`${storageKey}:${kind}:sent:${ownedRoundId}`)) return; } catch { /* privát mód: a szerver egyedi kulcsa véd */ }
    const owner = bindRoundOwner(ownerKeyOf(storageKey, kind, ownedRoundId), seenFresh.current.has(ownedRoundId));
    claimRound(lessonId, kind, ownedRoundId, owner);
  }, [lessonId, kind, storageKey, ownedRoundId, roundActive]);
  useEffect(() => {
    // Spec 2026-11-17-eredmeny-email-kviz: a helyi kvíz kérdésenként azonnal visszajelez, a lezáró gombot sokan meg sem nyomják — a
    // teljesen megválaszolt kör lezárás nélkül is megy (körönként egyszer: a jelző, a kimenő sor és a szerver egyedi kulcsa).
    const done = !!round.finishedAt || (kind === "quiz" && quizRoundComplete(round));
    if (!lessonId || !done || !(ready || timedOut)) return;
    // S1b (review K1) + R2: az a LE NEM ZÁRT kör, amelynek az UTOLSÓ VÁLASZA 7 napnál régebbi, utólag nem megy el (a lezárt kör a tanuló
    // döntése: az megy). A régen megnyitott, de ma megválaszolt kör megy — a korhatár nem a kvíz-fül első megnyitásához mér.
    if (!round.finishedAt && roundTooOld(roundActivityAt(round), Date.now())) return;
    const roundId = roundIdOf(round);
    const flag = `${storageKey}:${kind}:sent:${roundId}`;
    try { if (localStorage.getItem(flag)) return; } catch { /* privát módban a szerver egyedi kulcsa véd */ }
    // Terv R24: a törzs VÁRAKOZÁS NÉLKÜL a kimenő sorba kerül (a token és — ha még nincs meg — az ujjlenyomat a küldéskor jön), így az
    // utolsó válasz utáni azonnali lapelhagyás sem veszíti el: a következő oldalbetöltés kiküldi.
    const fingerprint = peekFingerprint();
    // Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S2): a párosított eszköz tokenje — a szerver ellenőrzi. R47: csak ha a kör
    // rögzített párosításával egyezik (újrapárosítás után a korábbi kör nem kerül az új tanulóhoz).
    const owner = bindRoundOwner(ownerKeyOf(storageKey, kind, roundId), seenFresh.current.has(roundId));
    const fresh = { ...(round.startedAt > 0 ? { startedAt: round.startedAt } : {}), ...(kind === "quiz" && round.lastAnsweredAt ? { lastAnsweredAt: round.lastAnsweredAt } : {}) };
    const body = kind === "tasks"
      ? { kind, roundId, answers: Object.fromEntries(round.ids.map(id => [id, round.answers[id] ?? ""])), ...(fingerprint ? { fingerprint } : {}), ...fresh }
      // Review #280: a kör minden kérdése megy; a kihagyott -1 (nulla pont), különben a levél pontszáma eltérne a képernyőétől.
      : { kind, roundId, picks: Object.fromEntries(round.ids.map(id => [id, round.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...fresh };
    // R30: a bejegyzés korhatárának alapja — lezárt körnél a sorba kerülés, le nem zártnál a kör utolsó tevékenysége. R31 + R47: a kör
    // rögzített kilét-címkéje (nem a küldéskori munkamenet).
    const activityAt = round.finishedAt ? Date.now() : roundActivityAt(round) || Date.now();
    enqueueResult({ id: `${lessonId}|${kind}|${roundId}`, lessonId, kind, body, flag, partialKey: `${storageKey}:${kind}:partial:${roundId}`, activityAt, subject: owner.subject, learnerTag: owner.learnerTag });
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
      const roundId = roundIdOf(current);
      const key = `${storageKey}:${kind}:partial:${roundId}`;
      const state = snapshotState.current;
      try {
        if (localStorage.getItem(`${storageKey}:${kind}:sent:${roundId}`)) return;
        const stored = Number(localStorage.getItem(key)) || 0;
        if (stored > 0 && (state.sent?.roundId !== roundId || state.sent.count < stored)) state.sent = { roundId, count: stored };
      } catch { /* privát mód: a munkamenet állapota marad */ }
      if (!snapshotDue(state, roundId, count)) return;
      // R47: a kör rögzített kiléte — a párosítás csak egyezésnél, a fiók címkéje a rögzített (ismeretlen: `?`).
      const owner = bindRoundOwner(ownerKeyOf(storageKey, kind, roundId), seenFresh.current.has(roundId));
      const fingerprint = peekFingerprint();
      const base = { kind, roundId, partial: true, picks: Object.fromEntries(current.ids.map(id => [id, current.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...(current.startedAt > 0 ? { startedAt: current.startedAt } : {}), ...(current.lastAnsweredAt ? { lastAnsweredAt: current.lastAnsweredAt } : {}), clientNow: Date.now(), subject: owner.subject ?? "?" };
      const mark = { roundId, count };
      state.pending = mark;
      // R49 (b): a párosítás minden kísérlet előtt (a 403 utáni ismétlésnél is) újra összevetődik a rögzített lenyomattal.
      const body = () => { const learner = ownerLearner(owner); return { ...base, ...(learner ? { learner } : {}) }; };
      void sendKeepalive(`/api/lessons/${lessonId}/results`, body).then(accepted => {
        if (state.pending === mark) state.pending = null;
        if (!accepted) return; // hálózati hiba / 429 / 5xx: nem rögzül, a következő alkalommal újra megy
        if (state.sent?.roundId !== roundId || state.sent.count < count) state.sent = mark;
        // R48 (9. vak kör L4): a közben véglegesített kör késői 202-je nem írja vissza a részleges jelzőt (R8 takarítása idempotens).
        // R51 / L3: körönként a legnagyobb elfogadott érték marad (a korábbi, kisebb pillanatkép késői 202-je nem tekeri vissza).
        try { if (!localStorage.getItem(`${storageKey}:${kind}:sent:${roundId}`) && count > (Number(localStorage.getItem(key)) || 0)) localStorage.setItem(key, String(count)); } catch { /* elég a munkamenet állapota */ }
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

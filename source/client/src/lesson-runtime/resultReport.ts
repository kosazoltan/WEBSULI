import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { getFingerprint } from "@/lib/fingerprintCache";
import { getLearnerToken } from "@/lib/learnerProfile";
import { quizRoundComplete, roundActivityAt, roundTooOld } from "@shared/quiz-round";
import { isRetryableRequestError } from "@shared/request-retry";
import { createRoundOwners, roundHasActivity } from "@shared/round-owner";
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
const roundOwners = createRoundOwners(() => { try { return localStorage; } catch { return null; } }, getLearnerToken, token => experienceFingerprint({ learner: token }));
const ownerKeyOf = (storageKey: string, kind: string, roundId: string) => `${storageKey}:${kind}:owner:${roundId}`;
export function useResultReport(lessonId: string | undefined, kind: "tasks" | "quiz", round: ExperienceRound, storageKey: string, ready = true) {
  const sending = useRef(false);
  /** R50: azok a körök (kérdéssor szerint), amelyeket EBBEN a dokumentumban még tevékenység nélkül láttunk. */
  const seenFresh = useRef(new Set<string>());
  useEffect(() => {
    const fresh = experienceFingerprint({ ids: round.ids });
    if (!roundHasActivity(kind, round)) { seenFresh.current.add(fresh); return; }
    const roundId = `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
    // L5: a már elküldött körhöz (újratöltéskor) nem keletkezik kilét-rekord.
    try { if (localStorage.getItem(`${storageKey}:${kind}:sent:${roundId}`)) return; } catch { /* privát mód: memóriában rögzül */ }
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
    if (!lessonId || !done || sending.current || !(ready || timedOut)) return;
    // B1b (R2): az a LE NEM ZÁRT kör, amelynek az UTOLSÓ VÁLASZA 7 napnál régebbi, utólag nem megy el (a lezárt kör a tanuló döntése: az
    // megy). A régen megnyitott, de ma megválaszolt kör megy — a korhatár nem a kvíz-fül első megnyitásához mér.
    if (!round.finishedAt && roundTooOld(roundActivityAt(round), Date.now())) return;
    const roundId = `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
    const flag = `${storageKey}:${kind}:sent:${roundId}`;
    try { if (localStorage.getItem(flag)) return; } catch { /* privát módban a szerver egyedi kulcsa véd */ }
    if ((pageAttempts.get(flag) ?? 0) >= RESULT_REPORT_ATTEMPTS) return;
    // R47: legkésőbb a lezáráskor rögzül (ha a tevékenység-effekt még nem futott le).
    const ownerKey = ownerKeyOf(storageKey, kind, roundId);
    const owner = roundOwners.bind(ownerKey, seenFresh.current.has(experienceFingerprint({ ids: round.ids })));
    sending.current = true;
    void (async () => {
      try {
        const fingerprint = await getFingerprint().catch(() => undefined);
        // B1b: a kör kezdete és (kvíznél) az utolsó válasz ideje — a szerver (B1a, #532) opcionális mezőként fogadja, a levél dátumsorához.
        const times = { ...(round.startedAt > 0 ? { startedAt: round.startedAt } : {}), ...(kind === "quiz" && round.lastAnsweredAt ? { lastAnsweredAt: round.lastAnsweredAt } : {}) };
        // Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S2): a párosított eszköz tokenje — a szerver ellenőrzi. B4b (R47, R49 b):
        // csak ha a mostani token a kör rögzített párosításával egyezik; minden kísérlet előtt újra (a várakozás alatti újrapárosítás sem öröklődik).
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
            await apiRequest("POST", `/api/lessons/${lessonId}/results`, bodyFor(roundOwners.learnerFor(owner)), { resultTimes: times, retries: 0, keepalive: kind === "quiz" });
            break;
          } catch (error) {
            if (attempt >= RESULT_REPORT_ATTEMPTS || !isRetryableRequestError(error)) throw error;
            await new Promise(resolve => setTimeout(resolve, RESULT_REPORT_RETRY_DELAYS_MS[attempt - 1]));
            // PR #556 review (B1b R2): a korhatár minden kísérlet előtt újra — a várakozás alatt (pl. felfüggesztett gépen) elavult, le nem
            // zárt kör nem megy el; a lezárt és a válaszidő nélküli régi kör kivétele (roundActivityAt) változatlan.
            if (!round.finishedAt && roundTooOld(roundActivityAt(round), Date.now())) return;
          }
        }
        try { localStorage.setItem(flag, "1"); } catch { /* elég a szerver egyedi kulcsa */ }
        roundOwners.clear(ownerKey);
      } catch { /* csendes: a tanuló felülete nem függ a levéltől */ }
      finally { sending.current = false; }
    })();
  }, [lessonId, kind, round, storageKey, ready, timedOut]);
}

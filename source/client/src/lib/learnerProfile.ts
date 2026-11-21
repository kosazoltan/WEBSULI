import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S1): a napi emlékeztető személyes linkje (`?t=…`) ezt az eszközt a
 * tanulóhoz párosítja. A token csak a böngészőben él (localStorage); a címsorból azonnal eltűnik. A token nevet nem tartalmaz.
 */
export const LEARNER_TOKEN_KEY = "websuli.learnerToken";
/**
 * Jelző a lap munkamenetére: a szerver ELUTASÍTOTTA az eszköz tanulói tokenjét (lejárt / visszavont link). A token ilyenkor
 * törlődik; a jelzőből az a felület, amelyiknek ez számít (adventi naptár, A53), meg tudja mondani a gyereknek, mi történt,
 * ahelyett hogy csendben névtelenként folytatná. Új, érvényes link eltárolása törli.
 */
export const LEARNER_TOKEN_REJECTED_KEY = "websuli.learnerTokenRejected";
/**
 * Saját lapon belüli jelzés: a tanulói token eltárolódott vagy törlődött (a másik lap a `storage` eseményből tudja). Az adventi naptár
 * ebből vált alanyt, hogy a korábbi tanuló állapota ne látszódjon (PR-C vak L3). Az esemény nem visz adatot (tokent sem).
 */
export const LEARNER_TOKEN_CHANGED_EVENT = "websuli:learner-token-changed";
function announceLearnerTokenChange(): void {
  try { window.dispatchEvent(new Event(LEARNER_TOKEN_CHANGED_EVENT)); } catch { /* nincs ablak (szerveroldal / teszt) */ }
}
const TOKEN_SHAPE = /^[A-Za-z0-9-]{8,64}\.[1-9][0-9]{0,8}\.[A-Za-z0-9_-]{22}$/;

/** Tiszta: a `t` paraméter (ha tokenszerű) és a nélküle maradó URL (a többi paraméter és a hash változatlan). */
export function takeLearnerTokenFromUrl(href: string): { token: string | null; cleanUrl: string | null } {
  const url = new URL(href);
  const raw = url.searchParams.get("t");
  if (raw === null) return { token: null, cleanUrl: null };
  url.searchParams.delete("t");
  return { token: TOKEN_SHAPE.test(raw) ? raw : null, cleanUrl: url.pathname + url.search + url.hash };
}

export function getLearnerToken(): string | null {
  try {
    const t = window.localStorage.getItem(LEARNER_TOKEN_KEY);
    return t && TOKEN_SHAPE.test(t) ? t : null;
  } catch {
    return null;
  }
}

export function clearLearnerToken(): void {
  try {
    window.localStorage.removeItem(LEARNER_TOKEN_KEY);
  } catch {
    // nincs tárhely: nincs mit törölni
  }
  announceLearnerTokenChange();
}

/** Induláskor: a link tokenje eltárolódik, és a címsorból (előzményből) eltűnik. */
export function captureLearnerTokenFromUrl(): void {
  let taken: ReturnType<typeof takeLearnerTokenFromUrl>;
  try {
    taken = takeLearnerTokenFromUrl(window.location.href);
  } catch {
    return;
  }
  if (taken.cleanUrl === null) return;
  try {
    if (taken.token) {
      window.localStorage.setItem(LEARNER_TOKEN_KEY, taken.token);
      window.sessionStorage.removeItem(LEARNER_TOKEN_REJECTED_KEY);
      announceLearnerTokenChange();
    }
  } catch {
    // privát mód / tele tárhely: a párosítás nem marad meg — a tanuló névtelen
  }
  // Review #301: a címsor tisztítása a tárolástól függetlenül lefut — a token ne maradjon a címsorban és az előzményekben.
  try {
    window.history.replaceState(window.history.state, "", taken.cleanUrl);
  } catch {
    // nagyon régi böngésző: nincs mit tenni
  }
}

/** Review #302: a megnyitott anyag jelzése a párosított tanulónak (a Stúdió-lecke és a PDF nem a /dev/:id-n át nyílik). */
export function useRecordLearnerView(materialId: string | null | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const token = getLearnerToken();
    if (!token || !materialId) return;
    void fetch(`/api/learner/view/${encodeURIComponent(materialId)}`, { headers: { "X-Learner-Token": token }, credentials: "same-origin" })
      // Review #303: a megnyitás után a sorozat (profil) friss legyen, amikor a tanuló visszatér a kezdőlapra.
      .then(() => queryClient.invalidateQueries({ queryKey: ["learner-profile"] }))
      .catch(() => undefined);
  }, [materialId, queryClient]);
}

export type LearnerProfile = { firstName: string; grade: number; streak?: { days: number; today: boolean } };

/**
 * Review #303: a profil (és vele a napi sorozat) ne ragadjon be — rövid frissességi idő, újralekérés fókuszra és látható lapon
 * 5 percenként (a budapesti napváltás így legkésőbb 5 perc múlva megjelenik).
 */
export const LEARNER_PROFILE_QUERY_OPTIONS = { staleTime: 60_000, refetchOnWindowFocus: true, refetchInterval: 5 * 60_000, refetchIntervalInBackground: false } as const;

/** A párosított eszköz tanulója; érvénytelen (hamis / visszavont) tokennél a token törlődik, és a tanuló névtelen. */
export function useLearnerProfile(): LearnerProfile | null {
  const token = getLearnerToken();
  const { data } = useQuery({
    queryKey: ["learner-profile", token],
    enabled: Boolean(token),
    ...LEARNER_PROFILE_QUERY_OPTIONS,
    retry: false,
    queryFn: async (): Promise<LearnerProfile | null> => {
      const res = await fetch("/api/learner/me", { headers: { "X-Learner-Token": token! }, credentials: "same-origin" });
      if (res.status === 401) {
        try { window.sessionStorage.setItem(LEARNER_TOKEN_REJECTED_KEY, "1"); } catch { /* tárhely nélkül csak a token törlődik */ }
        clearLearnerToken();
        return null;
      }
      if (!res.ok) return null;
      return (await res.json()) as LearnerProfile;
    },
  });
  return data ?? null;
}

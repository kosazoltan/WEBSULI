import { useQuery } from "@tanstack/react-query";

/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S1): a napi emlékeztető személyes linkje (`?t=…`) ezt az eszközt a
 * tanulóhoz párosítja. A token csak a böngészőben él (localStorage); a címsorból azonnal eltűnik. A token nevet nem tartalmaz.
 */
export const LEARNER_TOKEN_KEY = "websuli.learnerToken";
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
    if (taken.token) window.localStorage.setItem(LEARNER_TOKEN_KEY, taken.token);
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

export type LearnerProfile = { firstName: string; grade: number };

/** A párosított eszköz tanulója; érvénytelen (hamis / visszavont) tokennél a token törlődik, és a tanuló névtelen. */
export function useLearnerProfile(): LearnerProfile | null {
  const token = getLearnerToken();
  const { data } = useQuery({
    queryKey: ["learner-profile", token],
    enabled: Boolean(token),
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<LearnerProfile | null> => {
      const res = await fetch("/api/learner/me", { headers: { "X-Learner-Token": token! }, credentials: "same-origin" });
      if (res.status === 401) { clearLearnerToken(); return null; }
      if (!res.ok) return null;
      return (await res.json()) as LearnerProfile;
    },
  });
  return data ?? null;
}

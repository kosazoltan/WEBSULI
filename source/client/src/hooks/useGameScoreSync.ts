import { useQuery } from "@tanstack/react-query";

export type SyncEligibility = { eligible: boolean; reason?: string };

export function useSyncEligibilityQuery() {
  return useQuery<SyncEligibility>({
    queryKey: ["/api/games/sync-eligibility"],
  });
}

export function gameSyncBannerText(syncEligibility: SyncEligibility | undefined): string {
  if (!syncEligibility) return "Felhő szinkron ellenőrzése…";
  if (syncEligibility.eligible) {
    return "Be vagy jelentkezve Google-lal, és az e-mail címed rajta van a listán — a kör vége felkerül a ranglistára.";
  }
  switch (syncEligibility.reason) {
    case "not_logged_in":
      return "Nem vagy bejelentkezve — a helyi XP megmarad, felhő ranglista nincs.";
    case "google_only":
      return "Csak Google bejelentkezéssel menthető a pont a szerverre (OAuth).";
    case "not_on_mailing_list":
      return "Az e-mail címed nincs a WebSuli értesítő listáján — iratkozz fel, vagy kérj meghívót.";
    default:
      return "A felhő szinkron most nem elérhető.";
  }
}

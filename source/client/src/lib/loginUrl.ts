/**
 * LS-0a — building the Google login URL with a return destination.
 *
 * The OAuth callback sends the user back to whatever `returnTo` was supplied (after
 * server-side sanitising). A pupil who clicked "log in" from the games hub must land
 * back on the games hub, not on the admin surface.
 */

/** Reads `?returnTo=` from the current location, falling back to the given default. */
export function currentReturnTo(fallback = "/games"): string {
  if (typeof window === "undefined") return fallback;
  const fromQuery = new URLSearchParams(window.location.search).get("returnTo");
  // Only same-origin relative paths; the server sanitises again (defence in depth).
  if (fromQuery && fromQuery.startsWith("/") && !fromQuery.startsWith("//")) {
    return fromQuery;
  }
  return fallback;
}

/** Full URL for the Google login entry point, carrying the return destination. */
export function googleLoginUrl(returnTo?: string): string {
  const target = returnTo ?? currentReturnTo();
  return `/auth/google?returnTo=${encodeURIComponent(target)}`;
}

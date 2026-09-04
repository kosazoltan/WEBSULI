/**
 * Post-login redirect target handling (LS-0a).
 *
 * The Google OAuth callback used to hard-code `/admin`, which dropped every pupil on the
 * admin surface. The destination is now caller-supplied via `?returnTo=`, so it must be
 * constrained to same-origin relative paths — an unchecked value here is an open redirect
 * (phishing: `/auth/google?returnTo=https://evil.example` would send the user, freshly
 * authenticated, to an attacker page that looks like a continuation of the login flow).
 */

/** Longest accepted path; anything above this is treated as an attack/mistake. */
const MAX_RETURN_TO_LENGTH = 512;

/**
 * Returns the value when it is a safe same-origin relative path, otherwise `null`.
 *
 * Accepted: a single leading `/`, then path/query/hash characters.
 * Rejected: protocol-relative (`//host`, `/\host`), absolute URLs, other schemes,
 * relative paths without a leading slash, control characters (header injection), and
 * anything over `MAX_RETURN_TO_LENGTH`.
 */
export function sanitizeReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;

  // Control characters (CR/LF/NUL) must never reach a Location header. This check runs
  // BEFORE trim(): `trim()` strips a trailing "\r\n", which would silently launder a
  // header-injection attempt into a valid-looking path.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;

  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > MAX_RETURN_TO_LENGTH) return null;

  // Must start with exactly one slash: `//host` and `/\host` are absolute for browsers.
  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return null;

  // Conservative allowlist for the remainder (path, query, fragment).
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/?#[\]%]*$/.test(candidate)) return null;

  return candidate;
}

/**
 * Chooses where to send the user after a successful login.
 *
 * A stored (already sanitized) path always wins — including for admins, who may have
 * started the login from a lesson or game page. Without one, admins keep the historical
 * `/admin` destination and everyone else goes to `/games`.
 */
export function resolvePostLoginRedirect(input: {
  isAdmin: boolean;
  stored: string | null | undefined;
}): string {
  if (input.stored) return input.stored;
  return input.isAdmin ? "/admin" : "/games";
}

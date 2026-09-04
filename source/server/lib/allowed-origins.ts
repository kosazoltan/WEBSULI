/**
 * SECURITY: Single source of truth for the trusted browser origins.
 *
 * Used by both the CORS layer (server/index.ts) and the Origin/Referer allowlist that
 * guards the mutating endpoints which cannot carry a CSRF synchroniser token
 * (login/logout and the AI endpoints — see server/routes.ts).
 *
 * Keeping one list avoids the previous split-brain where CORS trusted the production
 * domains but the Origin allowlist only read the optional ALLOWED_ORIGINS variable.
 */

/** Production domains that are always trusted. */
const STATIC_ORIGINS = [
  "https://websuli.org",
  "https://www.websuli.org",
  "https://websuli.vip",
  "https://www.websuli.vip",
  // NOTE: HTTP versions needed because Nginx doesn't force HTTPS redirect
  "http://websuli.org",
  "http://www.websuli.org",
  "http://websuli.vip",
  "http://www.websuli.vip",
];

/** Normalise a URL-ish value to its bare origin (scheme://host[:port]), or null. */
function toOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function isDevelopmentEnv(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * SECURITY: True when the origin names the local machine.
 *
 * Matches the hostname exactly (or the whole 127.0.0.0/8 block and IPv6 ::1) rather
 * than by prefix, so a genuinely remote host that merely *looks* local —
 * `https://localhost.attacker.com`, `https://127.0.0.1.attacker.com` — is not treated
 * as loopback. `0.0.0.0` is included because binding to it is a common dev shorthand.
 */
export function isLoopbackOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  // URL() keeps IPv6 hosts in brackets: http://[::1]:5000 → "[::1]".
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return (
    bare === "localhost" ||
    bare === "::1" ||
    bare === "0.0.0.0" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare)
  );
}

/**
 * Builds the allowlist from the static production domains plus the deployment-specific
 * environment variables. Computed on every call so tests and runtime env changes are honoured.
 *
 * SECURITY (#100, 2026-09-04): in production every loopback origin is stripped at the end,
 * whatever its source. Previously only the two literal localhost entries below were gated
 * on NODE_ENV, while FRONTEND_URL, BASE_URL, CUSTOM_DOMAIN and ALLOWED_ORIGINS were folded
 * in unconditionally — so a deployment that still carried a developer value for any of them
 * trusted `http://localhost:5173` in production. That list also guards the mutating
 * endpoints which cannot carry a CSRF token, so the hole was reachable, not theoretical.
 */
export function getAllowedOrigins(): string[] {
  const fromEnv = [
    process.env.CUSTOM_DOMAIN && `https://${process.env.CUSTOM_DOMAIN}`,
    process.env.CUSTOM_DOMAIN && `https://www.${process.env.CUSTOM_DOMAIN}`,
    process.env.FRONTEND_URL, // Support Vercel/external frontend URL
    process.env.BASE_URL, // Support Render base URL for OAuth
    ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
    // SECURITY: localhost ONLY in development
    ...(isDevelopmentEnv() ? ["http://localhost:5173", "http://localhost:5000"] : []),
  ];

  const origins = [...STATIC_ORIGINS, ...fromEnv]
    .map(toOrigin)
    .filter((o): o is string => o !== null)
    // The single choke point: no environment variable may name the local machine in production.
    .filter((o) => isDevelopmentEnv() || !isLoopbackOrigin(o));

  return origins.filter((origin, index) => origins.indexOf(origin) === index);
}

/**
 * The origin the server itself is being addressed as, derived from the request's
 * protocol (honours X-Forwarded-Proto behind Nginx via Express' `trust proxy`) and Host
 * header. Returns null when the Host header is missing or unusable.
 */
export function getSelfOrigin(
  protocol: string | undefined,
  host: string | undefined,
): string | null {
  if (!protocol || !host) return null;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

/**
 * True when the request's Origin header names the very server handling it.
 *
 * Vite emits its bundles as `<script type="module" crossorigin>` / `<link crossorigin>`,
 * which makes the browser attach an Origin header even to same-origin asset requests.
 * Rejecting those is never a security win — a same-origin request is not cross-origin —
 * but it *is* an outage: every bundle 500s and the app renders a blank page. That happens
 * whenever the deployment is reached on a hostname the allowlist does not know
 * (a new domain, a missing CUSTOM_DOMAIN, http instead of https).
 */
export function isSameOriginRequest(
  origin: string | undefined,
  protocol: string | undefined,
  host: string | undefined,
): boolean {
  if (!origin) return false;
  const self = getSelfOrigin(protocol, host);
  return self !== null && self === origin;
}

/**
 * SECURITY: True when the given origin may perform state-changing requests.
 * Localhost is accepted on any port outside production only.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  if (getAllowedOrigins().includes(origin)) return true;
  return (
    isDevelopmentEnv() &&
    (origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:") ||
      origin === "http://localhost" ||
      origin === "http://127.0.0.1")
  );
}

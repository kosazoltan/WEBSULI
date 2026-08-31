/**
 * SECURITY: Validation for Web Push subscription endpoints.
 *
 * /api/push/subscribe is a public endpoint and the stored `endpoint` URL is later
 * requested by the server (web-push POSTs to it on every notification). Without
 * validation anyone could register an arbitrary URL — including internal addresses —
 * and turn the notification job into an SSRF / request-amplification primitive.
 *
 * Only HTTPS endpoints on the browser vendors' real push services are accepted.
 */

/** Hostname suffixes operated by the browser push services. */
const ALLOWED_PUSH_HOST_SUFFIXES = [
  "push.services.mozilla.com", // Firefox
  "fcm.googleapis.com", // Chrome / Chromium (FCM)
  "android.googleapis.com", // legacy GCM endpoint
  "notify.windows.com", // Edge / Windows (WNS)
  "push.apple.com", // Safari / Apple
];

/** Max characters accepted for a subscription endpoint URL. */
export const MAX_PUSH_ENDPOINT_LENGTH = 1000;

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_PUSH_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * Returns the normalised endpoint when it is a valid, allowlisted push service URL,
 * or null when it must be rejected.
 */
export function validatePushEndpoint(endpoint: unknown): string | null {
  if (typeof endpoint !== "string") return null;
  const trimmed = endpoint.trim();
  if (!trimmed || trimmed.length > MAX_PUSH_ENDPOINT_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!isAllowedHost(url.hostname)) return null;

  return url.toString();
}

/**
 * Web Push requires the `p256dh` and `auth` keys; both are base64url strings.
 * Rejects anything else so malformed rows can never reach web-push.
 */
export function validatePushKeys(keys: unknown): { p256dh: string; auth: string } | null {
  if (!keys || typeof keys !== "object") return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  const isBase64Url = (v: unknown, max: number): v is string =>
    typeof v === "string" && v.length > 0 && v.length <= max && /^[A-Za-z0-9_-]+=*$/.test(v);

  if (!isBase64Url(p256dh, 200) || !isBase64Url(auth, 100)) return null;
  return { p256dh, auth };
}

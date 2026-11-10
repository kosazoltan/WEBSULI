import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import { ipKeyGenerator } from "express-rate-limit";

/**
 * Spec 2026-11-10-korlat-kliens-ip: az IP-alapú kéréskorlátok közös kulcsa.
 *
 * A `websuli.vip` kérései Vercel → Cloudflare → Render terheléselosztó → Express úton érkeznek, ezért a `req.ip`
 * (`trust proxy: 1`) egy kérésenként váltakozó közbenső cím. A valódi kliens címe:
 *  - Vercelen át: az `X-Forwarded-For` bal szélső eleme (a Vercel írja, a kliens értékét felülírja) — de csak akkor hihető,
 *    ha a kérés bizonyítottan a Vercelről jön: ezt a Vercel által beállított megosztott titokfejléc igazolja;
 *  - közvetlen Render-hívásnál: a Cloudflare által írt `CF-Connecting-IP` (csak Renderen, mert máshol a kliens írhatná);
 *  - egyébként a `req.ip`.
 * A titok értékét és a fejlécek tartalmát ez a modul sosem naplózza.
 */
export const PROXY_SECRET_HEADER = "x-websuli-proxy-secret";
export const PROXY_SECRET_ENV = "WEBSULI_PROXY_SECRET";
export const MIN_PROXY_SECRET_LENGTH = 32;

export type ClientIpSource = "vercel" | "cloudflare" | "socket";
export interface ClientIpRequest {
  headers: IncomingHttpHeaders;
  ip?: string;
}
type Env = Record<string, string | undefined>;
type HeaderValue = string | string[] | undefined;

const first = (value: HeaderValue): string | undefined => (Array.isArray(value) ? value[0] : value);
const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/** Érvényes IP-cím (IPv4-be ágyazott IPv6 → IPv4), különben null. */
export function normalizeIp(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  const candidate = mapped ? mapped[1] : trimmed;
  return isIP(candidate) ? candidate : null;
}

/** A szerveren elfogadott titkok: vesszővel tagolva (titokcsere alatt régi + új), a túl rövid érték kimarad. */
function configuredSecrets(env: Env): string[] {
  return (env[PROXY_SECRET_ENV] ?? "")
    .split(",")
    .map((secret) => secret.trim())
    .filter((secret) => secret.length >= MIN_PROXY_SECRET_LENGTH);
}

/** Időzítésbiztos egyezés; beállított titok nélkül semmi sem érvényes. */
export function hasValidProxySecret(headerValue: HeaderValue, env: Env = process.env): boolean {
  const presented = first(headerValue);
  if (typeof presented !== "string" || presented.length === 0) return false;
  const presentedDigest = digest(presented);
  let valid = false;
  for (const secret of configuredSecrets(env)) {
    if (timingSafeEqual(presentedDigest, digest(secret))) valid = true;
  }
  return valid;
}

export function resolveClientIp(req: ClientIpRequest, env: Env = process.env): { ip: string; source: ClientIpSource } {
  if (hasValidProxySecret(req.headers[PROXY_SECRET_HEADER], env)) {
    const forwarded = normalizeIp(first(req.headers["x-forwarded-for"])?.split(",")[0]) ?? normalizeIp(first(req.headers["x-real-ip"]));
    if (forwarded) return { ip: forwarded, source: "vercel" };
  }
  if (env.RENDER === "true") {
    const cloudflare = normalizeIp(first(req.headers["cf-connecting-ip"]));
    if (cloudflare) return { ip: cloudflare, source: "cloudflare" };
  }
  return { ip: normalizeIp(req.ip) ?? req.ip ?? "", source: "socket" };
}

/** A korlát kulcsa: IPv4-nél a cím, IPv6-nál a /56 alhálózat. */
export function clientIpKey(req: ClientIpRequest, env: Env = process.env): string {
  return ipKeyGenerator(resolveClientIp(req, env).ip);
}

/** Az `express-rate-limit` `keyGenerator` beállítása minden IP-alapú korláthoz. */
export const clientIpKeyGenerator = (req: ClientIpRequest): string => clientIpKey(req);

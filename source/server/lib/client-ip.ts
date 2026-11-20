import { createHash, timingSafeEqual } from "node:crypto";
import { BlockList, isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import { ipKeyGenerator } from "express-rate-limit";

/**
 * Spec 2026-11-10-korlat-kliens-ip: az IP-alapú kéréskorlátok közös kulcsa.
 *
 * A `websuli.vip` kérései Vercel → Cloudflare → Render terheléselosztó → Express úton érkeznek, ezért a `req.ip`
 * (`trust proxy: 1`) egy kérésenként váltakozó közbenső cím. A valódi kliens címe:
 *  - Vercelen át: az `X-Forwarded-For` bal szélső eleme (a Vercel írja, a kliens értékét felülírja) — de csak akkor hihető,
 *    ha a kérés bizonyítottan a Vercelről jön: ezt a Vercel által beállított megosztott titokfejléc igazolja;
 *  - közvetlen Render-hívásnál: a Cloudflare által írt `CF-Connecting-IP` — csak Renderen, és csak ha a kérés bizonyítottan a
 *    Cloudflare-en át jött: az `X-Forwarded-For` lánc jobbról első nyilvános eleme (ezt a Render terheléselosztója írja, a kliens
 *    nem) a Cloudflare közzétett címtartományába esik (spec 2026-11-20-kliens-ip-cloudflare-ut, #169);
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

/** A Cloudflare közzétett címtartományai (https://www.cloudflare.com/ips-v4 és /ips-v6, letöltve 2026-11-20). */
export const CLOUDFLARE_RANGES: readonly string[] = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];
/** Belső / nem nyilvános tartományok: a Render belső hopjai ilyenek lehetnek, ezért a lánc vizsgálatánál átugorjuk őket. */
const PRIVATE_RANGES: readonly string[] = [
  "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "0.0.0.0/8",
  "::1/128", "fc00::/7", "fe80::/10",
];

function blockList(ranges: readonly string[]): BlockList {
  const list = new BlockList();
  for (const range of ranges) {
    const [network, prefix] = range.split("/");
    list.addSubnet(network, Number(prefix), isIP(network) === 6 ? "ipv6" : "ipv4");
  }
  return list;
}
const cloudflareList = blockList(CLOUDFLARE_RANGES);
const privateList = blockList(PRIVATE_RANGES);
const family = (ip: string): "ipv4" | "ipv6" => (isIP(ip) === 6 ? "ipv6" : "ipv4");

/** Az `X-Forwarded-For` lánc normalizált elemei (üres láncnál a `req.ip`); bármely érvénytelen elemnél null. */
function forwardedChain(req: ClientIpRequest): string[] | null {
  const raw = req.headers["x-forwarded-for"];
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const parts = typeof joined === "string" && joined.trim() !== "" ? joined.split(",") : [req.ip];
  const chain = parts.map((part) => normalizeIp(part));
  return chain.every((ip): ip is string => ip !== null) ? chain : null;
}

/**
 * A kérés a Cloudflare-en át jött-e: a lánc jobbról első nem belső eleme Cloudflare-cím. A lánc jobb oldalát csak a Cloudflare és a
 * Render írja, így a kliens által a bal oldalra írt Cloudflare-cím nem kerülhet erre a helyre.
 */
export function isFromCloudflare(req: ClientIpRequest): boolean {
  const chain = forwardedChain(req);
  if (!chain) return false;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const ip = chain[i];
    if (privateList.check(ip, family(ip))) continue;
    return cloudflareList.check(ip, family(ip));
  }
  return false;
}

export function resolveClientIp(req: ClientIpRequest, env: Env = process.env): { ip: string; source: ClientIpSource } {
  if (hasValidProxySecret(req.headers[PROXY_SECRET_HEADER], env)) {
    const forwarded = normalizeIp(first(req.headers["x-forwarded-for"])?.split(",")[0]) ?? normalizeIp(first(req.headers["x-real-ip"]));
    if (forwarded) return { ip: forwarded, source: "vercel" };
  }
  if (env.RENDER === "true" && isFromCloudflare(req)) {
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

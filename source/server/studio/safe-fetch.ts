import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import { parse, type DefaultTreeAdapterMap } from "parse5";

/**
 * Spec 2026-10-15-tartalek-b4-webgyujtes (C3, tulajdonosi döntés): a GPT-tartalék által talált oldalak VÉDETT szerveroldali
 * letöltése. A modell kimenetéből származó URL nem érhet el belső címet (SSRF): csak `https:`, alapértelmezett port, hitelesítő
 * adat nélkül; a DNS-feloldás MINDEN címe nyilvános, és a kapcsolat a már ellenőrzött címre megy (`lookup` rögzítve — nincs
 * DNS-rebinding rés); az átirányítás kézi és újraellenőrzött; csak HTML / sima szöveg, méret- és időkorláttal.
 */

export type ResolvedAddress = { address: string; family: number };
export type AddressLookup = (hostname: string) => Promise<ResolvedAddress[]>;
export type RawResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
};
export type RawRequest = (url: URL, address: ResolvedAddress, timeoutMs: number, signal?: AbortSignal) => Promise<RawResponse>;
export type PublicPage = { url: string; title: string; text: string };

const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const v4ToInt = (ip: string) => ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;

function isPublicV4(ip: string): boolean {
  const value = v4ToInt(ip);
  return !V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (v4ToInt(base) & mask);
  });
}

/** Az IPv6-cím 8 hextetre bontva (beágyazott IPv4-gyel is). */
function v6Hextets(ip: string): number[] | undefined {
  let address = ip.toLowerCase().split("%")[0];
  const v4Tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (v4Tail) {
    const value = v4ToInt(v4Tail[1]);
    address = `${address.slice(0, -v4Tail[1].length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [head, tail] = address.split("::");
  if (address.split("::").length > 2) return undefined;
  const headParts = head ? head.split(":") : [];
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (tail === undefined ? headParts.length !== 8 : missing < 0) return undefined;
  const parts = [...headParts, ...Array(tail === undefined ? 0 : missing).fill("0"), ...tailParts];
  const hextets = parts.map((part) => parseInt(part, 16));
  return hextets.length === 8 && hextets.every((h) => Number.isInteger(h) && h >= 0 && h <= 0xffff) ? hextets : undefined;
}

export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPublicV4(ip);
  if (family !== 6) return false;
  const h = v6Hextets(ip);
  if (!h) return false;
  if (h.every((x) => x === 0)) return false; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return false; // ::1
  // IPv4-leképezett (::ffff:a.b.c.d) és IPv4-kompatibilis (::a.b.c.d) cím: a beágyazott IPv4 dönt.
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
    return isPublicV4(`${h[6] >> 8}.${h[6] & 0xff}.${h[7] >> 8}.${h[7] & 0xff}`);
  }
  // Review #222: csak a globális unicast (2000::/3) engedett — ez kizárja a site-local fec0::/10, az egyedi helyi fc00::/7, a
  // link-local fe80::/10, a multicast ff00::/8, a NAT64 64:ff9b::/96 és a discard 100::/64 tartományt is.
  if ((h[0] & 0xe000) !== 0x2000) return false;
  if (h[0] === 0x2001 && h[1] === 0x0000) return false; // 2001::/32 Teredo (beágyazott IPv4)
  if (h[0] === 0x2001 && h[1] === 0x0002 && h[2] === 0x0000) return false; // 2001:2::/48 benchmark
  if (h[0] === 0x2001 && (h[1] & 0xfff0) === 0x0010) return false; // 2001:10::/28 ORCHID
  if (h[0] === 0x2001 && (h[1] & 0xfff0) === 0x0020) return false; // 2001:20::/28 ORCHIDv2
  if (h[0] === 0x2001 && h[1] === 0x0db8) return false; // 2001:db8::/32 dokumentációs
  if (h[0] === 0x2002) return false; // 2002::/16 6to4 (beágyazott IPv4)
  if (h[0] === 0x3fff && (h[1] & 0xf000) === 0x0000) return false; // 3fff::/20 dokumentációs
  return true;
}

/** Csak `https:`, alapértelmezett port, hitelesítő adat nélkül; `localhost` és nem nyilvános IP-literál tiltva. */
export function checkFetchUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`Érvénytelen URL: ${raw.slice(0, 120)}`); }
  if (url.protocol !== "https:") throw new Error(`Csak https engedélyezett: ${url.protocol}`);
  if (url.port && url.port !== "443") throw new Error(`Csak az alapértelmezett port engedélyezett: ${url.port}`);
  if (url.username || url.password) throw new Error("URL-be ágyazott hitelesítő adat nem engedélyezett.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`Nem nyilvános gépnév: ${host}`);
  }
  if (net.isIP(host) && !isPublicAddress(host)) throw new Error(`Nem nyilvános cím: ${host}`);
  return url;
}

const defaultLookup: AddressLookup = async (hostname) => {
  if (net.isIP(hostname)) return [{ address: hostname, family: net.isIP(hostname) }];
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
};

/** Az alapértelmezett kérés: `https.request` a már ellenőrzött címre rögzített `lookup`-pal (a TLS-név a gépnév marad). */
const defaultRequest: RawRequest = (url, address, timeoutMs, signal) => new Promise((resolve, reject) => {
  const pinnedLookup = (_host: string, options: { all?: boolean } | number, callback: (...args: unknown[]) => void) => {
    if (typeof options === "object" && options?.all) callback(null, [{ address: address.address, family: address.family }]);
    else callback(null, address.address, address.family);
  };
  const req = https.request({
    protocol: "https:", hostname: url.hostname.replace(/^\[|\]$/g, ""), servername: net.isIP(url.hostname) ? undefined : url.hostname,
    port: 443, path: `${url.pathname}${url.search}`, method: "GET",
    headers: { "User-Agent": "WEBSULI-forrasgyujto/1.0 (+oktatasi tananyag)", Accept: "text/html,text/plain;q=0.9", "Accept-Language": "hu,en;q=0.5" },
    lookup: pinnedLookup as never, timeout: timeoutMs, signal,
  }, (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res, destroy: () => res.destroy() }));
  req.on("timeout", () => req.destroy(new Error(`Időtúllépés (${timeoutMs} ms).`)));
  req.on("error", reject);
  req.end();
});

const SKIPPED = new Set(["script", "style", "noscript", "svg", "template", "iframe"]);
const BLOCK = new Set(["p", "div", "section", "article", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "br", "tr", "table", "header", "footer", "main", "blockquote", "pre", "dd", "dt"]);
type Node = DefaultTreeAdapterMap["node"];

/** HTML → olvasható szöveg (parse5): a cím a `<title>`-ből; script/stílus/sablon kihagyva; blokkhatáron sortörés. */
export function htmlToText(html: string): { title: string; text: string } {
  const document = parse(html);
  let title = "";
  const out: string[] = [];
  const walk = (node: Node) => {
    if ("tagName" in node && node.tagName === "title") {
      title = (node.childNodes ?? []).map((c) => ("value" in c ? String(c.value) : "")).join("").trim();
      return;
    }
    if ("tagName" in node && SKIPPED.has(node.tagName)) return;
    if (node.nodeName === "#text" && "value" in node) out.push(String(node.value));
    if ("tagName" in node && BLOCK.has(node.tagName)) out.push("\n");
    for (const child of ("childNodes" in node ? node.childNodes : []) as Node[]) walk(child);
    if ("tagName" in node && BLOCK.has(node.tagName)) out.push("\n");
  };
  walk(document as unknown as Node);
  const text = out.join("").replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, text };
}

function charsetOf(contentType: string, head: Uint8Array): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader;
  const sniff = new TextDecoder("latin1").decode(head.slice(0, 2048));
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1] ?? "utf-8";
}
function decode(bytes: Uint8Array, charset: string): string {
  try { return new TextDecoder(charset).decode(bytes); } catch { return new TextDecoder("utf-8").decode(bytes); }
}

export async function fetchPublicPage(raw: string, opts: {
  timeoutMs?: number; maxBytes?: number; maxRedirects?: number; signal?: AbortSignal;
  lookup?: AddressLookup; request?: RawRequest;
  /** Review #313: minden lépés (az átirányítás célja is) a kérés ELŐTT ellenőrizve; hamis → hiba, a kérés nem indul el. */
  allowUrl?: (url: URL) => boolean;
} = {}): Promise<PublicPage> {
  // Review #222 (CI): rendes (ref-elt) időzítő, a végén mindig törölve — az `AbortSignal.timeout` unref-elt időzítője nem tartja
  // életben a folyamatot, így egy függő DNS-ígéret mellett a határidő le sem járna.
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Időtúllépés (${timeoutMs} ms): ${raw}`)), timeoutMs);
  try {
    return await fetchWithinDeadline(raw, opts, opts.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithinDeadline(raw: string, opts: Parameters<typeof fetchPublicPage>[1] & object, signal: AbortSignal): Promise<PublicPage> {
  const timeoutMs = opts.timeoutMs ?? 10_000, maxBytes = opts.maxBytes ?? 2_000_000, maxRedirects = opts.maxRedirects ?? 3;
  const lookup = opts.lookup ?? defaultLookup, request = opts.request ?? defaultRequest;
  // Review #222: ABSZOLÚT határidő a teljes műveletre (DNS + minden átirányítás + törzsolvasás) — a socket-tétlenségi időkorlát
  // egy lassan csepegtető oldalnál nem véd; lejáratkor a várakozás és az aktív kérés is megszakad.
  const abortable = <T>(promise: Promise<T>) => new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason ?? new Error("Megszakítva.")); return; }
    const onAbort = () => reject(signal.reason ?? new Error("Megszakítva."));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => { signal.removeEventListener("abort", onAbort); resolve(value); }, (error) => { signal.removeEventListener("abort", onAbort); reject(error); });
  });
  let current = raw;
  for (let redirects = 0; ; redirects++) {
    const url = checkFetchUrl(current);
    if (opts.allowUrl && !opts.allowUrl(url)) throw new Error(`Nem engedélyezett cél: ${url.hostname}`);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await abortable(lookup(host));
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) throw new Error(`Nem nyilvános címre oldódik fel: ${host}`);
    const response = await abortable(request(url, addresses[0], timeoutMs, signal));
    if (response.status >= 300 && response.status < 400) {
      response.destroy();
      const location = response.headers.location;
      if (typeof location !== "string" || !location) throw new Error(`Átirányítás cél nélkül: ${url.href}`);
      if (redirects >= maxRedirects) throw new Error(`Túl sok átirányítás: ${raw}`);
      current = new URL(location, url).href;
      continue;
    }
    if (response.status !== 200) { response.destroy(); throw new Error(`HTTP ${response.status}: ${url.href}`); }
    const contentType = String(response.headers["content-type"] ?? "");
    if (!/^(text\/html|application\/xhtml\+xml|text\/plain)\b/i.test(contentType)) {
      response.destroy();
      throw new Error(`Nem szöveges tartalom (${contentType || "ismeretlen"}): ${url.href}`);
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      if (signal.aborted) { response.destroy(); throw new Error(`Időtúllépés (${timeoutMs} ms): ${url.href}`); }
      size += chunk.byteLength;
      if (size > maxBytes) { response.destroy(); throw new Error(`Túl nagy oldal (> ${maxBytes} bájt): ${url.href}`); }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = decode(bytes, charsetOf(contentType, bytes));
    if (/^text\/plain/i.test(contentType)) return { url: url.href, title: url.href, text: body.trim() };
    const { title, text } = htmlToText(body);
    return { url: url.href, title: title || url.href, text };
  }
}

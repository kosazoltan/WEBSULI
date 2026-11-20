# Végrehajtás: a `CF-Connecting-IP` csak igazolt Cloudflare-úton számítson

> Terv: `docs/specs/2026-11-20-kliens-ip-cloudflare-ut.md` · Ág: `fix/kliens-ip-cloudflare-ut` · Munkafa:
> `.claude/worktrees/kliens-ip` · Szelet: I-1 (`docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md`, „I-1”).
> Minden parancs a `source/` mappából, Windows-on `npm.cmd` / `npx.cmd`.

## T1 — Bukó tesztek ELŐBB (`source/tests/client-ip.test.ts`)

- Új állandók: `CF_EDGE_V4 = "172.70.1.1"` (a `172.64.0.0/13`-ban), `CF_EDGE_V6 = "2a06:98c0:3600::103"`, `ATTACKER = "192.0.2.10"`.
- `I1`: `resolveClientIp({ headers: { "cf-connecting-ip": "198.51.100.77", "x-forwarded-for": ATTACKER }, ip: ATTACKER }, { RENDER: "true" })`
  → `{ ip: ATTACKER, source: "socket" }`.
- `I2`: lánc `"172.70.9.9, 10.0.0.5, 192.0.2.10"` és `"104.16.0.1, 192.0.2.10, 10.1.2.3"` → `socket`; érvénytelen elem a láncban
  (`"unknown, 172.70.1.1"`) → `socket`.
- `I3`: `"198.51.100.77, 172.70.1.1"`, `"198.51.100.77, 172.70.1.1, 10.0.0.5"`, `"198.51.100.77, 2a06:98c0:3600::103"`, tömbfejléc,
  és XFF nélkül `ip: "::ffff:172.70.1.1"` → `{ ip: "198.51.100.77", source: "cloudflare" }`; csupa privát lánc → `socket`.
- `I4` (élő korlát, `withLimitedApp` + `RENDER=true` a `process.env`-ben, a futás végén visszaállítva): 3 kérés `behindLoadBalancer(ATTACKER, { "cf-connecting-ip": "203.0.113.<i>" })`
  → remaining `[2, 1, 0]`, a 4. → 429; a Cloudflare-úton (`behindLoadBalancer(CF_EDGE_V4, { "cf-connecting-ip": "198.51.100.1" })`)
  két különböző kliens külön keretet kap.
- Az A4 első állítása: a lánc `"203.0.113.7, 172.70.1.1"` (a Cloudflare-élszerver a végén) — a többi A4-állítás változatlan.
- Parancs: `node --import tsx --test tests/client-ip.test.ts` → elvárt: az I1, I2, I4 BUKIK (a mai kód a fejlécet elfogadja).

## T2 — Javítás (`source/server/lib/client-ip.ts`)

- `import { BlockList, isIP } from "node:net"`.
- `CLOUDFLARE_RANGES`: a 15 IPv4- és 7 IPv6-tartomány (forrás: `https://www.cloudflare.com/ips-v4`, `/ips-v6`, 2026-11-20), egy
  `BlockList`-be töltve (`addSubnet(network, prefix, "ipv4" | "ipv6")`).
- `PRIVATE_RANGES` (`BlockList`): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`,
  `0.0.0.0/8`, `::1/128`, `fc00::/7`, `fe80::/10`.
- `forwardedChain(req)`: az `x-forwarded-for` (tömbnél összefűzve) vesszőnként; üres lánc → `[req.ip]`. Minden elem `normalizeIp`;
  ha bármelyik `null` → `null` (a lánc nem értelmezhető).
- `isFromCloudflare(req)`: jobbról az első nem privát elem; ha van és a `CLOUDFLARE_RANGES` tartalmazza → `true`, különben `false`.
- `resolveClientIp`: a Cloudflare-ág feltétele `env.RENDER === "true" && isFromCloudflare(req)`. A modul fejkommentje frissül.
- Parancs: `node --import tsx --test tests/client-ip.test.ts` → `fail 0`.

## T3 — Előzmény-spec (`docs/specs/2026-11-10-korlat-kliens-ip.md`)

- A „Kulcs titok nélkül” döntés és az A4 mellé egy mondat: a `CF-Connecting-IP` csak igazolt Cloudflare-úton számít
  (`docs/specs/2026-11-20-kliens-ip-cloudflare-ut.md`).

## T4 — Ellenőrzés

- Mutációs ellenpróba: a `&& isFromCloudflare(req)` ideiglenes eltávolításával a T1 parancs → az I1, I2, I4 bukik; visszaállítás
  után `fail 0`. A mutáció nem kerül commitba.
- `npx.cmd tsc --noEmit` (a `check`) — NEHÉZ KÖR, csak gépi zárral, a `gate:stage` része.
- `npm.cmd run gate:stage`, `npm.cmd run gate:push` — gépi zárral (zár-név: `kliens-ip`).

## T5 — PR-leírás „Tulajdonosi teendő” (éles beállítás NINCS)

- A telepítés után az I6 élő mérés: `curl -s -o NUL -D - https://websuli-api-eu.onrender.com/api/learner/me` 8× ugyanarról a gépről;
  elvárt: a `Ratelimit-Remaining` egyesével csökken. Ha szóródik: a Render a Cloudflare után nyilvános című hopot tesz → a
  közvetlen hívás kulcsa a közvetlen ágra esett vissza (biztonságos, de szétszóródó keret) → új döntés.

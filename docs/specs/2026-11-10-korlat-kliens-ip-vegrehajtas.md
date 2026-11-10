# Végrehajtás: az IP-alapú kéréskorlátok a valódi kliens címe szerint

> Spec: `docs/specs/2026-11-10-korlat-kliens-ip.md` · Ág: `fix/korlat-kliens-ip`

## T1 — `source/server/lib/client-ip.ts` (új, tiszta; csak `node:crypto`, `node:net`, `express-rate-limit`)
- Állandók: `PROXY_SECRET_HEADER = "x-websuli-proxy-secret"`, `PROXY_SECRET_ENV = "WEBSULI_PROXY_SECRET"`, `MIN_PROXY_SECRET_LENGTH = 32`.
- `normalizeIp(value)`: trim, `::ffff:` előtag le, `net.isIP` → cím vagy `null`.
- `hasValidProxySecret(headerValue, env)`: a változó vesszővel tagolt, ≥ 32 karakteres értékei; SHA-256 + `timingSafeEqual`;
  minden jelöltet végigjár (nem áll meg az első egyezésnél).
- `resolveClientIp(req, env = process.env)` → `{ ip, source: "vercel" | "cloudflare" | "socket" }`:
  1. érvényes titok → XFF bal szélső eleme, majd `x-real-ip`; 2. `env.RENDER === "true"` → `cf-connecting-ip`; 3. `req.ip`.
- `clientIpKey(req, env)` = `ipKeyGenerator(resolveClientIp(...).ip)`; `clientIpKeyGenerator = (req) => clientIpKey(req)`.
- A titkot és a fejlécértéket sosem naplózza.

## T2 — A korlátok átkötése (`keyGenerator: clientIpKeyGenerator`)
- `source/server/index.ts`: mind a hat korlát.
- `source/server/routes.ts`: `materialResultIpLimiter`, `learnerMeLimiter`; a `materialResultClientLimiter` IP-tartaléka
  `ip:${clientIpKey(req)}` (az `ipKeyGenerator` import így feleslegessé válik).
- `source/server/routes/error-report.ts`, `source/server/routes/client-error.ts`, `source/server/lesson-result-email.ts`.
- A megjegyzések frissítése (`index.ts` `ttsAudioLimiter` fölött: a kulcs már a kliens címe).

## T3 — `source/vercel.json`
- Új `routes` tömb egy elemmel: `src: "/api/(.*)"`, `continue: true`, `transforms`: `request.headers` / `set` /
  `target.key: x-websuli-proxy-secret` / `args: "$WEBSULI_PROXY_SECRET"` / `env: ["WEBSULI_PROXY_SECRET"]`.
- A `rewrites` és a `headers` érintetlen. Ha a Vercel előnézeti build a `routes` + `rewrites` együttest elutasítja, vagy az
  előnézeten az átírás / fejlécszabály megváltozik: STOP, a `vercel.json` módosítása kikerül a PR-ból, és a spec „Módosítás”
  szakaszában új megoldás (pl. `vercel.ts` `requestHeaders`) kerül rögzítésre.

## T4 — Környezeti változó (az érték sehol nem jelenik meg)
- `scripts/qa/set-proxy-secret.mjs` (új): 32 véletlen bájt (hexa) a folyamat memóriájában; Render API
  (`PUT /v1/services/<id>/env-vars/WEBSULI_PROXY_SECRET`, `RENDER_API_KEY`) és Vercel API (`POST /v10/projects/<id>/env`,
  `type: sensitive`, `target: production + preview`, `VERCEL_TOKEN`); a kimenet csak HTTP-státusz. Meglévő változót nem ír
  felül (`--rotate`: a Renderen új + régi érték együtt). A Render-változó a következő telepítéskor él.
- **Az éles titoktár írása tulajdonosi lépés** (2026-11-10: az ügynök munkamenetében a jogosultsági őr letiltotta, megkerülni
  tilos): a tulajdonos futtatja `node scripts/qa/set-proxy-secret.mjs`, utána Render- és Vercel-újratelepítés. Addig a kód a
  közvetlen ágon fut (A1 élő része és A6 Vercel-fele nyitott).
- `render.yaml`: `WEBSULI_PROXY_SECRET` `sync: false`, magyarázó megjegyzéssel.

## T5 — Tesztek (új) — `source/tests/client-ip.test.ts`
- `normalizeIp`, `hasValidProxySecret` (hiányzó / rövid szerverérték, rossz érték, több érték, tömbfejléc).
- `resolveClientIp`: titokkal XFF bal szélső; titok nélkül hamis XFF hatástalan; `RENDER=true` → `cf-connecting-ip`; Renderen
  kívül nem; IPv6 /56; `::ffff:`.
- Valódi Express + `rateLimit` (`trust proxy: 1`, 127.0.0.1): (a) közvetlen hívás, kérésenként más hamis XFF → a
  `RateLimit-Remaining` folyamatosan csökken, a keret elfogy (429); (b) titokkal két különböző kliens külön számláló, ugyanaz a
  kliens közös; (c) rossz titok + hamis XFF → közös (közvetlen) keret.
- Forrásőr: a `server/**/*.ts` minden `rateLimit(` hívásának zárójelpárján belül van `keyGenerator`.
- `vercel.json`: a `routes` szabály alakja (A8), és a fájlban nincs 32+ hexa karakteres érték.

## T6 — Ellenőrzés, szállítás
- `npm run check`, `npm run lint`, `npm run check:test`, `npm test` (a `source/` mappában).
- PR a `main`-re; Vercel előnézet: a build zöld, az előnézeti címen `/api/learner/me` 401 + `Ratelimit-*`, a főoldal 200,
  `/api/tts/audio` fejlécei változatlanok. Összevonás; Render-telepítés megvárása (`verify-render-revision.mjs`).
- Élő próba (A6), `curl -D -`: közvetlenül 6 kérés (köztük hamis XFF és hamis titok) → egyetlen, folyamatosan csökkenő számláló;
  `websuli.vip`-en át 4 kérés → egyetlen csökkenő számláló; második kliens (más kimenő cím) → saját, friss számláló.
- `docs/agent-csapdak.md`: új bejegyzés (C-25) a mérésből adódó tanulságokkal; a C-24 nyitott tételének lezárása.

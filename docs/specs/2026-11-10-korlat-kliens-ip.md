# Spec: az IP-alapú kéréskorlátok a valódi kliens címe szerint számoljanak

> Dátum: 2026-11-10 · Állapot: **JÓVÁHAGYVA (a #410 review elhalasztott tétele; tulajdonosi állandó felhatalmazás 2026-11-09)**
> Végrehajtás: `docs/specs/2026-11-10-korlat-kliens-ip-vegrehajtas.md`. Előzmény: csapda C-24 (2. tünet).

## Mért tény (2026-11-10, élő próba, `GET /api/learner/me`, `learnerMeLimiter` 1500 / 15 perc)
- `source/server/index.ts`: `app.set("trust proxy", 1)` → `req.ip` = az `X-Forwarded-For` jobb szélső eleme. Az
  `express-rate-limit` alapkulcsa ez a cím.
- A Render előtt Cloudflare áll (`Server: cloudflare`, `CF-RAY`), utána a Render terheléselosztója. Egyetlen példány fut
  (`render.yaml`: `plan: starter`, példányszám nincs megadva).
- **Közvetlen hívás** (`websuli-api-eu.onrender.com`), 5 kérés ugyanarról a gépről: `Ratelimit-Remaining` 1499, 1498, 1499,
  1497, 1498 — legalább két külön számláló. A jobb szélső XFF-elem tehát kérésenként váltakozó közbenső cím, nem a kliensé.
  A korlát ma közvetlen hívásnál is szétszóródik (a kliens több keretet kap), és idegen kliensek közös keretbe eshetnek.
- **Vercelen át** (`websuli.vip`), 4 kérés: 1499, 1499, 1498, 1497 — ugyanez; a kulcs itt sem a látogató címe.
- Közvetlen hívás hamisított `X-Forwarded-For` fejléccel: a számláló a fenti szórásba illik — a bal oldali, kliens által írt
  elem ma nem kulcs (a jobb szélső számít). Hamisított `CF-Connecting-IP` fejlécre a Cloudflare 403-at ad, a kérés a
  szolgáltatásig el sem jut.
- A Render dokumentációja (web-services, faq, ddos-protection) a kliens-IP fejlécekről és az XFF-láncról **nem ír** —
  a Render-oldali viselkedés csak méréssel igazolható (A6).
- Vercel dokumentáció (`/docs/headers/request-headers`, `/docs/routing/rewrites`):
  - `x-forwarded-for`: „The public IP address of the client”; a Vercel a kliens által küldött értéket **felülírja**
    („we currently overwrite the X-Forwarded-For header and do not forward external IPs … to prevent IP spoofing”).
  - Külső átírásnál a Vercel továbbítja: `x-real-ip`, `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto`; „configure
    it to trust these headers only for requests that come from Vercel”.
  - „Restricting your origin to Vercel traffic”: titkos kérésfejléc `routes` → `transforms` (`request.headers`, `op: set`,
    `env`) szabállyal; a `set` a látogató saját értékét felülírja; ellenőrzés időzítésbiztos összehasonlítással.
- Érintett korlátok (kulcs: `req.ip`): `index.ts` — `subscriptionLimiter`, `loginLimiter`, `ttsLimiter`, `ttsAudioLimiter`,
  `arbiterLimiter`, `publicWriteLimiter`; `routes.ts` — `materialResultIpLimiter`, `learnerMeLimiter`, a
  `materialResultClientLimiter` IP-tartaléka; `routes/error-report.ts`; `routes/client-error.ts`;
  `lesson-result-email.ts` `resultLimiter`. Nem érintett: `rewards/review-router.ts` (kulcs: tanulóazonosító).

## Cél
- Minden IP-alapú korlát kulcsa a valódi kliens címe legyen: két különböző látogató a Vercelen át külön keretet kap, ugyanaz a
  látogató mindig ugyanazt a keretet fogyasztja.
- A kulcs ne legyen hamisítható: sem a Vercelen át, sem közvetlen Render-hívásnál ne adjon új keretet egy kliens által írt fejléc.
- Egyetlen közös kulcsképző (`server/lib/client-ip.ts`), IPv6-nál /56 alhálózat szerint (`ipKeyGenerator`).

## Nem cél
- A `trust proxy` érték módosítása (a `req.protocol` / biztonságos süti / origin-ellenőrzés erre épül).
- A korlátok mérete, ablaka, útvonala; megosztott (Redis) tároló.
- A `req.ip` egyéb felhasználásai (megtekintés-deduplikálás, eredménylevél, közreműködő-kulcs) — külön feladat.
- A Render közvetlen címének lezárása a nem Vercelről érkező forgalom elől (a `/dev/:id` anyagok onnan töltődnek).

## Döntések
- **A Vercelen át érkező kérés felismerése: megosztott titok.** A Vercel a `/api/*` kérésekre `x-websuli-proxy-secret`
  fejlécet állít (`vercel.json` `routes` → `transforms`, `op: set`, érték a `WEBSULI_PROXY_SECRET` környezeti változóból).
  A szerver ugyanezt a változót olvassa, és SHA-256 lenyomatokon `timingSafeEqual`-lal hasonlít. A titok értéke csak a Vercel
  és a Render környezeti változójában él; kódban, naplóban, dokumentumban, commitban nem szerepel. 32 karakternél rövidebb vagy
  hiányzó szerveroldali érték esetén a fejléc sosem számít érvényesnek (hibás beállítás nem nyit kaput).
  Elvetve: a Vercel kimenő címtartományának ellenőrzése (nincs közzétett, stabil lista).
- **Kulcs érvényes titokkal:** az `X-Forwarded-For` bal szélső eleme (a Vercel írja, a kliensét felülírja; a Cloudflare és a
  Render csak jobbra fűz). Ha ez nem érvényes IP: `x-real-ip`; ha az sem: a közvetlen ág.
- **Kulcs titok nélkül (közvetlen hívás):** a Renderen (`RENDER=true`) a `CF-Connecting-IP` (a Cloudflare írja; a kliens által
  küldöttet a Cloudflare elutasítja — mérve), különben `req.ip`. A `CF-Connecting-IP`-t Renderen kívül (helyi futás, saját
  nginx) nem vesszük figyelembe, mert ott a kliens írhatná.
- A cím normalizálása: `::ffff:a.b.c.d` → `a.b.c.d`; érvénytelen érték kihagyva; a végén `ipKeyGenerator(ip)`.
- Minden IP-alapú `rateLimit(...)` a közös `clientIpKeyGenerator`-t kapja. Forrásőr-teszt: a `server/` alatt nincs `rateLimit(`
  hívás `keyGenerator` nélkül.
- Titokcsere: a szerver vesszővel elválasztva több értéket is elfogad (régi + új), így a csere kiesés nélkül végezhető.
- Sorrend: a titok előbb kerül a Render és a Vercel környezetébe; a kód titok nélkül is biztonságos (közvetlen ág).

## Edge case-ek
- A látogató a Vercelen át saját `x-websuli-proxy-secret` / `X-Forwarded-For` fejlécet küld → a Vercel mindkettőt felülírja.
- Közvetlen hívás rossz titokkal + hamis XFF → közvetlen ág, a hamis cím nem kulcs.
- Közvetlen hívás titok nélkül, hamis XFF → közvetlen ág.
- A Vercelen a változó hiányzik (üres fejléc) → közvetlen ág: a keret a Vercel kimenő címe szerint közös (a mai állapotnál nem rosszabb).
- IPv6 kliens → /56 alhálózat a kulcs; IPv4-be ágyazott IPv6 → IPv4.
- XFF több elemmel, szóközökkel; tömbként érkező fejléc → az első érték bal szélső eleme.
- A titok kiszivárog → a támadó közvetlen hívással tetszőleges kulcsot írhat (korlátkerülés); kezelés: csere a fenti módon.
  A titok semmilyen más jogosultságot nem ad.
- Az Express előtt semmilyen proxy nem áll (helyi futás): `trust proxy: 1` mellett a `req.ip` a kliens által írt XFF jobb
  szélső eleme — meglévő viselkedés, nem cél (a `trust proxy` nem változik); a tesztek a termelési láncot modellezik (a
  terheléselosztó a lánc végére fűzi a csatlakozó fél címét).
- A Render nem továbbítja a `CF-Connecting-IP`-t → a közvetlen ág `req.ip`-re esik vissza (mai viselkedés); A6 méri.

## Elfogadás (EARS)
- [ ] A1: WHEN a kérés érvényes titokfejléccel érkezik THEN a kulcs SHALL az XFF bal szélső (érvényes) címe; két különböző
      cím két külön keretet fogyaszt, ugyanaz a cím ugyanazt.
- [ ] A2: WHEN a titokfejléc hiányzik vagy hibás THEN a kliens által írt `X-Forwarded-For` / `x-real-ip` SHALL NOT változtatja
      a kulcsot (egységteszt: hamisított XFF közvetlen hívásnál nem ad új keretet).
- [ ] A3: WHEN a szerveren nincs (vagy 32 karakternél rövidebb) titok THEN semmilyen fejlécérték SHALL NOT számít érvényes titoknak.
- [ ] A4: WHEN `RENDER=true` és nincs érvényes titok THEN a kulcs SHALL a `CF-Connecting-IP`; Renderen kívül ezt a fejlécet a szerver figyelmen kívül hagyja.
- [ ] A5: IPv6-címnél a kulcs SHALL a /56 alhálózat; `::ffff:`-előtagos cím IPv4-ként számol.
- [ ] A6 (élő): a `websuli.vip`-en át két különböző kliens külön `Ratelimit-Remaining` számlálót kap, és ugyanaz a kliens
      egymás utáni kérései egyetlen számlálót csökkentenek; közvetlen Render-hívásnál a hamisított `X-Forwarded-For` és a
      hamis titokfejléc nem ad új keretet, és az egymás utáni kérések egyetlen számlálót csökkentenek.
- [ ] A7: a `server/` alatt minden `rateLimit(` hívásnak SHALL van `keyGenerator`-a (forrásőr-teszt).
- [ ] A8: a `vercel.json` `/api/` szabálya SHALL `set` művelettel állítja a titokfejlécet a `WEBSULI_PROXY_SECRET` változóból;
      a fájl a titok értékét nem tartalmazza; a meglévő átírások és fejlécszabályok változatlanok.
- [ ] A9: `check`, `lint`, `check:test`, `npm test` zöld.

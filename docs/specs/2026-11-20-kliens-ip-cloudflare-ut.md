# Terv: a `CF-Connecting-IP` csak igazolt Cloudflare-úton számítson (kliens-IP hamisítás, #169)

> Dátum: 2026-11-20 · Szelet: I-1 (`docs/specs/2026-11-19-websuli-potlasok-terv.md`, 7.8; P-052) · Kanban: #169 ·
> Végrehajtás: `docs/specs/2026-11-20-kliens-ip-cloudflare-ut-vegrehajtas.md` · Előzmény: `docs/specs/2026-11-10-korlat-kliens-ip.md`.

## Mért / ellenőrzött tény

- `source/server/lib/client-ip.ts` 66–69. sor (a `d9d1e6c6` mainen): `RENDER === "true"` mellett a `cf-connecting-ip` fejléc
  igazolás nélkül kulcs. A Vercel-út (17. sor, `x-websuli-proxy-secret`) titokkal igazolt.
- Kanban #169: a vak ellenőr tesztkörnyezetében (`RENDER=true`) hamis `CF-Connecting-IP` minden kérésre új keretet adott (200).
- 2026-11-10-i élő mérés (előzmény-spec „Mért tény”): a `websuli-api-eu.onrender.com` előtt Cloudflare áll; hamisított
  `CF-Connecting-IP`-re a Cloudflare 403-at ad. Tehát a hiba csak akkor kihasználható, ha a Render-szolgáltatás a Cloudflare
  megkerülésével is elérhető — ezt nem tudjuk kizárni (a Render dokumentációja erről nem ír: UNVERIFIED), és a kód ne is erre
  építsen.
- A Cloudflare a származási szerver felé a közzétett címtartományaiból kapcsolódik
  (`https://www.cloudflare.com/ips-v4`, `/ips-v6`, letöltve 2026-11-20: 15 IPv4- és 7 IPv6-tartomány), és az
  `X-Forwarded-For` végére fűzi a hozzá csatlakozó kliens címét. A Render terheléselosztója (`trust proxy: 1` mellett ez adja a
  `req.ip`-t) a hozzá csatlakozó fél címét fűzi a lánc végére. A kliens csak a lánc bal oldalát írhatja.
- A Render- és a Cloudflare-beállítás a tulajdonos fiókjában nem adja meg, hogy a Render csak a Cloudflare-től fogadjon
  forgalmat (a Render nem kínál ilyen beállítást — UNVERIFIED; a `*.onrender.com` Cloudflare-zónája a Renderé, nem a tulajdonosé,
  ezért ott titkos fejléc sem állítható).

## Változatok és döntés

| Változat | Mit kér | Értékelés |
|---|---|---|
| **A — a Cloudflare-út igazolása a láncból (VÁLASZTOTT)** | kód: a `CF-Connecting-IP` csak akkor kulcs, ha az `X-Forwarded-For` lánc jobbról első nyilvános címe a Cloudflare közzétett tartományában van | éles beállítás nélkül biztonságos; a valódi Cloudflare-út (közvetlen Render-hívás és a titok nélküli Vercel-út) változatlan, mert ott a jobbról első nyilvános elem a Cloudflare élszervere |
| B — titkos jel a Cloudflare-úton (a Vercel-út mintájára) | Cloudflare Transform Rule a zónán | nem megvalósítható: a `onrender.com` zóna nem a tulajdonosé; saját zóna + saját domain a Render előtt nagy, éles átszervezés |
| C — a közvetlen Render-elérés elzárása | Render-beállítás | a Render ilyen kapcsolót nem kínál (UNVERIFIED); az előzmény-spec nem-célja (a `/dev/:id` anyagok onnan töltődnek) |
| D — a `CF-Connecting-IP` teljes elhagyása | kód | biztonságos, de a közvetlen Render-hívás kulcsa visszaesik a kérésenként váltakozó közbenső címre (a 2026-11-10 előtti, szétszóródó keret) — a Cloudflare-út NEM maradna változatlan |

Indok: az A az egyetlen, amely éles beállítás nélkül zárja a rést, és a mért, valódi útvonalakat nem változtatja. A jobbról első
**nyilvános** elemet nézzük (a privát / belső címeket — RFC 1918, CGNAT 100.64/10, loopback, link-local, IPv6 ULA — átugorjuk), mert
a Render egy vagy több belső hopot is tehet a lánc végére (a hopok száma UNVERIFIED); a lánc jobb oldalát csak a Cloudflare és a
Render írhatja, így a támadó által a bal oldalra írt Cloudflare-cím nem kerülhet az első nyilvános helyre.

## Cél

- Igazolatlan `CF-Connecting-IP` (a lánc jobbról első nyilvános eleme nem Cloudflare-cím) SOHA ne legyen kulcs — Renderen sem.
- A valódi Cloudflare-út (a jobbról első nyilvános elem Cloudflare-cím) változatlanul a `CF-Connecting-IP` szerint számol.
- A Vercel-út (érvényes titok) változatlan, és megelőzi a Cloudflare-ágat.

## Nem cél

- A `trust proxy`, a korlátok mérete / ablaka, a Vercel-titok kezelése, a `vercel.json`.
- A `req.ip` egyéb felhasználásai.
- Éles beállítás (Render, Cloudflare, Vercel, titok-rotáció) — az ügynök nem végzi.
- A Cloudflare-tartománylista automatikus frissítése (ritkán változik; a lista forrása és dátuma a kódban áll).

## Érintett fájlok

- `source/server/lib/client-ip.ts` — Cloudflare-tartományok (`net.BlockList`), privát tartományok, `isFromCloudflare(req)`,
  a Cloudflare-ág feltétele.
- `source/tests/client-ip.test.ts` — új bukó tesztek (I1–I4), az A4 első állítása a valódi láncot modellezi (Cloudflare-élszerver a
  láncban) — dokumentált spec-változás, nem gyengítés: a régi állítás pont a #169 hibás viselkedését rögzítette.
- `docs/specs/2026-11-10-korlat-kliens-ip.md` — az A4 döntés kiegészítése hivatkozással erre a tervre.

## Edge case-ek

- Közvetlen, Cloudflare-t megkerülő hívás hamis `CF-Connecting-IP`-vel, hamis Cloudflare-címmel a lánc bal oldalán → a Render
  terheléselosztója a támadó nyilvános címét fűzi a végére → nem igazolt → `req.ip` (közvetlen ág).
- Ugyanez, a lánc bal oldalán privát címekkel kevert hamis Cloudflare-címmel → a jobbról első nyilvános elem továbbra is a
  támadóé → nem igazolt.
- Valódi Cloudflare-út egy belső Render-hoppal (`…, <CF-élszerver>, 10.x.y.z`) → a privát elemet átugorjuk → igazolt.
- Nincs `X-Forwarded-For` → a lánc egyetlen eleme a `req.ip`; ha az Cloudflare-cím → igazolt, különben nem.
- Csupa privát lánc (helyi futás, belső hívó) → nem igazolt.
- Érvénytelen láncelem (`unknown`, port) → a lánc nem értelmezhető → nem igazolt (biztonságos irány).
- Tömbként érkező `X-Forwarded-For` → az elemek összefűzve, sorrendben.
- IPv6 Cloudflare-élszerver (`2a06:98c0::/29` stb.) → igazolt; `::ffff:`-előtagos IPv4 → IPv4-ként.
- Renderen kívül (`RENDER` nem `true`) a fejléc továbbra sem számít.
- Érvényes Vercel-titok → a Vercel-ág előbb fut, a Cloudflare-ág nem számít (változatlan).
- Ha élesben a Render a Cloudflare és az Express közé nyilvános című saját hopot tesz (UNVERIFIED), a közvetlen hívás kulcsa a
  közvetlen ágra esik vissza (szétszóródó keret, nem hamisítható) — ezt a tulajdonosi élő mérés (EARS I6) mutatja ki.

## Elfogadás (EARS)

<!-- acceptance-checklist -->
- [x] I1: WHEN `RENDER=true` és a kérés hamis `CF-Connecting-IP`-vel, Cloudflare-t megkerülve érkezik (a lánc jobbról első
      nyilvános eleme nem Cloudflare-cím) THEN a kulcs SHALL NOT a fejléc értéke (hanem a `req.ip`).
- [x] I2: WHEN a támadó a lánc bal oldalára Cloudflare-címet ír (privát elemekkel is keverve) THEN a fejléc SHALL NOT kulcs.
- [x] I3: WHEN a lánc jobbról első nyilvános eleme Cloudflare-cím (IPv4 vagy IPv6, belső hoppal vagy anélkül) THEN a kulcs SHALL a
      `CF-Connecting-IP` (a valódi Cloudflare-út változatlan).
- [ ] I4 (élő korlát, Express + `express-rate-limit`): Cloudflare-t megkerülő, kérésenként más hamis `CF-Connecting-IP` nem ad új
      keretet; a valódi Cloudflare-úton két különböző kliens külön keretet kap.
- [x] I5: a meglévő A1, A2, A3, A5, A7, A8 tesztek változatlanul zöldek; az A4 Renderen kívüli és Vercel-elsőbbségi állítása változatlan.
- [ ] I6 (élő, tulajdonosi mérés a telepítés után): közvetlen `websuli-api-eu.onrender.com` hívás 8× ugyanarról a gépről egyetlen,
      egyesével csökkenő `Ratelimit-Remaining` számlálót ad (a Cloudflare-út igazolt); ha szóródik, a lánc jobb oldalán nem
      Cloudflare-cím áll → új döntés kell.
- [x] I7: mutációs ellenpróba — a Cloudflare-feltétel eltávolításával az I1/I2/I4 teszt bukik.

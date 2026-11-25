# B7 — tartós kimenő sor a végleges eredmény-beküldésekre (kapcsoló mögött, alapból KI)

> Dátum: 2026-11-25 · Tulajdonosi döntések: 2026-11-21 („Szűkítés: tartós sor külön”, kapcsoló alapból KI), 2026-11-25 (B5b, utána
> B6–B8). · Előzmény: `docs/specs/2026-11-22-eredmeny-email-bontas.md` (B7 sor), `docs/specs/2026-11-20-eredmenylevel-tartos-sor.md`,
> a #510 tárolórétege (`shared/result-outbox.ts`, `389ea8c3` / `2461272c`).

## Probléma
A végleges beküldés ma a lapon belül legfeljebb 3-szor próbálkozik (B2); ha a tanuló közben bezárja a lapot, vagy a hálózat tartósan
nincs meg, a kör a következő megnyitásig csak akkor megy el, ha ugyanazt a leckét nyitja meg újra. A #510 tartós sora (R24, R28, R30,
R32) ezt oldja meg — a #510 kilét-modellje (fiókcímke, szerveroldali claim, V2 API) viszont nincs a főágon.

## Döntések (a főág modelljéhez szűkítve)
1. **Kapcsoló:** `VITE_RESULT_OUTBOX_ENABLED=1` (build-idejű); az e2e-buildben (`VITE_ENABLE_RUNTIME_PROBE=1`) a
   `window.__websuliResultOutbox === true` horog. KI állásban a viselkedés változatlan (a mostani lapon belüli 3 kísérlet).
2. **R24 — sorba kerülés:** BE állásban a kész kör (a mostani „kész” feltétel, korhatár) törzse várakozás nélkül a sorba kerül, és a sor
   azonnal ürül. A sort a beküldő, az alkalmazás indulása (ha van függő bejegyzés) és az `online` esemény üríti — más leckéből és
   későbbi megnyitáskor is.
3. **R32 — fülbiztos tárolás:** bejegyzésenként külön kulcs (`websuli:result-outbox:v1:<azonosító>`), nincs közös lista; azonos
   azonosító nem kerül be kétszer. **R28:** írhatatlan / elérhetetlen tárolónál memóriasor.
4. **R30 / R40 — korhatár:** a bejegyzés a kör utolsó tevékenységének idejét viszi (lezárt körnél a sorba kerülését); 7 napnál régebbi
   küldés nélkül kikerül — az ürítéskor ÉS a tényleges kérés előtt is.
5. **Kilét (B4b-vel azonos, R47 / R49 b):** a bejegyzés a kör rögzített párosítási lenyomatát viszi (nem a tokent); a mostani token csak
   egyezésnél kerül a kérésbe (kötés BE), különben a főági viselkedés. A fiókcímke (#510 R31) és a szerveroldali kilét-rögzítés (R51) a
   V2 API-val jön, nem itt.
6. **Kísérletek:** laponként bejegyzésenként legfeljebb 3 (30 s, 60 s várakozás), egyetlen szinten (`apiRequest` belső újrapróba 0).
   Siker (2xx) → „már elküldve” jelző, a pillanatkép- és a kilét-rekord törlése, a bejegyzés kikerül. 400 / más nem újrapróbálható 4xx
   (a 429 kivételével) → kikerül. Újrapróbálható hiba (hálózat, időtúllépés, 5xx, 429) → marad a sorban (a következő ürítésig).
7. Körönként egyszerre egy kérés lehet úton; különböző körök párhuzamosan mehetnek (R20).

## Elfogadás (EARS)
- AMIKOR a kapcsoló BE ÉS a végleges beküldés 5xx-szel bukik, A RENDSZER a bejegyzést a tárolóban tartja, és a következő
  alkalmazásinduláskor elküldi (a lecke megnyitása nélkül is).
- AMIKOR a válasz 400, A RENDSZER a bejegyzést törli, újra nem küldi.
- AMIKOR a bejegyzés 7 napnál régebbi tevékenységű, A RENDSZER küldés nélkül törli.
- AMIKOR a kapcsoló KI, A RENDSZER a tárolóba nem ír, és a mostani viselkedés marad.

## Visszavonás
A kapcsoló KI (alapállás). A megmaradt bejegyzéseket KI állásban senki nem olvassa; ártalmatlanok.

## Review #608 (2026-11-25)
- A hiba besorolása közös függvényben (`outboxFailureAction`): végleges elutasítás csak ismert, végleges HTTP-4xx-nél (a 408 / 429 kivételével); az 5xx, a 408 / 429 és minden besorolhatatlan hiba (pl. a CSRF-frissítés státusz nélkül továbbított 503-a, hálózati hiba) korlátos újrapróbán marad.
- A véglegesen elutasított kör külön, tartós jelzőt kap (`…:sent:<kör>:rejected`, memóriában is); a hook a sorba vétel előtt, a sor ürítése küldés előtt ellenőrzi — a lecke újranyitásakor sem megy újra, a háromkísérletes korlát nem kerülhető meg.

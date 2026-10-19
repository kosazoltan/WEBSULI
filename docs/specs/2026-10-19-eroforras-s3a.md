# Erőforrás-optimalizálás S3a — gyorsítótár-barát kérésszerkezet (bank, lektor)

Állapot: tulajdonosi jóváhagyás 2026-10-19 (az erőforrás-elemzés minden javaslata, szeletenként). Előzmény: S1 (#324: 1 órás TTL),
S2a (#325), S2b (#328).

## Mérés (éles telemetria, `studio_jobs.output.telemetry.stations`, utolsó 10 nap)
| állomás | hívás | javító | bemenet | ebből cache | kimenet |
|---|---|---|---|---|---|
| gyakorlóbank | 112 | 54 | 2 637 475 | 326 754 (12 %) | 1 022 647 |
| ellenőrzés | 216 | 0 | 394 708 | 1 102 (~0 %) | 505 919 |
| tananyag | 19 | 9 | 2 102 770 | 1 739 710 (83 %) | 366 565 |
| lektorálás | 14 | 0 | 1 161 853 | 19 295 (~2 %) | 48 402 |

## Gyökérok (fájl:sor)
- **Bank — az állandó előtag nem kerül gyorsítótárba.**
  - `server/studio/single-run/engine.ts` `freshBankCall`: a kérés EGY szövegblokk:
    `5. ÁLLOMÁS … ${system}\n\n${user}`, ahol `system` (`server/studio/experience-builder.ts` bank-ág) = szerepkészség (5 326 kar) +
    `LESSON_METHOD_CONTRACT` (4 388) + csomagonkénti szerződés + `OPEN_ANSWER_RULES_HU` (2 541) + csomagonkénti adat.
  - Utána jön a runbook (`withRoleRunbook`), a végén pedig a kérés-szintű automatikus töréspont, amely a csomagonként EGYEDI
    farok után ül.
  - Így a ~12 300 karakteres (≈ 4 000 token) állandó rész egyik csomag és egyik javítókör számára sem olvasható. A 112 hívás fele
    (54) javítókör, ugyanazzal az előtaggal.
- **Lektor — a forrás átirata nem kerül gyorsítótárba.**
  - `engine.ts` lektor-kör: [forrásátirat, lektorkérés + lecke, runbook], körönként FRISS beszélgetésben.
  - A 2. kör forrásátirata bájtra azonos, de töréspont csak a (változó) végén van, ezért nem olvasható.
- **A szabály** (Claude API prompt-caching dokumentáció):
  - olvasni csak ott lehet, ahol korábbi kérés töréspontot írt;
  - Opus 5.5-nél a minimum 512 token;
  - legfeljebb 4 töréspont kérésenként;
  - az 1 órás bejegyzés a rövidebbek előtt álljon.

## Cél
1. **`TurnBlock` szövegblokk:** opcionális `cache: true` → Anthropic-blokk `cache_control: { type: "ephemeral", ttl: "1h" }`.
   - Kérésenként legfeljebb 2 ilyen jelölő megy ki (a legutolsók); a rendszerblokk és a kérés-szintű jelölő mellett így ≤ 4.
   - Az OpenAI-tartalékon nincs hatása.
2. **Bank:**
   - az `experience-builder` bank-rendszerszövege az ÁLLANDÓ előtaggal kezdődik: `bankStaticPrefix()` = szerepkészség +
     `LESSON_METHOD_CONTRACT` + `OPEN_ANSWER_RULES_HU`; ezt követi a csomagonkénti rész;
   - a `freshBankCall` a kérést így rakja össze: [állandó előtag, runbook (`cache`), `5. ÁLLOMÁS …` + csomagonkénti rész + user].
3. **Lektor:** a forrásátirat-blokk `cache: true` → a 2. lektorkör olvassa.

## Nem-cél
- **A párhuzamosság és a sorrend változatlan:** az egyszerre induló csomagok továbbra sem olvassák egymást; a következő csoport és
  a javítókörök igen.
- **Minőséget érintő változások:** az ellenőrzés effortja, a javítókörök csökkentése (patch) és az arbiter-előszűrés — ezek
  mérési (költséges) kört igényelnek, külön szelet tulajdonosi keretjóváhagyással (S3b).
- **A modell** (a bank Opus marad, tulajdonosi döntés 2026-10-16).

## Edge case-ek
- **Forrásátirat nélküli lecke:** üres `sourceBlock` → nincs jelölő.
- **Ismeretlen rendszerszöveg:** ha a bank `system` nem az állandó előtaggal kezdődik (más hívó), a régi egyblokkos alak marad.
- **Visszatöltött beszélgetés:** az állapotban a `cache` mező is megmarad (JSON).

## Elfogadás (EARS)
- **Bank-kérés:** HA bankkérés megy, AKKOR az első szövegblokk az állandó előtag, a runbook-blokk `cache_control` 1h jelölőt visel,
  és a csomagonkénti rész utána áll.
- **Lektor-kérés:** HA lektorkérés megy forrásátirattal, AKKOR az átirat-blokk 1h jelölőt visel.
- **Töréspont-keret:** HA egy kérésben kettőnél több `cache` blokk volna, AKKOR csak az utolsó kettő kap jelölőt.
- **Élő mérés:** a kitelepítés utáni első gyártás telemetriájában a gyakorlóbank és a lektorálás gyorsítótár-aránya nő.
  - Ez NOT RUN a PR-ban; a következő tulajdonosi gyártás után mérjük.

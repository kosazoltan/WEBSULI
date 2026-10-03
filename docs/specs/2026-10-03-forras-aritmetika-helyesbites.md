# Hamis egyenlőség a forrásban — determinisztikus forrás-helyesbítés (2026-10-03)

Tulajdonosi bejelentés: a „Negatív számok kivonása” (5. o.) lecke a kapun megállt: „Hibás banktétel maradt a limiten, és a
kivétel után a bank nem felelne meg — nem publikálható” (job 9f2087ef, map 6701ee87, 2026-10-03 06:50–07:11, élesen 380f03c —
a modellcsere PR-ja még nem élt).

## Mért gyökérok (éles DB + kód)
- A forrás egy lefotózott munkalap (`source_files[0].kind = image`, OCR-átirat 182 kar.), 12 egyenlőséggel; közülük 7 HAMIS
  (`9-(-6)=+3`, `-8-(+6)=-2`, `-8-(-6)=-14`, `-2-8=-+6`, `-2-(-8)=+10`, `-2-(+8)=+6`, `-5-(+8)=+3`) — tanulói hibák / olvasati zaj.
- A kivonatoló mind a 13 sort tényként térképezte (`km_concepts`: „A forrás szerint 9-ből (-6)-ot kivonva +3 az eredmény.”).
- A forrás-helyesbítő (`server/studio/source-corrections.ts`) csak betűszintű olvasati hibát és tanári kérést fogad el; a
  számot KIFEJEZETTEN tiltja (`isLetterLevelMisread`: „szám, évszám, dátum SOHA nem betűhiba”) — jogosan, mert az modell-javaslat.
- A szerző hűen a térképet tanította („a forrás eredményéig” a vázlatban), a bank-ellenőr + vak megoldó 73 tételt jelzett
  (bizonyíték: `-5-(+8) = -13`, „a forrás és a tanítás itt hibás”), a lektor a limiten mindet kivehetőnek sorolta (nem
  tanítási tényhiba → nem járt célzott szerzői javítás), a kapu a kivétel után a fogalmankénti recall/apply padlót és a 45/75-öt
  nem látta teljesülni (`step-runner.ts:1428`). Ugyanez minden újraindításnál megismétlődne: az ok a térképben van.
- A bank-ellenőr promptja a forrás-IDÉZETET nevezi mércének (`bank-verifier.ts:127`), ezért a térkép definíciójának javítása
  önmagában nem elég: a helyesbítést az ellenőrnek is látnia kell.
- Az aritmetika-kiértékelő (`shared/arithmetic-expression.ts`) nem kezeli az előjeles zárójelet (`9-(-6)` → null) és a `+3`
  alakú eredményt (→ null).

## Cél
1. **Determinisztikus** (modell nélküli) forrás-helyesbítés `basis: "arithmetic"`: a fogalom idézete egy (vagy láncolt)
   egyenlőség, amelynek bal oldala kiértékelhető (előjeles zárójel normalizálva), és a jobb oldal eltér vagy olvashatatlan →
   a definíció a helyes eredményt mondja ki, és megnevezi, hogy a forrás sora hamis; a `quote` változatlan (bizonyíték).
2. A helyesbítés MINDEN lecke-indításnál fut (nem csak kérésre/fotóra), a meglévő mentési úton (`km_concepts` term/definition,
   `verbatim_reason = corrected:arithmetic`), és a `job.output.sourceCorrections`-ben utazik → tervező, szerző, lektor prompt.
3. A bank-ellenőr a helyesbített fogalom idézete mellé megkapja a helyesbítést („a forrás sora hamis, a helyes eredmény: …”),
   és a „cleared”-kulcs (verifierContext) a helyesbítést is tartalmazza.
4. A javítási (okosítási) útvonal (`structured-improvement.ts`) ugyanezt a determinisztikus helyesbítést alkalmazza.

## Nem-cél
Nem-aritmetikai forráshibák; a kapu/limit szabályai; a modellalapú helyesbítés szigorának lazítása (szám továbbra is tilos
modell-javaslatként); az OCR javítása.

## Edge case-ek
- Nem előjeles zárójel (`(500+480):2=490`) → kiértékelhetetlen → nem állítunk semmit (változatlan viselkedés).
- Lánc (`40 – 18 + 4 = 22 + 4 = 26`) → csak szomszédos, kiértékelhető tagok eltérése számít.
- Pipa/ikszek a sor végén (`-8-6=-14 ✓`) → levágva; a pipa NEM bizonyíték (a `-5-(+8)=+3 ✓` is hamis).
- Olvashatatlan eredmény (`-2-8=-+6`) → helyesbítés a kiszámolt értékkel.
- Már helyesbített sor (ismételt indítás) → azonos szöveg, idempotens (nincs kettős audit).
- Modell-javaslat és determinisztikus helyesbítés ugyanarra a fogalomra → a determinisztikus nyer.

## Elfogadás (EARS)
- HA a térkép a mért 13 idézetet tartalmazza, AKKOR pontosan c2, c4, c5, c6, c7, c8, c11 kap helyesbítést, rendre 15, −14, −2,
  −10, 6, −10, −13 értékkel; c1, c3, c9, c10, c12, c13 nem.
- HA egy fogalomhoz aritmetikai helyesbítés tartozik, AKKOR a szerzői/lektori prompt-sorok és a bank-ellenőr prompt tartalmazza
  a helyes eredményt és a „hamis egyenlőség a forrásban” jelölést.
- `correctMapFromOwner` kérés és fotó nélkül is lefuttatja az aritmetikai helyesbítést (forrás-ellenőrzés teszttel).
- Teljes unit + visszajátszás + tsc + lint zöld.

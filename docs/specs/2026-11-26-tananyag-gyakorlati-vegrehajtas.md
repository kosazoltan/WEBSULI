Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md`

# Végrehajtás — TANANYAG-GYAKORLATI

Szeletenként önálló PR, háromfázisú renddel (utasítás → bukó teszt → kód), a kapulánccal.

## P1 — közös mérce és csak olvasó audit (`feat/tananyag-gyakorlati-p1`)

1. `source/shared/practice-policy.ts`: tételenkénti besorolás — `alkalmazas | fogalmi | meta | bizonytalan` —, oka és a szabály
   verziója (`PRACTICE_POLICY_VERSION`). A modell saját `intent` címkéje NEM bizonyíték. Kvíznél a kérdés + az opciók, nyílt
   feladatnál a kérés + a minta számít. A meta determinisztikus mintákból (feladatlap / feladattípus / pontozás / útmutató / vizsga-
   szerkezet), kötelező negatív kontrollokkal (sportpontszám, geometriai pont, „hány pontot kapott a versenyző” szöveges feladat).
   `auditExperience(experience)` bankonként (kvíz, nyílt) darabszám + arány + tételek; `practiceTarget(N, C)` a D1 szerinti alsó /
   felső határ és a fogalompár-korlát.
2. `source/scripts/measure/practice-audit.mts`: lecke-JSON / fúziós HTML (`websuli-lesson-data`) / játékbank (JSON) bemenet → JSON
   jelentés; adatot nem ír.
3. Bukó teszt: `source/tests/practice-policy.test.ts` — meta-esetek (pontszám, feladattípus, „a feladatban X és … vannak”), negatív
   kontrollok, alkalmazás (szólás-kiegészítés, helyzethez illesztés, elválasztás, A/B/mindkettő), fogalmi (jelentés, név, szabály),
   `intent: apply` címkéjű meta-kérdés is meta; a szabványos tesztlecke (`fusionFixture`) auditja determinisztikus és mutatja a
   túl lexikális bankot.

### P1 — kiinduló mérés (élő DB, csak olvasva, 2026-11-26, szabály `2026-11-26.1`)

- 259 Stúdió-lecke. Kvízbank: 27 536 tétel — alkalmazás 14 662 (53,2%), fogalmi 11 558, meta 16, bizonytalan 1 300.
  Nyílt bank: 15 186 tétel — alkalmazás 9 270 (61,0%), fogalmi 2 360, meta 7, bizonytalan 3 549.
- Kvízbank-állapot leckénként: 81 teljesíti a 60%-os alsó határt (vagy a fogalompár-korlátot), 169 alatta, 9 leckében van meta-tétel.
- A 16 meta-kvíz mind a felvételi / feladatlap pontozására vagy feladattípusaira kérdez (pl. „Hány pontot ér a felvételi 2. feladata?”,
  „Lili … csak az egyik jelentést írta le helyesen. Hány pontot kap?”); a tulajdonos észrevételét igazolja.
- Aktív játékkvíz-sor: 33 (alkalmazás 18, fogalmi 10, bizonytalan 5, meta 0).
- A besorolás pontosságát a szabály fejlesztése közben az élő bank véletlen mintáin ellenőriztem (meta: 16/16 valódi; a helyzet nélküli
  kérdőszavas kérdés fogalmi, a leírt helyzet + kérdés alkalmazás); a kötelező 120 tételes, ember által besorolt ellenőrzőkészlet a
  P4 (aránykapu) előfeltétele.

Review #625 (10 szál): a formátum (number / oddOneOut) önmagában nem alkalmazás; képlet / definíció hiányzó tagja fogalmi;
sport-pontérték nem meta (a „hány pontot ér” csak vizsga-környezettel az); a feladatlap szerkezetére kérdező erős alak (feladattípus,
hány feladat, időkeret) idézet / szám mellett is meta; a `teljesul` a [60%, 75%] sávot jelenti, fölötte `magas`; a DB-mérés anyagonként
csak a legutóbbi publikált leckeváltozatot számolja. Újramérés: 257 lecke — kvíz 53,0%, nyílt 60,9%; teljesül 66, alacsony 168,
magas 13, meta 10 lecke (17 kvíz + 8 nyílt meta-tétel).

Állapot: P1 3/3 egység kész — következő: kapulánc, PR

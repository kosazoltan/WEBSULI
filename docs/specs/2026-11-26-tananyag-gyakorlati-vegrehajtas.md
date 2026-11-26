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

Állapot: P1 1/3 egység kész — következő: bukó tesztek

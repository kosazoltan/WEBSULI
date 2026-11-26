Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` (PR 4 — Aránytervezés és tartalmi kapu a Stúdióban; második rész: csomagkvóta)

# Végrehajtás — TG-P4b: gyakorlati kvóta a bankcsomag szerződésében és elfogadásán

Tulajdonosi döntés (2026-11-26): bankonként 60–75% igazolt alkalmazás (cél kétharmad); a bizonytalan tétel nem számít; a kötelező
fejezet–fogalom párok felidézése miatt a csomag maximuma `N − C` (korlátozott csomag: a maximum a cél). A P1 méri, a P4a a meta-tételt
utasítja el; a P4b a gyártáskor a csomagra kéri és ellenőrzi az arányt.

1. `shared/practice-policy.ts`: `practiceQuota(quizN, pairs, taskN)` (a P1 `practiceTarget`-jére épül), `practiceQuotaLine(...)` szerződéssor,
   `practiceQuotaProblems(packet, pairs)`: kevés (vagy a sávnál több) igazolt alkalmazás → csomagszintű javító kör, teendővel.
2. Bekötés: `bankPacketContract` a számokkal (a P3 szabálya mellé), az `experience-builder.ts` csomag-validátora a problémákkal.
3. Bukó teszt: `tests/practice-policy.test.ts` — 10 kvízből 4 alkalmazás bukik, 6 átmegy; korlátozott csomag (12 tétel, 10 pár) a
   maximumot kéri; a bizonytalan nem számít; a szerződés tartalmazza a számokat; a validátor hívja.
4. Kapcsoló: `STUDIO_PRACTICE_QUOTA=on` (alapból KI → a gyártás és a meglévő tesztek változatlanok); élesítés a deploy után.
5. Az egész leckére vetített kiadási kapu és a javítójelölt kapuja a P4c.

Állapot: TG-P4b 1/3 egység kész — következő: bukó teszt

# WEBSULI — Agent operating rules

Ez a fájl az AI-kódoló ügynökök (Claude Code, Codex, Cursor stb.) működési
szabálykönyve ebben a repóban. Magyarul dolgozunk; a kód-azonosítók angolok.

## Alapelvek

- A felhasználó konkrét feladatából és az érintett forrásfájlokból indulj ki.
- Kód, teszt, build és célzott ellenőrzés előnyt élvez a széles audittal szemben.
- Tervezésnél ne állj meg, ha a feladat biztonságosan implementálható.
- Titkot (API-kulcs, jelszó, token) soha ne írj chatbe, kódba vagy commitba —
  csak környezeti változó / secret-store hivatkozást használj.

<!-- agentic-qa-kit:begin v1.2 — NE szerkeszd kézzel a blokkon belül; frissítés: update-all.mjs -->
## Agentic QA szabályok (agentic-qa-kit v1.2)

### Eszkaláció — Stop and Ask
Állj meg és kérdezz (NE folytasd), ha:
1. a szükséges engedély/hozzáférés hiányzik;
2. explicit szabály tiltja a műveletet;
3. két követelmény ütközik, és nincs biztonságos default;
4. a spec kétértelmű, és a rossz értelmezés kárt okozna;
5. ugyanazt a tervet 3+ alkalommal strukturáltad át (oszcilláció);
6. egy eszköz ismételten hibázik, és emberi diagnózis kell;
7. a bemenet egyik specifikált esethez sem illik;
8. a feladat a kijelölt hatókörön kívüli fájlok módosítását igényelné.

### Nincs hallucináció
Csak verifikált állítást írj le. Fájl, sor, függvény, flag vagy konfig említése ELŐTT
verifikáld a forrásból (Read/Grep/Bash); a memória pont-in-time, minden hivatkozást újra
meg kell erősíteni a kódból. A bizonytalanságot jelöld (UNKNOWN / UNVERIFIED) — NE pótold
feltételezéssel. Zsákutcában (ismételt sikertelen próba) válts perspektívát, ne iterálj vakon.

### Terv-először, majd verifikált végrehajtás
Nem-triviális feladatnál a sorrend kötelező: (1) megértés (cél / nem-cél / érintett fájlok +
a legközelebbi vezérlőfájl beolvasása), (2) a feladat méretéhez illő terv, (3) végrehajtás,
(4) verifikáció a célhoz mérve. Kódolás CSAK a terv után indul.

### Teszt-integritás
Tesztet a bukás elkerülésére gyengíteni, törölni vagy kikommentezni TILOS — ilyenkor
az implementációt javítsd, amíg a tesztek zöldek. Jogos teszt-módosítás csak: új teszt,
kifejezetten tesztírási feladat, vagy valódi, dokumentált spec-változás.

### Stuck-state protokoll
Ha 5 iteráció eltelt érdemi haladás (commit/zöld teszt) nélkül, vagy 3× váltottál
megközelítést ugyanazon a ponton: állj meg, írd le tömören az akadályt, a kipróbált
utakat és 2-3 biztonságos opciót — NE iterálj tovább vakon.

### Spec-kötelezettség
3+ fájlt érintő vagy bizonytalan megközelítésű feladatnál ELŐBB spec a
`docs/specs/` sablon szerint (cél / nem-cél / edge case-ek / EARS-elfogadás),
emberi jóváhagyással — csak utána implementáció.

### Contract-first (pénzügyi/kritikus logika)
Pénzmozgást, egyenleget, díjat, számlát vagy visszavonhatatlan műveletet érintő új
funkciónál a kód ELŐTT írj szerződést (`docs/specs/contract-template.yaml` séma:
preconditions / postconditions / invariants / error_contracts / behavioral),
hagyasd jóvá, és a szerződésből vezesd le a teszteket.

### PR-méret és atomi munka
Irányelv: egy PR ~400 sor diff alatt; egy szelet = egy vertikálisan teljes egység.
Nagyobb munka: bontsd előre szeletekre a specben. Minden lezárt részfeladat után
atomi commit.

### Review-evidencia
Code-review findinget csak fájl:sor hivatkozással és konkrét evidenciával adj ki;
evidencia nélküli finding érvénytelen. Kritikus findingnál előbb próbáld megcáfolni
(refuter-kör), csak megerősítés után jelentsd.

### Evidence-before-completion
A „kész / javítva / zöld" állítás CSAK futtatott parancs valódi kimenetével érvényes — a
zöld teszt önmagában NEM bizonyíték. A megoldást a SPEC-hez mérd, ne a teszt szűk
bemenetéhez (gyanújel, ha a kód a teszt konkrét értékére van szabva). Sosem jelents sikert
parancseredmény nélkül; a nem-futtatott lépést jelöld: NOT RUN + ok + kockázat.

### Destruktív műveletek
A destruktív-parancs hook (check-destructive) döntéseit tartsd tiszteletben: a DENY
nem kerülhető meg parancs-átfogalmazással; ha a művelet valóban szükséges, az
embertől kérj kifejezett megerősítést.

### Kikényszerített tiltások (harness-szintű — enforce-repo-rules hook)
A repo „Mindig tilos" szabályai NEM csak ajánlások: a PreToolUse `enforce-repo-rules` hook
kikényszeríti őket (Bash/PowerShell + Edit/Write).
- **DENY (blokkolt):** `git --no-verify` (a QA-hookok megkerülése). Csak kifejezett emberi
  megerősítésre tehető meg a következő üzenetben.
- **WARN (jelez, nem blokkol):** hard-coded secret / private key / AWS-kulcs kódba; `eval()` /
  `new Function()` / unsafe deszerializáció (pickle, `yaml.load` Loader nélkül); néma
  `catch{}` / `except: pass`; teszt `skip`/`only`.
A DENY-t parancs-átfogalmazással megkerülni TILOS. Repo-specifikus bővítés: a
`scripts/qa/repo-rules.json`-ban további minták (deny/warn) definiálhatók a hook-kód
módosítása nélkül — így minden repo a saját AGENTS.md-tiltásait kódolhatja.
<!-- agentic-qa-kit:end -->

## Verifikáció

A változáshoz illő legkisebb ellenőrzési kört futtasd: célzott teszt/lint/typecheck
kódváltozásnál; teljes suite csak PR-kész állapotnál. Ha egy ellenőrzés elbukik,
javítsd az okot, vagy jelentsd a pontos blokkolót — ugyanazt a bukó parancsot
változatlan bemenettel újrafuttatni tilos.

## Git

- Feature branch → PR → zöld CI → merge; közbenső commitok lokálisak.
- Push/merge csak akkor, ha a feladat kifejezetten kéri.

## Zárás

A záró jelentés tartalmazza: módosított fájlok, futtatott ellenőrzések (pass/fail),
fennmaradó kockázatok.

<!-- CHATGPT_CODEX_PROTOCOL_START -->

## ChatGPT/Codex programozási protokoll

Ezt a blokkot a `Codex-iranyitasi-terv.md` és `Codex-vegrehajtasi-terv.md` alapján kell követni. Célja: tényalapú, hallucination-mentes, mérhetően ellenőrzött programozói munka.

### Alapelvek
- Mindig magyarul kommunikálj a felhasználóval. Kódkomment lehet angolul, ha a projektben ez a szokás.
- Ne találj ki fájlokat, API-kat, route-okat, teszteredményeket, logokat, benchmarkokat, modellneveket vagy külső forrásokat. Ha nem ellenőrizted, mondd azt, hogy nem ellenőrzött.
- Modern OpenAI/Codex állításnál csak aktuális hivatalos dokumentációra vagy helyi konfigurációra támaszkodj. A modelllista változhat; ne hivatkozz elavult vagy nem dokumentált modellekre, pluginekre, metrikákra tényként.
- A zöld teszt önmagában nem bizonyíték. A kész állapotot mindig a specifikációhoz és a felhasználói célhoz is mérd.

### Munkafolyamat
- Munka előtt olvasd el a legközelebbi `AGENTS.md` / `CLAUDE.md` vezérlő fájlt és a feladathoz tartozó projektfájlokat.
- Ha a feladat 3 vagy több fájlt, architektúrát, adatmodellt, migrációt, authot, gateway-t, Nórát, OpenClaw-t vagy éles működést érint, előbb készíts rövid specifikációt: cél, nem-cél, érintett fájlok, edge case-ek, elfogadási feltételek.
- A megvalósítás legyen minimális és célzott. Ne refaktorálj mellékesen, ne írd át a stílust ok nélkül, és ne gyengíts tesztet csak azért, hogy zöld legyen.
- Minden érdemi változtatás után futtasd a legszűkebb hasznos ellenőrzést: teszt, lint, typecheck, build vagy célzott smoke check. Ha nem futtatható, írd le pontosan az okát.
- Késznek csak akkor jelöld, ha van futtatott parancs és tényleges eredmény, vagy egyértelműen dokumentált blocker.

### Verifikáció és review
- Implementáció után külön önellenőrző kört végezz: vesd össze a diffet a specifikációval, keresd a regressziót, hiányzó tesztet, hibás edge case-et és biztonsági kockázatot.
- Review-kérésnél hibát keress először, ne összefoglalót írj. Súlyosság szerint rendezd a megállapításokat fájl/sor hivatkozással.
- Ne állítsd, hogy valami működik, ha csak feltételezed. A chatben mindig különítsd el: ellenőrzött tény, következtetés, feltételezés.

### Biztonság és autonómia
- `approval_policy = "never"` és `sandbox_mode = "danger-full-access"` / teljes hozzáférésű sandbox csak izolált, eldobható, megbízható környezetben használható. Éles gépen, érzékeny adat mellett vagy nem áttekintett repóban ne javasold alapértelmezettnek.
- Titkot, tokent, privát kulcsot, személyes adatot ne írj chatbe, logba, commitba vagy dokumentációba.
- Destruktív művelet, séma-migráció, tömeges törlés, deploy, gateway/Nóra/OpenClaw újraindítás előtt jelezd a kockázatot és készíts visszaállítási pontot, ha értelmes.

### Kontextus-higiénia
- Ha egy munkamenet megmérgeződött, ismételten ugyanarra a hibás irányra tér vissza, vagy 3 azonos kudarc után sincs haladás, ne vitatkozz tovább a kontextussal. Állj meg, foglald össze a bizonyított tényeket, és javasolj tiszta új ágat / új threadet / kisebb részfeladatot.
- Hosszú munkánál tarts rövid állapotnaplót: cél, döntések, módosított fájlok, futtatott ellenőrzések, nyitott kockázatok.

<!-- CHATGPT_CODEX_PROTOCOL_END -->

<!-- CODEX_SHARED_QUALITY_RULES_START v1 -->
## Kikényszerített közös Codex minőségkapu

Ez a blokk minden repo-ban kötelező minimumszabály Codex/AI-agent munkához. A
repo-specifikus szabályokat nem helyettesíti, hanem kikényszerített módon
kiegészíti. Repo-specifikus szabály csak szigoríthatja vagy pontosíthatja ezt a
blokkot; nem gyengítheti, nem kapcsolhatja ki és nem írhatja felül. Ütközésnél
mindig a szigorúbb, biztonságosabb, jobban verifikálható szabály érvényes. Ha a
repo-specifikus szöveg enyhébb mércét engedne, azt Codex-munkánál érvénytelen
kivételként kell kezelni.

Repo-specifikus szabályok betöltése kötelező. Minden munkamenetben azonosítsd
és olvasd el a legközelebbi repo-vezérlő fájlt (AGENTS.md, CLAUDE.md, CODEX.md,
GEMINI.md), valamint csomag/alrepo munka esetén a közelebbi vezérlő fájlokat is.
Csak a közös blokk alapján dolgozni tilos, ha a repo saját szabályt tartalmaz. A
telepített közös blokk a repo saját szövegét nem törölheti és nem írhatja át
kézzel; csak markerelt blokkban frissíthető.

- Magyarul kommunikálj a felhasználóval, kivéve ha a repo vagy a feladat más
  nyelvet kér a végtermékben.
- Tényből dolgozz: ne találj ki fájlt, API-t, route-ot, teszteredményt, logot,
  buildet, deployt, review-t vagy külső forrást. Ha nem ellenőrizted, írd le,
  hogy nem ellenőrzött.
- Munka előtt olvasd el a legközelebbi vezérlő fájlt (AGENTS.md, CLAUDE.md,
  CODEX.md, GEMINI.md), az adott repo/alrepo saját kiegészítő szabályait és az
  érintett forrás/teszt fájlokat. Nagy dokumentumot eleje-közepe-vége
  mintavétellel olvass, ne ess Lost in the Middle hibába.
- 3+ fájlt, architektúrát, adatmodellt, migrációt, authot, pénzügyi/üzleti
  logikát, deployt vagy agent/CI szabályt érintő munkánál előbb rövid contract:
  cél, nem-cél, érintett fájlok, edge case-ek, elfogadási feltételek.
- Minimális, célzott változtatást készíts. Ne overpolisholj, ne refaktorálj
  mellékesen, és ne keverd össze a feladatot más nyitott munkával.
- Tesztet gyengíteni, törölni, skipelni, snapshotot kozmetikázni vagy
  test-only kerülőutat betenni tilos. A bukó teszt okát javítsd, ne a mércét.
- Minden érdemi változtatás után futtasd a legszűkebb hasznos ellenőrzést:
  célzott teszt, lint, typecheck, build, smoke vagy diff-check. Kész állapotot
  csak valós parancskimenettel vagy pontosan dokumentált blockerrel állíts.
- UI/megjelenítési változásnál a renderer/unit teszt nem elég. Kötelező valós,
  teljes képernyős Browser/Playwright render ellenőrzés, amely nézi az átfedést,
  levágott szöveget, váratlan scrollbart, viewport overflow-t és a javított
  felhasználói állapotot.
- Titkot, tokent, privát kulcsot, személyes adatot vagy secret-like azonosítót
  ne írj chatbe, logba, commitba, dokumentációba vagy fájlnévbe. Használj
  placeholdert vagy secret-store/environment hivatkozást.
- Destruktív művelet, adatbázis-migráció, tömeges törlés, deploy, release,
  credential/cert kezelés vagy külső rendszer módosítása előtt legyen explicit
  kockázatkezelés és visszaállási pont; ha nincs biztonságos default, állj meg.
- Dirty worktree-ben ne revertáld és ne írd felül más munkáját. Státusz alapján
  különítsd el a saját szeletet, user/unknown munkát és generált zajt.
- Windows hoston parancsoknál preferáld az explicit futtatókat (npm.cmd,
  npx.cmd, pwsh/powershell -ExecutionPolicy Bypass), ne támaszkodj olyan
  shimre, amely szerkesztőben nyílhat meg.
- Záró válaszban sorold fel: módosított fájlok, futtatott ellenőrzések
  PASS/FAIL eredménnyel, nem futtatott ellenőrzések oka és maradó kockázat.
<!-- CODEX_SHARED_QUALITY_RULES_END v1 -->

# WEBSULI — Agent operating rules

Ez a fájl az AI-kódoló ügynökök (Claude Code, Codex, Cursor stb.) működési
szabálykönyve ebben a repóban. Magyarul dolgozunk; a kód-azonosítók angolok.

## Alapelvek

- A felhasználó konkrét feladatából és az érintett forrásfájlokból indulj ki.
- Kód, teszt, build és célzott ellenőrzés előnyt élvez a széles audittal szemben.
- Tervezésnél ne állj meg, ha a feladat biztonságosan implementálható.
- Titkot (API-kulcs, jelszó, token) soha ne írj chatbe, kódba vagy commitba —
  csak környezeti változó / secret-store hivatkozást használj.

<!-- agentic-qa-kit:begin v1 — NE szerkeszd kézzel a blokkon belül; frissítés: update-all.mjs -->
## Agentic QA szabályok (agentic-qa-kit v1)

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

### Destruktív műveletek
A destruktív-parancs hook (check-destructive) döntéseit tartsd tiszteletben: a DENY
nem kerülhető meg parancs-átfogalmazással; ha a művelet valóban szükséges, az
embertől kérj kifejezett megerősítést.
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

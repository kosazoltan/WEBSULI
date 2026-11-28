# ChatGPT/Codex programozási protokoll (kiköltöztetve az AGENTS.md-ből)

Az `AGENTS.md` innen hivatkozik (kontextus-diéta, `docs/specs/2026-11-28-kontextus-dieta.md`). A blokk telepítője nincs a gépen;
tartalma az `AGENTS.md`-ben maradt `CODEX_SHARED_QUALITY_RULES` és `agentic-qa-kit` blokk részhalmaza. Szó szerinti szöveg:

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
- Ha a feladat 3 vagy több fájlt, architektúrát, adatmodellt, migrációt, authot vagy éles működést érint, előbb készíts rövid specifikációt: cél, nem-cél, érintett fájlok, edge case-ek, elfogadási feltételek.
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
- Destruktív művelet, séma-migráció, tömeges törlés, deploy előtt jelezd a kockázatot és készíts visszaállítási pontot, ha értelmes.

### Kontextus-higiénia
- Ha egy munkamenet megmérgeződött, ismételten ugyanarra a hibás irányra tér vissza, vagy 3 azonos kudarc után sincs haladás, ne vitatkozz tovább a kontextussal. Állj meg, foglald össze a bizonyított tényeket, és javasolj tiszta új ágat / új threadet / kisebb részfeladatot.
- Hosszú munkánál tarts rövid állapotnaplót: cél, döntések, módosított fájlok, futtatott ellenőrzések, nyitott kockázatok.

<!-- CHATGPT_CODEX_PROTOCOL_END -->

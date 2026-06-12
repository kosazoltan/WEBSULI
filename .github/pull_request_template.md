# Összefoglaló

<!-- Mit és miért. Ha van spec: docs/specs/... link. -->

<!-- agentic-qa-kit:begin v1 -->
## Agent-PR ellenőrzőlista (kötelező AI-asszisztált PR-nál)

- [ ] **CI-integritás:** a PR nem gyengít gate-et (nem törölt tesztet, nem csökkentett küszöböt, nem módosított CI-konfigot indoklás nélkül)
- [ ] **Duplikáció:** nem vezet be máshol már létező utility/helper másolatot más néven
- [ ] **Kritikus útvonal:** a fő kódútvonalat ember végigkövette és megértette
- [ ] **Security boundary:** auth/jogosultság/input-validáció határai érintetlenek vagy szándékosan, dokumentáltan változtak
- [ ] **Tesztbizonyíték:** a nem-triviális viselkedés-változásra van teszt, és a teszt valódi logikát ellenőriz (nem "paper test")
- [ ] **Hatókör:** a diff csak a feladathoz tartozó fájlokat érinti; méret ~400 sor alatt (vagy indokolt)
<!-- agentic-qa-kit:end -->

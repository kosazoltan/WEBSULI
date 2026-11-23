---
name: learner-profile-tokens
description: A tanulói párosító linkek (?t=) a SESSION_SECRET-ből aláírtak — a titok cseréje minden gyerek párosítását érvényteleníti
metadata:
  node_type: memory
  type: project
  originSessionId: cce0558c-83f4-47c2-beaa-003dce27b7c3
  modified: 2026-11-17T08:00:00.000Z
---

A tanulói profil (S1–S5, 2026-10-18, #301–#305) személyes linkje `<learnerId>.<verzió>.<HMAC>`, a `LEARNER_LINK_SECRET`-ből,
hiányában a `SESSION_SECRET`-ből (élesben csak a SESSION_SECRET van beállítva).

**Why:** a SESSION_SECRET cseréje (pl. biztonsági rotáció) minden eszköz párosítását és minden kiküldött linket érvénytelenít; a
gyerekek a következő napi emlékeztető linkjével párosulnak újra. Helyben a titok nem elérhető, ezért pozitív (érvényes tokenes)
élő próbát nem lehet aláírni — csak a 401-es ágak ellenőrizhetők (a titok a Render env-ből in-process olvasható).

**How to apply:** titokrotáció előtt érdemes külön `LEARNER_LINK_SECRET`-et beállítani; egy tanuló eszközeinek visszavonása a
„Tanulók” admin fülről (token_version léptetés). Kapcsolódó: [[lesson-results-email-rule]], [[api-keys-location]].

**Tanulság (2026-10-21, mért):** a levelek kézbesültek (Resend delivered), mégsem párosult egy eszköz sem (valószínűleg Spam /
Promóciók) → az eredmény „Vendég tanuló” néven jött, a riasztás tévesen „nem tanult”-at írt. Javítás #362: QR-kód a SZÜLŐ
képernyőjén (a gyerek a saját telefonjával olvassa be), igaz riasztás, vendég-útmutató, „Párosítási útmutató küldése” gomb.
Helyi pg-kapcsolat az éles Neonhoz TLS-hibát ad → olvasás Neon HTTP-n `curl`-lel.

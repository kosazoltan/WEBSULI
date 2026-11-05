# Futó gyártás követése — review-javítás (#395 után, 2026-11-05)

A `docs/specs/2026-11-05-gyartas-reszletes-kovetes.md` (#395) összevonása után érkezett Sourcery / Copilot / Codex
review igazolt megállapításai.

## Igazolt hibák

- R1 (Copilot, Sourcery): a `GET /lessons/one-step/active` minden saját, futó egylépéses futást visszaad, a
  fogalomjavítást (`fix-concept`, workflow-mód `concept`) is — a Készítés fül azt gyártásként mutatná, és letiltaná az
  új feltöltést. Javítás: csak a gyártási módok (`upload`, `studio`, `webStudio`).
- R2 (Codex, Copilot): ha az űrlap tárolóból visszaállított futással indul, az egyszeri automatikus csatlakozás „el nem
  használt” marad; a „Bezárás” után az `/active` ugyanazt a futást újranyitja. Javítás: a már követett futás is
  elhasználja a csatlakozást.
- R3 (Sourcery): az aktív futást a haladássor kora (1 óra) választja ki, nem a workflow élő lízingje — egy órán át
  jelzés nélkül futó gyártás kimarad, egy leállt munka viszont „aktívnak” látszhat. Javítás: `w.lease_until > now()`.

- R4 (Sourcery, #396): ha az `/active` kérés alatt követett futás állt be, majd bezárták, a késő válasz újra csatolt.
  Javítás: a kérés indulása után beállt követés érvényteleníti a választ.

## Nem javított megállapítások (indoklással)

- „A `/workflows/:id` elutasítja a kötőjelet”: nem igaz, a minta `^[a-zA-Z0-9:-]{1,100}$` a `-`-t engedi.
- „Gazdátlan piszkozat folyamatnaplója nem olvasható”: gazdátlan = nincs workflow-sora; a felület ezt helyesen jelzi.
- „Régi tárolt futást követ, miközben másik fut” / „üres válasz után nincs újrapróbálás”: a tárolt futás állapota
  (kész / hiba) látszik, „Bezárás” után a következő csatolás csatlakozik; ritka szélső eset, külön jegyben kezelhető.
- „Indulás és lízing közötti rés” (#396): a workflow-sor létrehozása és a lízing megszerzése ugyanabban a hívásban,
  ezredmásodpercek alatt történik (`executeWorkflow`); a visszalépő tanár ennél jóval később kérdez.
- „Bezárt, de még élő futás újracsatolódik” (#396): „Bezárás” gomb csak megállt / kész futásnál van, az pedig nem
  élő lízingű — futó futás panelje nem zárható be, így újracsatolása szándékos.
- README-dokumentáció: a repó API-ját a `docs/specs` dokumentálja, a README nem tart végpontlistát.

<!-- acceptance-checklist -->
- [x] A1: az `/active` lekérdezés csak `upload` / `studio` / `webStudio` módú workflow-t ad vissza.
- [x] A2: tárolóból visszaállított futás „Bezárás”-a után nincs automatikus újranyitás (e2e).
- [x] A3: az `/active` az élő lízing alapján választ (`lease_until > now()`), korhatár nélkül.
- [x] A4: a kérés indulása után beállt követés mellett a késő `/active` válasz nem csatol.

---
name: docker-available
description: "A gépen fut a Docker (29.8.1), használható eldobható Postgres-konténerhez és helyi teljes-lánc tesztekhez"
metadata:
  node_type: memory
  type: reference
  originSessionId: cce0558c-83f4-47c2-beaa-003dce27b7c3
  modified: 2026-10-15T09:56:59.850Z
---

A tulajdonos jelezte (2026-10-15): a Docker fut a gépen, és szabadon használható. Ellenőrizve: `docker version` → 29.8.1.
Fut egy `platform-db-dev` (postgres:17) konténer — más projekté lehet, NEM piszkáljuk; saját, eldobható konténert indítunk
(a CI E2E mintájára: üres Postgres → teljes séma), élő adat érintése nélkül.

**How to apply:** helyi teljes-lánc / folytatás / kapu-próbához és gyors E2E-hez saját konténer; a végén leállítjuk és töröljük
(csak a sajátunkat). Kapcsolódó: [[lesson-trial-harness]].

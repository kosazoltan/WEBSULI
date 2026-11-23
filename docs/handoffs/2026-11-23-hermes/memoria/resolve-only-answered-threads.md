---
name: resolve-only-answered-threads
description: "PR review-szálak lezárásakor csak a ténylegesen megválaszolt szál-azonosítókat zárjuk, nem „minden nyitottat”"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cce0558c-83f4-47c2-beaa-003dce27b7c3
  modified: 2026-10-19T12:58:47.500Z
---

Review-szálak lezárásánál csak azokat a szálakat zárjuk le, amelyekre a kör válaszolt (a válaszolt comment-id-k
szálát), nem az összes nyitott szálat egy ciklusban.

**Why:** 2026-10-19-én a #319-en a „minden nyitott szál lezárása” ciklus hét, időközben érkezett, még nem kezelt
Copilot/Vercel-szálat is lezárt. Mind jogos hiba volt; csak utólagos ellenőrzéssel derült ki.

**How to apply:** a GraphQL-lekérdezésben a szál első kommentjének `databaseId`-jét vesd össze a megválaszolt
id-kkel, és csak azt zárd le. Lezárás előtt listázd a nyitott szálakat szerzővel és rövid szöveggel. Lásd
[[websuli-push-audit-hook]].

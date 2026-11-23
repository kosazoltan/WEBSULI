---
name: orchestrator-owns-all-websuli-flows
description: "A tulajdonos rám bízta minden WEBSULI lint / push / merge / deploy folyamat sorba állítását és átvételét, más munkamenetekét is (2026-11-18)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
  modified: 2026-11-18T20:13:53.789Z
---

A tulajdonos 2026-11-18-án: „Rád bízom, hogy a folyamatban lévő lint, merge, push, deploy folyamatokat sorba állítsd, átvedd,
és kezeld akár más sessionök folyamatait is. Mindent, ami a WebSulival kapcsolatos.” Előtte: „Az elmúlt 2 nap fejlesztéseiből
minden legyen: lint, push, merge, deploy a main-re.”

**Why:** több munkamenet (a fő orkesztrátor és a tananyaggyártás munkamenete) párhuzamosan nyúlt a főághoz; a C-61 szabály, a
~2 órás böngészős CI-kör és a túlterhelt gép miatt egyetlen sorrend-felelős kell.

**How to apply:** a WEBSULI merge-sorát én vezetem: én döntöm el a sorrendet (őr- / kapu-érintő PR-ok egyenként, saját
merge-ablakban; a többi felváltva, ahogy zöld), a nyugodt tesztablakokat és más munkamenetek PR-jainak összevonási idejét is.
A felhatalmazás a SORRENDRE és a végrehajtásra szól, nem a kapuk megkerülésére: minden merge előtt futásőr + `gate:merge`, vak
ellenőr ítélete, zöld CI; force-push, `--no-verify`, a védelem kikapcsolása továbbra is tilos. Más munkamenet ágára csak
egyeztetve töltök fel (a saját munkáját ne írjam felül). Kapcsolódó: [[quality-gates-mandate]], [[blind-bug-hunting-reviewer]],
[[no-deploy-during-active-runs]].

---
name: three-phase-plan-reference
description: "WEBSULI háromfázisú ellenőr — a -vegrehajtas.md fájlnak teljes docs/specs/<név>.md útvonallal kell hivatkoznia a tervre, már az első kódcommit előtt"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 45fed2a4-e600-47d6-b718-a81d6bd486cb
  modified: 2026-11-18T11:41:47.001Z
---

A `scripts/qa/three-phase-check.mjs` (a `gate:push` része) a végrehajtási utasítás tartalmát az ELSŐ KÓDCOMMIT állapotában olvassa, és
a `docs/specs/<név>.md` szövegmintát keresi benne. A relatív Markdown-link (`[terv](2026-…-terv.md)`) nem elég: a szövegben szerepelnie
kell a teljes `docs/specs/…md` útvonalnak.

**Why:** 2026-11-18-án az S1a szelet `gate:push` futása ezen bukott (kb. 8 perc kapuidő + a helyi commitok újrarendezése). Utólagos
javító commit nem segít, mert az ellenőr az első kódcommit idején érvényes fájlt nézi.

**How to apply:** spec-pár írásakor (és alügynöknek adott spec-író megbízásban) a `-vegrehajtas.md` első soraiban legyen szó szerint
`docs/specs/<tervfájl>.md`; a kódcommit ELŐTT futtasd: `node scripts/qa/three-phase-check.mjs`. Ha mégis utólag derül ki és még nincs
push: `git reset --soft <terv-commit>`, a hivatkozás javítása külön commitban, majd a kód újracommitolása (nem rebase, nem force-push).
Kapcsolódik: [[quality-gates-mandate]].

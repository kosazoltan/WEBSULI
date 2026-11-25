---
name: websuli-pr-leiras
description: Use when writing a WEBSULI PR body. Template that passes gate:pr.
---

# WEBSULI PR-leírás — a `gate:pr` „PR-leírás sablon” lépésén elsőre átmenő váz

Szabály: a PR-leírást SOHA ne szabad szerkezetben írd. A `scripts/qa/gates/pre-pr-gate.mjs` `checkPrBody` kötelezően keresi:
`elfogad` szó + `- [ ]`/`- [x]` lista, „Futtatott ellenőrzések”, „Nem futtatott”/`NOT RUN`. A hiányt a kapu a drága lépések
(build, DB-integráció) ELŐTT jelzi, de javítás után az egész kapu újrafut — ezt a kört spórolja meg az alábbi előellenőrzés.
Forrás: `.agents/skills/websuli-pr-elotti-kapu/SKILL.md`.

A váz SZÁNDÉKOSAN üres jelölőket tartalmaz: pipát (`[x]`) és eredményt csak a ténylegesen lefuttatott / teljesült tételhez írj.
A `checkPrBody` csak a szerkezetet nézi, a valóságtartalmat nem — egy ki nem töltött „ZÖLD” vagy pipa a PR-ban valótlan állítás.

## Váz (másold, töltsd ki)

```markdown
## Összefoglaló
<mit és miért; terv: docs/specs/<dátum>-<név>.md, végrehajtás: ...-vegrehajtas.md>

## Elfogadás
- [ ] E1 WHEN ... THEN ... SHALL ...   ← pipa csak bizonyított teljesülésnél

## Tesztek (RED → GREEN)
- `<tesztnév>` — javítás előtt: <mért bukás>; utána: <mért zöld>

## Futtatott ellenőrzések
- `npm run gate:stage` — <valós eredmény>
- `npm run gate:push` — <valós eredmény>
- helyi ellenőr (`node scripts/qa/gates/local-review.mjs`): <ítélet>; high/medium leletek kódból igazolva/cáfolva (fájl:sor)
- `npm run gate:pr -- --body-file <ez a fájl>` — <valós eredmény>

Független ellenőr ítélete: <IGEN | IGEN, FELTÉTELLEL | NEM> (fej: <a local-review által kiírt fej>)

## Nem futtatott
- <NOT RUN + ok + kockázat, vagy „nincs”> (pl. helyi `npm test` native-arch kivétel C-38 → a CI futtatja)

## Agent-PR ellenőrzőlista
- [ ] CI-integritás · [ ] Duplikáció · [ ] Kritikus útvonal · [ ] Security boundary · [ ] Tesztbizonyíték · [ ] Hatókör
```

Az ítélet-sort a `local-review.mjs` utolsó kimeneti sorából másold szó szerint. A kapu elsődlegesen a helyi
`review-<fej>.json` bizonyítékot olvassa; a leírásbeli sor a tartalék (más gép / CI), formátuma: `scripts/qa/gates/lib.mjs`
`VERDICT_LINE`.

## Ellenőrzés a hosszú kapu előtt (másodpercek)

A repó / munkafa GYÖKERÉBŐL futtasd (relatív import → mindig az aktuális ág kapuja, bármelyik klónhelyen):

`node --input-type=module -e "import {checkPrBody} from './scripts/qa/gates/pre-pr-gate.mjs'; import {readFileSync} from 'node:fs'; console.log(checkPrBody(readFileSync(process.argv[1],'utf8')))" <body.md>`

→ `[]` kell. Csak utána `npm run gate:pr -- --body-file <body.md>`.

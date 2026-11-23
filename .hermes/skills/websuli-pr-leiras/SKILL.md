---
name: websuli-pr-leiras
description: Use when writing a WEBSULI PR body. Template that passes gate:pr.
---

# WEBSULI PR-leírás — a `gate:pr` „PR-leírás sablon” lépésén elsőre átmenő váz

Szabály: a PR-leírást SOHA ne szabad szerkezetben írd. A `scripts/qa/gates/pre-pr-gate.mjs` `checkPrBody` kötelezően keresi:
`elfogad` szó + `- [x]` lista, „Futtatott ellenőrzések”, „Nem futtatott”/`NOT RUN`. Hiányánál a ~9 perces kapu a végén bukik
(build + DB-integráció után) → egy teljes kör elvész. Forrás: `.agents/skills/websuli-pr-elotti-kapu/SKILL.md`.

## Váz (másold, töltsd ki)

```markdown
## Összefoglaló
<mit és miért; terv: docs/specs/<dátum>-<név>.md, végrehajtás: ...-vegrehajtas.md>

## Elfogadás
- [x] E1 WHEN ... THEN ... SHALL ...

## Tesztek (RED → GREEN)
- `<tesztnév>` — javítás előtt bukott (<mért kimenet>), utána zöld.

## Futtatott ellenőrzések
- `npm run gate:stage` — ZÖLD
- `npm run gate:push` — ZÖLD
- helyi ellenőr (`local-review.mjs`, fej `<sha>`): <ítélet>; high/medium leletek kódból igazolva/cáfolva (fájl:sor)
- `npm run gate:pr -- --body-file <ez>` — ZÖLD

## Nem futtatott
- <NOT RUN + ok + kockázat, vagy „nincs”> (pl. helyi `npm test` native-arch kivétel C-38 → a CI futtatja)

## Agent-PR ellenőrzőlista
- [x] CI-integritás · [x] Duplikáció · [x] Kritikus útvonal · [x] Security boundary · [x] Tesztbizonyíték · [x] Hatókör
```

## Ellenőrzés a hosszú kapu előtt (másodpercek)

`node -e "import('file:///D:/repo/WEBSULI/scripts/qa/gates/pre-pr-gate.mjs').then(m=>console.log(m.checkPrBody(require('fs').readFileSync('<body.md>','utf8'))))"`
→ `[]` kell. Csak utána `npm run gate:pr -- --body-file <body.md>`.

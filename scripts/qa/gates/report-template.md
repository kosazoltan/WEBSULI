# Alügynök-zárójelentés — sablon (S2, `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md`)

Az orkesztrátor csak gépileg ellenőrzött jelentést fogad el:
`node scripts/qa/gates/verify-report.mjs --report <jelentés.md>` → zöld (kilépési kód 0). A HAMIS hivatkozás (nem létező fájl / sor,
a ±3 soron belül nem található kódrészlet, nem létező `npm run` szkript / commit / PR) és a gépi blokk bármely eltérése bukás.

Szabályok a szöveghez:

- Fájlhivatkozás repó-gyökérhez relatív úttal (`scripts/qa/gates/<fájl>.mjs:12`, tartomány: `…:12-18`). Ha kódot idézel, közvetlenül a
  hivatkozás után backtickben adod meg — a szkript a ±3 soros ablakban keresi.
- „PASS / zöld / N teszt” állítás csak bizonyíték-azonosítóval: a parancsot így futtasd:
  `node scripts/qa/gates/evidence-run.mjs -- <parancs> <arg…>` → a kiírt `run-<id>`-t írd a sor végére. A kapuk (szakasz-, push-,
  PR-kapu) maguk írnak bizonyítékot (`stage-<fej>`, `pre-push-<fej>`, `pre-pr-<fej>`), a független ellenőr ítéletét a `record-review`
  rögzíti (`review-<fej>`).
- A nem futtatott lépés: NOT RUN + ok + kockázat (a `notRun` listában is).

## Összefoglaló

<2–5 mondat: mi készült el, mi nem.>

## Módosított fájlok

- <út> — <mit>

## Futtatott ellenőrzések

- `npm run gate:stage` — PASS (stage-<fej>)
- node --test <fájl> — <pass>/<összes> teszt (run-<id>)

## Nem futtatott (NOT RUN)

- <mi> — <ok> — <kockázat>

## Gépi blokk (kötelező, pontosan egy)

```json allitasok
{
  "schema": "websuli-allitasok/1",
  "branch": "<ág>",
  "head": "<40 jegyű fej-hash: git rev-parse HEAD>",
  "base": "origin/main",
  "changedFiles": ["<git diff --name-only origin/main...<fej> minden sora>"],
  "commands": [{ "cmd": "npm run gate:stage", "status": "PASS", "evidence": "stage-<fej>" }],
  "tests": [{ "cmd": "node --test <fájl>", "pass": 12, "fail": 0, "evidence": "run-<id>" }],
  "refs": [{ "file": "<út>", "line": 12, "text": "<a soron szó szerint szereplő részlet>" }],
  "pr": null,
  "gates": ["stage"],
  "notRun": [{ "what": "<mi>", "reason": "<ok>", "risk": "<kockázat>" }]
}
```

`pr`: `{ "number": <n>, "state": "OPEN", "ci": "green" | "red" | "pending" | "none" }` vagy `null`. `gates`: a ténylegesen lefutott
kapuk (`stage`, `push`, `review`, `pr`); a `pr` mellé a `push` és a `review` is kell.

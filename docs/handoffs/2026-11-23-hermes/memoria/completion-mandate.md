---
name: completion-mandate
description: "Mandátum (2026-11-01) — spec, javítás, fejlesztés, implementáció félbehagyása tilos; minden session végén teljességellenőrzés a kérésekhez mérve"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-17T08:00:00.000Z
---

**ÉRVÉNYES ÁLLAPOT (2026-11-23):** a „Hermes-kanban” a repó FELADAT-táblája (`docs/kanban.md`, `.hermes/kanban.db`); a tanulságok és hibák a Claude-környezet tapasztalat-kanbanjába és a `kanban/hosszu-futas-hibajegyzek.md`-be kerülnek ([[futas-vegi-hurok]], [[hosszu-futas-vezenyles]]).

Tulajdonosi mandátum (2026-11-01): **tilos félbehagyni** — specet félig, javítást / fejlesztést / implementációt menet
közben abbahagyni nem szabad; minden feladat a teljes elkészültéig fut. **Minden session végén kötelező a
teljességellenőrzés:** a beadott kérések tételes összevetése az elkészült munkával, és javítás, amíg minden teljesül.

**Why:** korábban előfordult félig kidolgozott spec és befejezetlen munka; a tulajdonos mandátumszinten tiltotta.

**How to apply:** a háromfázisú rend (`docs/agent-haromfazisu-munka.md`) mindhárom fázisa teljesen kidolgozva; zárás
előtt tételes checklist a kérésekről; objektív blokkolónál NOT DONE + ok + kockázat — de a cél a befejezés, nem a
jelentés. A „kész” állítás bizonyítéka a gépi kapu-kimenet ([[quality-gates-mandate]]), nem az ügynök szava. A teljes szöveg forrása a repóban: `AGENTS.md` „Befejezési mandátum” (és a globális `~/.claude/CLAUDE.md`
„MANDÁTUM”); hivatkozik rá a `docs/kanban.md`, a `.cursor/rules/haromfazisu-munka.mdc`, a skillek és a Hermes-kanban
STANDING jegye.

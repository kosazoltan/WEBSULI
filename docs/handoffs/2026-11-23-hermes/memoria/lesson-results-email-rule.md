---
name: lesson-results-email-rule
description: "Minden generált tananyag szöveges feladat- és kvízeredménye e-mailben megy az ADMIN_EMAILS címzettjeinek (2026-10-21 óta 3: + Szabó János, sendResultEmail, mailto tilos)"
metadata:
  node_type: memory
  type: project
  originSessionId: cce0558c-83f4-47c2-beaa-003dce27b7c3
  modified: 2026-10-17T15:35:29.023Z
---

Tulajdonosi kérés (2026-10-17): a tananyaggyártó olyan tananyagot generáljon, amelynek szöveges feladat- és tesztEREDMÉNYE e-mailben elküldhető — a címzett a két admin (Máté Szilvia és Kósa Zoltán; éles `ADMIN_EMAILS`, a címeket csak a szerver ismeri).

2026-10-21: tulajdonosi kérésre Szabó János (szülő, teljes jogú admin) bekerült a Render `ADMIN_EMAILS`-be — eredmények, tanulói jelentések, riasztások neki is mennek. „Szülő” = ADMIN_EMAILS-címzett (külön szerep nincs).

**Why:** a tanári visszajelzés a tanulói eredményekből jön; a régi `mailto`-s anyagoknál a tanuló levelezője nyílt meg (iframe-ben sokszor semmi sem történt), az eredmények elvesztek.

**How to apply:**
- Webes (HTML) lecke: a Kiértékelés után automatikusan `window.sendResultEmail(subject, body)` (a /dev/:id injektálja) — nincs e-mail-cím, nincs `mailto:`. Előírja: `server/ai/lesson-html-spec.ts` „EREDMÉNYKÜLDÉS E-MAILBEN”, és a helyi `tananyag-keszito` skill (a plugin-szinkron felülírhatja → ellenőrizd).
- Strukturált lecke: a futtatókörnyezet küldi (#280, `server/lesson-result-email.ts`), a generálásnak nincs teendője.
- Régi HTML-anyagok: kiszolgáláskori mailto-elfogás + automatikus beolvasás (`server/lib/material-capture.ts`). 2026-10-18 (#300): a kliens AZONNAL küld (a websuli.vip visszalépéskor eltávolítja a keretet — se pagehide, se unload; a korábbi 30 mp-es kliensoldali várakozás miatt eredmény veszett el), az összevárást a szerver végzi (`ResultCoalescer`, 30 mp / max 3 perc, egy levél). Diagnózis: `email_logs` tábla + Render napló `material-result`.

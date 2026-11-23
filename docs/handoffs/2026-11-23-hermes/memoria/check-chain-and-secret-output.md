---
name: check-chain-and-secret-output
description: "A push előtti ellenőrzést külön, kilépési kóddal jelentve futtasd (a grep-es lánc elnyelte a bukó tesztet); titkos parancssor nem kerülhet hibakimenetbe"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cce0558c-83f4-47c2-beaa-003dce27b7c3
  modified: 2026-10-22T05:38:44.805Z
---

Két hiba 2026-10-22-én:
1. `(npm run lint; tsc; npm test | grep …; npm run build) && git commit && push` — a zárójeles csoport kilépési kódja az UTOLSÓ parancsé (build), így egy BUKÓ teszt mellett is lefutott a commit és a push (#366).
2. `execFileSync("curl", [... "Neon-Connection-String: <url>" ...])` hibája a teljes parancssort (a DB-jelszóval) a tool-kimenetbe írta.

**Why:** a „zöld” állítás csak valódi kilépési kóddal érvényes (AGENTS.md evidence-before-completion); a titok a munkamenet-naplóba sem kerülhet.

**How to apply:**
- Push előtt a `npm run gate:push` fut ([[quality-gates-mandate]]): lépésenként külön PASS / FAIL, bukásnál 1-es kilépés, a
  kimenet szűrt (e-mail, kapcsolati szöveg, token nem kerül ki). Kapun kívüli kézi ellenőrzésnél továbbra is külön:
  `cmd >/dev/null 2>&1; echo "név=$?"` — csak csupa 0 után commit/push.
- Titkot hordozó külső parancsot try/catch-be, `stdio: ["ignore","pipe","pipe"]`, a hibaágban csak a kilépési kódot írd ki.
- Kapcsolódó: [[websuli-push-audit-hook]], [[lint-max-warnings]].

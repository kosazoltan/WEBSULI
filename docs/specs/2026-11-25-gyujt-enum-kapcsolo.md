# Terv: a követelmény-gyűjtő a felsorolásos kapcsolót (pl. `ADVENT_RESULT_EMAIL_MODE`) is mérje (2026-11-25)

**Lelet (teljes revízió, 2026-11-25):** a `scripts/kovetelmeny/gyujt.py` a Render-környezet minden nem logikai, nem szám értékét
„beállítva (érték rejtve)” formában tárolja (titokvédelem). Az `ADVENT_RESULT_EMAIL_MODE=send` tulajdonosi döntés (`flag_decisions`)
ezért a `feladat.py kapcsolo` nézetében hamisan „ELTÉR”.

**Cél:** a kapcsolószabályban (`FLAG_RULES`) FELSOROLT, ismert értékkészletű kapcsoló élő értéke nyíltan tárolódjon — csak a szabályban
megadott értékek egyikeként; minden más érték (és minden nem felsorolt kulcs) továbbra is rejtett. Az `ADVENT_RESULT_EMAIL_MODE`
szabálya: BE = `send` (forrás: `source/server/advent/result-email.ts:39`), ismert értékek: `send`, `dry-run`.

Végrehajtás: `docs/specs/2026-11-25-gyujt-enum-kapcsolo-vegrehajtas.md`.

# Ciklus 4 — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus4-minta-kifejezes-autofix.md`.

1. **`server/studio/tools/bank-packet-autofix.ts`:** `fixTypedValues(task, fixes)` — szám → `String(value)`.
2. **`server/studio/experience-builder.ts`, a minta-ellenőrzés üzenete:** + a mintából pontosan hiányzó `requiredPhrases` csoportok és a
   `requiredOrder`-eltérés.
3. **Teszt:** `tests/ciklus4-minta-kifejezes-autofix.test.ts`.

## Review #355 javítások (végrehajtás)

1. **`legacy-migration.ts`:** `isLatestInstance()` SQL-feltétel a `claimRetry` UPDATE-ben és az új elem foglaló tranzakciójában (atomi
   kerítés); `registered` jelző — bejegyzés nélkül a kör nem foglal; `registerInstance()` a körök ELŐTT, hiba esetén percenként újra;
   a legújabb példány körönként frissíti a jelét (`scheduled_for`), `INSTANCE_STALE_MS` (35 perc) után a régi átveszi; `run?.error || jobError`.
2. **`engine.ts` `appendLektorArchive`:** `wellFormed` a vágás után, `slice(-200)` (legújabbak); a blokkoló jegyzetek után azonnali `save`.
3. **`conversation.ts`:** az OpenAI fájlnév is `wellFormed`.
4. **`bank-packet-autofix.ts`:** az exponenses alak (`1e+21`) nem alakul szöveggé.
5. **`tests/mojibake-guard.test.ts`:** + `source/tests`, beágyazott `AGENTS.md` / `CLAUDE.md`; a teszt saját megjegyzései kódpontosak.
6. **Teszt:** `tests/ciklus4-diagnozis.test.ts` — legújabb 200, fél-karakter-biztos vágás, exponens, kliens-bekötés (mock), bejegyzés nélküli kör.
7. **`tests/mojibake-guard.test.ts` (2. kör):** + `.py` / `.yaml` / `.yml`, `.agents/skills`, `.cursor/rules`, `.github`; a Latin-1-es
   „ő” (U+00C5 + U+0091) és a nagybetűk Windows-1252 alakja; önellenőrzés minden ékezetes betűre külön, mindkét kódlappal.

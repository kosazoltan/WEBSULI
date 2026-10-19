# Erőforrás S3a — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-eroforras-s3a.md`. Munkakönyvtár: `source/`. Ág: `perf/s3a-gyorsitotar-szerkezet`.

1. **`server/studio/single-run/conversation.ts`:**
   - `TurnBlock` szövegváltozat: `{ type: "text"; text: string; cache?: boolean }`;
   - az `anthropicClient` a szövegblokkot `cache_control: { type: "ephemeral", ttl: "1h" }`-val küldi, ha `cache`;
   - a kérés összes `cache` blokkja közül csak az utolsó kettő kap jelölőt.
2. **`server/studio/experience-builder.ts`:**
   - `export function bankStaticPrefix(): string` = `${roleSkillBlock("bank")}\n${LESSON_METHOD_CONTRACT}\n${OPEN_ANSWER_RULES_HU}`;
   - a bank `system` = `${bankStaticPrefix()}\n${contract}\n${signRules}…` (a többi rész sorrendje változatlan).
3. **`server/studio/single-run/engine.ts`:**
   - **`freshBankCall`:** ha `system.startsWith(bankStaticPrefix())`, a blokkok:
     `[text(prefix), {runbook, cache: true}, text("5. ÁLLOMÁS — GYAKORLÓBANK (egy fejezet csomagja).\n" + rest + "\n\n" + user)]`;
     különben a régi alak.
     - A runbook szövege ugyanaz, mint a `withRoleRunbook`-é: a közös `roleRunbookBlock(role)` segédfüggvényből jön.
   - **Lektor:** a `sourceBlock` `text(…)` → `{ type: "text", text: …, cache: true }`.
4. **Tesztek — `tests/resource-s3a.test.ts`:**
   - hamis Anthropic-klienssel a kérés alakja: a jelölt blokk 1h jelölőt kap; 3 jelöltből csak az utolsó 2;
   - `freshBankCall` blokksorrend (hamis beszélgetéssel);
   - a bank `system` az állandó előtaggal kezdődik.
   - A meglévő tesztek zöldek; ha egy teszt a régi sorrendet rögzíti, az dokumentált specváltozás.
5. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
6. **Kitelepítés:** az aktív-futás őr = 0. Élő mérés a következő gyártás telemetriájából.

## Review #329 — pontosítás
- **Jelölők kiválasztása:** a töréspontot a jelölt blokkok POZÍCIÓJA (forduló:blokk) alapján választjuk, nem objektum-azonosság
  szerint, mert ugyanaz a blokkobjektum több fordulóban is szerepelhet.
  - Teszt: négy fordulóban újrahasznált blokk → csak az utolsó két előfordulás kap jelölőt.
- **Fogalomjavítás lektora:** a `server/studio/single-run/concept-fix.ts` forrásátirat-blokkja is `cache: true`.

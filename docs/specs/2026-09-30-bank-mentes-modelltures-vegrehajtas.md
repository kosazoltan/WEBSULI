# Végrehajtás: Bankcsomag-mentés és modellhiba-tűrés (3–4. szelet)

Spec: `docs/specs/2026-09-30-bank-mentes-modelltures.md`. Munkakönyvtár: `source/`. Ág: `feat/bank-mentes`.

## 3. szelet — bankcsomag-mentés
1. `server/studio/experience-builder.ts`: exportált `salvagePacket(packet, validate, maxRounds = 3)`.
   - Keret: `max(2, floor(0,2 × tételszám))`.
   - Tétel-azonosítás CSAK a tételhiba-alakból: az üzenet `"<id>: "`-tal kezdődik, vagy tartalmazza a
     `"csomaggal: <id> ("` részt (review #153: szabad szöveges keresés Zod-útvonalra is illeszkedne).
   - Körönként kivétel → újraellenőrzés; siker csak üres hibalistával; hibátlan bemenetre `null`.
2. Ugyanott a csomag-ciklusban: az utolsó (mentő) kísérlet után, ha a válasz alakilag érvényes és a hiba nem csak aritmetikai
   gyanú, `salvagePacket(parsed.data, quotaAndValidate)`, ahol `quotaAndValidate` előbb a csomag-szintű `packetSchema`
   kvótáit, aztán a `validate` összes szabályát méri (review #153 P1). Siker → `deps.onToolFix("bank-salvage", …)`.
3. `server/studio/role-skills.ts`: `TOOL_SKILLS["bank-salvage"]` („Mit tesz / Mit NEM tesz / npm run studio:tool”), `ROLE_TOOLS.bank`
   kiegészítve (a bank skill < 5200 karakter). `scripts/studio-tool.ts`: `bank-salvage <csomag.json> <hibak.json>` ág.
4. Teszt: `tests/bank-salvage.test.ts` — szóhatár/ID-alak, 20%-os keret, névtelen hiba, Zod-útvonal „0” azonosítóval,
   valódi csomagépítés 4 kísérlettel. Parancs: `npx tsx --test tests/bank-salvage.test.ts tests/studio-tools.test.ts`.

## 4. szelet — második tartalék modell
1. `server/ai/models.ts`: `SECOND_FALLBACK_MODELS = { pedagogue: "gpt-5.6-terra", lektor: "claude-opus-5-5" }` — a szerző nélkül
   (tulajdonosi döntés 2026-09-29).
2. `server/studio/step-runner.ts`, az elsődleges → tartalék ág: a tartalék `StepModelError`-a után, ha van második tartalék,
   eltér a két korábbitól és a kulcsa be van állítva → még egy próba; a végső hiba a teljes láncot megnevezi.
3. `server/studio/step-io.ts` `lektorReportSchema.solutions`: 40 fölött levágás (`z.preprocess`), nem bukás.
4. Tesztek (`tests/lesson-pipeline-runner.test.ts`): `(m2)` lánc + a szerző hiánya + a lektor függetlensége; `(m3)` 45 megoldás → 40;
   a meglévő `(o)` változatlanul zöld.

## Ellenőrzés
`node --import tsx --test "tests/*.test.ts"`, `npx tsc --noEmit -p .`, `npx tsc --noEmit -p tsconfig.test.json`,
`npx eslint server/studio server/ai scripts --max-warnings 1166`.

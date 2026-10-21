# Rövid fogalomnév megalapozása II — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-rovid-fogalom-ekezet.md`.

1. **`source/server/studio/grounding.ts`:**
   - `checkGrounding`: a `shortName` ágban ha az eredeti név (kisbetűsítve, NFC, trim) nem csak `[a-z0-9]` → ékezetes rövid szó:
     a blokk ékezetes tokenjei (`toLowerCase().normalize("NFC")`, `\p{L}\p{N}` szerint tagolva) közül valamelyik a névvel kezdődik
     → `true`, különben `false`. (A „< 4 szó” védelem után.)
   - `shortTermGrounded`: a példa-keresés a `quote` + `definition` szakaszain; a megkülönböztető jelölés regexe mellett a csupa
     nagybetűs (≥ 2 betű) eredeti név nagybetűs, önálló előfordulása is.
2. **`source/server/studio/legacy-migration.ts`:** `LEGACY_REDO` + „345a84d9-9d3a-4f4c-9e7b-622e53a7d01d” (utasítás: az AT / ON / IN a
   forrás példáival); `LEGACY_REDO_ROUND = 4`.
3. **Tesztek:** `tests/studio-grounding-short-term.test.ts` — „Őz” (ragozva is; ékezet nélkül nem), „AT/ON/IN” definíció-példa és
   nagybetűs jelölés, „Az” mondat eleji nem jelölés, a meglévő a/an esetek változatlanok; `tests/ciklus6-csoport-ujraszigoritas.test.ts`
   a `LEGACY_REDO` kulcslista (dokumentált bővítés).
4. **Mérés:** a két job mentett szerzői köreinek (`output.singleRun.conversation`) blokkjain a `groundingReport` régi vs. új: a mért
   hamis hiányok eltűnnek (offline, csak olvasva).

# Végrehajtás — vak kör kivezetése (terv: `docs/specs/2026-11-23-vak-kor-kivezetes.md`)

Ág: `chore/vak-kor-kivezetes-helyi-ellenor`.

1. `scripts/qa/gates/local-review.mjs`: diff `base...head` → `splitDiff` (zárfájl/kép/bank-adat kihagyva, 24 ezer karakteres darabok)
   → Ollama `/api/chat` (`format: json`, `think: false`, `temperature: 0`, angol prompt) → `parseFindings` → `decideVerdict`
   (high → NEM, csak medium/low → IGEN, FELTÉTELLEL, semmi → IGEN; `--refuted` kivonja) → jelentés (`--ki`, alapból a
   bizonyíték-tárba) + `review-<fej>.json` (`reviewer: local-llm`). Kilépés 0 / 1 / 3.
2. `scripts/qa/gates/local-review.test.mjs`: a tiszta függvények egységtesztje (`node --test`).
3. Valódi futás egy meglévő PR-commiton (#539), mérés: idő, leletek, hamis pozitívok → a mérés a végrehajtási napló alá.
4. Szabályok átírása: `AGENTS.md` Minőségkapuk 3., 4., 6. pont; `.hermes.md` tükör (sync-script vagy kézi tükör, sha frissítéssel);
   `docs/minosegkapuk.md`; a három kapu-skill mindkét fában azonosan (`skills-sync-check` zöld); `.cursor/rules/minosegkapuk.mdc`.
5. Kapuk: `node --test scripts/qa/gates/*.test.mjs`, `npm run gate:lint`; commit, push, PR.

## Végrehajtási napló

- 2026-11-23 — #539 (`fcf033ee`, eredmény-email B1b, 8 fájl): **16,5 s**, 0 felhős token, ítélet IGEN, FELTÉTELLEL
  (0 high, néhány medium/low: teszt-erősség és régi körök `lastAnsweredAt` nélkül — értelmes, triázsolható felvetések; a #539
  felhős köre ugyanerre a fejre több tízezer tokent vitt). Hamis kockázat-jelzés: a `docs/*.md` „email” szó miatt → javítva
  (`riskyFiles` a .md/.txt fájlt kihagyja, teszttel).
- Szintetikus próba: eltávolított nullaosztás-őr → helyes `high` lelet 8 s alatt.

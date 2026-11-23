---
name: blind-review-runner
description: "Vak ellenőr gépi futtatója: npm run gate:blind-review, modell openai/gpt-6.2-sol, reasoning high, blindReview.exclusive BE — a futtató ítélete a kötelező (tulajdonos, 2026-11-19)"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-19T15:52:35.091Z
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
---

**ÉRVÉNYES ÁLLAPOT (2026-11-23):** a futtató a FŐÁGON NINCS (`npm run gate:blind-review` és a `websuli-vak-ellenor` skill sem). Indítás a `vak-v2` munkafából (ág `chore/vak-ellenor-konvergencia`): `node scripts/qa/gates/blind-review/blind-review.mjs --base origin/main --head <sha> --spec … --goal … --out … [--previous …] --node-modules /d/repo/WEBSULI/source/node_modules`. A `vak-ellenor-deepseek` munkafa NEM a kanonikus. Főágra vitel: főterv H3 K3.

**Érvényes szabály (tulajdonosi döntés, 2026-11-19):** „A teljes ökoszisztémában az ellenőr, független ellenőr modellt cseréld le
skillekben, Agent MD fájlokban, memóriákban, a GPT-6.2 SOL modellre high efforttal.” Az OpenRouter-azonosító `openai/gpt-6.2-sol`
(ellenőrizve: létezik, `reasoning` paramétert támogat; 2 / 10 USD / 1M token), `reasoning.effort: "high"`. A kizárólagosság
(`blindReview.exclusive`) BE: a kötelező ítélet a futtatóé; Claude-alügynököt vak ellenőrnek NEM indítok. Ha a futtató nem tud
lefutni, a munka megáll és a tulajdonos dönt (nincs csendes tartalék).

Futtatás: `npm run gate:blind-review -- --base <ref> --head <teljes hash> --spec <terv.md> --goal <cél.md> --out <scratchpad/jelentés.md>`,
majd `record-review`. A futtató a `chore/vak-ellenor-deepseek` ágon épült (`scripts/qa/gates/blind-review/`); ELLENŐRIZD, hogy a
főágon van-e már, mielőtt onnan hivatkozol rá.

**Előzmény:** 2026-11-18 DeepSeek V4.1 Flash → ugyanaznap Qwen 4 Max; a mért alapvonal (9 közepes leletből 1 + 1 részben) miatt
a kapcsoló KI maradt, az alügynök adta az ítéletet. A 2026-11-19-i döntés ezt felülírja.

**Hogyan alkalmazd:** skill `websuli-vak-ellenor`. Kulcs: `OPENROUTER_API_KEY` a Hermes .env-ből, csak folyamaton belül, soha nem
kiírva ([[api-keys-location]]). Kapcsolódó: [[blind-bug-hunting-reviewer]], [[quality-gates-mandate]].

- **`--max-usd` legfeljebb 6** (a futtató kemény határa; 2026-11-20-án 8-cal két ítélet veszett el, és a sor-futtató naplójából némának tűnt). A sor-futtató a hibás futásnál a `KILÉPÉS … — ok:` / `HIBA:` sort is emelje ki, és a naplót ne írja felül.

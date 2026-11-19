# WEBSULI — Claude Code belépő

A repó teljes ügynök-szabálykönyve az [`AGENTS.md`](AGENTS.md) — olvasd el munka előtt, és azt kövesd (magyarul dolgozunk). Ez a
fájl nem másolat, csak a belépő, és a legfontosabb kötelező szabály kiemelése:

## Vak hibakereső ellenőr — kötelező (AGENTS.md „Vak hibakereső ellenőr — kötelező”)

- Minden elkészült fejlesztést / javítást vak, hibakereső ellenőr néz át a PR megnyitása ELŐTT és minden javító feltöltés előtt; a
  fejlesztő saját magát soha nem ellenőrizheti.
- Ki az ellenőr (AGENTS.md „Ki az ellenőr” bekezdés): KIZÁRÓLAG a gépi futtató — `npm run gate:blind-review` (skill: `websuli-vak-ellenor`), modell `openai/gpt-6.2-sol`, high (tulajdonosi döntés 2026-11-19); `blindReview.exclusive` BE: alügynök vagy kézzel írt jelentés nem ad ítéletet; ha a futtató nem fut le, a munka megáll, a tulajdonos dönt.
- Az ellenőrnek CSAK a tervet és a diffet / fejet add; a saját jelentésedet, „zöld” állításaidat ne.
- Parancs: `npm run gate:blind-review -- --base <ref> --head <teljes fej-hash> --spec <terv.md> --goal <cél.md> --out <jelentés.md>`,
  majd `node scripts/qa/gates/record-review.mjs --head <fej> --verdict "<ítélet>" --report <jelentés.md>` (csak a futtató bizonyítékával
  rögzít). NE indíts ellenőrként alügynököt.

Kapuk és sorrendjük: [`docs/minosegkapuk.md`](docs/minosegkapuk.md). Háromfázisú rend: [`docs/agent-haromfazisu-munka.md`](docs/agent-haromfazisu-munka.md).

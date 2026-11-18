# WEBSULI — Claude Code belépő

A repó teljes ügynök-szabálykönyve az [`AGENTS.md`](AGENTS.md) — olvasd el munka előtt, és azt kövesd (magyarul dolgozunk). Ez a
fájl nem másolat, csak a belépő, és a legfontosabb kötelező szabály kiemelése:

## Vak hibakereső ellenőr — kötelező (AGENTS.md „Vak hibakereső ellenőr — kötelező”)

- Minden elkészült fejlesztést / javítást vak, hibakereső ellenőr néz át a PR megnyitása ELŐTT és minden javító feltöltés előtt.
- A vak ellenőr KIZÁRÓLAG a futtató: `npm run gate:blind-review` (a `gates.config.json` `blindReview.model` modelljével — független, nem Anthropic). Alügynökkel vagy kézzel írt jelentés NEM érvényes ítélet; ha a futtató nem tud lefutni: a vak ellenőr nem futott, a tulajdonos dönt (skill: `websuli-vak-ellenor`).
- NE indíts helyette alügynököt (Agent / Task eszköz) ellenőrnek, és a saját jelentésedet ne add át az ellenőrnek.
- Parancs: `npm run gate:blind-review -- --base <ref> --head <teljes fej-hash> --spec <terv.md> --goal <cél.md> --out <jelentés.md>`,
  majd `node scripts/qa/gates/record-review.mjs --head <fej> --verdict "<ítélet>" --report <jelentés.md>`.

Kapuk és sorrendjük: [`docs/minosegkapuk.md`](docs/minosegkapuk.md). Háromfázisú rend: [`docs/agent-haromfazisu-munka.md`](docs/agent-haromfazisu-munka.md).

# WEBSULI — Claude Code belépő

A repó teljes ügynök-szabálykönyve az [`AGENTS.md`](AGENTS.md) — olvasd el munka előtt, és azt kövesd (magyarul dolgozunk). Ez a
fájl nem másolat, csak a belépő, és a legfontosabb kötelező szabály kiemelése:

## Vak hibakereső ellenőr — kötelező (AGENTS.md „Vak hibakereső ellenőr — kötelező”)

- Minden elkészült fejlesztést / javítást vak, hibakereső ellenőr néz át a PR megnyitása ELŐTT és minden javító feltöltés előtt; a
  fejlesztő saját magát soha nem ellenőrizheti.
- Ki az ellenőr: ma a vak, hibakereső ellenőr az AGENTS.md „Ki az ellenőr” bekezdés szerint; a gépi futtató (`npm run gate:blind-review`, skill: `websuli-vak-ellenor`) mellette kiegészítő bizonyíték. KIZÁRÓLAGOS csak a `blindReview.exclusive` kapcsoló tulajdonosi átállítása után (ha az újramérés eléri a küszöböt).
- Az ellenőrnek CSAK a tervet és a diffet / fejet add; a saját jelentésedet, „zöld” állításaidat ne.
- Ítélet rögzítése: `node scripts/qa/gates/record-review.mjs --head <fej> --verdict "<ítélet>" --report <jelentés.md>` (a futtató
  bizonyítékát, ha van, kiegészítőként csatolja).

Kapuk és sorrendjük: [`docs/minosegkapuk.md`](docs/minosegkapuk.md). Háromfázisú rend: [`docs/agent-haromfazisu-munka.md`](docs/agent-haromfazisu-munka.md).

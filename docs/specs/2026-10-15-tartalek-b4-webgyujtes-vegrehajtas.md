# Végrehajtás: B4 — webes forrásgyűjtés GPT-tartaléka (2026-10-15)

Spec: `docs/specs/2026-10-15-tartalek-b4-webgyujtes.md`. Parancsok a `source/` mappából.

## V1 — védett letöltő (`server/studio/safe-fetch.ts`)
- `isPublicAddress(ip)`, `checkFetchUrl(url)`, `htmlToText(html)` (parse5; script/style/noscript/svg/template kihagyva,
  `<title>` külön), `fetchPublicPage(url, { timeoutMs, maxBytes, maxRedirects, lookup?, request? })` — `https.request` a
  validáló `lookup`-pal, kézi átirányítás újraellenőrzéssel, tartalomtípus- és méretkorlát, charset a fejlécből.

## V2 — GPT-gyűjtés (`server/studio/web-gather-gpt.ts`)
- `candidateUrls(output)`: `url_citation` előbb, majd `web_search_call.action.sources`; https, egyedi, max. 12.
- `gatherWebSourcesGpt(input, { model, signal, onEvent, download? })`: Responses `web_search` (`search_context_size: high`,
  HU), `reasoning.effort: medium`, `include: ["web_search_call.action.sources"]`; letöltés 4-esével, max. 8 forrás;
  `sourceIsErrorPage` és min. 80 karakter; `workflowCheckpoint("web-gather-gpt", …)`; `workflowUsage`.

## V3 — bekötés (`web-research-runner.ts`)
- A meglévő Claude-gyűjtés `gatherWebSourcesClaude` néven; az új `gatherWebSources` hibánál (külső megszakítás kivételével, ha
  van OpenAI-kulcs) a GPT-gyűjtést hívja; ha az is bukik, az eredeti hiba + a tartalék oka.

## V4 — tesztek
- `tests/web-gather-gpt.test.ts`: `isPublicAddress` (IPv4/IPv6 tartományok, leképezett IPv6), `checkFetchUrl` (http, port,
  hitelesítő adat), a letöltő injektált `request`-tel (privát DNS → elutasítva, átirányítás privát címre → elutasítva, bináris
  → elutasítva, méretkorlát), `htmlToText`, `candidateUrls`, `gatherWebSourcesGpt` mockolt Responses-válasszal és letöltővel.

## V5 — mérés és kapuk
- `scripts/measure/web-gpt-gather.mts` (3 téma) → `docs/measurements/2026-10-15-b4-web-gpt-gather.json`.
- `npm.cmd run check`, `check:test`, `lint`, `test`, `build`.

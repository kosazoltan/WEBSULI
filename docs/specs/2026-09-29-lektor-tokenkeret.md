# Lektor: kimeneti tokenkeret 12 000 → 32 000 (2026-09-29)

## Kiváltó ok (élő mérés)
„Mezopotámia”, 5. o., kombinált forrás (a füzetfotó és 3 letöltött oldal), job `1ebf7a88…`, 916 s után `error`:
- az elsődleges lektor (`grok-4.6`, Responses, reasoning medium) **üres** választ adott;
- a tartalék (`anthropic/claude-sonnet-5`) válasza „elérte a hosszkorlátot; csonka eredmény nem használható”.

A lektor kerete 12 000 kimeneti token (`server/ai/studio-provider.ts`, `createStudioStepProvider`). Az indoklás
(„a lektor kimenete kicsi, ≈ 0,4–2k token”) a 2026-09-20-i állapotot írja le. Azóta a lektor önálló megoldásokat
is ad (`solutions`), a bank-ellenőri és tanítási jegyzetek száma nőtt, és a grok-nál a gondolkodás is ebből a keretből
fogy. A négyforrásos leckénél így a keret kifogyott: a tartaléknál csonka lett a válasz, az elsődlegesnél a
gondolkodás elvitte a teljes keretet.

## Döntés
- `LEKTOR_MAX_TOKENS = 32_000`, nevesített, exportált konstans. A korlát megmarad (nem korlátlan kérés), a
  többi szabály (Responses, medium, `store: false`, `maxRetries: 0`, 480 s) változatlan.
- **Dokumentált tesztváltozás:** a `tests/lektor-request-policy.test.ts` a `max_output_tokens` értékét 32 000-re várja.
  A teszt szándéka (korlátos kérés, pontos érték) megmarad.

## Elfogadás
- **E1** A lektorkérés `max_output_tokens` értéke 32 000 (teszt).
- **E2** Kapuk zöldek; élő újramérés ugyanazzal a kombinált forrással: a lektor-lépés nem csonkul.

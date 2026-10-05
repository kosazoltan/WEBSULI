# S10 — Adatvesztés-mentesség: streamelt modellhívás és automatikus folytatás (tulajdonosi kérés, 2026-10-05)

Tulajdonosi kérés: „a modellek streamelve kommunikáljanak, hogy ne vesszenek el az adatok … a rendszeren belül is hiba lehet,
mert nem folyamatosan adja át az adatokat”.

## Mért kiindulás (éles DB, a 9 „infrastructure” bukás valódi hibaszövege, 2026-10-05)
- 1× modell-időtúllépés: „[xAI] Request timed out.” (lektor) — a gyártás NEM streamel: `run-step.ts:200`
  (`provider.chat`), teljes válaszra szabott korlát 180–300 s, max 24k token (`studio-provider.ts:118-149`). Időtúllépésnél a
  már legenerált (kifizetett) rész is elvész.
- 3× „A szerver újraindult a lecke-készítés közben — indítsd újra a lépést az »Újra« gombbal.” — a deploy/újraindulás
  megszakítja a futást, folytatás csak kézzel.
- 1× szolgáltatói hiba (animator); 4× szándékos próba-leállítás (nem rendszerhiba).
- A szolgáltatói osztályok streamelni tudnak (`OpenRouterProvider.ts:141 streamChat`, `ClaudeProvider.ts:111`,
  `OpenAIProvider.ts:106`), a gyártási út nem használja.

## Cél
1. **Streamelt hívás a hosszú lépésekre** (bank, szerző, lektor, animátor, ábratervező): a válasz darabonként érkezik,
   **tétlenségi korláttal** (nincs új adat N mp-ig → hiba) a teljes-válasz korlát helyett; a beérkező szöveg folyamatosan
   pufferelődik, a kész válasz ugyanúgy validálódik. Időtúllépésnél a részleges szöveg a futás naplójába kerül.
2. **Automatikus folytatás szerver-újraindulás után:** induláskor a megszakadt (lízing lejárt) futások a meglévő
   ellenőrzőpontjaikról folytatódnak — a kész lépés és kész hívás NEM fut újra; kézi „Újra” nem kell. Keret: futásonként
   legfeljebb 2 automatikus folytatás.
3. **Szabály a scriptekre:** minden hosszú, fizetős batch leckénként/tételenként ellenőrzőpontot ír (a besoroló már így működik).

## Nem-cél
Szolgáltató-váltás, modellváltás; a lecke tartalmi kapuinak módosítása.

## Kutatási kötelezettség (research-first)
Implementáció ELŐTT: az OpenAI SDK (OpenRouter-kompatibilis) streaming + `usage` a stream végén (`stream_options.include_usage`),
JSON-mód streameléssel, megszakítás (`AbortSignal`) — hivatalos dokumentáció / Context7 alapján; az Anthropic SDK
`stream().finalMessage()`.

## Elfogadás (EARS)
- HA a modell lassan, de folyamatosan generál, AKKOR a hívás nem bukik el teljes-válasz korláton.
- HA N mp-ig nem jön adat, AKKOR a hívás tétlenségi hibával bukik, a részleges szöveg naplózva.
- HA a szerver futás közben újraindul, AKKOR a futás induláskor magától folytatódik a legutolsó ellenőrzőponttól, a kész
  hívások nem ismétlődnek (token-napló igazolja).
- A streamelt és nem streamelt válasz ugyanarra a bemenetre ugyanúgy validálódik (teszt rögzített streamből).

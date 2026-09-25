# Spec — Kimerült OpenAI-keret: igaz hibaüzenet és automatikus átállás (2026-09-25)

Tulajdonosi utasítás: „keresd meg a websuli alkalmazásban az internetes tananyag készítés hibáját és folytasd a
javítást amíg a gyökérokat meg nem találod és nem javítottad”.

## Háttér (mért)

- Internetes job `22a38c0a` („Első károly magyar király”, 2026-09-25 12:04–12:21 UTC, Render): a kutatás, a
  forrásjegyzék és a tananyagírás elkészült; a gyakorlóbank 2. hívása bukott. A job hibája: „A tananyagírás vagy
  a gyakorlóbank készítése nem fejeződött be.” A Render-naplóban csak „[WEB-RESEARCH] background job failed” áll.
- Reprodukció a job workflow-rekordjának memóriabeli másolatával (csak a bankfázis fut élőben): `StepModelError`
  → cause: „[OpenAI] Rate limit exceeded”.
- Próbahívás az ÉLES kulccsal (`AI_INTEGRATIONS_OPENAI_API_KEY`, Renderen ugyanaz a lenyomat): HTTP 429,
  `insufficient_quota` / `credit_balance_exhausted` — **az OpenAI-fiók kreditje elfogyott** (terra és luna is).
- Ugyanazok a modellek az OpenRouteren (`openai/gpt-5.6-terra`, `openai/gpt-5.6-luna`) működnek (HTTP 200, a
  háttérszolgáltató OpenAI), az OpenRouter-egyenleg pozitív.

## Gyökérok

1. Külső: az OpenAI-fiók kreditje elfogyott (feltöltés a tulajdonos dolga).
2. Kód: (a) az `OpenAIProvider` minden 429-et „Rate limit exceeded”-nek (újrapróbálható) fordít, a kimerült
   keretet nem különbözteti meg; (b) egyetlen fiók kimerülése minden OpenAI-lépést (szerző, kivonatoló, bank,
   mentőkör, ábra-tartalék) leállít; (c) a webes futtató a `StepModelError` okát eldobja; (d) a háttérjob
   naplója hibaobjektum nélkül naplóz — ezért volt a hiba felderíthetetlen.

## Cél

- A kimerült keret saját, nem újrapróbálható hibaként jelenjen meg, magyar, igaz üzenettel.
- Közvetlen OpenAI-hívásnál kimerült keret esetén UGYANAZ a kérés UGYANAZZAL a modellel az OpenRouteren fusson
  tovább (ha van OpenRouter-kulcs); a kimerülés 10 percig megjegyzett, addig a közvetlen hívás kimarad.
- A webes ág hibaüzenete és naplója nevezze meg az okot.

## Nem-cél

Modellcsere; más szolgáltatók (Anthropic, xAI) átállása; a legacy (nem stúdió) OpenAI-hívók átírása.

## Elfogadás (EARS)

- HA az OpenAI 429-et ad `insufficient_quota` típussal, AKKOR `AIProviderQuotaError` (nem újrapróbálható) keletkezik;
  sima 429 (sebességkorlát) továbbra is `AIProviderRateLimitError`.
- HA a stúdió-provider közvetlen OpenAI-hívása `AIProviderQuotaError`-t kap és van OpenRouter-kulcs, AKKOR ugyanaz az
  üzenetlista `openai/<modell>` néven az OpenRouteren fut, és annak válasza jön vissza; a következő 10 percben a
  közvetlen hívás kimarad.
- HA nincs OpenRouter-kulcs, AKKOR a kvótahiba változatlanul továbbmegy.
- HA a webes gyártás kvótahibán bukik, AKKOR a job hibája a kimerült keretet nevezi meg; a háttérjob naplója a hiba
  üzenetét tartalmazza.
- Élő bizonyíték: a `22a38c0a` job bankfázisa ugyanazzal a reprodukcióval lefut (az OpenRouteren át).

## Végrehajtás (AI-ügynöknek)

1. `server/ai/AIProvider.ts`: `AIProviderQuotaError`.
2. `server/ai/OpenAIProvider.ts`: 429 + `insufficient_quota`/`credit_balance_exhausted` → kvótahiba.
   `server/ai/OpenRouterProvider.ts`: 402 → kvótahiba.
3. `server/ai/studio-provider.ts`: `QuotaFailoverProvider` az `openai` szállítóra, ha van OpenRouter-kulcs.
4. `server/studio/web-research-runner.ts`: az ok naplózása + kvóta-specifikus üzenet; `web-research-jobs.ts`: a
   háttérhiba üzenete a naplóba.
5. Új tesztek (`tests/ai-quota-failover.test.ts`); kapu; PR; CI; merge; deploy; élő reprodukció.

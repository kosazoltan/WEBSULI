# Lektor- és szerzőmodell-csere (tulajdonosi döntés, 2026-10-05)

## Döntés
- **Lektor:** `grok-4.6` → **`gpt-6.1-sol`** (OpenAI, Responses API, medium effort, streamelve) — „képes hosszú futásokra, nem akad el”.
  **Tartaléka:** **`gpt-5.6-terra`** (a kért „GPT-6 Terra” nem létezik; az OpenAI /models listáján 2026-10-05: gpt-5.6-luna,
  gpt-5.6-sol, gpt-5.6-terra, gpt-6-astra, gpt-6-luna, gpt-6-sol, gpt-6.1-sol — a tulajdonos a gpt-5.6-terrát választotta).
  A lektor második tartaléka (eddig claude-opus-5-5) megszűnik: a szerző családjába esne.
- **Szerző:** `gpt-6-luna` → **Claude Opus 5.5** (`claude-opus-5-5`, közvetlen Anthropic API). **Tartaléka:** a Sonnet helyett
  **Qwen 3.8** az OpenRouteren, maximális efforttal: `qwen/qwen3.8-max-prime` (a Qwen 3.8 legfrissebb csúcsmodellje,
  kiadva 2026-09-23; `reasoning.effort: "high"` — a konfigurációs típus és az OpenRouter dokumentált felső foka).

## Indok / megkötés
A D1-független lektor szabálya (audit 2026-09-05, `assertDistinctFamilies`) megmarad: a lektor (openai) más családú, mint a
szerző (anthropic) és a szerző tartaléka (qwen). A tulajdonos ezt választotta a szabály lazítása helyett.

## Igazolás (élő próbahívás, 2026-10-05, streamelve ahol támogatott)
gpt-6.1-sol 5650 ms ✓ · gpt-5.6-terra 882 ms ✓ · qwen/qwen3.8-max-prime (high) 2030 ms ✓ · claude-opus-5-5 7518 ms ✓
(az Anthropic-ág ekkor még nem streamelt → S10/3 kötelező, mert a szerző hosszú kimenete ezen fut).

## Elfogadás
- `assertDistinctFamilies` minden (szerző|tartalék) × (lektor|tartalék) párra teljesül.
- A lektor OpenAI-n Responses API-n, medium efforttal, streamelve megy; a szerző-tartalék Qwen `reasoning.effort: high`-al.
- A modellt rögzítő meglévő tesztek a dokumentált döntéshez igazítva; teljes unit, tsc, lint zöld.

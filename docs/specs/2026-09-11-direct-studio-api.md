# Közvetlen Studio API

Cél: Terra feladatok OpenAI API-val, Grok feladatok xAI API-val fussanak, saját környezeti kulccsal. GLM nem lehet alapmodell vagy tartalék. A szerző és a lektor külön szolgáltató marad.

Nem-cél: OCR Qwen/Gemini modellcsere, fogalomazonosító-javítás, meglévő tananyagok módosítása. Az OCR OpenRouter használata megmarad.

Érintett: server/ai/models.ts, OpenAIProvider.ts, új studio-provider.ts; Studio extraction, step-runner, structured-improvement, routes; improveAsync; célzott tesztek és ENV példa.

Elfogadás: Terra/Grok logikai modellazonosító közvetlen szolgáltatói végpontra jut, OpenRouter kulcs jelenléte sem irányíthatja át. Hiányzó saját kulcs esetén világos hiba, nincs csendes OpenRouter fallback. Natív és korábbi prefixelt Terra/Grok override egyaránt közvetlen. Tokenlimit és megszakítás megmarad. Készenlét szolgáltatónként ellenőrzött. GLM szerepek Terra alapértéket kapnak. A szerző/lektor külső fallback megszűnik a független lektorálás megtartásával.

Verifikáció: hálózat nélküli útvonal/kulcs/paraméter tesztek, typecheck, lint és érintett meglévő tesztek. Éles xAI-kulcs helye UNKNOWN; kulcs nélkül nem állítható éles működés. Titkok nem kerülnek dokumentumba. Visszaállás: célzott kóddiff visszavonása; adatbázis-módosítás nincs.

## Eredmény

- A felhasználó megadta a saját kulcsfájlok helyét; a megfelelő OpenAI projektkulcs és xAI kulcs a Gitből kizárt source/.env-be került. Kulcsérték nem került kimenetbe.
- Közvetlen /models lekérdezés mindkét szolgáltatónál HTTP 200; Terra és Grok elérhető. Az új provideren keresztüli valódi minimális generálás mindkettőnél teljes, nem üres választ adott.
- npm.cmd run verify: PASS; typecheck, lint, test typecheck, 1154/1154 teszt, frontend/backend build. git diff --check: PASS.
- További érintett pontok: AIProviderFactory.ts OpenRouter regisztrációja OCR-re váltott; server/routes.ts téves fallback-naplója javítva; render.yaml xAI secret deklaráció érték nélkül. A javítási végpont saját kulcsellenőrzést használ.
- A régi author fallback tesztek az új szerződés szerint módosultak: pedagogue fallback továbbra is ellenőrzött, author hibánál külső fallback nincs. Teszt nem lett kihagyva.
- Éles secret beállítás/deploy és teljes fizetős tananyagfutás: NOT RUN ebben a szeletben. A korábban talált fogalomazonosító-hiba nem része ennek a javításnak.

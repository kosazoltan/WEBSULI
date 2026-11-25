# Helyi ellenőr — az Ollama „token repeat limit” 500-as válasza nem kapuhiba

## Probléma
A #587 (`scripts/kovetelmeny/gyujt.py`) első töredékén a Gemma 4 a JSON-lelet szövegében ismétlő hurokba esik (`f"` után végtelen
szóköz), az Ollama a generálást `HTTP 500 {"error":"prediction aborted, token repeat limit reached"}` válasszal megszakítja.
A `callModelOnce` ezt átmeneti hibának veszi, háromszor ugyanazzal a (determinisztikus, seed 42) kéréssel újrapróbálja, majd a
teljes ellenőrzés `HIBA: ollama HTTP 500`-zal, ítélet nélkül leáll (két egymást követő futás, mérve 2026-11-25).

## Döntés
- A „repeat limit” 500-as válasz **értelmezhetetlen modellválasz**, nem átmeneti hiba: a hívás üres tartalmat ad vissza, így a
  meglévő út érvényesül — `reviewChunk` a darabot felezi (legfeljebb 2 szintig), kisebb darabon a hurok jellemzően nem jön elő.
- Minden más nem-OK válasz változatlanul hiba (404 → `ModelUnavailable`, egyéb → átmeneti hiba, újrapróba).
- A döntés tiszta függvényben (`classifyModelResponse(status, body)`), egységteszttel.

## Elfogadás
- `classifyModelResponse(500, '{"error":"prediction aborted, token repeat limit reached"}')` → `{ kind: 'loop' }`.
- 404 → `unavailable`, egyéb 500 → `error`, 200 → `ok` + tartalom.
- Valós adaton a #587 diffjére a helyi ellenőr ítéletet ad (nem áll le HTTP 500-zal).

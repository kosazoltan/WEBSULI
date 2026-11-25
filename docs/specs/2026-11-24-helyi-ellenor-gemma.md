# Helyi ellenőr: Gemma 4 26B az Ornith-9B helyett

Forrás: tulajdonosi döntés, 2026-11-24 (űrlap). A helyi GPU-modell a Gemma 4 26B A4B (`gemma4:26b`).
- Mérés (Hermes-agent `scripts/helyi-modell-meres.py`): 27/27 helyes válasz az Ornith 25/27-ével szemben, 195 tok/s a 74 tok/s-mal szemben, kb. 19,7 GB VRAM 32k kontextussal.
- A régi 9B modell nagy diffen nem volt stabil (TRAP: 15 hamis „high” lelet).

## Változás
- `local-review.mjs`: az alapértelmezett modell `gemma4:26b` (a `WEBSULI_LOCAL_REVIEW_MODEL` felülírhatja).
- A `repeat_penalty` / `repeat_last_n` kikerül. A 9B modell ismétlő hurkára vezették be, a Gemmánál viszont kiírja a válaszból a `"findings"` kulcsot (`{"verdict":"PASS"}`), ezért a válasz értelmezhetetlen lesz. A `num_predict` korlát marad.
- `parseFindings`: a `{"verdict":"PASS"}` alak (lelet nélkül) üres leletlistát jelent. A CONCERNS vagy BLOCK ítélet `findings` nélkül továbbra is értelmezhetetlen (`null`), hogy egy csonka válasz ne fedje el a leletet.

## Elfogadás
- E1: WHEN a válasz `{"verdict":"PASS"}` THEN `[]`. WHEN `{"verdict":"BLOCK"}` vagy `{"verdict":"CONCERNS"}` THEN `null`.
- E2: WHEN nincs `WEBSULI_LOCAL_REVIEW_MODEL` THEN `DEFAULT_MODEL === "gemma4:26b"`.
- E3: valós futás a B5a-1 diffjén: minden darabra értelmezhető ítélet, a futás nem áll le hibával.

# R2 — HTML-okosítás: determinisztikus bankjavítás a záró kapu előtt

Állapot: tulajdonosi kérés 2026-10-20 (mély elemzés + javítás). Az elemzés:
`docs/specs/2026-10-20-elakadas-gyokerok-elemzes.md` (R1-ág, #331).

A szelet a #327 rubrika-igazítást (`server/improve/align-html-bank.ts`) terjeszti ki.

## Mérés (éles, csak olvasva)
- **Sikerarány:** a HTML-okosítás 30 nap alatt 4 futásból 1-szer sikeres.
- **f2c2f102 (ma 07:46) a záró kapun bukott:**
  - `t11` két bankcsomag fogalmát fedi (`["watch","clock"]`, a terv: `[clock, face, …]` és `[watch]` ugyanabban a fejezetben)
    → „Bankterven kívüli tétel”;
  - „A nyílt bank mérete, írásos vagy szóbeli változata hiányos”;
  - `t43` mintaválasza nem kap teljes pontot.
- **A hibák természete:** mind determinisztikusan javítható vagy a minimum fölött elhagyható. Ennek ellenére a teljes, 23 perces
  generálás elveszett.

## Szakirodalmi minta
Előbb determinisztikus javítás, utána a modell (Guardrails `FIX_REASK`); túlgenerálás + szűrés a padló fölött (`FILTER`); csak a
maradék hiba megy a modellhez.

## Cél (a kapu előtt, ebben a sorrendben; a HTML a JSON-bankon kívül bájtra azonos)
1. **Rubrika-igazítás:** változatlan (#327).
2. **Csomaghatár:** ha egy tétel (`methods` / `tasks` / `quiz`) `coversConceptIds`-e a fejezete egyik csomagjába sem fér bele, akkor
   a lista az ELSŐ fogalom csomagjának fogalmaira szűkül.
   - Ha az első fogalom egyik csomagban sincs, a tétel érintetlen (a kapu jelenti).
3. **Szóbeli/írásos egyensúly:** ha egy csomag (`bankPlan.units`) feladatai között ≥ 2 van, de mind azonos módú, a csomag utolsó
   feladata átvált a másik módra.
4. **Padló-próbás elhagyás:** az a feladat, amelynek a mintája az igazítás után sem kap teljes pontot, akkor kerül ki, ha
   utána a JSON-bank sémája (`htmlLessonDataSchema`) nem jelez ÚJ hibát.
   - Különben marad, és a kapu jelenti — majd a hibalistás tartalék próba jön (#327).

## Nem-cél
- **A modell-hívások száma és a kapu szigora:** nem változik. A pontozó és a minimumok sem.
- **A tételszintű modell-javítókör:** külön szelet (R4).

## Elfogadás (EARS)
- **Csomaghatár:** HA egy tétel két csomag fogalmát fedi, AKKOR a kapu előtt az első fogalom csomagjára szűkül, és a
  „Bankterven kívüli tétel” hiba nem jelentkezik.
- **Mód-egyensúly:** HA egy csomag minden feladata írásos (≥ 2 feladat), AKKOR az utolsó szóbeli lesz.
- **Elhagyás:** HA egy feladat mintája nem teljes pontos, és az elhagyása nem okoz új sémahibát, AKKOR kikerül; különben marad.
- **Változatlanság:** HA a bank hibátlan, AKKOR a HTML bájtra azonos.

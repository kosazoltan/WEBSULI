# NAT 2020 mintatanmenetek → `server/data/tanmenet-2020.json`

Terv: `docs/specs/2026-10-17-tanmenet-rendezes.md`.

**Forrás:** Oktatási Hivatal, „Mintatanmenetek” —
https://www.oktatas.hu/kozneveles/kerettantervek/2020_nat/mintatanmenetek (évfolyamonként `…/tanmenet_<N>evf`).
A `sources.json` tartalmazza a felhasznált 256 dokumentum címét és URL-jét.

A dokumentumok **nem** kerülnek a repóba, csak a kivonat: az órák sorrendje (témakör, óracím).

## Újragenerálás
1. Töltsd le a `sources.json` URL-jeit egy üres mappába (pl. `curl -A "<böngésző UA>"`).
   - A régi `.doc` fájlokat alakítsd át: `soffice --headless --convert-to docx`.
   - A fájlnév előtagja `g<évfolyam>__` legyen (a listaoldal évfolyama).
2. `python -I extract.py <mappa> tables.json`
3. `python -I lessons.py tables.json lessons.json`
4. `python -I build.py lessons.json sources.json ../../server/data/tanmenet-2020.json`

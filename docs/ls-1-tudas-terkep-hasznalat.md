# LS-1 — Tudás-térkép: így fogod használni

**Mi változott (2026-09-04):** az Admin felületen megjelent egy új fül, **Tudás-térkép**.
Ez az első lépés afelé, hogy a tananyagok ne „egy AI kitalálta HTML-oldal" legyenek,
hanem a **te forrásodból** (tankönyv-oldal, fénymásolat, jegyzet) származó, ellenőrzött
tananyagok.

## Miért volt erre szükség

Eddig: feltöltöttél egy PDF-et, az AI ránézett, és írt belőle egy kész HTML-oldalt.
Ami abban szerepelt, azt **senki nem tudta visszaellenőrizni** — nem látszott, hogy egy
mondat a tankönyvből jött-e, vagy a modell tette hozzá „mert tudja".

Mostantól közbeiktatunk egy lépést: **először kivonatoljuk, mit mond a forrás**, azt te
átnézed és jóváhagyod, és a lecke majd csak ezen a jóváhagyott halmazon belül mozoghat.

## A képernyő

**Admin → Tudás-térkép**

A lista a meglévő térképeket mutatja (tantárgy, osztály, állapot). Egy térképre kattintva
megnyílik a szerkesztő, ahol fogalmanként látod:

- a **fogalom nevét és meghatározását**,
- a **Forrásidézet** dobozt: pontosan melyik fájlból, melyik oldalról származik, és mi az
  a szó szerinti mondat, amire épül,
- egy **címkét**, hogy a rendszer megtalálta-e ezt a mondatot a forrásban:
  - 🟢 **Forrásból igazolt** — a mondat tényleg ott van a feltöltött anyagban,
  - 🔴 **Nem igazolt** — a modell olyat állít, amit nem tud idézni.

## Mit csinálj vele

Fogalmanként három gombod van:

| Gomb | Mikor |
|---|---|
| **Elfogadom** | Rendben van. (Csak akkor aktív, ha az idézet igazolt.) |
| **Idézet javítása** | Az idézet pontatlan. Beírod a helyeset, mentésre a rendszer **azonnal újraellenőrzi** a forrás ellen. |
| **Kihúzom** | Ez a fogalom nem kell ebbe a leckébe. |

Fent a **Térkép jóváhagyása** gomb csak akkor válik aktívvá, ha:

1. minden **kulcsfogalom** forrásból igazolt, és
2. nincs több „átnézésre vár" tétel.

Amíg nem az, a gomb alatt ott áll, pontosan mi hiányzik.

## A legfontosabb szabály (D1)

**A forrás mindig nyer.** Ha a tankönyv olyat ír, ami elavult vagy vitatható, a rendszer
**akkor is a tankönyvet rögzíti** — mert a gyereket abból fogják feleltetni. A modellnek
nincs joga „kijavítani" a tananyagot, és nincs semmilyen „helyesbítve" felirat a gyerek
felé.

Ezt nem ígéret, hanem gépi szabály: minden állításnak szó szerinti idézettel kell
igazolnia magát, különben pirosra vált és blokkolja a jóváhagyást. A böngésző nem tudja
„megmondani", hogy valami igazolt — ezt mindig a szerver dönti el a tárolt forrásszöveg
alapján.

## Költség

A kivonatolás fizetős modellhívás (egy egész dokumentumot néz át). Ezért **ugyanazt a
feltöltést nem számoljuk el kétszer**: ha ugyanazokat a fájlokat ugyanarra a
tantárgy/osztály párosra töltöd fel újra, a rendszer a már meglévő térképet adja vissza.
Ha viszont a tartalom vagy az osztály változik, az új munka — és jogosan új térkép.

## Ami még nincs kész

Ez a 1. szelet. A térképből **még nem készül lecke** — az a következő lépés (LS-2).
Most az alap készült el: a forráshoz kötött, általad jóváhagyott fogalomkészlet.

---

### Technikai összefoglaló (fejlesztőknek)

- Séma: `shared/knowledge-map-schema.ts` (zod), táblák: `knowledge_maps`, `km_concepts`
  (migráció: `migrations/0008_knowledge_maps.sql`, Neonon lefuttatva).
- D1-őr: `server/studio/verbatim.ts` — normalizált részlánc-egyezés (kis/nagybetű,
  whitespace, magyar idézőjelek, gondolatjel-variánsok, lágy elválasztójel).
  **Nem** bag-of-words: a forrás szavaiból összerakott, de nem létező mondat elbukik.
- Idempotencia: `computeInputHash` (sha256, fájlnév szerint rendezve + hatókör), DB-szinten
  `input_hash` UNIQUE.
- Végpontok: `server/studio/routes.ts`, mind `isAuthenticatedAdmin` mögött (futó szerveren
  mérve: 7/7 → 401 anonim hívásra).
- Kapuk a szelet végén: tsc 0 · eslint 988/989 · unit 266/266 · build OK · Playwright 18/18.
- Reverz-mutáció: 5 mutáció a `verbatim.ts`-en, 6 az `extractor.ts`-en — mind bukik.

### Örökölt hiba, amit menet közben találtunk (NEM ebben a szeletben javítva)

`server/lib/allowed-origins.ts:49-50` feltétel nélkül felveszi az engedélyezett originek
közé a `FRONTEND_URL` és `BASE_URL` értékét. Fejlesztői gépen ezek `http://localhost:*`,
így éles (`NODE_ENV=production`) módban is engedélyezetté válna a localhost — pont az a
védelem sérül, amit az 53. sor szándékosan felállít. Bizonyíték: e két változó
kiürítésével a `tests/csrf-origin.test.ts` 16/16 zöld, velük 15/16.
Éles kockázat akkor keletkezik, ha a Render-környezetben ezek localhostra mutatnának.
Külön tétel, nem az LS-1 hatóköre.

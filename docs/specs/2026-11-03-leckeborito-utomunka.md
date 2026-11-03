# Leckeborító-utómunka: gyengén illeszkedő képek cseréje, lecke nélküli anyagok borítója

Előzmény: `docs/specs/2026-11-03-leckeborito.md` (PR #382, élesben). Tulajdonosi kérés (2026-11-03, szó szerint): „Nézd át még egyszer
a tananyagok kezdőképeit… Nem illesztetted megfelelően a tananyagot, illetve a képet a tartalomhoz vagy a címhez. Ezeket szintén te
cseréld autonóm módon mindenhol, vagy a címhez, vagy a tananyag témájához illesztett módon.” A szülő munkamenet kontaktlapos
átnézése (217 kártya) alapján a hibák:

## Mért tények
- A régi képeket (híd, földgömb, hegyre sétáló gyerekek) a főoldal elavult listája mutatta: a `/api/html-files` `HtmlFilesCache`-e
  (5 perc TTL) a csere előtt épült fel, a közvetlen DB-írás nem ürítette. Ma élesben 213/213 lecke tartalmi borítót mutat.
- Gyengén illeszkedő leckeborító (a tanítószöveg alapján):
  - 4. o. „Fogalomjegyzék a feltöltött forrásokból” (`cover-l-d0228a7b52eb02a1`) — a lecke a Fehérlófia-mese lényeit és jelképeit
    tanítja (három-, hat-, tizenkét fejű sárkány, griffmadár, fehér ló, aranyfürt, gyűrű, Hétszűnyű Kapanyányimonyók); a kép általános mesetáj.
  - 5. o. „A talaj kialakulása, összetevői és termékenysége” (`cover-l-63c4aa9223a9ede0`) — aprózódás, mállás, élőlények, humusz; a kép egy kőtömb.
  - 5. o. „A számírás fejlődése – Római számok” (`cover-l-3494830174e1c34b`) — a hét római jel (I V X L C D M); a kép ásó pásztor.
  - 4. o. „Az emberi test – Egészségünk” (`cover-l-4de4a74b2884ba6d`) — vér, erek, szív, pulzus, elsősegély, táplálkozási piramis,
    tisztálkodás; a kép padon ülő gyerek.
- Lecke nélküli (régi HTML / PDF) anyagok `cover = null` → a főoldal a sáv hős-képét mutatja: „English Grammar with Pictures – 4th
  Grade” (`baf280be…`, 4.), „Suno AI – Zenekészítés…” (`2ae90d2b…`, 0.), „Szabó Magda: Abigél – A regény” (PDF, `8eca0ab6…`, 8.),
  „Abigél” (HTML, `d1cbfb26…`, 8.).

## Cél
- A 4 leckeborító új képe ugyanazon az azonosítón (a katalógusbejegyzés és a WebP cserélődik; a leckék `art.picture`-je nem változik,
  DB-írás nincs). A római számos képen — tulajdonosi kérésre — a hét római jel kőbe vésve megjelenik (a lecke tárgya maga a jel).
- 3 új katalógusborító a lecke nélküli anyagokhoz (az Abigél HTML és PDF közös képet kap), és egy kézi leképezés
  (`MATERIAL_COVERS`: `html_files.id` → borító-id) a `shared/lesson-cover.ts`-ben; a `getAllHtmlFiles` ezt adja `cover`-nek, ha az
  anyagnak nincs publikált leckéje.
- Gyorsítótár: a szerveroldali automatikus borító saját folyamatában üríti a listát (PR #384); a kézi szkriptes csere után a lista
  legkésőbb a TTL (5 perc) lejártával frissül — a csereszkript ezt kiírja, az ellenőrzés csak ezután történik.

## Nem-cél
- A többi 208 leckeborító; a kártyaleírás; admin cache-végpont (a TTL elég, a háttérfolyamat ürít).

## Edge case-ek
- A leképezett anyag később publikált leckét kap → a lecke borítója nyer (a `coversByFile` eredménye elsőbbséget élvez).
- A leképezett borító nincs a katalógusban (pl. átnevezés) → `null` (a régi viselkedés), nem hibás kép.
- Böngésző-gyorsítótár: a `/api/design-assets/:id` `max-age=86400` + ETag — a csere utáni első napon a régi kép a kliensben maradhat;
  a főoldali bélyegkép (`/thumb`, sha256-kulcs) és a statikus fájl friss.

## Elfogadás (EARS)
- HA az anyagnak nincs publikált leckéje és szerepel a `MATERIAL_COVERS`-ben (és a borító a katalógusban van), AKKOR a
  `getAllHtmlFiles` `cover` = a leképezett borító; HA van publikált leckéje, AKKOR a lecke borítója.
- HA a 4 lecke megnyílik, AKKOR az új, tartalomhű kép látszik (élesben, 390 és 1280 px); HA a főoldal betölt, AKKOR a 4 anyag kártyáján is.
- HA a kézi csereszkript lefut, AKKOR kiírja a lista frissülésének idejét (TTL).
- HA `npm test`, `tsc` (app + teszt), `eslint --max-warnings 0`, `npm run build`, AKKOR zöld.

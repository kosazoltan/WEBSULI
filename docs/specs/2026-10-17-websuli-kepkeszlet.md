# Websuli képkészlet — MI-generált, kurált saját képek — terv

**Forrás:** `docs/design/Websuli_Grafikai_Szabalyterv.md`, a 2.3 (képi nyelv) és a 4. pont (tulajdonosi döntések, 2026-10-17). Vizuális
referencia: `docs/design/Websuli_Koncepcio_Egy_Platform.png`. Ez a szabályterv 5/2. szelete (képkészlet és borítóválasztás), első
része: a **gyártóeszköz és az első, jóváhagyott képcsomag**. A lejátszóba kötés a következő rész.

## Tulajdonosi döntések (2026-10-17)
- **Modell:** csak a ByteDance **Seedream 5.0 Pro** (`bytedance-seed/seedream-5-0-pro`), az OpenRouter képvégpontján keresztül
  (`POST https://openrouter.ai/api/v1/images`).
- **Működés:** szkript a repóban, a meglévő OpenRouter-kulccsal. A kulcsot csak a folyamat olvassa, sehová nem írja ki.
- **Stílus:** a promptok és a stílusleírás verziókezelve vannak, így minden kép újragenerálható.
- **Jóváhagyás:** minden képet a tulajdonos hagy jóvá egy válogató oldalon.
- **Kabala:** egy közös, nemtől független állatfigura (a koncepcióképen róka) az 1–5. évfolyamra. A 6–12. évfolyamon nincs kabala.

## Ellenőrzött tények (2026-10-17, a nyilvános OpenRouter API-ból)
- A `/api/v1/images/models` listázza a modellt. Paraméterei:
  - `resolution`: 1K vagy 2K;
  - `aspect_ratio`: többek között 1:1, 3:2, 4:3, 16:9, 21:9;
  - `n`: 1;
  - `input_references`: 0–14 referenciakép;
  - `seed`: igen/nem.

  A bemenet szöveg és kép, a kimenet kép.
- **Ár** (`/endpoints`): 0,045 USD/kép, nagy felbontás 0,09 USD/kép, referenciakép 0,003 USD.
- **Válasz:** `data[].b64_json` és `media_type`, a dokumentáció szerint (`openrouter.ai/docs/guides/overview/multimodal/image-generation`).
- **Kulcs:** `OPENROUTER_API_KEY` a Hermes-profil `.env`-jében (`%LOCALAPPDATA%\hermes\.env`). A WEBSULI `.env`-ben nincs.

## Cél
1. **`scripts/design-assets/generate.ts`:** a `design-assets/prompts.json` tételeit legenerálja a Seedream 5.0 Pro-val.
   - A közös stílusleírás és a sávonkénti képi nyelv a szabályterv 2.3-a.
   - A jelöltek ide kerülnek: `design-assets/candidates/<id>/<n>.png`. A mappa nem kerül gitbe.
   - Minden futás költséget naplóz, és van kemény darabszám-korlátja.
2. **Kabala-következetesség:** a jóváhagyott alap-kabalakép a többi kabalapóz referenciaképe (`input_references`).
3. **`scripts/design-assets/review-page.ts`:** a jelöltekből helyi válogató oldalt készít.
   - Tételenként kártyák, „Ez jó” jelölés.
   - A kiválasztás JSON-ként másolható.
   - A tulajdonos dönt.
4. **`scripts/design-assets/approve.ts`:** a kiválasztott képeket WebP-be teszi, méretre igazítja, és elmenti ide:
   `client/public/design/<sáv>/<id>.webp`. Felveszi őket a katalógusba: `shared/design-assets.json`.
   - Mezők: `id`, `kind` (`mascot` | `hero` | `icon` | `cover`), `band`, `subjects`, `keywords`, `alt`, `origin`, `model`, `promptHash`,
     `seed`, `approvedAt`.
   - Az `origin` értéke: „MI-generált, saját (Seedream 5.0 Pro)”.
5. **Első csomag:** a lenti „Első csomag” táblázat.

## Nem-cél
- A képek bekötése a lecke-lejátszóba (hős, borító, ikonok). Az a következő rész, külön terv nélkül nem indul.
- A tanulói keret képei.
- Más modell. Ha a Seedream nem hozza a minőséget, a tulajdonos dönt újra.

## Első csomag (próbakör → teljes)
| Csoport | Tételek | Képarány | Próbakör |
|---|---|---|---|
| Kabala (róka, unisex) | alap, köszön, mutat, ünnepel, gondolkodik; 3–5. sávban expedíciós változat | 1:1 | alap + köszön |
| Sávhős | 5 sáv a 2.3 szerint: mesés erdő a kabalával · festett csúcs zászlóval · Föld az űrből · függőhíd · csúcs naplementében, hátulról látszó túrázóval | 16:9 | mind az 5 |
| Tárgyikon | matematika, magyar, környezet, természettudomány, történelem, angol, földrajz, biológia, fizika, kémia, informatika, művészet (1–5.: fényes 3D; 6–12.: lapos) | 1:1 | 2 db |
| Tárgyköri borító | tárgykörönként 1, a pipeline választ belőle | 3:2 | 2 db |

Próbakör: 12 kép × 0,09 USD ≈ 1,1 USD. A teljes csomag háromszoros válogatással kb. 120 generálás ≈ 11 USD.

## Szélső esetek
- **Hiányzó kulcs:** a szkript hibával kilép, és a kulcs nevét írja ki, az értékét nem.
- **Hiba (4xx/5xx), üres `data`, nem képtípus:** a tételt kihagyja, naplózza. Nem próbálkozik végtelenül; tételenként legfeljebb egy
  újrapróbálás.
- **Költségkorlát:** `--max N` (alapértelmezés 12). A futás előtt kiírja a becsült árat.
- **Szöveg a képen:** a prompt tiltja. A felirat a felületen lesz, nem a képen; a magyar ékezetek miatt sem kerül szöveg a képbe.
- **Unisex / nincs sztereotípia:** a stílusleírásban kötelező; a válogatáskor a tulajdonos ellenőrzi.
- **Arcfelismerhető személy:** a 11–12. sáv túrázója hátulról látszik. Valós, azonosítható személy nincs.

## Elfogadás (EARS)
- HA a szkript a kulccsal fut, AKKOR minden tétel `candidates/<id>/` alá menti a képet, és a napló a modellt, a seedet, a
  promptlenyomatot és a becsült költséget tartalmazza. A kulcs sehol nem jelenik meg.
- HA a tulajdonos jóváhagy egy jelöltet, AKKOR a WebP a `client/public/design/` alá kerül, és a katalógus a szabályterv 2.3 szerinti
  metaadatokkal bővül. Egységteszt ellenőrzi a katalógus sémáját, a fájlok létezését és az alt szöveg meglétét.
- A katalógus minden eleme `origin` szerint MI-generált, saját. Külső kép nincs.

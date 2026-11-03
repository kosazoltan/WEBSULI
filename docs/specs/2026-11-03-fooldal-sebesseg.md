# Spec: a főoldal gyorsítása — build-időben készülő bélyegképek, gyorsítótár-ostrom megszüntetése

> Dátum: 2026-11-03 · Szerző: Claude (Kósa Zoltán kérésére: „ezzel a képkészítéssel és -megjelenítéssel megint belassult a
> megjelenítés… Ellenőrizd a teljes kódot, a szerveren való futást, az esetleges párhuzamos futtatásokat, a felesleges futásidőket és a
> túl nagy képeket. Ismét optimalizáld a futássebességet.”) · Állapot: JÓVÁHAGYVA

## Mért tények (élesben, 2026-11-03, `3bd36730`, innen mérve, alapvonal `/api/health` TTFB ≈ 0,32–0,47 s)

- **Hideg bélyegkép (deploy után):** 20 párhuzamos kérés → az utolsó 3,5 s-nál érkezik, összesen 3,8 s. Egy bélyegkép a szerveren
  ~150 ms CPU (`sharp` dekódolás + átméretezés + kódolás), és a kérések egymás után futnak. Meleg (memóriából) 1,6 s ugyanez; ennek
  nagy része a kérésenkénti `design_assets` metaadat-lekérdezés és a hálózat.
- **A memóriabeli bélyegkép-gyorsítótár minden újraindításkor elvész.** Ma sok deploy volt, mindegyik után az első látogatók kivárták
  a teljes újragenerálást.
- **`/api/html-files` (`server/routes.ts`, `HtmlFilesCache`, 5 perc):** lejáratkor `get()` `null`-t ad, és MINDEN egyidejű kérés
  külön, párhuzamosan építi újra a teljes listát. Ez gyorsítótár-ostrom. Egy újraépítés:
  - `html_files` 164 ms;
  - borító-lekérdezés 198–288 ms (11,6 MB tömörített lecke-JSON-ból olvas);
  - bevezető-lekérdezés;
  - tanmenet-betöltés.
- **A `/design/*` statikus képek:** `Cache-Control: public, max-age=0, must-revalidate`, így minden megnyitáskor újraellenőrzés.
- **Böngészőben, meleg állapotban:** LCP 1,03 s, `/api/html-files` 297 ms, a bélyegkép 7–24 KB (a borító 54–214 KB).

## 1. Cél

- A katalógus mind a 603 képéhez a BUILD készít bélyegképet (480×320 WebP), tartalom-hash-es fájlnévvel. Ezek statikus fájlként,
  `immutable`, egyéves gyorsítótárral mennek ki: futásidőben nincs `sharp` és nincs DB-lekérdezés, a deploy utáni első látogató sem vár.
- A lista minden kártyához kész `coverThumb` URL-t ad: a build bélyegképét, ha van; különben a futásidejű végpontot (csak az
  adatbázisban lévő, pl. automatikus borító).
- A futásidejű bélyegkép-végpont:
  - memóriatalálatnál DB nélkül szolgál ki;
  - egy azonosítót egyszerre csak egyszer generál (single-flight);
  - egyszerre legfeljebb 2 `sharp`-művelet fut.
- `HtmlFilesCache`:
  - lejáratkor az elavult listát AZONNAL adja (stale-while-revalidate), és egyetlen háttér-újraépítés fut (single-flight);
  - az érvénytelenítés (publikálás, javítás) után az első kérés vár (friss lista kell), de az egyidejű kérések egy építésen osztoznak.

## 2. NEM cél

- A kártya kinézete és a rendezés.
- A borítók tartalma és a lecke-lejátszó képei.
- Az automatikus borító (#384) logikája: csak a futásidejű végpontot használja.

## 3. Érintett területek

- `source/scripts/build-design-thumbs.mjs` (új):
  - `client/public/design/**/*.webp` → `client/public/design-thumbs/<id>.<sha8>.webp`, plusz `manifest.json` (`{ id: fájlnév }`);
  - inkrementális: a meglévő azonos hash-ű fájlt nem gyártja újra;
  - a `vite build` előtt fut, így a Vite a kimenetbe másolja.
- `source/package.json` `build`: `node scripts/build-design-thumbs.mjs && vite build && node build-server.js`.
- `source/.gitignore`: `client/public/design-thumbs/`.
- `source/server/vite.ts` `serveStatic`: `/design-thumbs` → `express.static(..., { immutable: true, maxAge: "1y" })` a generikus
  static előtt.
- `source/server/design-assets.ts`:
  - `thumbUrlFor(id)`: a manifest alapján statikus URL, különben `/api/design-assets/<id>/thumb`;
  - a futásidejű végpont: memóriatalálat DB nélkül, single-flight, legfeljebb 2 párhuzamos `sharp`.
- `source/server/storage.ts`: a sorok `coverThumb` mezőt kapnak (a `cover`, illetve a lecke nélküli anyagnál a sáv hős-képe).
- `source/client/src/components/UserFileList.tsx`: `src={file.coverThumb ?? <eddigi>}`.
- `source/server/cache/HtmlFilesCache.ts` + `server/routes.ts`: elavult-friss kiszolgálás + egyetlen újraépítés.
- Tesztek (új).

## 4. Rögzített döntések

- A tartalom-hash a forrásfájl sha256-jának első 8 jegye: új kép, új URL, ezért az `immutable` biztonságos.
- A manifest betöltése a szerver indulásakor, hiányában üres. Fejlesztői módban a manifest nem létezik: futásidejű végpont.
- A bélyegkép mérete marad 480×320, q70. Mért: 7–24 KB; a 2 hasábos mobilnézet 2× DPR-rel ~340 px, ehhez elég.
- Az elavult lista a gyorsítótár-lejárat után legfeljebb egy újraépítésnyi ideig (~0,5 s) szolgálódik ki.
- Érvénytelenítés után nincs elavult kiszolgálás, mert a publikáló azonnal a saját változását várja.

## 5. Edge case-ek

- A manifestben nem szereplő azonosító (új, csak az adatbázisban lévő kép): futásidejű végpont.
- A build-szkript hibája egy képnél: kihagyja és naplózza, a build nem bukik el. Az a kép futásidőben készül.
- Az újraépítés hibája elavult listánál: az elavult lista marad, a hiba naplóba kerül; a következő kérés újrapróbálja.
- Egyidejű érvénytelenítés és újraépítés: a futó építés eredménye nem írhatja felül az érvénytelenítés utáni állapotot. Ezt egy
  generáció-számláló biztosítja.

## 6. Elfogadás (EARS)

- WHEN a főoldal betölt, THEN a katalógusbeli borítók `/design-thumbs/<id>.<hash>.webp` URL-ről, `immutable` fejléccel jönnek, DB-hívás
  és `sharp` nélkül.
- WHEN a deploy után 20 bélyegkép egyszerre kell, THEN mind statikus fájl (nincs 3,5 s-os sor).
- WHEN a lista gyorsítótára lejár és N kérés érkezik egyszerre, THEN pontosan EGY újraépítés fut, és a kérések az elavult listát
  azonnal kapják.
- WHEN a futásidejű végpontra ugyanarra az azonosítóra egyszerre 10 kérés jön, THEN egyetlen `sharp`-művelet fut.

## 7. Tesztterv

- **Új tesztek:**
  - `tests/design-thumbs-build.test.ts`: a szkript tiszta magja (fájlnév-hash, manifest, inkrementalitás) egy ideiglenes mappán;
  - `tests/html-files-cache.test.ts`: elavult-friss kiszolgálás, egyetlen újraépítés N egyidejű kérésnél, érvénytelenítés-generáció;
  - `tests/design-thumb.test.ts` bővül: single-flight (10 egyidejű → 1 `makeThumbnail`) és `thumbUrlFor`.
- **A meglévő `public-perf`, `home-*`, `curriculum` tesztek zöldek.**
- **Élesben, deploy után:**
  - a bélyegkép-URL-ek `/design-thumbs/…`, `Cache-Control: … immutable`;
  - 20 párhuzamos bélyegkép összesen a hálózati alapvonal közelében;
  - böngészős LCP 390 és 1280 px-en.

## 8. Kockázatok / visszavonás

- **Hosszabb build:** ~603 kép. Inkrementális, és a Render build-gyorsítótárában nem marad meg, ezért kb. 20–40 s.
- **A Vercel-előnézet is `npm run build`-del készül:** ugyanaz a kimenet.
- **Visszavonás:** a merge commit revertje.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-03-fooldal-sebesseg-vegrehajtas.md`

# „Mai felfedezés” hírlevél — S2 végrehajtási utasítás (ügynöknek), review-keményítéssel

Terv: `docs/specs/2026-10-19-mai-felfedezes-hirlevel.md`. Az alap S2-lépéseket a
`docs/specs/2026-10-19-mai-felfedezes-hirlevel-vegrehajtas.md` „S2” része írja le. Ez a fájl azt egészíti ki a #313/#314
review alapján, mert a #313-at a GitHub lezárta az S1-ág törlésekor, és az S2 új ágon, új PR-ban megy. Munkakönyvtár:
`source/`. Ág: `feat/hirlevel-s2-ujra`.

1. **Migráció, séma, forráslista, sablon:** az alap utasítás szerint.
   - A `learner_newsletters` tábla kiegészül: `teaser`, `question`, `delivered_to text[]`.
   - A `delivered_to` a kézbesített címek sha256-előtagja, NEM maga a cím.
2. **`server/studio/safe-fetch.ts`:** új opcionális `allowUrl(url)`. Minden lépés, az átirányítás célja is, a kérés ELŐTT
   ellenőrizve; hamis → hiba.
3. **`server/newsletter.ts` — a választás és ellenőrzés:**
   - A keresés a `filters.allowed_domains` szűrővel megy.
   - A letöltés `allowUrl` = `isAllowedArticleUrl`.
   - A magyar nyelv ellenőrzése arányalapú: a betűk ≥ 2%-a magyar ékezetes, és van gyakori funkciószó.
   - **Független tartalomszűrő:** szótövek a címre, az ismertetőre és a kérdésre, a modell `ageAppropriate` ítéletétől
     függetlenül.
   - Ha nincs használható cikk, de volt sikertelen letöltés → dob (újrapróbálható).
   - Az ismétlésvédelem kanonikus URL-en mér (`canonicalArticleUrl`: kisbetűs host, query/hash és záró perjel nélkül).
     Ismétlésnek számít a `sent` és a részben kézbesített (`delivered_to` nem üres) foglalás is.
4. **`server/newsletter.ts` — a foglalás és a kézbesítés:**
   - **Visszavehető foglalás:** a `failed`, vagy a 20 percnél régebbi `pending`, mindkettő a próbálkozási korláton (3)
     belül.
   - **Tulajdon:** a próbálkozás sorszáma. Minden írás (cikk mentése, kézbesítés rögzítése, lezárás) csak a saját
     sorszámmal érvényes, különben a futó megáll.
   - **Rögzített cikk:** a kiválasztott cikk a küldés ELŐTT a foglalásba kerül; az újrapróba ugyanazt a cikket csak a még
     nem kézbesített címekre küldi.
   - **Küldés előtt friss ellenőrzés:** kapcsoló, a cím aktív és a tanulóhoz tartozik, és az aktuális token-verzió (a link
     ezzel készül).
   - **Tesztkörnyezet:** álküldő nélkül nem küld valódi levelet (`NODE_ENV=test` → hiba).
   - **Ütemezés:** 16:00, 16:30, 17:15 (Europe/Budapest), csak élesben. A futás szintű hiba az eredmény `error` mezőjében.
5. **Tesztek:**
   - **`tests/newsletter.test.ts`:** forráslista; szűrés; életkori ítélet; tartalomszűrő (ragozott alakok is); magyar arány
     (független fixtúrák); kanonikus ismétlés; átmeneti hiba; átirányítás-tiltás; sablon; ütemezés.
   - **`tests/newsletter-db.integration.ts` (eldobható DB):**
     - címzett-szűrés;
     - a modell bemenete (keresés és választás) név, cím és azonosító nélkül;
     - napi egy levél;
     - újrapróba ugyanazzal a cikkel a hiányzó címre;
     - beragadt foglalás;
     - közben kikapcsolt cím;
     - tesztőr;
     - részben kézbesített cikk mint ismétlés;
     - tulajdon elvesztése.
6. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `test:learning-db`, `build`.

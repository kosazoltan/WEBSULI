# Websuli arculati bank — végrehajtási utasítás (AI-ügynöknek), S1: témaköri borítók

Terv: `docs/specs/2026-10-17-arculati-bank.md`. Ág: `feat/arculati-bank` (a #275 ágára épül, annak merge-e után a main behúzva).
A parancsok a `source/` mappából futnak.

1. **`shared/topic-taxonomy.ts`:** `TOPICS: Array<{ subject: CatalogSubject; band: DesignBand; key: string; label: string; keywords: string[]; motif: string }>`.
   - Tantárgy × sáv páronként 2–6 témakör (mérve: 238 témakör a 72 párra), a NAT 2020 kerettantervi témakörei alapján, összefoglalva. A lista nem a NAT szó
     szerinti szövege; a tulajdonos szúrópróbázza.
   - A `key` alakja `[a-z0-9-]`, a pár témakörei között egyedi.
   - A `keywords` ékezettűrő (`foldText`), legalább 3 karakteres szavak.
   - A `motif` angol képleírás a borítóhoz.
   - Új `topicKeyOf({ subject, classroom, title, topicArea? })`, a sorrend:
     - a `topicArea` kulcsszó-egyezése;
     - a cím kulcsszava;
     - döntetlennél a leghosszabb egyezés, utána a lista sorrendje;
     - ha nincs egyezés, `null`.
   - Csak a `SUBJECT_BANDS` szerinti tanított párokra van bejegyzés.
2. **`scripts/design-assets/add-topic-covers.ts`:** idempotensen felveszi a `cover-<tantárgy>-<sáv>-<kulcs>` tételeket a
   `prompts.json`-ba.
   - Tulajdonságok: `kind: "cover"`, `aspect_ratio: "3:2"`, `batch: 3`, `subjects: [tantárgy]`, `keywords: [címke, ...kulcsszavak]`.
   - A prompt a tárgyat helyezi előre („Subject of the illustration: …”). Szöveg tilos.
   - **Próbakör (2026-10-17, 6 kép):** a sávhős referenciaként a hős tájképét másolta (zászlós csúcs, hátulról látszó túrázó).
     Ezért a borító referencia nélkül készül; a sáv stílusát a `style.md` sávleírása adja. A 3 újragyártott próbakép mind
     a saját témáját mutatta.
   - **Önellenőrzés:** 238 kép, 6 áttekintő lap. A gyanús képeken (kotta, táblák, lépőkövek, óra) nagyítva sincs szöveg.
     4 gyenge motívum (geometria-bizonyítás, etika, angol és francia „Környezet”) új leírással újragyártva. Méret: 20 MB.
3. **Gyártás:** `generate.ts --only <id-k>` három párhuzamos szálon, `--max`-szal; a költség a naplóban.
   - Önellenőrzés: tantárgyanként áttekintő lap. Hibánál új motívum és újragyártás.
   - Jóváhagyás `approve.ts`-sel (1200 px WebP).
   - A DB-méret: a 360 borító összmérete a jóváhagyás után mérve.
4. **`shared/design-assets.ts`:** a `designAssetSchema` kap egy opcionális `topic` mezőt (a borító témakörkulcsa). A
   `pickLessonArt` opcionális `topic` bemenettel bővül:
   - ha van `cover-<tantárgy>-<sáv>-<topic>` a katalógusban, az a kép;
   - különben a mai rotáció.
5. **`migrations/0029_design_assets_topic.sql`:**
   - `ALTER TABLE design_assets ADD COLUMN IF NOT EXISTS topic varchar(64)`;
   - a `kind` CHECK cseréje (`mascot`, `hero`, `icon`, `cover`, `marker`, `divider`), idempotensen (`DROP CONSTRAINT IF EXISTS` + `ADD`).
   - Drizzle-séma és szinkron (`topic` mező).
6. **`server/design-assets.ts` `withLessonArt`:**
   - A `topicKeyOf` a lecke címéből és tantárgyából számol, és az `art.topic` is mentődik.
   - A `lessonSchema.art` kap egy `topic` mezőt (ugyanaz a minta).
   - A `resolveStoredArt` változatlan: a kép azonosítója hordozza a borítót.
7. **Tesztek:**
   - unit, taxonómia:
     - kulcsok egyediek;
     - csak tanított párok szerepelnek;
     - minden párnak 2–6 témaköre van;
     - a kulcsszavak ékezettűrőek és legalább 3 karakteresek;
     - a `topicKeyOf` esetei: katalógus-témakör, cím, ismeretlen, döntetlen;
   - lefedettség: minden témakörnek van jóváhagyott borítója és létező fájlja;
   - `pickLessonArt`: témakör esetén a témakör borítója;
   - DB: a mentés a témakör borítóját és a `topic`-ot írja; a `0029` kétszer alkalmazva;
   - e2e: a meglévő `lesson-design`, `lesson-responsive`, `lesson-loading` és `subject-icon` zöld.
8. **Kapuk:** tsc, check:test, lint, unit, `test:learning-db`, a célzott Playwright és a build.
   - A PR-ba az áttekintő lapok képernyőképe is bekerül.

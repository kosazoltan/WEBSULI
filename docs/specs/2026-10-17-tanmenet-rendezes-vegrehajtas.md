# Tananyaglista a NAT 2020 tanítási menetrendje szerint — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-tanmenet-rendezes.md`. Ág: `feat/tanmenet-rendezes`. A parancsok a `source/` mappából futnak.

1. **`scripts/curriculum/` (Python, csak stdlib):**
   - `extract.py`: a .docx → táblázatsorok;
   - `lessons.py`: évfolyam-tanmenetek, az órák sorrendje (témakör, óracím), a tantárgykód leképezése;
   - `README.md`: a forrás URL-jei és a futtatás módja; a dokumentumok nem kerülnek a repóba.
2. **`server/data/tanmenet-2020.json`** (generált): `[{ grade, subject, file, source, lessons: [[section, topic], …] }]`.
3. **`shared/school-calendar.ts` (tiszta):**
   - a 2025/2026 és a 2026/2027 tanév rendje;
   - `schoolYearPosition(date)`: 0–1, a tanítási napok aránya; a szünetek és a hétvégék kimaradnak; nyáron a következő tanév
     eleje (0).
4. **`server/curriculum/match.ts` (tiszta, a JSON-t paraméterként kapja):**
   - `normalizeTokens(text)`: ékezet nélkül, kisbetű, tövek (5 karakteres előtag); stopszavak és évfolyam-kifejezések nélkül;
   - `subjectOfTitle(title)`: kulcsszólisták a tanmenet tantárgykulcsaihoz;
   - `matchMaterial({ title, classroom }, index)` → `{ pos, label, subject, score } | null`:
     - a jelölt órák közül a legjobb IDF-súlyos egyezés (az óra témaköre + címe), küszöbbel;
     - `pos = óraindex / óraszám`;
   - `SEASONAL`: ünnepi és évszakos kulcsszavak rögzített pozícióval, a nyelvi és az illesztetlen anyagokra.
5. **`/api/html-files`:**
   - a kiszolgáló minden elemhez hozzáadja a `curriculum`-ot;
   - a `HtmlFilesCache`-szel együtt számolódik, a meglévő érvénytelenítés kezeli.
6. **Kliens:**
   - `client/src/lib/curriculum-order.ts`: `curriculumSort(files, today)` (tiszta, tesztelt);
   - `UserFileList.tsx`: a `createdAt`-rendezés helyett ez, és a ±2 hetes anyagon „Most tanuljuk” jelölés;
   - `Preview.tsx` / `lessonNeighbours`: ugyanaz a sorrend.
7. **Mérés (csak olvasás):**
   - szkript: a 207 éles anyag illesztése; kimenet: arány és a teljes lista (cím → tanmenet-óra);
   - kézi szúrópróba, a küszöb hangolása; az eredmény a PR-ba kerül.
8. **Tesztek:**
   - unit: naptár (szünet, hétvége, nyár), tokenizálás, illesztés (pozitív és negatív esetek a valódi tanmenetből), évszakos
     kulcsszavak, rendezés;
   - Playwright: a lista sorrendje mockolt `/api/html-files`-szal és rögzített órával, mobil és asztali nézetben, „Most tanuljuk”
     jelöléssel.
9. **Kapuk:** tsc, check:test, lint, unit, célzott Playwright, build. Élő ellenőrzés a deploy után a főoldalon és egy évfolyamon.

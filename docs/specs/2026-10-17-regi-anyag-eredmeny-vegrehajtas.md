# Régi (HTML) tananyagok eredménye e-mailben — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-regi-anyag-eredmeny.md`. Ág: `feat/regi-anyag-eredmeny`. A parancsok a `source/` mappából futnak.

1. **`server/lib/material-mailto.ts` (tiszta):** `rewriteMailtoAssignments(html)`.
   - Csak a `<script>` blokkokon belül dolgozik.
   - Minta: `(window.)?location(.href)? = <'|"|`>mailto:…;` → `window.__websuliMailto(…);`. Az értékadás jobb oldala változatlan
     marad.
   - Visszaadja az új HTML-t és a cserék számát.
2. **`server/routes.ts` (a `/dev/:id` összeállítás):** a felhasználói HTML a beinjektálás előtt átmegy a
   `rewriteMailtoAssignments`-en (teljes dokumentum és töredék esetén is).
3. **`globalEmailScript` bővítése (ugyanabban a fájlban):**
   - **`window.__websuliMailto(url)`:** kiveszi a tárgyat és a törzset (`URLSearchParams`), és meghívja a csendes küldést.
     A `href="mailto:"` linkek kattintását (capture fázis) ugyanez kapja el.
   - **Csendes küldés:** `fetch('/api/material-result', {materialId, subject, body, auto: true})`.
     - Oldalbetöltésenként a törzs lenyomata szerint egyszer, legfeljebb 5 levél.
     - Hibánál nincs felület.
   - **Kiértékelés-figyelő:**
     - `click` (capture) a `button`, `input[type=button|submit]` és `[onclick]` elemekre, ha a felirat vagy az `onclick` illik a
       `/kiértékel|ellenőr|eredmény|beküld|evaluate|check|submit/i` mintára;
     - 1500 ms múlva összegyűjti:
       - a cím (`document.title` vagy az első `h1`);
       - az eredményszöveg: a látható elemek, amelyek `id` vagy `class` neve illik a `/result|eredmeny|eredmény|score|pont/i`
         mintára, nem üresek, és számot tartalmaznak; legfeljebb 1500 karakter;
       - a válaszok: szövegmezőnként a legközelebbi kérdésszöveg (az előző címsor vagy `label` vagy `p`) és az érték;
         összesen a kiválasztott rádiógombok száma;
     - ha az eredményszöveg üres, nem küld.
4. **`server/lib/material-result.ts` és a végpont:**
   - **`normalizeMaterialResult`:** opcionális `auto: boolean`; a tárgy végére automatikus beküldésnél ` — automatikus` kerül.
   - **Ismétlésvédelem:** memóriabeli Map, kulcsa sha256(anyag | IP | törzs), élettartama 10 perc, mérete legfeljebb 5000 kulcs.
     Az ismételt beküldés 200-at kap `{ duplicate: true }`-val, levél nélkül.
   - **Korlát:** 60 / 15 perc / IP.
5. **Tesztek:**
   - unit (`tests/material-mailto.test.ts`): a csere esetei (egyszeres és dupla idézőjel, sablonsztring, `window.location`,
     többsoros kifejezés, nem `mailto` értékadás változatlan, szkripten kívüli szöveg változatlan); a normalizálás és az
     ismétlésvédelem;
   - éles adaton (csak olvasás), szkript: mind a 183 HTML átalakítva → minden `<script>` szintaktikailag érvényes (TypeScript
     `createSourceFile` diagnosztika). Az eredmény a PR-ba kerül;
   - e2e (`tests/material-result-capture.spec.ts`):
     - a beinjektált szkript egy `page.setContent`-tel betöltött minta-anyagon fut: egy `mailto`-s és egy kiértékelős anyag;
     - a `/api/material-result` kérés mockolva;
     - ellenőrzés: egy kérés megy a helyes törzzsel, a levelező nem nyílik meg, és ismételt kiértékelésnél azonos eredményre
       nincs második kérés.
6. **Tananyaggyártó (terv 5. pont):**
   - `server/ai/lesson-html-spec.ts`: új „EREDMÉNYKÜLDÉS E-MAILBEN” szakasz; a „mailto link” előírás kikerül;
   - a `globalEmailScript` `sendResultEmail`-je és a `mailto`-elfogó beállítja a `window.__websuliExplicitResult` jelzőt, így az
     automatikus beolvasás nem küld mellé;
   - unit teszt a specifikáció szövegére;
   - a helyi skill (`tananyag-keszito/SKILL.md`, a repón kívül) azonos szakaszt kap, előtte mentés a munkamappába.
7. **Kapuk:** tsc, check:test, lint, unit, a célzott Playwright és a build. Élő ellenőrzés a deploy után egy éles anyagon:
   a tulajdonos postafiókja kapja.

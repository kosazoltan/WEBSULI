# Régi (HTML) tananyagok eredménye e-mailben az adminoknak — terv

**Tulajdonosi kérés (2026-10-17):** „…fésüld át az adatbázisban lévő összes tananyagot, és nézd meg, hogy az eredményküldések
implementálva vannak-e bennük. Alakítsd át őket vagy magát a küldőrendszert úgy, hogy a régebben készült tananyagok eredményeit
is beolvassa, és mindkét adminnak elküldje, amikor a tanuló kitölti őket.” A címzettek: Máté Szilvia és Kósa Zoltán. Az éles
`ADMIN_EMAILS` 2026-10-17-én erre a két címre állítva, a tulajdonos engedélyével.

## Felmérés (éles adatbázis, csak olvasás, 2026-10-17)
| Típus | Darab | Eredményküldés ma |
|---|---|---|
| strukturált lecke (`lesson`) | 24 | #280 (háttérben, szerveroldali pontozással) |
| HTML: a beinjektált `sendResultEmail`-t hívja | 1 | működik (`/api/material-result` → `ADMIN_EMAILS`) |
| HTML: `mailto:` (44 db `location.href = 'mailto:' + …`, 3 db link) | 50 | a tanuló levelezője nyílik meg; a címzett egy beírt cím vagy egy beégetett cím |
| HTML: van kiértékelés (pl. `onclick="evaluateQuiz()"`), de küldés nincs | 125 | az eredmény elvész |
| HTML: van feladat, de nincs felismerhető kiértékelés | 4 | — |
| HTML: nincs kiértékelés (recept, útmutató) | 2 | nincs mit küldeni |
| PDF / `text/html` | 1 / 1 | — |

**Döntés:** a 183 tárolt HTML-t **nem** írjuk át (az éles tartalom tömeges módosítása lenne), hanem a küldőrendszert. A
`/dev/:id` kiszolgálás már ma is injektál szkriptet (`globalEmailScript`); ez bővül.

## Cél
1. **`mailto:` elfogása (kiszolgáláskor, a tárolt HTML változatlan):**
   - a beágyazott szkriptekben a `location.href = 'mailto:…'` (és a `window.location = …`) értékadás
     `window.__websuliMailto(…)` hívássá alakul;
   - a függvény a `mailto:` URL-ből kiveszi a tárgyat és a törzset, és csendben a szerverhez küldi (`/api/material-result`);
     a levelező nem nyílik meg;
   - a `href="mailto:…"` linkek kattintása ugyanígy.
2. **Automatikus beolvasás kiértékeléskor (a többi anyag):**
   - a beinjektált szkript figyeli a kiértékelő gombokat (felirat vagy `onclick`: kiértékel, ellenőriz, eredmény, beküld,
     evaluate, check, submit);
   - a kattintás után a megjelenő eredményt olvassa ki: a látható, eredményre utaló elemek (`id`/`class`: result, eredmeny,
     score, pont) szövegét, a tanuló válaszait (szövegmezők a kérdésükkel, a bejelölt választások száma) és az anyag címét;
   - mindezt egy levélbe teszi (legfeljebb 5000 karakter), és beküldi.
   - Ugyanaz az eredmény nem megy kétszer: kliensoldali lenyomat oldalbetöltésenként, és szerveroldali ismétlésvédelem.
3. **Szerver (`/api/material-result`):**
   - a korlát 10 helyett 60 / 15 perc / IP, mert egy iskolai hálózatban sok tanuló ugyanazon az IP-n van;
   - az azonos (anyag, IP, törzs-lenyomat) 10 percen belül nem küld újra;
   - az automatikus beküldés jelölése (`auto: true`) a tárgyban: `[WebSuli eredmény] <anyag> — automatikus`.
4. **A tanuló felülete:** az automatikus beküldés csendes. A kézi `sendResultEmail` hívás visszajelzése (✅) marad.

5. **A tananyaggyártó (tulajdonosi kérés, 2026-10-17: „Mentsd el a tananyag készítő tudatába is, hogy emailben küldhető szöveges
   és teszt eredményeket kell generálni.”):**
   - a webes leckegenerátor kötelező specifikációja (`server/ai/lesson-html-spec.ts`) a `mailto` link helyett előírja:
     a Feladatok és a Kvíz Kiértékelése után a `window.sendResultEmail(subject, body)` automatikusan elküldi az eredményt
     (a tanuló válaszaival); a tananyagban nincs e-mail-cím és `mailto:`;
   - a helyi `tananyag-keszito` skill ugyanezt kapja;
   - ha a tananyag maga küld (`sendResultEmail` vagy `mailto`), az automatikus beolvasás nem küld mellé második levelet.
   A strukturált leckéknél ezt a futtatókörnyezet végzi (#280), ott a generálásnak nincs teendője.

## Nem-cél
- A tárolt HTML tartalmak módosítása.
- Eredményküldés a kiértékelés nélküli anyagokhoz (2 db).

## Szélső esetek
- **Az anyag a `mailto` előtt e-mail-címet kér** (kötelező mező): a validálása változatlan. Az eredmény a kiértékeléskori
  automatikus beolvasással a cím megadása nélkül is megérkezik.
- **Többszöri kiértékelés:** azonos eredmény nem megy újra; változott eredmény új levél, legfeljebb 5 automatikus levél
  oldalbetöltésenként.
- **Az átalakítás nem törheti a szkriptet:** a regex csak a `mailto:` sztringgel kezdődő értékadást érinti. Ellenőrzés: mind a
  183 éles HTML átalakítva szintaktikailag érvényes JS (TypeScript-parser, csak olvasás).
- **CSP:** a `/dev/:id` `connect-src https:` engedi a saját HTTPS-eredetet (élesben HTTPS), ezért a beküldés a mai
  `sendResultEmail`-lel azonos úton megy.

## Elfogadás (EARS)
- HA egy `mailto`-s régi anyag elküldené az eredményt, AKKOR a levelező nem nyílik meg, és az eredmény mindkét adminhoz megérkezik.
- HA egy küldés nélküli régi anyagban a tanuló kiértékel, AKKOR az eredmény (és a válaszai) automatikusan mindkét adminhoz megérkezik.
- HA ugyanaz az eredmény újra keletkezik, AKKOR nem megy második levél.
- Mind a 183 éles HTML a kiszolgáláskori átalakítás után is szintaktikailag érvényes.

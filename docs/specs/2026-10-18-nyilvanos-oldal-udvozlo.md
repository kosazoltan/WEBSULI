# Nyilvános oldal: átláthatóbb lista és személyes üdvözlő ajánló — terv

**Tulajdonosi kérés (2026-10-18):**
- „nyúljunk hozzá a nyilvános oldalhoz is, és a színeket megtartva tedd átláthatóbbá”;
- „érzékeld, hogy melyik diákunk lép be, és ajánld neki a legújabb tananyagokat valamilyen kis, tanulásra lelkesítő szöveggel”;
- „ha így nem tudod megállapítani, hogy melyik tanulónk nézi a tananyagot, akkor kérd be a nevét, amikor belép a nyilvános
  oldalra”.

## Felmérés (kódból ellenőrizve)
- **Hol vannak a tanulói adatok:**
  - név + e-mail csak a bejelentkezett felhasználóknál van (`users.first_name`, `last_name`; Google / jelszavas belépés);
  - az elmentett tanulói e-mail-címekhez (`extra_email_addresses`: e-mail + évfolyamok) nincs név;
  - a nyilvános oldal látogatója belépés nélkül nem köthető e-mailhez; csak böngésző-ujjlenyomat van, ami a lájkokhoz kell.
- **Következmény:**
  - bejelentkezett tanulónál a nevét a fiókból vesszük;
  - mindenki mást az első látogatáskor megkérdezünk („Hogy hívnak?”), ahogy a tulajdonos kérte.
- **A lista jelenlegi felépítése** (`UserFileList.tsx`, `HeroSection.tsx`):
  - fejléc;
  - 13 évfolyam-jelvény, az üresek „(0)” felirattal és halványan;
  - kereső;
  - kártyarács nagyon kis betűkkel (9–10 px-es jelvény és leírás, 12 px-es cím).
- **„Legújabb”:** a `html_files.createdAt`; a lista ma tanmenet szerint rendez, a legújabbakra nincs külön blokk.

## Döntések
1. **Üdvözlő kártya** (`WelcomeCard`): a lista fölött, nem felugró ablak, így semmit nem takar el.
   - **Ha van név** (fiókból vagy korábban megadva):
     - „Szia, {név}!” és egy rövid, lelkesítő mondat;
     - a mondat a napra rögzített forgatásból jön, `lib/learner.ts` → `motivationFor(name, date)`;
     - a legújabb 3 tananyag a tanuló évfolyamából (évfolyam nélkül az összesből), „Új” jelöléssel; egy kattintás megnyitja.
     - **Mi számít újnak:** legfeljebb 30 napos, vagy ha nincs ilyen, a 3 legfrissebb.
   - **Ha nincs név:**
     - kérdés: „Szia! Hogy hívnak?”;
     - mezők: név (kötelező, legfeljebb 40 karakter), évfolyam (nem kötelező);
     - gombok: „Mehet” és „Most nem”.
     - A „Most nem” a munkamenetre elrejti a kérdést; újra megnyitva ismét megjelenik.
   - **Javítás:** „Nem te vagy? / módosítás” link, ezzel a név és az évfolyam módosítható.
2. **Adatkezelés:**
   - a név és az évfolyam csak a tanuló böngészőjében tárolódik (`localStorage`: `websuli.learnerName`; az évfolyam a
     meglévő `websuli.classroomGrade` kulcs, így a játékok is ugyanazt látják);
   - a szerverre nem kerül, nem kerül URL-be;
   - bejelentkezett tanulónál a fiók keresztneve az elsődleges (a tárolt név csak tartalék).
   - **Nem-cél:** a név összekötése az eredmény-e-mailekkel, illetve az e-mail-címlistával (külön döntés kell hozzá, mert
     személyes adat kerülne a szerverre).
3. **Átláthatóbb lista, a színek megtartásával:**
   - az üres évfolyamok jelvényei nem jelennek meg; a „(0)” felirat megszűnik;
   - a betűméretek nőnek:

     | Elem | Most | Új |
     |---|---|---|
     | kártyacím | 12 px | 14 px |
     | leírás | 10 px | 12 px |
     | évfolyam-jelvény | 9 px | 11 px |
     | „Most tanuljuk” | 10 px | 11 px |
     | „Tananyagok” címsor | – | 16 px |

   - a színek, a háttér, a kártyaforma és a gombok változatlanok.

## Edge case-ek
- A név szóköz / üres → nem menthető; a 40 karakter feletti rész levágódik; a HTML-t a React escape-eli.
- Ha a `localStorage` nem érhető el (privát mód), a kérdés csak az adott oldalbetöltésre él, és nincs hiba.
- Ha a tanuló évfolyamán nincs anyag, a legújabbak az összes évfolyamból jönnek.
- Évfolyamként 1–12 választható (a játékokkal közös `classroomStore` csak ezt tárolja); évfolyam nélkül minden évfolyam
  legújabb anyaga ajánlható, a programozási alapismeretek is.

## Elfogadás (EARS)
- HA a látogatónak nincs neve, AKKOR a lista fölött megjelenik a névkérő kártya; a lista végig használható.
- HA a látogató megadja a nevét (és az évfolyamát), AKKOR „Szia, {név}!” üdvözlés, lelkesítő mondat és legfeljebb 3 legújabb
  tananyag jelenik meg az évfolyamából; az újratöltés után is.
- HA a látogató be van jelentkezve, és van keresztneve, AKKOR nem kérdezünk, hanem azzal köszönünk.
- HA a látogató a „Most nem”-et választja, AKKOR az adott munkamenetben nem kérdezünk újra.
- A lista, a szűrő és a tanmenet-sorrend tesztjei változatlanul zöldek. 390 és 1366 px-en nincs túlcsordulás; a kártya
  szövegei AA-kontrasztúak.

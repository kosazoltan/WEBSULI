# A kötőjeles szám nem negatív szám (v1-pontozó)

Állapot: tulajdonosi döntés 2026-10-20 („Javítsd most”), az angol internetes futás (job 102bedaa) mérése után.

## Mérés
- **A hiba (bankcsomag 2. fejezet, 1–2. kísérlet):** „s1-t-9: a mintaválasz nem teljes pont … fel nem ismert kötelező
  szinonimacsoportok: [["270"]]”. A minta a telefonszámot „72/552-270” alakban írta.
- **Ok:** a v1 normalizálás (`normalizeAnswer`) a `[+-]?\d+` mintával a „552-270”-ből „552 -270”-et csinál. A „-270” nem illeszkedik a
  „270”-re, így a helyes válasz (a mintáé és a tanulóé is) csak részpontot kap.
- **Következmény:** 2 javítókör; a tanulói oldalon a telefonszám, a tartomány („2-3”) és az évszám („1848-49”) téves részpont.

## Cél
- A számjel (`+` / `-`) csak akkor előjel, ha előtte NEM áll betű vagy számjegy:
  - „-5 fok”, „−4,5” negatív marad;
  - az „552-270” két szám, a „2-3” is két szám.
- **Ugyanez a HTML-szerzőnek adott referencia-pontozóban** (`server/ai/lesson-html-spec.ts` `ee_norm`), mert a két pontozó
  paritása tesztelt.

## Nem-cél
- A v2-pontozó: ott a „-” már külön műveleti jel, nem érintett.
- A pontozási verzió változtatása: a v1 kliens- és szerveroldalon ugyanaz a modul, és a változás csak téves részpontot szüntet meg.

## Edge case-ek
- **Önálló negatív szám** („-4.5”, „−4,5”): negatív marad (a meglévő teszt rögzíti).
- **Betű utáni kötőjel** („x-3”): „x 3” (korábban „x -3”). A v1 rubrika szám-alternatívája nem negatív kifejezés.
- **Kvíz számellenőrzés** (`quizCorrectIndexProblems` `numbersOf`): ugyanazt a normalizálást használja mindkét oldalon, így
  következetes marad.

## Elfogadás (EARS)
- HA a válasz „72/552-270”, AKKOR a `required: [["270"]]` teljesül.
- HA a válasz „-4.5”, AKKOR a `required: [["4.5"]]` nem teljesül (változatlan).
- A HTML referencia-pontozó és a szerveroldali v1 ugyanazt az eredményt adja a kötőjeles számokra.

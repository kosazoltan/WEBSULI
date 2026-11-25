# Helyi ellenőr — sorhatáron vágott, megjelölt hunk-töredékek

## Probléma
A `scripts/qa/gates/local-review.mjs` `splitDiff` függvénye a darabméretnél nagyobb hunkot (tipikusan egy új, több száz soros fájl
egyetlen `@@ -0,0 +1,N @@` hunkját) **karakterpozíción** vágja, és minden darab elé az eredeti fájl-fejlécet teszi, a hunk-fejlécet nem.
A modell így egy soron belül elvágott, fejléc nélküli szöveget lát, és visszatérően „csonka fájl / SyntaxError / truncated JSON”
**high** leletet ad (#587: három egymást követő kör, változó azonosítóval), ami hamis NEM ítéletet és kézi cáfolási kört okoz.

## Döntés
- A túl nagy hunk **sorhatáron** bomlik; minden töredék saját, helyes `@@ -régi,db +új,db @@` fejlécet kap (a sorszámok a hunkon belüli
  `-`/`+`/` ` sorokból számolva), így a modell valós sorszámot ad.
- A töredék fejlécében megjelölés: `töredék i/n — a hunk a szomszédos darabban folytatódik`.
- A prompt kimondja: töredéknél a darabhatáron hiányzó kezdet/vég elvárt; a darabhatár miatti csonkaságot / szintaxishibát tilos jelenteni.
- Egyetlen, a darabméretnél hosszabb sor továbbra is karakterre vágódik (szélsőség), de az is megjelölt töredék.

## Elfogadási feltételek
- Egy 0,0 +1,N hunk darabjai mind sorhatáron kezdődnek és végződnek, a fejlécek sorszámai összefüggők és lefedik az 1..N tartományt.
- Minden töredék tartalmazza a `töredék` jelölést; a prompt tartalmazza a darabhatár-szabályt.
- A meglévő `local-review.test.mjs` tesztek zöldek maradnak.

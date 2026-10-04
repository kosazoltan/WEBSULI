# Képlet-biztos szöveg-heurisztikák — egy közös modul (2026-10-04)

Tulajdonosi szabály (2026-10-01): ismétlődő hibánál előbb átfogó gyökérok-elemzés, aztán EGY javítás; nincs heurisztika-halmozás.
Ismétlődő hibacsalád: a szöveg-heurisztikák (≥3 karakteres szó, ≥8/≥20 karakteres idézet, nem-alfanumerikus jelek törlése) a
TISZTA KÉPLET fogalmakon/idézeteken elvéreznek (#184: megalapozottság, #185: tanári pont idézete). Átfogó audit (felderítő
alügynök, majd minden lecke-blokkoló tétel saját próbával igazolva) — `source/probe-formula*.local.mts`.

## Igazolt, leckét blokkolni képes hibák (próbával)
1. `server/studio/instruction-check.ts` (`parseInventoryCheck` :90, `parseInstructionCheck` :114): a bizonyíték ≥ 8 betű/szám —
   a „-5-(-8)=+3” képlet-bizonyíték (a fejezetben szó szerint) → `taught: false` → hiányzó pont → célzott szerzői kör. Az idézet
   ≥ 20 (:92, :119) képletre sosem teljesül.
2. `server/studio/grounding.ts` `formulaPresent` (#184 saját regresszió): a szóközök teljes törlése után a mondatvégi pont
   („hozzáadása. −5 − (−8)”) tizedesjelnek, a felsorolás vesszője („−5 − (−8), 9 − (−6)”) számfolytatásnak látszik → hamis
   „megalapozatlan”; az egyenlet-fogalom („-5-(-8)=+3”) a lánccal („-5-(-8)=-5+8=+3”) nem egyezik.
3. `grounding.ts` `checkGrounding`: a „< 4 szó” szabály a képlet-ág ELŐTT fut → a „-5-(-8) = ___” ellenőrző blokk sosem alapoz.
4. `server/studio/verbatim.ts` `checkVerbatim`: a „-5-(-8)=+3” idézet a „-5 - (-8) = +3” forrásban `not_found` (a szóköz
   különbözik), a relokáció ≥ 3 szót kér → a core fogalom `unquoted` → a térkép jóváhagyása blokkolódhat.
5. `server/studio/instruction-points.ts` :84: a ≥ 3 betű/szám kérés-részlet („9-(-6)” = „96”) csendben kiesik.
6. `instruction-points.ts` `verbatimInSource` (#185): csak a TELJES képlet-sor igazol — a „b) 9-(-6)=15” címkés sor és a
   kétoszlopos sor nem; a forrásban szó szerint álló képlet-részlet sem.
7. `shared/answer-value.ts` `referenceValueProblems`: a zárójel előtt elvágott részlánc („Mennyi 5-8-(-2)?” → „5-8”) hamis
   „hibás referencia” → a helyes tétel kiesik a csomagból.

## Cél
`shared/formula-text.ts`: `formulaNormalize` (−/–/— → -, szóköz csak műveleti jel, zárójel, „=” körül törölve, egyébként
egy szóköz), `isFormulaText` (számjegy + műveleti jel vagy „=”, betű nélkül, sorvégi pipa/írásjel nélkül), `containsFormula`
(határtudatos: előtte nem szám/tizedes-szám/előjel-operandus/szám utáni művelet; utána nem szám, tizedes-folytatás vagy
művelet + szám/zárójel; egyenlet-képletnél a bal oldal + a láncban később álló „= jobb oldal” is egyezés). Mind a 7 hely ezt
használja; a szöveges ágak szabályai változatlanok.

## Nem-cél (külön szelet, bizonyítékkal listázva a PR-ban)
A pontozó (v1/v2 kulcsszó-csoportok) előjel-/zárójel-érzékenysége, `questionKey`, `single-choice-check` „+3”, `complaintKey`,
`falseArithmeticClaims` abszolút érték, match `sideKey`, SVG-címke — minőségi, nem leckét blokkoló.

## Edge case-ek
Lásd a 7 pont bemeneteit; továbbá: képlet-töredék a forrásban (pl. „-5-(-8)” a „-5-(-8)=+3” sorban) betűhűen ott áll → igazol
(dokumentált változás a #185-ös tesztben rögzített szigorhoz képest: a betűhűség kérdése a jelenlét, nem a sor-teljesség).
Előjel-eltérés, más operandus, hosszabb kifejezés része → nem egyezik (változatlan).

## Elfogadás (EARS)
- Mind a 7 próba-bemenet a javítás után a helyes eredményt adja; a meglévő tesztek zöldek (a #185 töredék-elvárása a fenti
  dokumentált változás szerint); minden új teszt a javítás nélkül bukik; teljes unit + visszajátszás (bce352a5, 3b4b165c,
  49657518) + tsc + lint zöld.

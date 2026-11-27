# Végrehajtás — TG-P7b (TANANYAG-GYAKORLATI, PR 7 második része: csak-bank gyakorlati javítás az admin javítóúton)

Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` — „PR 7”. Előzmény: TG-P7a (célzott tételcsere a banképítőben).
Feladat (SQL): `TANANYAG-GYAKORLATI`.

Hiány: a leckejavítás (`generateStructuredImprovement`) mindig a szerzővel újraírja a tanítást — a tanítás szövege ettől
megváltozik, így a fejezetek bankja nem vehető át, és a TG-P7a célzott cseréje élő leckén nem érvényesül. Az élő állomány
11 meta-tételes leckéjéhez (2026-11-27-i leltár) olyan javítás kell, amely a tanítást érintetlenül hagyja, és csak a
kifogásolt banktételt cseréli — a meglévő előnézet → jóváhagyás → mentés (biztonsági mentéssel) → visszaállítás úton.

1. Bukó tesztek (`tests/practice-bank-repair.test.ts`):
   - `buildPracticeBankRepair(original, source, call)`: nincs szerzői / pedagógusi hívás; a tanítás (sections) bájtra azonos;
     a meta-tétel célzott javítómódban cserélődik, a többi tétel és azonosító marad; a lektor lefut; a munkafolyamat-fázisok
     sorrendje érvényes.
   - Bekötés: a `POST /api/admin/improve-material/:id` `mode: "practice-bank"` mezője leckénél a csak-bank utat indítja
     (`generateStructuredImprovement(…, { bankOnly: true })`); ismeretlen `mode` → 400; a `LessonRepairPanel` külön gombbal indítja.
2. Javítás: `server/studio/structured-improvement.ts` (`buildPracticeBankRepair`, `bankOnly` opció), `server/improveAsync.ts`
   (mode átadása), `client/src/components/LessonRepairPanel.tsx` (gomb: „Gyakorlati bankjavítás (a tanítás marad)”).
3. Ellenőrzés: új + érintett egységtesztek (elakadas-r1, lesson-fusion-repair, repair-bank-reuse, improve*), tsc, eslint.
   Élő futtatás (a 11 lecke) csak az élesítés után, gyártásmentes időben, jóváhagyással (előnézet → alkalmazás).

Állapot: tervezve — következő: RED.

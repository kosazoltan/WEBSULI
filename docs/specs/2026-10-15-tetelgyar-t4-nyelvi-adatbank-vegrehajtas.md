# Végrehajtási utasítás — Tételgyár T4′: magyar nyelvi adatbank a rubrikához (1. szelet, determinisztikus)

Terv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` (T4′, tulajdonosi döntés D2). Ág: `feat/tetelgyar-t4-nyelvi-adatbank`.

## Mért kiinduló tények

- A bank-blokkolók 37%-a (339/911, 21 nap) pontozó-rubrika eredetű (szinonima, ragozás, írásmód).
- Élő példák (job `416ad01d`, Render-napló 2026-10-15): `tasks[0]` — „a tanítás »ásványianyag-« alakot használ, ez szóköz nélkül nem egyezik
  az »ásványi anyag« elemmel”; `tasks[12]` — „a »termőjére« csoport nem fogadja el a tanítás pontos szövegében szereplő »termőre« alakot”.
  Mindkettő: **a tanítás saját szóalakja hiányzott a rubrikából**.
- Ellenpélda (ugyanott, `tasks[12]`): a rubrika a „rovar testere” (= testére) alakot is elfogadta „testéről” helyett → a túl tág elfogadás is hiba.
- Meglévő determinisztikus eszköz: `server/studio/tools/bank-packet-autofix.ts` `fixTask` — a MINTAválasz szóalakját adja a rubrikához
  (`stemPrefix`, ≥ 4 betű); a hívó (`experience-builder.ts` 498. sor) csak `{ sectionIndex, allowedConceptIds }` kontextust ad.

## T4′.1 — `shared/hu-lexicon.ts` (új)
1. `spellingVariants(term: string): string[]` — írásmód-változatok: többszavas kifejezés egybeírva („ásványi anyag” → „ásványianyag”), kötőjel
   nélkül és szóközzel („ásványi-anyag” → „ásványianyag”, „ásványi anyag”); az eredeti nem kerül a listába; ékezetet a pontozó már normalizál.
2. `inflectedForms(term: string, text: string): string[]` — a `text` (a fejezet tanítása) azon szóalakjai, amelyek a kifejezés UTOLSÓ szavának
   **teljes normalizált alakjával kezdődnek és legfeljebb 4 betűvel hosszabbak** (toldalék), valamint az egybeírt változat ugyanígy
   („termő” → „termőre”, „termőjére”; „ásványi anyag” → „ásványianyag”, „ásványianyagok”). Nem talál ki szót: csak a szövegben ténylegesen
   szereplő alakot ad. Rövid (< 4 betűs) szóra nem fut. Többszavas kifejezésnél az előző szavak változatlanok.
3. `HU_SYNONYM_GROUPS`: kicsi, konzervatív, kézzel ellenőrzött magyar egyenértékűség-lista (iskolai szókincs), soronként forrás-megjegyzéssel;
   `synonymsOf(term)` csak teljes csoporttagságra ad (részszóra nem). Kiinduló készlet (bővítés csak mért esetből, T8):
   `["tilos", "nem szabad"]`, `["vízgőz", "pára"]`, `["lehull", "leesik"]`, `["felszáll", "felemelkedik"]`, `["eső", "csapadék"]` NEM (nem egyenértékű —
   ez a negatív példa a tesztben). Bizonytalan párt (szófaj- vagy jelentéseltérés, pl. „fotoszintézis”/„fotoszintetizál”, „szárazföld”/„szárazulat”)
   nem veszünk fel.

## T4′.2 — az autofix bővítése
Fájl: `server/studio/tools/bank-packet-autofix.ts`:
- `BankAutofixContext` kap `teachingText?: string`.
- `fixTask` a meglévő minta-lépés UTÁN: minden `required` csoporthoz hozzáadja (ismétlés nélkül) a csoport tagjainak `spellingVariants`,
  `inflectedForms(term, teachingText)` és `synonymsOf` értékeit; a javítás naplója: `${id}: a tanítás szóalakja / írásmód-változat / rokon értelmű
  kifejezés a rubrikába került (…)`. Csak HOZZÁAD, sosem töröl, és a `minWords`-hez nem nyúl.
- Biztonság: nem kerül be olyan alak, amely a csoport valamely tagjának **tagadó** vagy **ellentétes irányú** párja (a tagadás-heurisztika
  változatlan; irány-szavak: `-ról/-ről` ↔ `-ra/-re`, `-ból/-ből` ↔ `-ba/-be`, `-tól/-től` ↔ `-hoz/-hez/-höz`): ha a tag az egyik irányragot
  viseli, a másik irányragos alak nem kerül be (a `tasks[12]` „testéről”/„testére” hiba osztálya).
Fájl: `server/studio/experience-builder.ts` 498. sor: a kontextus `teachingText` = a fejezet tanításának szövege (`explain`/`example` blokkok
szövege, ábra nélkül — ugyanaz a `withoutFigures(lesson.sections[unit.sectionIndex])`, amit a bank kap).

## T4′.2b — a javítókör és az automatikus bővítés összhangja (a meglévő tesztek által talált hiba)
Mért (8 meglévő `lesson-experience`/bank teszt bukott az első változatnál): a javítókörben az összefésülés és a szóalak-megőrző őr
(`applyBankPacketRepair` → `retainsRequiredGroups`) az autofix ELŐTT fut; az előző körben automatikusan hozzáadott alakot a modell nem ismeri,
így az őr hamis „törlést” látott. Javítás (`server/studio/experience-builder.ts`): a javítóválasz is megkapja ugyanazt a determinisztikus
bővítést az összefésülés előtt (ugyanaz a tanításszöveg → ugyanaz a hozzáadás); a valódi törlést az őr továbbra is elutasítja.
Eredmény: a 8 teszt a tesztek módosítása nélkül zöld.

## T4′.3 — tesztek (új `tests/hu-lexicon.test.ts`, és a meglévő autofix-tesztek változatlanul zöldek)
- `spellingVariants("ásványi anyag")` tartalmazza „ásványianyag”; `inflectedForms("termő", "a virágpor a termőre kerül")` → `["termőre"]`;
  `inflectedForms("termő", "a termés beérik")` → `[]` (nem toldalékos alak).
- Irányvédelem: `testéről` csoportba a tanítás „testére” alakja nem kerül be.
- Az autofix a 416-os két esetet megoldja: a „ásványianyag-” és „termőre” alakú helyes válasz `evaluateOpenAnswer` szerint „ok”.
- A `["eső", "csapadék"]` nem egyenértékű: a `synonymsOf("eső")` nem adja a „csapadék”-ot.
- Parancsok: `npx.cmd tsx --test tests/hu-lexicon.test.ts tests/bank-packet-autofix*.test.ts tests/lesson-experience.test.ts`, `npm.cmd run check`, `lint`, teljes `npm.cmd test`.

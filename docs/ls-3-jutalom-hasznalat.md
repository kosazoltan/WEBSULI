# Így használd — Jutalom és játékidő (LS-3)

Ez a rész arról szól, hogyan lesz a leckéből játékidő Dominiknak, és mit tudsz te
állítani rajta. Két helyen történik valami: a **leckében** (a gyerek oldala) és a
**Stúdióban** (a te oldalad).

## Mit lát a gyerek

1. Végigolvassa a lecke egy szakaszát, és a szakasz kérdéseinél rákattint a válaszokra.
2. A szakasz alján megnyomja a **„Próba beküldése"** gombot.
3. Megjelenik az eredmény: *4/5 — 80%*.
   - **80% alatt** nincs játékidő, de kiírjuk, melyik fogalmakat nézze át, és van egy
     **„Újra"** gomb.
   - **80–99%** között jár a jelenlegi létrafok (első alkalommal 1 perc).
   - **100%** esetén jár a perc, **és a létra egyet lép** — a következő hibátlan szakasz
     már 2 percet ér, aztán 3-at, aztán 4-et.
   - Ha a **lecke utolsó** szakaszát hibátlanul zárja, **10 perc** jár.
4. Az **„Irány a játék"** gombbal átmegy a játékokhoz. A Szökőár szökésben és a Brain Rot
   Lopásban felül megjelenik egy **visszaszámláló**. Egy perc alatt pirosra vált.
5. Amikor lejár, egy ablak jön fel: *„Idő lejárt — Vissza a leckéhez"*. A futó kör nem
   vész el mögötte, de az idő nem folytatódik.

## Amit fontos tudni

**Az órát a szerver járatja, nem a böngésző.** Ha a gyerek másik fülre vált, a
visszaszámláló megáll a képernyőn — de az idő attól még fogy. Amikor visszatér, a
számláló beugrik a valós értékre. Ez nem hiba, hanem szándékos: a fül elrejtése nem
időnyerés.

**A pontszámot is a szerver adja.** A gyerek gépén nincs olyan érték, amit át lehetne
írni; a szerver a tárolt leckéből javít. Ez azért van így, mert a jutalom valódi
(képernyőidő), és egy 9 éves is gyorsan megtanulja megnyomni az F12-t.

**Kupon nélkül minden marad a régiben.** Aki csak beugrik játszani, ugyanúgy játszhat,
mint eddig — se visszaszámláló, se korlát. A kupon plusz, nem zár.

## Amit te állíthatsz

A `reward_policy` adatbázistáblában, `key = 'default'` soron. A jelenlegi értékek:

| Beállítás | Érték | Mit jelent |
|---|---|---|
| `ladder` | `[1, 2, 3, 4]` | Az egymás utáni hibátlan szakaszok percértéke |
| `lessonPerfectMax` | `10` | Hibátlan lecke-záró próba jutalma |
| `thresholds.retry` | `80` | Ez alatt nincs kupon |
| `thresholds.perfect` | `100` | Ettől lép a létra |
| `bonusSeconds` | `30` | Egy játék közbeni helyes válasz értéke (lásd lent) |
| `couponTtlHours` | `24` | Ennyi idő után lejár a fel nem használt kupon |
| `freePlay` | `true` | Kupon nélkül is lehet játszani |

Ha például öt fokot szeretnél 2 perces indulással, a `ladder` legyen `[2,3,4,5,6]`.
Kódot nem kell hozzányúlni, és nem kell újratelepíteni semmit — a szerver egy percen
belül átveszi az új értéket.

## Ami még nincs kész

A **+30 másodperc játék közbeni helyes válaszért** szerveroldalon készen áll, de a két
játék még nem küldi be: ehhez az kell, hogy a lecke kérdései bekerüljenek a játékok
kvíz-készletébe (ez az LS-5 munkája). Addig a kupon perce fix — nem hosszabbodik
játék közben.

A többi négy játék (Űrkaland, Kockavadász, Matek sprint, Szólétra) még nem nézi a
kupont; a sorrend a te döntésed volt: előbb Tsunami és BrainRot.

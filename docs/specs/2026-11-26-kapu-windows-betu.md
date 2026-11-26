Terv: `docs/specs/2026-11-16-jatekok-jatekelmeny.md`

# A kapu böngészős útjának helyi (Windows-betűs) bukásai: Kockavadász mérőpanel, Tornádó K3 (KAPU-WIN)

## Felmérés (2026-11-26, a kapu saját beállításával mérve: SwiftShader, 1 worker, buildelt szerver)
A JK (#kezesség) `gate:pr`-je kétszer ugyanazon bukott; a mainen (`31e4c316`) ugyanígy, determinisztikusan:
1. `blockcraft-perf-panel.spec.ts` „a nyitott panel nem takarja …” fekvő 640×360 / 568×320: a „Számok” nézetben a mérősorok nem
   férnek ki (`scrollHeight 99`, `clientHeight 87`, ill. `31`). Ok: a panel a TELJES felső HUD alá kerül, abban a sort törő
   célsúgó („Gyűjts 3 rúnaércet…”) is benne van — alacsony fekvő nézetben a panelnek a súgó alatt alig marad hely.
2. `tornado-play.spec.ts` „J7b K3 360x640”: a turbó-kérdés 3. gombja a járműre / az előtte lévő útra lóg (313–369 px). Ok: álló
   nézetben a három gomb egy sorban áll (címkeszélesség 43 px); a 3 sornál hosszabb címke (pl. „a folyó mellett”) a közös mérő
   szerint túlcsordul → egy oszlopra vált, a három egymás alatti gomb a járműig ér. A kérdés véletlen, ezért a bukás is az
   (a CI-ben a szélesebb DejaVu-betűvel más tételeknél jön elő) — valós hiba a gyereknek is: hosszabb válaszoknál a kérdés
   eltakarja az autót.

## Megoldás
1. Mérőpanel: a „Számok” (olvasó) nézetben a panel teteje a felső HUD célsúgó NÉLKÜLI részének alja (a pályajelző sor) — a súgó
   nem érinthető szöveg, a mérősorok fontosabbak; a „Kapcsolók” nézet a teljes HUD alatt marad (vak kör L4 változatlan).
   `createPerfOverlay` `getTopInset(reading)` paramétert kap.
2. Tornádó: álló nézetben, gomb-módban, ha a címkék a 3 oszlopot túlcsordulják (`data-option-fit="1"`), a gombok 2 oszlopban
   (2 + 1) állnak, nem egyben — két sor, a jármű és az előtte lévő út szabad marad. Mérő-tétel: `forceState({ question: true,
   answers: "medium" })` a bukott esettel azonos címkékkel.

3. **Mobil mérő M10, Tornádó 844×390** (a mainen is ~18-ból 1 bukás): a mozgó táblára adott EGÉR-koppintásnál (asztali
   gép, és a teszt is egérrel kattint) a lenyomás és a felengedés között a tábla elmozdul, a `pointerup` már MÁS elemre esik —
   egérnél nincs implicit pointer capture (érintésnél van, lásd `pointerTap.ts` 2. pont) —, a választás elvész. Javítás:
   `pointerTapHandlers` lenyomáskor `setPointerCapture`-t kér, így a felengedés mindig a lenyomott célhoz jut (a „nem mozdult
   ujj” szabály így egérrel is érvényesül). A tesztet nem lazítjuk (review #622: újrakattintás helyett valódi javítás).

## Elfogadás
- A két spec a kapu beállításával (`playwright.gate.local.mts`) zöld; a Tornádó K3 a közepes címkés mérő-tétellel is.
- A „Kapcsolók” nézet és a vak kör L4 (álló 360×640, a panel a teljes HUD alatt) tesztje változatlanul zöld.

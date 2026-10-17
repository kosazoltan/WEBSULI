# Websuli grafikai szabályterv

**Forrás:** a tulajdonos által 2026-10-17-én csatolt „Egy platform. Minden korosztálynak.” koncepciókép (öt oszlopos tábla). A képet
nem a repó tárolja; javasolt elmentése: `docs/design/Websuli_Koncepcio_Egy_Platform.png`. Ez a dokumentum a kép **részletes
elemzése**, és a belőle levezetett, kódba ültethető **grafikai szabályok**.

**Viszony a mesterutasításhoz:** `Websuli_Design_AI_Implementacios_Utasitas.md`.
- Ami változatlan marad: az öt évfolyamsáv, a főszínek, az unisex elv, az önhostolt betűk, a WCAG 2.2 AA és a magyar karakterek
  szabálya.
- Ez a terv a „jóváhagyott vizuális koncepciót” teszi mérhetővé. Ott, ahol a mostani megvalósítás (#267) ettől eltért, ez a
  dokumentum az irányadó.

**Állapot:** terv, jóváhagyásra vár. Kód még nem készült.

---

## 1. A kép részletes elemzése

### 1.1 Teljes kompozíció
| Rész | Mit látunk | Szerepe |
|---|---|---|
| **Fejléc-sáv** | Sötét éjkék színátmenet (≈ `#1E2D57` → `#2C3E73`). Bal oldalt óriási, fehér, extra vastag cím: „Egy platform. Minden korosztálynak.” Jobbra vékonyabb fehér szlogen: „Tanulás. Fejlődés. Valódi lehetőségek.” | Márkaígéret. A tipográfia önmagában a dísz. |
| **Ecsetvonásos matrica** | Jobb felső sarokban türkiz-menta ecsetfolt, kb. −6°-ra döntve. Rajta kézírásos, sötét felirat: „Tudás ma. Siker holnap.” | Emberi, kézzel készült gesztus, amely oldja a géprendet. Az alsó sarokban ismétlődik: „JOBB TANULÁS. BOLDOGABB JÖVŐ.” |
| **Öt oszlop** | Öt egyforma szélességű, lekerekített (≈ 20 px) panel, mindegyik egy-egy évfolyamsáv teljes alkalmazás-képernyője. | Egy közös komponensrendszer, öt hangulat. |
| **Oszloplábléc-szalag** | Teli, mély sávszínű sáv. Bal oldalt fehér vonalas ikon, mellette kétsoros, nagybetűs fehér szlogen. | Sávonkénti ígéret, „aláírás”. |
| **Jellemzősáv** | Fehér sáv hat ikonnal és felirattal: Mindenkinek, Motiváló, Reszponzív, Adatbiztonság, Modern technológia, Natív magyar karaktertámogatás. | Értékek, nem funkció. Csak a marketingfelületre való. |

### 1.2 Oszloponként
**Közös szerkezet felülről lefelé:**
1. sávfejléc;
2. hős-kártya (illusztráció vagy fotó);
3. haladás- vagy cél-kártya;
4. tantárgy-csempék;
5. két tanulási kártya;
6. alsó navigáció;
7. lábléc-szalag.

**A sávfejléc mindenhol azonos szerkezetű:**
- **Ikonjelvény:** nagy, kör alakú, teli főszínnel, benne fehér jelkép. Sávonként: levél, iránytű, agy, lombik, emelkedő grafikon.
- **Évfolyam:** „N–M. osztály” főszínnel, vastagon.
- **A téma neve** mély színnel, extra vastagon.
- **Hármas mottó** • elválasztóval, például „Kíváncsiság • Játék • Alapok”.
- **Két kis ikon a jobb felső sarokban:** menü, keresés vagy értesítés.

| | 1–2. Felfedező világ | 3–5. Tudás kalandjai | 6–8. Kreatív stúdió | 9–10. Digitális tudáslabor | 11–12. Jövőtervező |
|---|---|---|---|---|---|
| **Háttér** | Halványzöld → krém színátmenet | Homok → barack | Levendula → halványlila | Jégkék → fehér | Sötét éjkék (sötét téma) |
| **Mottó** | Kíváncsiság • Játék • Alapok | Fedezz fel • Próbáld ki • Fejlődj | Gondolkodj • Alkoss • Oldj meg | Elemezz • Kísérletezz • Valósítsd meg | Tudás • Célok • Lehetőségek |
| **Hős** | **Kabalafigura** (róka) rajzolt erdőben. Fehér szóbuborék: „Szia! Ma is felfedezünk valami újat!” | **Festett tájkép:** hegycsúcs zászlóval. Buborék: „Minden lépés egy új felfedezés!” | **Fotó:** a Föld az űrből. Idézet a képre írva: „A világ tele van kérdésekkel…” | Előtte **fülsor** (Áttekintés · Tantárgyak · Projektek · Szimulációk). **Fotó:** függőhíd. Felirat: „Mérnöki gondolkodás a mindennapokban”, nyílgomb. | **Filmszerű fotó:** túrázó a csúcson naplementében. Idézet: „Nagy célok valós lépésekkel kezdődnek.” Alatta türkiz aláhúzás. |
| **Haladás** | „Mai célom” zöld sáv, 3/5 és ⭐ | „Kalandtérkép” 4/10, kincsesláda | – (a projekt-kártya viszi) | „Aktuális modul” 3/6, modulkártya nyíllal | „Saját céljaim”: három ikoncsempe (érettségi, egyetem, külföld) |
| **Tantárgy-csempék** | 4 nagy csempe, **3D-s, fényes** tárgyikonokkal (alma, 1·2·3, földgömb, paletta) | 4 csempe, fényes ikonok (könyv, lista, levél, zászló) | 8 kisebb csempe **lapos, kétszínű** indigó ikonokkal | Csak fülként; a felület a modulra fókuszál | – (tanulási terv sávokkal) |
| **1. tanulási kártya** | **Tanulókártya:** mosolygós Nap. Cím: „Nap”, egymondatos magyarázat, hangszóró-gomb, lapozónyilak, pontok. | **Mai kihívás:** képes kártya, „Juss fel a tudás csúcsára!”, kör alakú nyílgomb | **Kiemelt projekt:** szélturbina-fotó, „Fenntartható jövő”, lila cselekvés-gomb: „Belevágok →” | **Tudáspróba:** feleletválasztó kérdés, rádiógombok, a kijelölt válasz kiemelve, kék „Ellenőrzés” gomb | **Tanulási terv:** 6 tantárgy, mindegyiknél ikon, sáv és %-érték |
| **2. tanulási kártya** | **Játékos feladat:** „Melyik állat él a vízben?”, három képes válasz, zöld pirula: „Ügyes vagy! ⭐” | **Memóriakártya:** levél képe „level” felirattal és egy „?” fordítókártya, nyilakkal | **Fejlődésem:** „+32%”, növekvő lila oszlopok, jelmagyarázat (Tudás, Kreativitás…) | **Statisztikáim:** 78%-os gyűrű, jelmagyarázat (Helyes · Folyamatban · Ismétlésre) | **Inspiráció:** idézet szerzővel (Francis Bacon) |
| **Alsó navigáció** | Kezdőlap · Tanulás · Játék · Eredményeim | Kezdőlap · Küldetések · Tanulás · Eredmények | Kezdőlap · Tanulás · Projektek · Közösség · Profil | Kezdőlap · Tantárgyak · Szimulációk · Eredmények · Profil | Kezdőlap · Tanulás · Célok · Lehetőségek · Profil |
| **Lábléc-szalag** | Mély zöld · „KÖNNYŰ HASZNÁLAT / NAGY LEHETŐSÉGEK” | Barna · „KÍVÁNCSISÁGBÓL / TUDÁS LESZ” | Indigó · „MÉLYEBB TUDÁS / TÁGABB LÁTÓKÖR” | Sötétkék · „ISMERETBŐL MEGÉRTÉS / MEGÉRTÉSBŐL MEGOLDÁS” | Éjkék · „TUDÁS. IRÁNY. JÖVŐ. / TE DÖNTESZ.” |

### 1.3 A kép belső logikája: az érés tengelye
A tábla balról jobbra **egyetlen folyamatos érési görbét** mutat. Hat dimenzióban változik, mindig ugyanabba az irányba:

| Dimenzió | 1–2. | → | 11–12. |
|---|---|---|---|
| **Képi nyelv** | rajzolt kabala, mesés táj | festett táj → fotó | filmszerű, valós fotó |
| **Ikonstílus** | 3D-s, fényes, tárgyszerű | → lapos kétszínű | vékony vonalas, fehér a sötéten |
| **Sűrűség** | 4 nagy csempe, kevés szó | → 8 csempe, grafikon | adat: sávok, %-ok, gyűrű |
| **Megszólítás** | „Szia!”, felkiáltás, csillag | → „Juss fel…”, „Belevágok” | idézet, saját célok, döntés |
| **Szín** | meleg, telített zöld-sárga | → hideg levendula, kék | sötét alap, egy élénk türkiz kiemelés |
| **Jutalmazás** | csillag, „Ügyes vagy!” | → térkép, láda, +32% | statisztika, terv, eredmény |

**Következtetés:** a „szépséget” nem a díszítés mennyisége adja, hanem az, hogy **minden sáv saját, teljes vizuális világ**, mégis
ugyanazokból az építőkövekből áll. A #267 csak a színt és a betűt vette át, a **képi réteget** (kabala, táj, fotó, 3D-s ikonok,
idézetek, jutalmazó elemek) nem. Ezért lett sivár.

### 1.4 Visszatérő formai jegyek (minden sávban)
- **Kártyák:** fehér, illetve sötét témán sötét panel. Sarok 16–20 px, nagyon lágy árnyék, keret nincs vagy hajszálvékony.
- **Kártyafejléc:** vastag cím balra, jobbra „Összes →” vagy egy ikon (hangszóró, könyvjelző, nyíl). Mindig van címe.
- **Haladás:** lekerekített sáv sínnel, mellette **mindig szám** (3/5, 4/10, 72%).
- **Cselekvés-gomb:** teli főszín, fehér szöveg, jobbra nyíl. Kör alakú nyílgomb a képes kártyákon.
- **Pirula-címkék:** kitüntetett állapot vagy fül.
- **Kép a kártyában:** kitölti a kártya felső részét. A képre írt szöveg alatt sötét áttűnés teszi olvashatóvá.
- **Alsó navigáció:** 4–5 ikon felirattal. Az aktív elem a sáv főszínét kapja.
- **Ecsetvonásos matrica:** csak marketing- és fejlécfelületen, a tananyagban nem.

### 1.5 Gyenge pontok a képen (ezeket a megvalósításban javítani kell)
- **Kicsi szürke feliratok:** a csempe-feliratok és a mottók 10–12 px-esek, halványak. A mesterutasítás minimuma tananyagra 16 px,
  kiegészítő feliratra nálunk 13 px.
- **Fotóra írt szöveg:** egyes helyeken (6–8., 11–12.) csak egy áttűnés teszi olvashatóvá. Kötelező a mért sötétítő réteg (scrim).
- **A 3D-s, fényes ikonok és a fotók** valódi, jogtiszta képeket kívánnak. Nem állíthatók elő szabad kézzel rajzolt SVG-vel
  ugyanazon a minőségen. Ez beszerzési feladat (lásd 4.).
- **A 9–10. sáv képlete:** a „Melyik képlet írja le a gyorsulást?” helyes válasza a képen `a = Δv / Δt`. Tartalmilag rendben van,
  de a képi kvízek tartalmát is a tananyag-ellenőrzésnek kell adnia, nem a díszletnek.

---

## 2. Grafikai szabályok

### 2.1 Sávonkénti token-készlet (bővítés)
A főszín, az alapfelület és a mély szöveg a mesterutasítás táblázata, nem változik. Mellé minden sáv kap:

**`--ws-accent-2` és `--ws-accent-3`:** két társszín a kép alapján, kontrasztra mérve.

| Sáv | `--ws-accent-2` | `--ws-accent-3` |
|---|---|---|
| 1–2. | napsárga | égkék |
| 3–5. | türkiz | mély bordó |
| 6–8. | lila | égkék |
| 9–10. | türkiz | grafit |
| 11–12. | lila | arany |

**Egyéb új tokenek:**
- `--ws-hero-from`, `--ws-hero-to`: a háttér-színátmenet két végpontja (1.2 „Háttér” sor);
- `--ws-footer`: a lábléc-szalag mély színe (1.2);
- `--ws-icon-style`: `glossy` (1–5.), `duotone` (6–8.), `line` (9–12.).

Minden szöveg/háttér párra ≥ 4,5:1, minden grafikai jelölőre ≥ 3:1 kötelező, egységteszttel, a meglévő `tests/lesson-design.test.ts`
mintájára.

### 2.2 Tipográfia
- **Betűcsalád:** a mesterutasítás szerint Nunito Sans (1–5.) és Inter (6–12.). A kép vastag, kerekded hatását **súllyal** érjük el,
  nem új betűvel: a címek 800–900-as súlyúak, betűközük −0,02 em.
- **Skála** (asztali / mobil):

  | Szint | Méret | Súly |
  |---|---|---|
  | Óriáscím (csak marketing) | 44 / 30 px | 900 |
  | Lecke címe | 40 / 28 px | 900 |
  | Sávcím | 26 / 22 px | 900 |
  | Kártyacím | 17 / 16 px | 800 |
  | Törzsszöveg | a sáv minimuma (22 / 19 / 17 / 16 / 16 px) | – |
  | Kiegészítő felirat | ≥ 13 px | 600–700 |
- **Hármas mottó:** 14 px, 600-as súly, • elválasztóval, mély színnel. Nem halványszürke.
- **Kézírásos matrica:** csak marketingfelületen. Önhostolt, ő/ű-fedettségre ellenőrzött kézírásos betű, külön jóváhagyással.
  A tananyagban nincs.

### 2.3 Képi nyelv (illusztráció és fotó)
| Sáv | Hős-kép | Tantárgy-ikon | Tilos |
|---|---|---|---|
| 1–2. | Rajzolt kabalafigura nemtől független állattal (a kép szerint róka) mesés környezetben, szóbuborékkal | 3D-s, fényes tárgyikon | Rémisztő, túl részletes kép |
| 3–5. | Festett tájkép: expedíció, térkép, csúcs, zászló | 3D-s, fényes tárgyikon | Babás, „ovis” stílus |
| 6–8. | Fotó vagy fotószerű kép: űr, természet, technika | Lapos, kétszínű ikon | Rajzfilmfigura |
| 9–10. | Valós fotó: mérnöki, tudományos jelenet | Lapos vagy vonalas | Dísz a díszért |
| 11–12. | Filmszerű fotó: cél, út, pálya | Vékony vonalas, fehér a sötéten | Gyerekes elem |

Közös szabályok:
- **Unisex:** a kabala állat, nem fiú vagy lány. A fotókon a szereplők nemtől függetlenek vagy hátulról látszanak (a kép
  túrázója is ilyen).
- **Képre írt szöveg:** csak mért sötétítő réteggel, és a szöveg-háttér kontraszt a réteg nélküli legrosszabb pixelen is ≥ 4,5:1.
- **Forrás:** kizárólag jogtiszta, saját vagy licencelt kép (mesterutasítás §1). Kurált **képkészlet** a repóban vagy a
  tárhelyen, metaadatokkal: sáv, tárgykör, kulcsszavak, licenc, alt szöveg.
- **Leckeszinten:** a lecke borítója a készletből, a tárgykör és a kulcsszavak alapján választott kép. A pipeline csak választ,
  nem rajzol. Ez váltja ki a mostani három rögzített rajzot (`LessonCoverArt.tsx`).

### 2.4 Komponensszabályok
| Komponens | Szabály |
|---|---|
| **Sávfejléc** | Ikonjelvény (56 px kör, főszín, fehér jelkép) · évfolyam főszínnel · téma neve · hármas mottó. Mobilon is egy sorban az ikon és a két cím. |
| **Hős-kártya** | Kép kitöltéssel, 16–20 px sarok, a kép alján vagy oldalán szöveg. 1–5.: szóbuborék, fehér, sötét szöveggel. 6–12.: idézet vagy kiemelt cím a képen, sötétítő réteggel, kör alakú nyílgomb. |
| **Cél- és haladás-kártya** | Cím + sáv + szám + jutalomikon (⭐, láda, gyűrű). A szám mindig ott van. |
| **Tantárgy-csempe** | Négyzetes fehér csempe, ikon fent, felirat lent (≥ 13 px). 1–5.: 2×2, 6–8.: 4×2 rács. 44 px-nél nagyobb célterület. |
| **Tanulókártya / memóriakártya** | Kép vagy ikon balra, cím és egymondatos magyarázat jobbra; hangszóró-gomb; lapozó-nyilak és pontok. A fordítókártya „?” hátlappal. |
| **Tudáspróba** | Rádiógombos válaszok kártyaként, a kijelölt teli kerettel; teli „Ellenőrzés” gomb. A visszajelzés szöveges pirula: „Ügyes vagy!” vagy „Nézd meg újra”, nem csak szín. |
| **Statisztika** | Gyűrű középen %-kal, jelmagyarázat színponttal **és szöveggel**. |
| **Cselekvés-gomb** | Teli főszín, nyíllal; másodlagos: halvány sávszín. Sarok 12 px, magasság ≥ 44 px. |
| **Idézet-kártya** | Kis „Inspiráció” fejléc ikonnal, idézet 17–18 px, szerző jobbra. A 6–12. sávban. |
| **Lábléc-szalag** | Teli `--ws-footer`, fehér vonalas ikon, kétsoros nagybetűs sávszlogen. Csak a tanulói kereten (irányítópult), a leckében nincs. |

### 2.5 Elrendezés és ritmus
- **Térköz:** 8 px-es rács. Kártyák között 12–16 px, kártyán belül 16–20 px.
- **Sűrűség az érési tengely szerint:** 1–2.: egy fő elem képernyőnként, nagy csempék. 9–12.: 2–3 oszlopos kártyarács, több adat.
- **Mobil:** egy oszlop, alsó navigáció; asztali: oldalsó navigáció vagy fejléc-fülek (§8).
- **Mozgás:** nincs kötelező animáció (§2.7). A gombok és kártyák 150–200 ms-os, kis emelkedése megengedett, `prefers-reduced-motion`
  mellett kikapcsol.

### 2.6 A lecke-lejátszóra vonatkozó alkalmazás
A kép a tanulói keretet mutatja. A leckére ezeket vesszük át:
1. **Lecke-hős:** a 2.3 szerinti borítókép a sáv stílusában. Hozzá szóbuborék (1–5.) vagy idézet (6–12.), cím, nyitókérdés és
   tanulási célok.
2. **Sávfejléc** a lecke tetején, ikonjelvénnyel és hármas mottóval.
3. **Fülek** ikoncsempével. A 9–10. sáv fülsora a kép szerinti szegmentált fül.
4. **Haladás-kártya** a fejezetszámmal (3/5) és jutalomikonnal.
5. **Tanulókártya, memóriakártya, tudáspróba, statisztika:** a meglévő Ismétlés-fül, Kvíz és eredmény a 2.4 szerinti formában.
6. **Idézet-kártya** a lecke végén (6–12.).

Nem vesszük át a leckébe: ecsetvonásos matrica, lábléc-szalag, jellemzősáv. Ezek marketing- vagy keretelemek.

---

## 3. Elfogadás (EARS)
- HA egy lecke megjelenik, AKKOR a sávjának megfelelő hős-kép, ikonstílus, háttér-színátmenet és sávfejléc látszik, a 2.3 és 2.4
  szerint.
- Minden szöveg/háttér pár ≥ 4,5:1 és minden jelölő ≥ 3:1. Egységteszt a tokenekre, böngészős mérés a képre írt szövegre.
- A haladás minden megjelenésében szám is van. Az állapotot nem csak szín közli.
- A képkészlet minden eleméhez van licenc, alt szöveg és sávjelölés; a pipeline csak a készletből választ.
- 390 / 768 / 1440 px-en nincs kilógás. Mind az öt sávról képernyőkép, összevetve ezzel a dokumentummal.

## 4. Nyitott döntések a tulajdonosnak
1. **Képbeszerzés:**
   - (a) mesterséges intelligenciával generált, kurált saját képkészlet;
   - (b) licencelt stock-fotó és -illusztráció;
   - (c) a kettő vegyesen.

   Ettől függ a minőség, a költség és a jogtisztaság.
2. **Kabala:** egy közös kabala minden sávra (a 1–5. sávban), vagy sávonként más állat?
3. **Hatókör:** csak a lecke-lejátszó (2.6), vagy vele együtt a tanulói keret is (irányítópult, `Websuli_Tanuloi_Keret_Minta.html`)?
4. **Kézírásos betű a marketingfelületre:** kell-e, és melyik (ő/ű-fedettséggel)?

## 5. Javasolt szeletek (a háromfázisú rend szerint, a 4. döntései után)
1. **Tokenek és tipográfia** (2.1, 2.2): bővített sávszínek, súlyok, skála, kontraszttesztek.
2. **Képkészlet és borítóválasztás** (2.3): a készlet szerkezete, az első képcsomag (sávonként hős-képek, tárgykörönként
   borítók), a pipeline választó lépése; kiváltja a `LessonCoverArt`-ot.
3. **Lecke-hős és sávfejléc** (2.6/1–2): horog- és célmezők a sémában.
4. **Ikonrendszer** (2.3): sávonkénti ikonstílus a fülekre és csempékre.
5. **Tanulási kártyák** (2.4): tanulókártya, tudáspróba, statisztika, idézet.
6. *(Ha a 4/3. döntés szerint kell)* tanulói keret.

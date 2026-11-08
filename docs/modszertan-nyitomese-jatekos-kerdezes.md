# Célkártya, nyitómese és játékos kérdezés — módszertani tudásbázis

> 2026-11-08 · Spec: `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md` · Gyártási szerződések: `source/shared/lesson-opener.ts`
> Kapcsoló: `STUDIO_LESSON_OPENER=on` (alapból KI). A módszer két, a tulajdonos nevére licencelt könyvből (Oțoiu: *Terápiás mesék
> gyermekeknek*; Coatu: *600 IQ-fejlesztő játék, fejtörő és találós kérdés gyerekeknek*) és nyílt licencű forrásokból származik.
> **A két könyvből szöveg, szereplő, tárgy, feladat nem vehető át — csak a módszer.** Minden alábbi minta saját szöveg.

## Miért (bizonyíték és korlát)

- **Mese + beszélgetés.** A SAGA második vizsgálatban (óvodás csoportok, közös képeskönyv-olvasás) a mese után feltett
  „mit érezhetett, mit gondolhatott a szereplő?” típusú kérdések a gyerekek együttműködő viselkedését javították; a viselkedési
  problémákra nem volt kimutatható hatás. Tanulság: a mese önmagában kevés — a hozzá kapcsolt kérdés és a stratégia viszi át.
- **Iskolai történetalapú keret.** Az iskolai kreatív biblioterápiás beavatkozások (nem klinikus vezeti, fikció, mese, vers) a
  szakirodalomban kis–közepes pozitív hatásúak a viselkedésre; a vizsgált protokoll a hatásmechanizmusokat keresi. A mi
  nyitómesénk ennek iskolai, tanórába illesztett, nem terápiás változata.
- **Felidézés és „miért” kérdés.** Az ismétlő kérdezés (felidézés) tartósabb tudást ad, mint az újraolvasás; a mély „miért,
  hogyan” kérdések hatása erős bizonyítékú, az előkérdéseké (a tananyag előtt) gyenge, de hibázni szabad bennük.
- **Fokozatos segítség.** A segítség a tanuló szintjéhez igazodik, és fokozatosan elhagyható (a közelítő fejlődési zóna elve).
- **Korlát:** arra, hogy egy **tanóra elején álló mese** önmagában javítja a tantárgyi tanulást, közvetlen nyílt bizonyítékot
  nem találtunk. Ez következtetés — ezért a kapcsolóval mérjük (spec S2b), mielőtt élesben bekapcsolnánk.

## A lecke nyitánya: Célkártya → mini mese → tanítás

**Célkártya** — az 1. fejezet első blokkja (`explain`). A könyvek mesefejlécének (állapot – cél – tanulság) tanulói változata,
négy rövid bekezdésben, a lépcső címkéivel:
1. **Cél** — mit akarunk elérni a lecke végére; szó szerint megnevezi az 1. fejezet első fogalmát és a fő képességet. Ez az első
   bekezdés, ezért ez lesz a főoldali kártya leírása is — egész mondat, címke nélkül is érthető.
2. **Buktató** — mi az, ami miatt a cél esetleg nem sikerül (a térkép tévhitei, a téma tipikus nehézsége, a tanulási nehézség).
3. **Oka** — miért történik ez, megszégyenítés nélkül.
4. **Leküzdés** — egy konkrét, megismételhető stratégia, amelyet a mini mese meg is mutat.

**Mini mese** — az 1. fejezet második blokkja (`explain`), **pontosan 5 mondat**:
1. hős és helyzet;
2. a lecke tantárgyi problémája és az elakadás, az érzés megnevezésével;
3. segítő vagy felismerés, amely normalizál („ez másokkal is megesik”);
4. a Célkártya stratégiája működés közben;
5. **nyitott kérdés**, amelyre a lecke adja meg a választ.

A mese szó szerint tartalmazza az 1. fejezet első fogalmának nevét, és azt jelöli. A dramaturgia a terápiás mesék hét lépéséből
(hős → probléma → kudarc és érzés → segítő → stratégia „varázstárgyban” → kis siker → továbbadás és tanulság) tömörített, öt
mondatra szabott változat.

**Tanítás** — a harmadik blokktól a meglévő didaktikai ív szerint (`source/shared/lesson-arc.ts`).

**Visszatérés** — a lecke utolsó összefoglalójának (`recap`) **első pontja** visszatér a mese hőséhez és a célhoz: mit tanult
meg, hogyan segített a stratégia. A Célkártya és a mese a szókereten belül van: a bevezető mondatokat váltják ki.

## Évfolyamlépcső

| Lépcső | Évfolyam | Mese formája | Mondathossz (szó, legfeljebb) | Célkártya címkéi | Tanulság |
|---|---|---|---|---|---|
| L1 | 1–2. | állat- vagy fantáziamese, bölcs segítő; „varázstárgy”, de valódi módszer | 10 | Mit tanulunk ma? / Mi lehet nehéz? / Miért? / Így sikerül! | a recapben egyszerű mondattal |
| L2 | 3–4. | kaland gyerek- vagy fantáziahőssel; az 5. mondat „Te mit tennél?” | 12 | ugyanaz | a recapben kimondva |
| L3 | 5–6. | életszerű kortárs helyzet vagy kis rejtély; a hős hibázik | 15 | Célunk / Ami nehezítheti / Miért? / Hogyan győzd le? | a recapben, a tanuló szemszögéből |
| L4 | 7–8. és programozás | dilemma, csoporthelyzet, döntés; vagy a térkép eseménye jelenetként | 18 | ugyanaz | a tanuló vonja le; a recap kérdésként zárja |
| L5 | 9–10. | esetleírás, ütköző nézőpontok, gondolatkísérlet | 22 | Cél / Tipikus buktató / Oka / Leküzdés | nyitott; a recap az elemzés eredménye |
| L6 | 11–12. | érett eset vagy szakmai / erkölcsi dilemma, mesélő hang nélkül | 22 | ugyanaz | nyitott; a recap szintézis |

### L1 — 1–2. évfolyam

Hangnem: meleg, játékos; állat- vagy fantáziahős, bölcs segítő. A stratégia lehet „varázstárgy”, de a Célkártya kimondja a
valódi módszert. Minta: **matematika — összeadás tízes átlépéssel.**

**Célkártya**
- **Mit tanulunk ma?** Megtanulod az összeadást tízes átlépéssel, például 8 + 5.
- **Mi lehet nehéz?** Sokan sietnek, és ujjon számolva elcsúsznak.
- **Miért?** Ha sok számot kell egyszerre fejben tartani, könnyű eltéveszteni.
- **Így sikerül!** Előbb kiegészítjük tízre, aztán hozzáadjuk a maradékot.

**Mini mese**
> Peti, a kis sün, nyolc almát gyűjtött, aztán még ötöt. A tízes átlépés megijesztette, és sietve elszámolta magát. Bagoly
> anyó megsimogatta: „Ez másokkal is megesik, kicsim.” Adott neki egy tízes tálat: „Előbb ezt töltsd tele!” Szerinted hány
> alma maradt a tál mellett?

**IQ-kérdés (sorminta, `check`)** — „Folytasd: 8 + 2 = 10, 7 + 3 = 10, 6 + ? = 10.” Helyes: 4. Rossz válaszra: „Jó úton jársz!
Nézd meg, mennyi hiányzik a 6-ból a tízig — a kérdés ezt kérdezi: mennyi kell még a teli tízeshez.”

Lelki téma: türelem és önuralom · Stratégia: előbb tízre kiegészíteni · Nyitott kérdés: hány alma maradt a tál mellett? ·
Recap első pontja: „Peti előbb megtöltötte a tízes tálat, így 8 + 5 = 13 lett — te is így adhatsz össze tízes átlépéssel.”

### L2 — 3–4. évfolyam

Hangnem: meleg, kalandos; gyerek- vagy fantáziahős küldetéssel; az 5. mondat „Te mit tennél?” típusú. Minta:
**környezetismeret — a víz körforgása.**

**Célkártya**
- **Mit tanulunk ma?** Megismered a víz körforgását: a párolgást, a felhőképződést és a csapadékot.
- **Mi lehet nehéz?** Könnyű összekeverni, melyik lépés jön előbb.
- **Miért?** A víz útját nem látjuk egyben, csak darabokban.
- **Így sikerül!** Rajzolj egy kört, és tedd rá sorban a lépéseket.

**Mini mese**
> Lili egy forró nyári napon észrevette, hogy eltűnt a pocsolya. Nem értette a víz körforgását, és bosszantotta, hogy nem
> tudja. Nagypapa azt mondta, minden nagy felfedező kérdezéssel kezdte. Együtt rajzoltak egy kört, és Lili sorba tette, amit
> látott. Te mit tennél, ha meg akarnád találni a pocsolya vizét?

**IQ-kérdés (kakukktojás, kvíz)** — „Melyik nem illik közé? párolgás · felhő · csapadék · homokozó.” Helyes: homokozó.
Visszajelzés rossz válaszra: „Ügyes próbálkozás! A kérdés azt kérdezi, melyik nem a víz útjának része — a másik három egymás
után következik a körön.”

Lelki téma: kíváncsiság, a kérdezés bátorsága · Stratégia: körrajz a lépésekkel · Nyitott kérdés: hol van a pocsolya vize? ·
Recap első pontja: „Lili a körrajzzal megtalálta a pocsolya vizét: elpárolgott, felhő lett, és esőként visszatér.”

### L3 — 5–6. évfolyam

Hangnem: életszerű, nem gyerekes; kortárs helyzet vagy kis rejtély, a hős hibázik. Minta: **matematika — törtek bővítése.**

**Célkártya**
- **Célunk:** Megtanulod a törtek bővítését, és megérted, hogy a bővített tört értéke nem változik.
- **Ami nehezítheti:** Sokan csak a számlálót vagy csak a nevezőt szorozzák meg.
- **Miért?** A nagyobb számok nagyobb értéket sugallnak, pedig a tört értéke ugyanaz marad.
- **Hogyan győzd le?** Minden bővítés után rajzzal ellenőrizd, hogy ugyanakkora rész van-e kiszínezve.

**Mini mese**
> Bence a születésnapi tortán vitatkozott a húgával, hogy ki kapott többet. Neki 2/4 jutott, a húgának 1/2, és Bence úgy érezte,
> becsapták. Anya nevetett: „Ezen a hibán a legtöbben átesnek.” Rajzolt két egyforma tortát, és a törtek bővítését színezéssel
> mutatta meg. Vajon tényleg kevesebbet kapott Bence, mint a húga?

**IQ-kérdés („Melyik állítás hamis?”, kvíz)** — A) 1/2 = 2/4 · B) 3/6 = 1/2 · C) 2/3 = 4/6 · D) 1/3 = 2/3. Helyes: D. Visszajelzés
rossz válaszra: „Jó, hogy ellenőrzöd! Itt a hamis egyenlőséget keressük: a D-nél csak a számláló nőtt, a nevező nem — ez nem bővítés.”

Lelki téma: összehasonlítás és irigység · Stratégia: rajzos ellenőrzés · Nyitott kérdés: kevesebbet kapott-e Bence? ·
Recap első pontja: „Bence rajza megmutatta: 2/4 = 1/2, a bővítés nem változtat a tört értékén — és összehasonlítás előtt érdemes ellenőrizni.”

### L4 — 7–8. évfolyam és programozás

Hangnem: egyenes, komoly, nem kioktató; dilemma, csoporthelyzet vagy döntés; a tanuló vonja le a tanulságot. Minta:
**történelem — a honfoglalás** (csak általánosan ismert tartalom, évszám nélkül).

**Célkártya**
- **Célunk:** Megérted, mi volt a honfoglalás, és hogyan tudhatjuk meg, mi történt valójában.
- **Ami nehezítheti:** Könnyű a mondákat és a történeti forrásokat egyformán igaznak tekinteni.
- **Miért?** A monda izgalmasabb, ezért jobban emlékszünk rá, mint a száraz forrásra.
- **Hogyan győzd le?** Minden állításnál kérdezd meg: ki mondja, honnan tudja, mi a bizonyíték?

**Mini mese**
> Dóra kiselőadást készített a honfoglalásról, és mindent egyetlen videóból vett át. Amikor egy osztálytársa megkérdezte, honnan
> tudja, hogy a fehér ló mondája megtörtént, Dóra elpirult és megsértődött. A tanár szerint ez a kérdés nem támadás, hanem a
> történészek mindennapi munkája. Dóra táblázatot készített arról, mit mond a monda, és mit a régészeti lelet. De akkor miből
> tudjuk, hogyan érkeztek a magyarok a Kárpát-medencébe?

**IQ-kérdés (kakukktojás, `check`)** — „Melyik NEM írott forrás? krónika · oklevél · régészeti lelet · levél.” Helyes: régészeti
lelet. Visszajelzés rossz válaszra: „Jó gondolat, hogy mérlegelsz! A kérdés a forrás anyagára kérdez: a másik három írás, a lelet
tárgy — ezért tárgyi forrás.”

Lelki téma: forráskritika, álhírek · Stratégia: ki mondja – honnan tudja – mi a bizonyíték · Nyitott kérdés: miből tudjuk, hogyan
érkeztek a magyarok? · Recap első pontja (kérdésként): „Dóra táblázata alapján: melyik állításodat támasztja alá forrás, és melyik csak monda?”

### L5 — 9–10. évfolyam

Hangnem: érett, mesélő hang és gyerekes elem nélkül; esetleírás, ütköző nézőpontok vagy gondolatkísérlet. Minta:
**fizika — Newton II. törvénye.**

**Célkártya**
- **Cél:** Megérted Newton II. törvényét: a test gyorsulása egyenesen arányos a rá ható eredő erővel, és fordítottan arányos a
  tömegével (F = m · a).
- **Tipikus buktató:** Sokan azt gondolják, hogy állandó sebességhez állandó erő kell, és erő nélkül a test megáll.
- **Oka:** A hétköznapokban mindig jelen van a súrlódás, ezért úgy tűnik, hogy a mozgás fenntartásához erő kell.
- **Leküzdés:** Minden helyzetben előbb rajzold fel az összes erőt, és csak az eredő erőből következtess a gyorsulásra.

**Mini mese**
> Ádám és Réka egy üres és egy teli bevásárlókocsit tolt végig a parkolón. Réka szerint a teli kocsi egyszerűen lassabb, mert
> nehezebb, Ádám bizonytalanul Newton II. törvényére hivatkozott. Egyikük sem volt biztos a dolgában, és mindketten érezték, hogy
> a meggyőződés még nem bizonyíték. Felrajzolták az erőket, majd ugyanakkora tolóerővel indították mindkét kocsit, és mérték, mennyi
> idő alatt gyorsulnak fel. Mit mutatna a mérés, ha a teli kocsi tömege kétszerese lenne az üresének?

**IQ-kérdés (analógia, kvíz)** — „Kétszeres erő ugyanakkora tömegre → kétszeres gyorsulás. Kétszeres tömeg ugyanakkora erővel → ?”
A) kétszeres gyorsulás · B) fele akkora gyorsulás · C) ugyanakkora gyorsulás · D) négyszeres gyorsulás. Helyes: B. Visszajelzés rossz
válaszra: „Érdemes volt végiggondolni! A kérdés a fordított arányosságot kérdezi: a = F / m, így kétszeres tömegnél a gyorsulás a felére csökken.”

Lelki téma: döntés bizonytalanságban · Stratégia: erőábra, majd következtetés az eredő erőből · Nyitott kérdés: mit mutatna a
mérés kétszeres tömegnél? · Recap első pontja: „A kocsis kísérlet eredménye: azonos erőnél a kétszeres tömeg fele akkora
gyorsulást kap — a vitát a mérés döntötte el, nem a meggyőződés.”

### L6 — 11–12. évfolyam

Hangnem: érett, akadémiai; mesélő hang és gyerekes elem nélkül; szakmai vagy erkölcsi dilemma, érettségi- és életpálya-vonatkozással.
Minta: **irodalom — a nézőpont szerepe az elbeszélésben.**

**Célkártya**
- **Cél:** Megérted, hogyan alakítja az elbeszélői nézőpont (első vagy harmadik személyű, mindentudó vagy korlátozott) azt, amit a
  szövegből megtudunk.
- **Tipikus buktató:** Az elbeszélő szavait könnyű a szerző véleményének vagy a teljes igazságnak tekinteni.
- **Oka:** Az olvasó ösztönösen megbízik abban, aki a történetet elmondja — különösen első személyű elbeszélésnél.
- **Leküzdés:** Minden szövegnél tedd fel a kérdést: ki beszél, mit tudhat, és mit nem láthat?

**Mini mese**
> Egy diákönkormányzati ülésről két jegyzőkönyv készült, és a kettő szinte semmiben nem egyezett. Az egyiket az ülést vezető diák
> első személyben írta, a másikat egy kívülálló, és mindkettő a saját nézőpontját tartotta tárgyilagosnak. A vita addig
> mérgesedett, amíg valaki meg nem jegyezte, hogy egyik szöveg sem hazudik, csak mást lát. Ekkor egymás mellé tették a két
> beszámolót, és mondatonként jelölték, mit tudhatott az egyik és mit a másik elbeszélő. Melyik jegyzőkönyvből ismerhető meg
> jobban, mi történt — és miből derül ki, mit nem tudhatunk?

**IQ-kérdés (ellenpélda, szöveges feladat)** — „Hozz ellenpéldát arra az állításra, hogy az első személyű elbeszélő mindig
megbízhatatlan, és indokold!” A pontozás a tanított fogalmakat méri (első személyű elbeszélő, nézőpont, megbízhatóság); a minta
egy lehetséges jó válasz.

Lelki téma: vita és nézeteltérés kezelése · Stratégia: ki beszél – mit tudhat – mit nem láthat · Nyitott kérdés: melyik
jegyzőkönyvből ismerhető meg jobban, mi történt? · Recap első pontja: „A két jegyzőkönyv tanulsága: a nézőpont nem hazugság, hanem
korlát — az elemzés azt mutatja meg, mit tudhat és mit nem az elbeszélő.”

## A lelki réteg: tanulási nehézségek és stratégiák

Egy, a tantárgyhoz és az évfolyamhoz illő **tanulási** nehézség; a stratégia mindig konkrét és otthon is megismételhető.

| Téma | Évfolyam | Példastratégia |
|---|---|---|
| halogatás és szervezés | mind | teendőlista fontossági sorrendben, egyszerre egy tétel |
| figyelem | mind | „csak én és a feladat” belső mondat, zavaró tárgyak elrakása |
| türelem és önuralom | mind | megállás, három lassú levegő, újrakezdés |
| hibától vagy kudarctól való félelem | mind | a hiba mint nyom: mit mutat meg? |
| kitartás | mind | kis lépésekre bontás, minden lépés kipipálása |
| segítségkérés | mind | pontos kérdés megfogalmazása: hol akadtam el? |
| együttműködés | mind | szerepek kiosztása, a másik ötletének meghallgatása |
| tökéletességre törekvés | 3.– | „elég jó” határ kijelölése, ellenőrzés egyszer |
| megszólalás mások előtt | 3.– | rövid gyakorlás hangosan, egy kezdőmondat előre |
| önbizalom, „nem vagyok elég jó” érzés | 3.– | amit már tudok: három dolog felsorolása |
| izgulás dolgozat vagy felelés előtt | 3.– | felkészülési terv, légzés, a könnyű feladattal kezdés |
| unalom, motiváció hiánya | 3.– | „mire jó ez nekem?” kérdés, kis cél és jutalom |
| összehasonlítás és irigység | 3.– | a saját tegnapi eredmény a mérce |
| változáshoz alkalmazkodás (új téma, új közeg) | mind | ami ismerős benne: kapcsolás a már tudotthoz |
| csalódás és kudarc feldolgozása | 3.– | mi sikerült mégis? mit csinálok másképp? |
| időbeosztás | 5.– | időbecslés, majd összevetés a valós idővel |
| képernyő és figyelemelterelés | 5.– | értesítések némítása tanulás közben, időkeret |
| vita és nézeteltérés kezelése | 5.– | előbb meghallgatom, aztán elmondom, mit gondolok és miért |
| szükségletek kifejezése | mind | „Szükségem van…, mert…” mondat |
| másság és sokszínűség elfogadása | mind | kérdezek, mielőtt ítélek |
| felelősségvállalás | 5.– | „ezt én vállalom” — és a határidő kimondása |
| kíváncsiság, a kérdezés bátorsága | mind | minden új témánál egy saját kérdés felírása |
| döntés bizonytalanságban | 9.– | érvek és ellenérvek táblázata, majd döntés |
| forráskritika, álhírek | 7.– | ki mondja, honnan tudja, mi a bizonyíték? |

## Biztonsági és tartalmi korlátok

- Nincs diagnózis- vagy betegségcímke (pl. ADHD, szorongásos zavar), terápiás ígéret, megszégyenítés, testi jellemzők kritikája;
  a nehézséget viselkedésként írjuk le, a hőst nem címkézzük.
- 1–6. évfolyamon tilos: halál, bántalmazás, válás, betegség, erőszak, félelemkeltő jelenet. 7–12. évfolyamon társas nehézség
  (kirekesztés, csoportnyomás) visszafogottan megengedett, naturalisztikus részlet nélkül.
- **Új tény nem kerülhet be**: a kitalált keret (szereplő, helyszín, párbeszéd) nem tény; minden tantárgyi állítás a térképből
  jön. Valós személy vagy esemény csak akkor szerepelhet, ha a térképben van.
- A nyitómese tanulást segítő keret, nem terápia; tartós érzelmi nehézségnél szakember (pszichológus, orvos) segít — ezt a
  szülőknek szóló anyagokban ki kell mondani, a gyereknek szóló szövegben nem.
- A két licencelt könyvből szöveg, szereplő, tárgy vagy feladat nem vehető át.

## Játékos (IQ-) kérdezés

### Formák és helyük

| Forma | Hol | Fejlesztett készség | Évfolyam | Megkötés |
|---|---|---|---|---|
| kakukktojás („Melyik nem illik közé, és miért?”) | kvíz, `check`, szöveges feladat | kategorizálás, indoklás | 1.– | kvízben/`check`-ben pontosan egy védhető helyes válasz; a visszajelzés megnevezi a szempontot |
| sorminta / következő elem | kvíz, `check` | szabályfelismerés | 1.– | a szabály a tanított tartalomból következik |
| analógia | kvíz, `check`, `analogy` módszer | összefüggés átvitele | 3.– | |
| „Melyik állítás hamis?” / igaz-hamis csapda | kvíz, `check`, `myth` módszer | tévképzet javítása | 5.– | hihető, de hamis; a magyarázat megmondja, mi tévesztett meg |
| találós kérdés | kvíz, `popup` módszer; fordítva szöveges feladat („Írj találós kérdést…”) | fogalom-előhívás | 3.– | |
| következtetés, nyomozós kizárás | kvíz, `check`, `gate` | dedukció | 5.– | egyértelmű, ellenőrzött megoldás |
| előkérdés / becslés | `prediction` módszer, szöveges feladat indoklással | előzetes aktiválás, modellezés | 5.– | hibázni szabad |
| „Magyarázd el, miért” / ellenpélda | szöveges feladat, `selfCheck` | mélyfeldolgozás | 7.– | a `required` a tanított fogalmat méri |
| „Mi lenne, ha …?” | szöveges feladat (szóbeli is) | ok-okozat, transzfer | 3.– | a `required` a fogalom alkalmazását méri, a `sample` egy lehetséges jó válasz |
| dilemma | `conflict` módszer, szöveges feladat | érvelés, nézőpontváltás | 7.– | |

### Mennyiség és nehézségi ív

- Banki csomagonként legalább **egy** IQ-formájú kvízkérdés és legalább **egy** IQ-formájú szöveges feladat; a Tananyag lapon
  leckénként legalább **egy** IQ-formájú `check` (ha van `check`). A meglévő darabszámokon (45 feladat / 75 kvíz) belül, nem felül.
- Minden csomagban és fejezetben könnyű, sikerélményt adó tétel az első, utána közepes, végül kihívás.

### Évfolyam szerinti forma

- **1–2.:** konkrét, egylépéses, csapda nélkül; kakukktojás képszerű szavakkal, egyszerű sorminta.
- **3–4.:** találós kérdés, kakukktojás, egyszerű analógia.
- **5–6.:** hamis állítás keresése indoklással, kétlépéses következtetés.
- **7–8.:** többlépéses és laterális kérdés, nyomozós kizárás.
- **9–12.:** dilemma, becslés, ellenpélda, „magyarázd el, miért”.

A nehézség három tényezőből áll: mennyi információt kell egyszerre fejben tartani; mennyire visz tévútra a szöveg; mennyi
segítséget kap a tanuló.

### Visszajelzés és segítség

- Helyes válasznál röviden: miért jó.
- Rossz válasznál: az első mondat bátorító; utána mi tévesztett meg; egy mondat arról, **mit kérdezett valójában** a feladat; a
  helyes gondolatmenet egy mondatban. Erőfeszítést dicsérünk, nem minősítünk.
- A `check.hint` irányt mutat (kérdés vagy szempont), **nem árulja el** a választ.
- A játékos keret nem enged új tényt: kizárólag a Tananyag lapon ténylegesen megtanított állítás kérdezhető.

## Forrásjegyzék és licencek

Ötlet és módszer szerzői jogilag nem védett; szöveget csak közkincsből vagy CC BY / CC BY-SA forrásból veszünk át, forrásmegjelöléssel.
A két licencelt könyvből (Oțoiu; Coatu, Gold Kiadó) szöveg nem vehető át, csak a módszer.

| Forrás | Licenc | Ellenőrzés | Mit használunk |
|---|---|---|---|
| Linnavalli és mtsai (2024): SAGA második vizsgálat, *Frontiers in Education*, doi:10.3389/feduc.2024.1284474 | CC BY | oldalon ellenőrizve 2026-11-08 | mese utáni „mit érezhetett / gondolhatott?” kérdés hatása |
| Redman és mtsai (2024): iskolai kreatív biblioterápia protokoll, PMC10936023 | CC BY (AAM) | oldalon ellenőrizve 2026-11-08 | iskolai, nem klinikus által vezetett történetalapú keret |
| Dudeney: *Amusements in Mathematics*, Project Gutenberg #16713 | „Public domain in the USA” | oldalon ellenőrizve 2026-11-08 | feladat → tipp → megoldás minta, történetbe ágyazott fejtörő |
| Aiszóposz-mesék, Project Gutenberg #11339 | közkincs (USA) | keresési találat | rövid mese, kimondott tanulság |
| Wikipedia: Zone of proximal development | CC BY-SA 4.0 | kutatóügynök látta | fokozatosan elhagyható segítség |
| IES/WWC Practice Guide (Pashler és mtsai 2007) | valószínűleg közkincs (USA szövetségi) | UNVERIFIED | ismétlő kvíz (erős), mély „miért” kérdés (erős), előkérdés (gyenge) |
| OpenStax *Psychology 2e*, *Lifespan Development* | CC BY-NC-SA 4.0 | oldalon ellenőrizve | csak módszertani tájékozódás, szöveg nem |
| Benedek Elek, Arany László népmesék (MEK) | UNVERIFIED | — | csak ellenőrzés után |
| Kizárva: NRICH, Open Middle, Deans for Impact (minden jog fenntartva); Susan Perrow könyvei (kereskedelmi) | — | — | — |

## Hol él a gyártásban (kódhivatkozások)

- Szerződések és lépcsők: `source/shared/lesson-opener.ts` (`openerStageForClassroom`, `OPENER_STAGES`, `learningThemesFor`,
  `lessonOpenerContract`, `PLAYFUL_AUTHOR_RULES`, `LESSON_OPENER_LEKTOR_CHECKLIST`, `PLAYFUL_QUESTIONING_CONTRACT`,
  `LESSON_OPENER_HTML_CONTRACT`, `lessonOpenerStageLine`).
- Kapcsoló: `source/server/studio/lesson-opener-flag.ts` (`STUDIO_LESSON_OPENER=on`).
- Bekötés: `source/server/studio/step-io.ts` (`buildAuthorPrompt`, `buildLektorPrompt`), `source/server/studio/experience-builder.ts`
  (`bankStaticPrefix`), `source/server/ai/lesson-html-spec.ts` (`lessonHtmlSpecParts`), `source/server/studio/web-research-agent.ts`
  (`webLessonAuthorPrompt`).
- Tesztek: `source/tests/lesson-opener.test.ts`.

# Független review — docs/websuli-potlasok
Fej: 131add444772f769eb3c5f66bd2fd09b5990e79a
## Ítélet: NEM
A változás valóban csak dokumentáció. A végrehajtási utasítás azonban az adventi élesítés előtt olyan próbát követel, amelyhez még nem engedi elindítani az előnézet megvalósítását. Az adventi eredménylevél elfogadási feltétele pedig felülírt, körönkénti működést ír elő a jóváhagyott évadonkénti küldés helyett.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

**L1 — blokkoló — Az A-2 túl korán és többször küldhet eredménylevelet.** `docs/specs/2026-11-19-websuli-potlasok-terv.md:264–267`. Egy párosított tanuló megválaszolja mind a 24 ablakot az első körben, de még javíthat vagy új kört kérhet. A pótlási terv EARS-pontja `finished_at` beállásakor levelet követel. A jelenlegi hívási út már ekkor beállítja ezt a mezőt, és új körnél nullázza (`source/server/advent/routes.ts:426–441,456–460`). A hivatkozott Kiegészítés 5 kifejezetten felülírja a körönkénti küldést (`docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md:593–595`), és a végrehajtási pár 107. sora helyesen a végleges eredményt nevezi meg. Ez nem cáfolja a hibát: két ellentétes, egyaránt kötelező feltételt ad ugyanahhoz a teszthez. A csak részben játszó, évadzáráskor értesítendő tanulót sem fedi a `finished_at` szabály. **Javítás:** a pótlási terv EARS-pontját cseréljék az adventi terv 18.1 három véglegesítő ágára, címzettenkénti évados kulccsal. Legyen külön negatív eset a még javítható első körre és pozitív az évadzárásra; az A-1 takarítója és az A-2 küldője között nevezzék meg az évadzáró hívás felelősét is.

**L2 — blokkoló — Az A-1 saját előnézetétől teszi függővé az indulását.** `docs/specs/2026-11-19-websuli-potlasok-terv.md:189`; a végrehajtás `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:16–17` szerint a Függőség oszlop **minden** eleme indulási feltétel. Amikor PR-B és PR-C bent van, az orkesztrátor a D-11 próbára vár; a próbálandó külön admin útvonal és kliensbekötés viszont az A-1 által hivatkozott S6 1–2. lépésében készül (`docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md:313–325`). Megcáfolási kísérlet: a végrehajtás egyedi A-1 sora csak B/C-t sorolja induláskor, és helyesen a merge elé teszi a jóváhagyást (84–85., 96–102. sor); nincs azonban kimondva, hogy ez felülírja a 0.1 szabályt. A flagtől független előnézet még nem azonos egy már futó előnézettel. A szabályt szó szerint követve a november 30-i élesítés megáll. **Javítás:** B/C legyen indulási előfeltétel; a kész A-1 fej kontrollált előnézetének próbája és a tulajdonosi jóváhagyás csak merge-feltétel legyen, konkrét próbakörnyezettel és a kipróbált fej rögzítésével.

**L3 — közepes — Az I-2 futtatható útmutatója elavult kisfilm-alapállapotból indul.** `docs/specs/2026-11-19-websuli-potlasok-terv.md:106,525–526`. A dátumozott leltár mint pillanatkép megőrizhető, de a végrehajtó a #418-at a 159–161. sor szerint még frissíti és beolvasztja. A vizsgált fej második szülőjéről érkezett a kisfilm-memóriaterv, migráció és kód; a fejen már `CLIP_PARALLEL = 1` és RSS-őr van (`source/server/lesson-clips.ts:19–29`), nem a „megerősített” kettő. A viselkedési teszt egy fejezetet és memóriahatár feletti kihagyást igazol. Az aktuális távoli PR-státusz UNVERIFIED, a kód megléte nem az. **Javítás:** a pillanatkép megőrzése mellett az I-2 indulásakor ellenőrizzék a main tartalmát és a PR valós státuszát; ha a kód bent van, a megismételt merge helyett csak a külön engedélyhez kötött maradék mérés maradjon.

**L4 — közepes — A D-16 sorrendje nem érvényesül a párhuzamos indítás szabályában.** `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:214–216`. A döntés és a cím a P1-blokk utánra teszi a G-21-et, de a függősége üres. A 0.1 csak az indítható szeleteket rendezi és legfeljebb négy párhuzamos szeletet enged. Ha a Q-3 fut, és felszabadul egy hely, az orkesztrátor a P1 befejezése előtt elindíthatja a G-21-et. A táblázat 11. helye (`docs/specs/2026-11-19-websuli-potlasok-terv.md:198–199,559`) csak prioritást ad, nem várakozási feltételt. **Javítás:** írják elő a P1 lezárását mint indítási feltételt (és adják meg, hogy a jóváhagyott NOT DONE lezárás számít-e); ha csak prioritást értettek alatta, azt tegyék egyértelművé a döntés végrehajtásában.

**L5 — közepes — Az M-8 új sorokra korlátozott indexe nem védi a régi postafiókokat.** `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:399–402`. Adott egy migráció előtti, nem tiltott Gmail-fiók. A gyerek a migráció után pontozott vagy `+`-os változattal jelentkezik először. A csak új sorokat indexelő szabálynak nincs mivel ütköznie. Ma az adatbázis szó szerinti `email`-t tesz egyedivé (`source/shared/schema.ts:1311–1314`); a kódos és a Google-út is `ON CONFLICT (email)`-t használ (`source/server/player/store.ts:194–197`, `source/server/player/account-store.ts:160–170`), a meglévő kanonikus ellenőrzés itt tiltott fiókot keres. Ez nem teljesíti a terv 510–512. sorát, amely **már regisztrált** postafiók aliasát is elutasítja. **Javítás:** az új regisztráció ütközzön a régi kanonikus foglalással is, a régi fiókok összevonása nélkül; mindkét belépési útra kérjenek DB-esetet előre betöltött régi fiókkal és párhuzamos első regisztrációval.

**L6 — közepes — Az A-3 becslésből nem garantál kemény számlázási plafont.** `docs/specs/2026-11-19-websuli-potlasok-terv.md:269–275`. A későbbi, külön jóváhagyott képkörnél a helyi őr átengedheti a következő hívást a várható árral, miközben a tényleges ár csak a válaszban érkezik. A követett teszt bemenetén 6,95 + 0,048 = 6,998 USD alatt indul a hívás; ha a válasz hipotetikusan 0,06 USD-t számol, a végösszeg 6,95 + 0,06 = 7,01 USD. A kód az árkülönbözetet csak **a hívás után** könyveli (`source/scripts/design-assets/generate.ts:98–114`, `source/scripts/design-assets/lib.ts:114–159`). Az eredeti adventi végrehajtás ezért külön előírja a szolgáltatói kulcsplafont mint valódi kemény korlátot (606–607. sor); az A-3 nem. **Javítás:** vagy legyen a szolgáltatói plafon ellenőrzése kifejezett előfeltétel, vagy a helyi korlátot nevezzék becslési korlátnak, és egészítsék ki az elfogadást a becslést meghaladó hamis válasz esetével. Nem állítok tényleges túlszámlázást vagy engedély nélküli hívást.

**L7 — közepes — A D-13 hatókörét a Q-5 utasítás jóváhagyás nélkül kibővíti.** `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:436–442`. A tulajdonosi választás és a Q-5 terv PR-nyitó és -összevonó eszközöket nevez meg (`docs/specs/2026-11-19-websuli-potlasok-terv.md:358–363,556`), az utasítás ugyanezen döntésként külön a fájlfeltöltő eszközöket is előírja, ugyanazzal a bizonyítékkal. A koordinátor így olyan matcher-javaslatot kap, amely egy normál, megnyitás előtti fájlfeltöltést is PR-műveletként kezelhet. A tulajdonosi matcher-alkalmazás véd az azonnali éles módosítástól, de nem teszi jóváhagyottá az új követelményt. **Javítás:** a Q-5 egyezzen a rögzített D-13-mal; a fájlfeltöltést külön döntésként, saját műveleti szerződéssel tárgyalják.

**L8 — közepes — A közös kiadási út nem tud szabályosan továbblépni feltételes ítélettel.** `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:46–47`. Ha egy szelet csak jegyre menő leletet kap, a vak ellenőr `IGEN, FELTÉTELLEL` ítéletet adhat. A dokumentált parancs csak IGEN/NEM-et sorol, a következő lépés pedig csak IGEN-t fogad. A `record-review` nem fogad el egy, a jelentéstől eltérő IGEN-t (`scripts/qa/gates/record-review.mjs:44–47`); a PR-kapu a helyes feltételes ítéletet WARN-ként kezeli (`scripts/qa/gates/pre-pr-gate.mjs:132`, `scripts/qa/gates/lib.mjs:275–281`), a merge-átmenetet is fedi az egységteszt. **Javítás:** dokumentálják a harmadik értéket és a jegyre/PR-leírásba rögzítendő feltételeket, vagy mondják ki a szigorúbb szabályt és írják le a korrekt továbblépést az ítélet átnevezése nélkül.

**L9 — közepes — Az S9 megnevezett ellenőrzése zöld az analitikai skill nélkül is.** `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:424–425`. Az ügynök kihagyja a pótlást vagy eltérő tartalmat másol; a megadott ellenőrzés a konfiguráció öt elemét járja be (`scripts/qa/gates/skills-sync-check.mjs:37–40`, `scripts/qa/gates/gates.config.json:63–69`), az analitikai skill nincs közöttük, a követett teszt ezt az ötelemű listát használja. **Javítás:** az S9-ben legyen a konkrét útvonalpárt ellenőrző teszt, vagy tudatosan bővítsék a konfigurációt és a tesztet; az analitikai forrás eltávolítására vagy a tükör módosítására bukjon meg.

**L10 — kicsi — Az I-5 hibás fejezetszámra hivatkozik.** `docs/specs/2026-11-19-websuli-potlasok-terv.md:234`. Az I-5 ütemezője a 7.9-et keresné, de a 7.8 után a 8. szakasz kezdődik (514., 540. sor); a J3–J10 alszeletek a 7.8-ban, 531–535. sorban állnak. **Javítás:** teljes fejezetcímre vagy a 7.8 I-5 pontjára mutasson a függőség.

**L11 — közepes — Egy rész-PR idő előtt készre állít egy összetett leltártételt.** `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:75–76`. Az A-1 beolvadása után a közös szabály `kész`-re állítja a P-038 sort egy merge-hash-sel, holott azt A-1, A-2 és A-4 teljesíti (`docs/specs/2026-11-19-websuli-potlasok-terv.md:103`). A zárás csak a még „szelet” sorokra írja elő a PR-igazolást (576. sor), így eltűnhet a levélmaradék. **Javítás:** rész-PR-enként rögzítsék a bizonyítékot, a teljes tétel csak az összes hozzárendelt rész beolvadása vagy indokolt lezárása után legyen kész.

**L12 — közepes — A P-060 párosítólink-életciklusa kimarad a folytatásból.** `docs/specs/2026-11-19-websuli-potlasok-terv.md:125`. A leltár ugyanebben a tételben külön előírja a párosítólinkek újrakiadásának és a kulcsforgatás hatásának ellenőrzését (`docs/websuli-potlasok.md:1035–1041`). Ha csak a Q-10 frissességellenőrzés olvad be, a tétel késznek látszik, miközben a következő rotáció előtt a linkek viselkedését senki nem igazolta. **Javítás:** legyen külön verifikációs alszelet, vagy legyen a linkrész kifejezetten kizárva, indokkal és a runbook hivatkozásával.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — talált hiba:** `finished_at` nem végleges évaderedmény (L1); a csak új sorokra érvényes index nem fedi a régi postafiókot (L5).
2. **Biztonság és adatvédelem — talált jóváhagyási hatókörhiba (L7); új nyers titkot vagy azonosított személyes adatot nem találtam.** Dátumozott helyi fájlneveket, a régi automatizmus/ág címkéjét és helyőrzős GitHub-URL-t láttam. A követett szöveges fájlok e-mail-őre zöld. Az Advent írásai a közös CSRF-őr után érik el a routert (`source/server/routes.ts:845–857,891–901`); az admin-előnézet dátumparamétere nem token. A jövőbeli admin-út és GET mellékhatásmentessége nincs futtatással igazolva.
3. **Regresszió — talált dokumentációs hiba:** az I-2 már bent lévő működést újranyitná (L3); az A-2 a javító körös tanuló és az évadzáró út szerződését eltéríti (L1). A rövid nyílt válasz meglévő egységtesztje zöld, a diff nem változtat pontozókódot.
4. **Europe/Budapest — próbáltam, nem sikerült megtörni a meglévő adventi naptár napváltását.** A követett teszt december 1-jén 23:59:59/00:00:00 és december 24→25 határon, valamint a januári lezáráson ellenőriz; az új terv 564. sora Budapestet ír elő. A jövőbeli Aszteroida óraváltás UNVERIFIED.
5. **Migráció, indítás, cron, e2e — talált hiba:** M-8 index/örökölt sor (L5), A-1 előnézeti sorrend (L2) és A-1/A-2 évadzáró összekötés (L1). A mostani diff nem tartalmaz migrációt vagy futtatóváltozást.
6. **Párhuzamosság, megszakítás — talált hiba:** a WIP-szabály mellett a D-16 nem sorompó (L4). A meglévő képfuttató zárolására a követett átfedéses teszt zöld; az árvazár és a jövőbeli SIGINT-javítás nem volt megvalósítva ebben a diffben.
7. **Tesztminőség — talált hiba:** rossz üzleti elfogadás (L1) és az S9 zöldje nem bizonyítja a pótlást (L9). A diff nem gyengít követett tesztet. A skill elhagyását a konfigurált bemenetből és a követett tesztből ellenőriztem; a munkafában nem végeztem forrásmutációt.
8. **Feladat-specifikus — talált hibák:** döntés és ütemezés (L2, L4), döntés és eszközhatókör (L7), hibás belső hivatkozás (L10). A háromfázisú pár teljes útvonallal, kölcsönösen hivatkozik (terv 6., 588.; végrehajtás 3. sor). A diffben csak a három Markdown-fájl van. A leltárban a P-001…P-068 címsorok, a tervben a 66–133. sorok adják a 68 tételt; az 189–238. sorok számozása 1–50. A végrehajtási készültséget még nem lehet igazolni: az elfogadási lista jövőbeli végrehajtást mér, a már kipipált döntésátvezetés viszont nem ellentmondásmentes.
9. **Egyéb — talált hiba:** a feltételes ítélet megakasztja a dokumentált kiadási utat (L8); a többszeletes tétel elveszítheti maradékát (L11), a P-060 pedig nem viszi tovább a linkrészt (L12).

## Mit próbáltam megtörni, és nem sikerült
- Rossz fejre vagy más ítélettel rögzített review: a `record-review` tesztje elutasítja az eltérést. A helyes teljes tervútvonalat összevetettem a háromfázisú teszt hiányzó tervet és késői utasítást elutasító eseteivel.
- Napváltás Budapesten és évadzárás: a naptár követett határértéktesztjei zöldek. A vizsgált dátum-paraméter nem tartalmaz személyes adatot.
- Párhuzamos adventi képfutás: a követett tesztben a második futás a zár alól olvassa a könyvet és a meglévő képeket. Ez nem bizonyít kemény szolgáltatói költségplafont.

## Mit NEM vizsgáltam
- Az élő GitHub PR-állapot, CI, Render, éles kapcsolók, Kanban és a helyi tulajdonosi forrásanyagok UNVERIFIED. A forrásbeli állításokat nem kevertem össze a távoli státusszal. A leltár helyi átadóit és valamennyi történeti hivatkozását nem tudtam feloldani.
- Nem futtattam éles vagy fizetős műveletet, DB-kört, böngészős/álló–fekvő képernyőmérést vagy élő Windows-hookot: a diff csak dokumentáció, a tervezett felületek és integrációk nem ennek a diffnek a részei. A jövőbeli preview, levélkézbesítés és fiókmigráció működése ezért nincs teljes útvonalon mérve.
- A saját `.blind-review-tmp/dokumentum-proba.mjs` ellenpróbát a futtató megtagadta: az adott Node-verzióval nem tudja kizárni a hálózatot. A szerkezeti és ütemezési ellenpéldák kézi, fájl:sor alapú ellenpróbák; nem mutációs futási eredmények.

## Megcáfolt gyanúk
- A fej egy merge-commit, de a `base...head` diffben nincs alkalmazáskód, teszt, workflow vagy kapukonfiguráció. A második szülőből érkezett fájlok nem részei ennek a változásnak.
- Az S10/1 fizetős lépést önmagában nézve jogosulatlannak gyanítottam. A terv 481. sora külön jóváhagyott D2 próbakeretre hivatkozik, és a végrehajtás 67–68. sora tulajdonosi jóváhagyás nélkül kifejezetten tiltja a hívást. Az A-4 és az S8c éles indítását külön a tulajdonosra bízza. A tényleges engedélyeket nem ellenőriztem.
- A 2026-11-19-i leltár „döntésre vár” sorai önmagukban nem hibák: a terv 10–11. sora kifejezetten változatlan pillanatképként kezeli a leltárt. Ettől külön hiba, ha a végrehajtás maga is elavult állapotot használ (L3).

## Mit futtattam (parancs + eredmény)
- `git diff --stat base...head` az eszközön át: 3 Markdown-fájl, 2530 beszúrás. `git log` és `git show head`/`base`: ág és szülők ellenőrizve. Célzott fájlolvasás és keresés: döntések, fejezethivatkozások, tesztbelépők, cím- és kulcsminták.
- `node --test scripts/qa/three-phase-check.test.mjs scripts/qa/gates/record-review.test.mjs` — 12 átment, 0 bukott.
- `node --test scripts/qa/gates/lib.test.mjs scripts/qa/gates/pre-merge-gate.test.mjs` — 18 átment, 0 bukott.
- `node --test scripts/qa/gates/skills-sync-check.test.mjs` — 3 átment, 0 bukott; a valós fájlokon futó eset csak az öt konfigurált skillt ellenőrzi.
- `npx tsx --test source/tests/no-real-emails-guard.test.ts source/tests/advent-calendar.test.ts` — 12 átment, 0 bukott.
- `npx tsx --test source/tests/open-answer-short.test.ts` — 10 átment, 0 bukott.
- `npx tsx --test source/tests/advent-art-pipeline.test.ts` — 22 átment, 0 bukott; hamis hálózat, átfedő futásokkal.
- `npx tsx --test source/tests/lesson-clip-worker.test.ts` — 34 átment, 0 bukott, 1 POSIX-specifikus eset kihagyva; a párhuzamossági és memóriaőr-eset átment.
- `node .blind-review-tmp/dokumentum-proba.mjs` — a futtató elutasította, nem futott le.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 2 | 2 | 0 | 0 | 0 |
| közepes | 9 | 9 | 0 | 3 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Az A-2 felülírt, körönkénti levélküldést követel — `docs/specs/2026-11-19-websuli-potlasok-terv.md:265` — hivatkozás igazolt
- **L2** (blokkoló) Az A-1 indulása a még meg nem valósított előnézettől függ — `docs/specs/2026-11-19-websuli-potlasok-terv.md:189` — hivatkozás igazolt
- **L3** (közepes) Az I-2 elavult kisfilm-alapállapotot állít beavatkozási célként — `docs/specs/2026-11-19-websuli-potlasok-terv.md:106` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: unit)
- **L4** (közepes) A G-21 indítását nem védi a D-16 szerinti P1-sorrend — `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:216` — hivatkozás igazolt
- **L5** (közepes) Az új sorokra szűkített index nem fedi a régi Gmail-postafiókokat — `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:400` — hivatkozás igazolt
- **L6** (közepes) Az A-3 becsült áras ellenőrzése nem kemény számlázási plafon — `docs/specs/2026-11-19-websuli-potlasok-terv.md:269` — hivatkozás igazolt
- **L7** (közepes) A Q-5 kibővíti a D-13-ban kiválasztott eszközkört — `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:440` — hivatkozás igazolt
- **L8** (közepes) A végrehajtás nem ad szabályos utat feltételes ítélethez — `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:46` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: unit)
- **L9** (közepes) Az S9 zöld ellenőrzése nem vizsgálja az érintett skillt — `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:425` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: unit)
- **L11** (közepes) A többszeletes tétel az első rész után késznek látszik — `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:75` — hivatkozás igazolt
- **L12** (közepes) A P-060 párosítólink-feladata kiesik a tervből — `docs/specs/2026-11-19-websuli-potlasok-terv.md:125` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 30 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 4148
- tokenek: 3371434 bemeneti (ebből gyorsítótárból: 3165582, gyorsítótárba írva: 205762), 18064 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.7%; becsült megtakarítás: 11.8234 USD
- költség (a tényleges usage alapján): 1.0118 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)

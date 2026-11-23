# Független review — `feat/tgm-s2b1-v2`, 2. kör
Fej: 693660f9e031c283f1cbf340e8e2093429430e0c
## Ítélet: NEM

A döntési fa korábbi törését a visszamért mintán javították. A kártyák névterezése javítja a korábbi piros–kék esetet is, de az új átírás érvényes SVG-ből képrészletet tüntethet el, és a tanulónak szánt szöveget is módosíthatja. Mindkettőt a rendes lejátszóban reprodukáltam.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L2 — blokkoló, részben javítva — Érvényes, szóközös SVG-hivatkozásnál eltűnik a kitöltés.** `source/shared/illustration-svg.ts:249`, hívó: `source/client/src/lesson-runtime/blocks/tree-cards.tsx:63–73`. Egy tanuló 844×390-es fekvő telefonon jelzőszínekről szóló leckét nyit meg. A „Zöld téglalap” kártyán csak a felirat látszik, az alakzat nem. A `fill="url( #paint0 )"` átmegy a tisztítón (`illustration-svg.ts:142` kifejezetten elfogadja a belső szóközöket). Az új kód a definíciót `svpr2-paint0`-ra nevezi át, de a hivatkozást `#paint0`-n hagyja. **Mérés:** Chromium, `/preview/review-cards`, szabályos szintetikus tárolt lecke az API-határon, változatlan kliensvalidációval és lejátszóval. A DOM-ban `id="svpr2-paint0"` mellett `fill="url( #paint0 )"` maradt (`1-svg-hibas.jpg`). Amikor csak a hivatkozott ID-t igazítottam a definícióhoz, a szóközöket meghagyva, megjelent a zöld téglalap (`1-svg-egyezo-azonosito.jpg`). A két szóköz nélküli `paint0`-s piros és kék rajz már helyes. **Okozás:** a base tisztítója elfogadta ezt a szintaxist; a kártyarajzoló és az SVG-névterező a diff része. A `236ca37a` kör előtti `CardArt` közvetlenül a tisztított `check.svg`-t illesztette be, nem szakította így szét a definíciót és a hivatkozást. Ez érvényes SVG-ből hibás ábrát ad, és sérti a terv 64–65. sorát. **Javítás:** a tisztított SVG-ben a valódi hivatkozó attribútumokat írd át, a tisztító által elfogadott `url(...)` nyelvtannal. A regressziós próba mindkét szintaxisnál ellenőrizze a saját definícióhoz tartozó kirajzolt kitöltést.

- **L6 — blokkoló, új — A névterezés a tanulónak szánt SVG-feliratot is átírja.** `source/client/src/lesson-runtime/blocks/tree-cards.tsx:65` → `source/shared/illustration-svg.ts:247–250`. Egy SVG-szintaxist tanuló diák olyan képes kártyát nyit meg, amelynek rajzán a `paint0` definícióra mutató `fill=url(#paint0)` példa szerepel szövegként. A diák ehelyett a React-futásból származó `fill=url(#svpr3-paint0)` alakot látja. **Mérés:** ugyanazon a normál előnézeti útvonalon, 844×390-en az eredeti SVG `<text>` tartalma `fill=url(#paint0)`, a DOM `textContent` értéke `fill=url(#svpr3-paint0)`; ez az `1-svg-hibas.jpg` képen is olvasható. A reguláris kifejezés a teljes szerializált rajzon fut, nem csak az attribútumokon. **Base:** sem a base tisztítója, sem a `236ca37a` kártyakódja nem végzett ilyen szövegcserét; az új javító commit vezette be. A hiba szabályos, feliratos SVG-vel előáll, és a tanuló már nem a forrásban szereplő oktatási példát látja. **Javítás:** csak a tisztított SVG DOM `id` és hivatkozó attribútumait módosítsd, a szövegcsomópontokat és az alternatív szöveget ne. A próba ugyanazon SVG-n ellenőrizze az átírt `fill` attribútumot és a betű szerint változatlan `<text>` feliratot.

## Az előző kör leleteinek sorsa

| Lelet | Ítélet | Visszaellenőrzés |
|---|---|---|
| L1 — 13 csomópontos fa | **Megszűnt a visszamért forgatókönyvben.** | `tree-cards.tsx:53`, `lesson-design.css:388–398`: a beágyazott fa lista. A mostani 13 csomópontos négyszögfán 844×390-en mind a 12 ágfeliratnál `scrollWidth − clientWidth = 0` px; a fa és az oldal túlcsordulása is 0 px (`2-fekvo-13-fa.jpg`). A mintát álló telefonon és asztali nézetben is visszamértem. |
| L2 — SVG-ID-ütközés | **Részben szűnt meg.** | A szóköz nélküli `paint0`-s piros/kék esetben külön ID és helyes kitöltés látszik. A tisztító által szintén elfogadott szóközös hivatkozást viszont letöri az átírás; lásd L2 fent. |
| L3 — vezetővonal | **Megszűnt a visszamért esetben.** | `lesson-design.css:375,394–402`: a két ág dobozai közti mért rés 0 px 844×390-en és 1280×800-on; az összekötő mindkét képen folytonos. A számított vonal- és panelszínt vásznon sRGB-re mintavételeztem, majd relatív fénysűrűségből számoltam: 3,35:1 a világos `adventure` és 5,25:1 a sötét `future` mintán. |
| L4 — alapértelmezett ágfelirat | **Megszűnt.** | A terv 67–68. sora felülírja a korábbi mondatot; a kötelező `label` továbbra is a forrásból jön (`lesson-visual-params.ts:158`). |
| L5 — mélységi teszt | **Megszűnt.** | `lesson-tree-cards.test.ts:130–135`: a generátor leghosszabb útja pontosan 3, illetve 4 csomópont; a négyszintű fa összesen 7 csomópontos, így nem a 13-as csomópontkorláton bukik. Mindkét állítás lefutott és zöld. |

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba a megjelenítési határon (L2, L6).** A kártya sémája és tisztítója által átengedett SVG-t a kliens utólag hibásan módosítja. A V29 határtesztjei, a V30 KI lenyomatai és a V31 pozitív `shown` esetei zöldek. A V31 nem vizsgál tényleges kirajzolást: a képes tételnél a nem üres `svg` mező számít (`source/server/studio/gates/source-coverage-gate.ts:196–209`).
2. **Biztonság/adatvédelem — a vizsgált esetben nem találtam rést.** A V29 meglévő szkript/esemény tesztje zöld; az SVG beillesztés előtt tisztítva van. L2 és L6 megjelenítési hiba, nem XSS. A frissítő commit nem vezet be új kérést, URL-paramétert, naplózást, végpontot vagy GET-mellékhatást.
3. **Regresszió — a régi utak mintáit nem sikerült megtörni.** A régi olvasási séma főági lenyomata, a KI gyártási és javítási lenyomatok zöldek. A régi táblázat/szabálydoboz/összehasonlító kártya Chromium-tesztjei zöldek. A névterező egyetlen klienshívója az új `CardArt`; a régi `illustration` nem fut ezen át. A promptkatalógus őre továbbra is pontosan a korábbi hirdetett listát várja (`studio-author-catalog.test.ts:23–49`).
4. **Europe/Budapest — nem alkalmazható.** Az új kód nem olvas vagy számít dátumot, időzónát vagy napváltást.
5. **Migráció, indítás, cron, e2e — migráció/cron változás nincs; az e2e működött.** Nincs DB- vagy Drizzle-diff. Az e2e futtató eldobható PostgreSQL 17-en migrált, a szerver elindult, a napló szerint kihagyta a háttérjobokat, majd a futtató eltávolította az adatbázist. A probe útvonal `VITE_ENABLE_RUNTIME_PROBE` kapuja nem változott.
6. **Párhuzamosság/ismétlés — a módosított renderelésben nem találtam versenyhelyzetet.** A külön `useId` által adott névteret az egyszerre látható piros és kék kártya DOM-ja és eltérő színe visszaigazolta. L2 a hivatkozás alakjától függ, nem a betöltési sorrendtől. A javítás nem vezet be aszinkron feladatot vagy futási állapotot.
7. **Tesztminőség — a két SVG-lelet átcsúszik a zöld őrökön.** A `lesson-tree-cards.test.ts:91–113` a kanonikus alakot ellenőrzi, nem a szóközös változatot vagy a változatlan SVG-feliratot. A mélységi határtesztet javították. A 13 csomópontos böngészőmintán a listás osztályt helyben szélesre cserélve a geometriai ellenőrzés nem jelzett levágást; a külön osztályellenőrzés elvárt értéke így már nem teljesülne. A terv az elrendezés és az ágfelirat változását dokumentálja.
8. **Felület, akadálymentesség, CSS — talált hiba a kártyarajzon; a fa és a kártyakeret mintáit nem sikerült megtörni.** A V32 DOM-szerkezetet és a három nézetet Chromiumban ellenőriztem; az oldal vízszintes túlcsordulása mindháromban 0 px. Megnéztem az álló, fekvő és sötét asztali képeket. Az Igen/Nem ágak közös lista két `li` gyerekei. A fa statikus, a Tab-próba nem mutatott fókuszcsapdát. Mind a nyolc mintaképnek van `role="img"` és neve; a `.sv-pcard` kártyákon nincs `.sv-card` osztály.
9. **Egyéb — talált hiba: a szó szerinti tananyagszöveg átírása (L6).** Az SVG-attribútum és az ugyanolyan karaktersorozatú, látható felirat külön szerepét ellenőriztem: a csere nem különbözteti meg őket.

## Mit próbáltam megtörni, és nem sikerült

- A 13 csomópontos négyszögfa ágfeliratait fekvő telefonon: a lista nem szorítja a leveleket a korábbi keskeny oszlopokba. Az álló nézet és a sötét asztali minta sem mutatott vízszintes túlcsordulást.
- Azonos nevű helyi színátmenettel két kártyát rossz színre kényszeríteni a szóköz nélküli alakban: a névterezett hivatkozások és a képernyőkép szerint különállóak. A szóközös elleneset blokkoló.
- A gyártás KI útjának és a régi tárolt leckék olvasásának megváltozását a követett főági lenyomatokkal: a futtatott esetekben nem volt eltérés.

## Mit NEM vizsgáltam

- Nem futtattam éles modellkérést, nem használtam éles leckét, és nem játszottam végig bejelentkezett Stúdió-gyártást. A böngészős leletekhez a tárolt lecke API-válasza szintetikus volt; a DB-írást és a modellkimenetek gyakoriságát nem méri a próba.
- Nem futtattam WebKit/VoiceOver vagy más képernyőolvasós böngészőpárost és nem vizsgáltam minden paletta–nézet kombinációt. A listaszemantika felolvasása és a ritkább tördelési határesetek UNVERIFIED-ek.
- Nem futott a TS-séma saját, őrsort törlő mutánsa: a futtató Node-verziója miatt a saját parancsot a homokozó elutasította. A követett pontos határteszt és a böngészőbeli osztálymutáció lefutott. A teljes DB-integrációs készlet és a halasztott S2b-2 funkciók nem voltak részei ennek a visszaellenőrzésnek.

## Megcáfolt gyanúk

- Nem a Chromium utasítja el a szóközös SVG-szintaxist: ugyanaz a `url( #… )` alak működik, ha a definíció átírt azonosítójára mutat.
- A 640 px-es médiaküszöb nem teszi az összes fát vízszintessé: 844×390-en a mély fa `sv-tree--list` marad. A 360 px-es Igen/Nem fán a `--wide` osztály mellett is grid a számított elrendezés.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-tree-cards.test.ts source/tests/source-visuals-flag.test.ts source/tests/studio-author-catalog.test.ts` — **28/28 zöld**; a DB nélküli futtató kapcsolódási figyelmeztetései mellett.
- `npx tsx --test source/tests/lesson-source-visual-kinds.test.ts source/tests/source-coverage-gate.test.ts` — **56/56 zöld**.
- `npx tsc --noEmit` — kilépési kód 0.
- `run_e2e source/tests/source-visuals.spec.ts` — **18/18 zöld**, köztük a három új V32 nézet.
- `run_browser_scenario .blind-review-tmp/cards-svg.json` — négy kártya: piros/kék névtér helyes, a zöld kitöltés hiányzik és az SVG-szintaxis felirata átíródik; az ID helyreigazításával a zöld kitöltés megjelenik. Két kép.
- `run_browser_scenario .blind-review-tmp/tree-layout.json` — három nézet, hat kép, fa-, oldal- és kontrasztmérés. Az első, hét képet kérő definíciót a futtató nem futtatta; a hatképes változat lefutott.
- `run_browser_scenario .blind-review-tmp/tree-mutation.json` — osztálymutáció, listaszerkezet és Tab-próba, kilépési kód 0.
- `node .blind-review-tmp/depth-mutation.mjs` — a futtató elutasította (a hálózatot kizáró jogosultság nem érhető el a Node-verzión); nincs mutációs eredmény.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 2 | 2 | 2 | 0 | 0 |
| közepes | 0 | 0 | 0 | 0 | 0 |
| kicsi | 0 | 0 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L2** (blokkoló) Érvényes, szóközös SVG-hivatkozásnál eltűnik a kitöltés — `source/shared/illustration-svg.ts:249` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L6** (blokkoló) A névterezés a tanulónak szánt SVG-feliratot is átírja — `source/client/src/lesson-runtime/blocks/tree-cards.tsx:65` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 22 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2211
- tokenek: 1396289 bemeneti (ebből gyorsítótárból: 1287626, gyorsítótárba írva: 108597), 17433 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.8%; becsült megtakarítás: 4.7844 USD
- költség (a tényleges usage alapján): 0.5747 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)

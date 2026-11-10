import type { Clip } from "../shared/lesson-clip";

/**
 * Spec docs/specs/2026-11-10-fejezet-kisfilmek.md (4.5): KÉZZEL írt kisfilmek. A háttérfolyamat minden körben beírja a hiányzókat,
 * ha a lecke publikált és a fejezetcím betűre egyezik; a kézi sor az automatikusat felülírja, fordítva soha.
 *
 * Az első próba: „Dinamika – összefoglaló a 9. osztályos fizikához” (az élesből 2026-11-10-én letöltött lecke 12 fejezete).
 * Csak a lecke állításai és számai szerepelnek; a `say` hangosan elmondott szöveg, ezért a képlet szavakkal áll benne,
 * a jelölés a képen látszik.
 */
export type ClipSeed = { sectionIndex: number; heading: string; clip: Clip };

const DINAMIKA: ClipSeed[] = [
  {
    sectionIndex: 0,
    heading: "A mozgás leírása: hely, pálya, út és elmozdulás",
    clip: { v: 1, title: "Út vagy elmozdulás?", scenes: [
      { say: "Hogyan írjuk le, hogy egy test mozog? Ehhez először azt kell megmondanunk, mihez képest.", visual: { kind: "title", emoji: "🧭", text: "A mozgás leírása" } },
      { say: "A vonatkoztatási rendszer megmondja, mihez képest és mikor adjuk meg a test helyét. Mozgás akkor van, ha ez a hely változik az időben.", visual: { kind: "idea", emoji: "📍", text: "Vonatkoztatási rendszer: mihez képest és mikor?" } },
      { say: "A pálya az a görbe, amelyen a test halad. A megtett út ennek a görbének a hossza.", visual: { kind: "motion", actor: "🏃", effect: "orbit", caption: "Pálya: a befutott görbe · út: a görbe hossza" } },
      { say: "Az elmozdulás egyetlen nyíl a kezdőpontból a végpontba. Csak a két pont számít, és iránya is van.", visual: { kind: "compare", left: { emoji: "〰️", label: "Út: a görbe hossza" }, right: { emoji: "➡️", label: "Elmozdulás: nyíl A-ból B-be" }, verdict: "Nem ugyanaz!" } },
      { say: "A futó lefut egy négyszáz méteres kört, és a rajtvonalnál áll meg. Az út négyszáz méter, az elmozdulás mégis nulla.", visual: { kind: "formula", parts: [{ t: "s = 400 m", note: "megtett út" }, { t: "Δs = 0 m", note: "elmozdulás" }], caption: "Egy teljes kör után a kezdő- és a végpont ugyanaz." } },
    ] },
  },
  {
    sectionIndex: 1,
    heading: "Egyenes vonalú egyenletes mozgás és a sebesség",
    clip: { v: 1, title: "Egyenletes mozgás és sebesség", scenes: [
      { say: "A legegyszerűbb mozgás az egyenes vonalú egyenletes mozgás. Erre épül minden további.", visual: { kind: "title", emoji: "🚴", text: "Egyenes vonalú egyenletes mozgás" } },
      { say: "A pálya egyenes, és az út egyenesen arányos az idővel: kétszer annyi idő alatt kétszer annyi utat tesz meg a test.", visual: { kind: "motion", actor: "🚴", effect: "slide", caption: "Kétszer annyi idő → kétszer annyi út" } },
      { say: "A sebesség a megtett út és a hozzá szükséges idő hányadosa. Egyenletes mozgásnál állandó, a gyorsulás pedig nulla.", visual: { kind: "formula", parts: [{ t: "v = s/t", note: "sebesség" }, { t: "s = v · t", note: "út" }, { t: "a = 0", note: "gyorsulás" }] } },
      { say: "A kerékpáros kétszáznegyven másodperc alatt ezerkétszáz métert tesz meg. A sebessége öt méter per szekundum, ami tizennyolc kilométer per óra.", visual: { kind: "formula", parts: [{ t: "1200 m : 240 s" }, { t: "= 5 m/s" }, { t: "= 18 km/h" }], caption: "1 m/s = 3,6 km/h" } },
    ] },
  },
  {
    sectionIndex: 2,
    heading: "Egyenletesen változó mozgás és a gyorsulás",
    clip: { v: 1, title: "A gyorsulás", scenes: [
      { say: "Az induló autó nem halad rögtön teljes sebességgel: a sebessége fokozatosan nő.", visual: { kind: "title", emoji: "🚗", text: "Egyenletesen változó mozgás" } },
      { say: "A gyorsulás megmutatja, milyen gyorsan változik a sebesség: a sebességváltozás és az eltelt idő hányadosa.", visual: { kind: "formula", parts: [{ t: "a = Δv/Δt", note: "gyorsulás" }], caption: "Mértékegysége m/s², és iránya is van." } },
      { say: "Két méter per szekundumnégyzet gyorsulás azt jelenti, hogy a sebesség másodpercenként két méter per szekundummal változik.", visual: { kind: "motion", actor: "🚗", effect: "push", caption: "2 m/s²: másodpercenként 2 m/s-mal gyorsabb" } },
      { say: "Az út és a sebesség képlete csak akkor igaz, ha a test álló helyzetből, a kezdőpontból indul.", visual: { kind: "formula", parts: [{ t: "s = a/2 · t²", note: "út" }, { t: "v = a · t", note: "sebesség" }], caption: "Kezdeti feltétel: t = 0-kor s = 0 és v = 0" } },
      { say: "Ha a kocsi két méter per szekundumnégyzettel gyorsul, három másodperc múlva a sebessége hat méter per szekundum, az út kilenc méter.", visual: { kind: "steps", items: [{ emoji: "⏱️", text: "t = 3 s, a = 2 m/s²" }, { emoji: "💨", text: "v = 6 m/s" }, { emoji: "📏", text: "s = 9 m" }] } },
    ] },
  },
  {
    sectionIndex: 3,
    heading: "Szabadesés és a nehézségi gyorsulás",
    clip: { v: 1, title: "Szabadesés", scenes: [
      { say: "Az elejtett kulcscsomó egyre gyorsabban esik. Ez a mozgás a szabadesés.", visual: { kind: "title", emoji: "🔑", text: "Szabadesés" } },
      { say: "Szabadesés a nyugalomból elengedett test tömegvonzás okozta mozgása. Ez az egyenletesen változó mozgás különleges esete.", visual: { kind: "motion", actor: "🔑", effect: "fall", caption: "Nyugalomból indul, egyre gyorsabb" } },
      { say: "A gyorsulás helyére a nehézségi gyorsulás kerül. Értéke átlagosan kilenc egész nyolc tized méter per szekundumnégyzet.", visual: { kind: "formula", parts: [{ t: "s = g/2 · t²", note: "út" }, { t: "v = g · t", note: "sebesség" }, { t: "g = 9,8 m/s²", note: "átlagosan" }] } },
      { say: "Ha nem lenne légellenállás, a Föld egy adott pontján minden test azonos gyorsulással esne. A nehezebb test sem gyorsulna jobban.", visual: { kind: "compare", left: { emoji: "🪨", label: "nehéz test" }, right: { emoji: "🪶", label: "könnyű test" }, verdict: "Légellenállás nélkül azonos gyorsulás" } },
    ] },
  },
  {
    sectionIndex: 4,
    heading: "Erő, tehetetlenség és Newton 1. törvénye",
    clip: { v: 1, title: "A tehetetlenség törvénye", scenes: [
      { say: "Eddig leírtuk a mozgást. Most azt nézzük meg, mi változtatja meg.", visual: { kind: "title", emoji: "🏒", text: "Erő és tehetetlenség" } },
      { say: "Az erőhatás megváltoztatja a test mozgásállapotát vagy alakját. A mértéke az erő, a jele nagy F.", visual: { kind: "idea", emoji: "💪", text: "Erőhatás → változik a mozgásállapot vagy az alak" } },
      { say: "Newton első törvénye szerint minden test nyugalomban vagy egyenes vonalú egyenletes mozgásban marad, amíg erőhatás nem éri.", visual: { kind: "motion", actor: "🏒", effect: "slide", caption: "Erőhatás nélkül a korong egyenletesen halad tovább" } },
      { say: "A mozgás fenntartásához tehát nem kell erő. Erő csak a mozgásállapot megváltoztatásához kell.", visual: { kind: "compare", left: { emoji: "➡️", label: "Mozgás fenntartása: nem kell erő" }, right: { emoji: "🛑", label: "Megváltoztatása: erő kell" } } },
      { say: "Az a vonatkoztatási rendszer, amelyben ez a törvény teljesül, az inerciarendszer. A Newton-törvények csak ilyenben érvényesek.", visual: { kind: "idea", emoji: "🧭", text: "Inerciarendszer: itt érvényesek a Newton-törvények" } },
    ] },
  },
  {
    sectionIndex: 5,
    heading: "Newton 2. törvénye: a dinamika alaptörvénye",
    clip: { v: 1, title: "A dinamika alaptörvénye", scenes: [
      { say: "Az első törvény megmondja, mikor változik a mozgásállapot. A második azt, hogy mennyire.", visual: { kind: "title", emoji: "🛒", text: "Newton 2. törvénye" } },
      { say: "Az erő a saját irányába gyorsítja a testet, és a gyorsulás egyenesen arányos az erővel. Az erő a tömeg és a gyorsulás szorzata.", visual: { kind: "formula", parts: [{ t: "F", note: "erő" }, { t: "= m", note: "tömeg" }, { t: "· a", note: "gyorsulás" }] } },
      { say: "Ugyanaz az erő a nagyobb tömegű testet kevésbé gyorsítja.", visual: { kind: "compare", left: { emoji: "🛒", label: "kis tömeg: nagy gyorsulás" }, right: { emoji: "🚚", label: "nagy tömeg: kis gyorsulás" }, verdict: "Ugyanakkora erő mellett" } },
      { say: "Ha több erő hat, összegezzük őket. Az eredő erő egyenlő a tömeg és a gyorsulás szorzatával, a gyorsulás pedig az eredő irányába mutat.", visual: { kind: "formula", parts: [{ t: "ΣF = m · a", note: "eredő erő" }], caption: "A Σ az összegzést jelenti." } },
      { say: "A négy kilogrammos kiskocsit tíz newton tolja előre, két newton hátra. A gyorsulása két méter per szekundumnégyzet, előre.", visual: { kind: "steps", items: [{ emoji: "➡️", text: "10 N előre, 2 N hátra" }, { emoji: "⚖️", text: "m = 4 kg" }, { emoji: "🚀", text: "a = 2 m/s², előre" }] } },
    ] },
  },
  {
    sectionIndex: 6,
    heading: "Newton 3. törvénye és a súly",
    clip: { v: 1, title: "Hatás és ellenhatás", scenes: [
      { say: "Ha egy testre erőt fejtünk ki, az is visszahat ránk.", visual: { kind: "title", emoji: "🤝", text: "Newton 3. törvénye" } },
      { say: "Az erők mindig párosával lépnek fel: egyenlő nagyságúak és ellentétes irányúak.", visual: { kind: "compare", left: { emoji: "👉", label: "erő" }, right: { emoji: "👈", label: "ellenerő" }, verdict: "Egyenlő nagyság, ellentétes irány" } },
      { say: "Az erő és az ellenerő mindig más-más testre hat, ezért nem oltják ki egymást.", visual: { kind: "idea", emoji: "⚠️", text: "Más-más testre hatnak → nem oltják ki egymást" } },
      { say: "A súly az az erő, amellyel a test a felfüggesztést húzza vagy az alátámasztást nyomja. Nem magára a testre hat.", visual: { kind: "motion", actor: "📕", effect: "bounce", caption: "A könyv súlya az asztalra hat" } },
      { say: "Az öt newton súlyú könyv nyomja az asztalt, az asztal pedig öt newton erővel, felfelé hat a könyvre.", visual: { kind: "steps", items: [{ emoji: "📕", text: "A könyv súlya: G = 5 N, az asztalra hat" }, { emoji: "⬆️", text: "Az asztal: 5 N felfelé, a könyvre hat" }] } },
    ] },
  },
  {
    sectionIndex: 7,
    heading: "Lendület és impulzustétel",
    clip: { v: 1, title: "Erőlökés és lendület", scenes: [
      { say: "Egy erő hatása nemcsak a nagyságától függ, hanem attól is, mennyi ideig hat.", visual: { kind: "title", emoji: "⏱️", text: "Lendület és impulzustétel" } },
      { say: "Az eredő erő és az erőhatás idejének szorzata az erőlökés.", visual: { kind: "formula", parts: [{ t: "F · Δt", note: "erőlökés" }] } },
      { say: "Az impulzustétel szerint a test lendületváltozása megegyezik az őt érő erőlökéssel. Ez Newton második törvényének másik alakja.", visual: { kind: "formula", parts: [{ t: "F · Δt", note: "erőlökés" }, { t: "= ΔI", note: "lendületváltozás" }], caption: "A lendület jele I vagy p, mértékegysége kg · m/s." } },
      { say: "A korongra fél másodpercig húsz newton erő hat. Az erőlökés tíz newtonszekundum, a lendület ugyanennyivel változik.", visual: { kind: "motion", actor: "🏒", effect: "push", caption: "20 N · 0,5 s = 10 N · s" } },
    ] },
  },
  {
    sectionIndex: 8,
    heading: "A lendület megmaradása pontrendszerben",
    clip: { v: 1, title: "A lendület megmarad", scenes: [
      { say: "Most egy test helyett több testből álló pontrendszert vizsgálunk, például két korcsolyázót.", visual: { kind: "title", emoji: "⛸️", text: "Lendületmegmaradás" } },
      { say: "A belső erők a rendszer tagjai között hatnak, a külső erőket a rendszeren kívüli testek fejtik ki.", visual: { kind: "compare", left: { emoji: "🔄", label: "belső erők: a tagok között" }, right: { emoji: "🌍", label: "külső erők: kívülről" } } },
      { say: "A belső erők nem változtatják meg az összlendületet. A zárt pontrendszer összlendülete ezért állandó.", visual: { kind: "idea", emoji: "🔒", text: "Zárt pontrendszer: az összlendület állandó" } },
      { say: "A két korcsolyázó ellöki egymást. Előtte az összlendület nulla volt, ezért utána is nulla marad.", visual: { kind: "motion", actor: "⛸️", effect: "push", caption: "Ellökés előtt és után is 0 az összlendület" } },
      { say: "Ha az egyik lendülete hatvan egység előre, a másiké ugyanekkora, de hátrafelé mutat.", visual: { kind: "steps", items: [{ emoji: "➡️", text: "Az egyik: 60 kg · m/s előre" }, { emoji: "⬅️", text: "A másik: 60 kg · m/s hátra" }] } },
    ] },
  },
  {
    sectionIndex: 9,
    heading: "Súrlódás: tapadás és csúszás",
    clip: { v: 1, title: "Tapadás és csúszás", scenes: [
      { say: "Ha egy nehéz ládát tolunk, először nem mozdul, aztán megcsúszik.", visual: { kind: "title", emoji: "📦", text: "Súrlódás" } },
      { say: "A tapadási súrlódási erő egymáshoz képest nyugvó felületek között lép fel, a csúszási pedig mozgó felületek között.", visual: { kind: "compare", left: { emoji: "🧱", label: "tapadás: nyugvó felületek" }, right: { emoji: "🛷", label: "csúszás: mozgó felületek" }, verdict: "Egyszerre a kettő nem lép fel" } },
      { say: "Amíg az elmozdító erő nem haladja meg a tapadási erő maximumát, a láda áll. Ha meghaladja, csúszni kezd.", visual: { kind: "motion", actor: "📦", effect: "push", caption: "80 N: áll · 120 N: megcsúszik (a maximum 100 N)" } },
      { say: "A csúszási súrlódási erő a súrlódási együttható és a felületeket összenyomó erő szorzata, és a mozgással ellentétes irányú.", visual: { kind: "formula", parts: [{ t: "Fs = μ · Fny" }, { t: "0,3 · 200 N" }, { t: "= 60 N" }], caption: "A mozgással ellentétes irányban." } },
    ] },
  },
  {
    sectionIndex: 10,
    heading: "Munka és teljesítmény",
    clip: { v: 1, title: "Munka és teljesítmény", scenes: [
      { say: "A munka attól függ, mekkora erővel és milyen hosszú úton mozgatunk egy testet.", visual: { kind: "title", emoji: "🗄️", text: "Munka és teljesítmény" } },
      { say: "A munka az erő és az erő irányában történő elmozdulás szorzata.", visual: { kind: "formula", parts: [{ t: "W", note: "munka" }, { t: "= F", note: "erő" }, { t: "· s", note: "elmozdulás" }] } },
      { say: "Nem mindegy, mennyi idő alatt végezzük a munkát. Az átlagos teljesítmény a munka és az idő hányadosa, mértékegysége a watt.", visual: { kind: "formula", parts: [{ t: "Pá = W/t", note: "átlagos teljesítmény" }, { t: "P = F · v", note: "pillanatnyi" }], caption: "1 watt = 1 J / 1 s" } },
      { say: "A szekrényt ötven newton erővel négy méteren át toljuk, tíz másodpercig. A munka kétszáz joule, az átlagos teljesítmény húsz watt.", visual: { kind: "steps", items: [{ emoji: "💪", text: "50 N erő, 4 m út" }, { emoji: "🔧", text: "W = 200 J" }, { emoji: "⚡", text: "10 s alatt: 20 W" }] } },
    ] },
  },
  {
    sectionIndex: 11,
    heading: "Energia: mozgási és helyzeti energia",
    clip: { v: 1, title: "Mozgási és helyzeti energia", scenes: [
      { say: "Az energia eltárolt munka, vagyis munkavégző képesség.", visual: { kind: "title", emoji: "🔋", text: "Energia" } },
      { say: "Az energia a test egy adott állapotát jellemzi, a munka pedig két állapot közti folyamatot ír le.", visual: { kind: "compare", left: { emoji: "📸", label: "energia: állapot" }, right: { emoji: "🎬", label: "munka: folyamat" } } },
      { say: "A mozgási energia a tömeg felének és a sebesség négyzetének szorzata. Negatív nem lehet.", visual: { kind: "formula", parts: [{ t: "Em = ½ · m · v²", note: "mozgási energia" }], caption: "Mértékegysége a joule (J)." } },
      { say: "A munkatétel szerint a testre ható erők eredőjének munkája egyenlő a mozgási energia megváltozásával.", visual: { kind: "formula", parts: [{ t: "W = ΔEm", note: "munkatétel" }] } },
      { say: "Ha a testet a talajról felemeljük, a végzett munka a helyzeti energiájával egyenlő: tömeg szorozva a nehézségi gyorsulással és a magassággal.", visual: { kind: "motion", actor: "⚽", effect: "grow", caption: "Helyzeti energia: W = m · g · h" } },
    ] },
  },
];

/** lessonId → kézi kisfilmek. */
export const CLIP_SEEDS: Readonly<Record<string, readonly ClipSeed[]>> = {
  "1f04037f-bb51-4929-940e-366337ec04b8": DINAMIKA,
};

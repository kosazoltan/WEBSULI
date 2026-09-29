import type { FourChoiceQuiz } from "@/types/gameQuiz";
import { WORD_LADDER_EN } from "./wordLadder/en";

/** Szökőár + általános pool: könnyű (3. oszt.+) */
export const tsunamiQuizEasyMore: FourChoiceQuiz[] = [
  { id: "e29", prompt: "Hogy mondjuk angolul: szürke?", options: ["green", "gray", "gold", "glass"], correctIndex: 1, explanation: "A szürke angolul gray (briteknél grey). A green a zöld — mindkettő g-vel kezdődik, ezért keverednek össze." },
  { id: "e30", prompt: "Hogy mondjuk angolul: rózsaszín?", options: ["purple", "brown", "pink", "black"], correctIndex: 2, explanation: "A rózsaszín angolul pink. A purple a lila, a brown a barna: a pink a legvilágosabb a háromból." },
  { id: "e31", prompt: "Hogy mondjuk angolul: hét (szám)?", options: ["three", "ten", "seven", "seventeen"], correctIndex: 2, explanation: "A hét (szám) angolul seven. A seventeen már tizenhét — a -teen végződés mindig tízzel többet jelent." },
  { id: "e32", prompt: "Hogy mondjuk angolul: nyolc?", options: ["eighteen", "eighty", "eight", "eleven"], correctIndex: 2, explanation: "A nyolc angolul eight. Az eighteen tizennyolc, az eighty nyolcvan: a puszta eight a nyolc." },
  { id: "e33", prompt: "Hogy mondjuk angolul: kilenc?", options: ["nineteen", "nice", "nine", "night"], correctIndex: 2, explanation: "A kilenc angolul nine. A nineteen tizenkilenc, a night pedig éjszaka — csak egy betű a különbség." },
  { id: "e34", prompt: "Hogy mondjuk angolul: tíz?", options: ["two", "twelve", "ten", "twenty"], correctIndex: 2, explanation: "A tíz angolul ten. A twelve tizenkettő, a twenty húsz: a ten a legrövidebb a háromból." },
  { id: "e35", prompt: "Hogy mondjuk angolul: banán?", options: ["berry", "banana", "bread", "butter"], correctIndex: 1, explanation: "A banán angolul banana — három a betűvel, ahogy magyarul is három a-val mondjuk." },
  { id: "e36", prompt: "Hogy mondjuk angolul: eper?", options: ["strawberry", "potato", "pencil", "parent"], correctIndex: 0, explanation: "Az eper angolul strawberry. A berry bogyót jelent, a straw szalmát: a szalmán termő bogyó." },
  { id: "e37", prompt: "Hogy mondjuk angolul: répa?", options: ["corn", "carrot", "cake", "camel"], correctIndex: 1, explanation: "A répa angolul carrot. Két r-rel írjuk, és a c-t k-nak ejtjük: „kerrot”." },
  { id: "e38", prompt: "Hogy mondjuk angolul: tejberizs (egyszerű: rizs)?", options: ["rice", "ice", "race", "rise"], correctIndex: 0, explanation: "A rizs angolul rice. Az ice jég, a race verseny — egyetlen betű dönti el, melyikről van szó." },
  { id: "e39", prompt: "Hogy mondjuk angolul: tojás?", options: ["egg", "eye", "edge", "engine"], correctIndex: 0, explanation: "A tojás angolul egg, két g-vel. Az eye a szem: mindkettő e-vel kezdődik, de az egg rövid és kemény." },
  { id: "e40", prompt: "Hogy mondjuk angolul: sajt?", options: ["chicken", "cheese", "chair", "cheap"], correctIndex: 1, explanation: "A sajt angolul cheese. A chicken csirke: mindkettő ch-val kezdődik, a cheese-t viszont hosszú í-vel ejtjük." },
  { id: "e41", prompt: "Hogy mondjuk angolul: ajtó?", options: ["desk", "door", "doll", "duck"], correctIndex: 1, explanation: "Az ajtó angolul door, két o-val. A desk az íróasztal, a doll a baba." },
  { id: "e42", prompt: "Hogy mondjuk angolul: ágy?", options: ["bag", "bed", "bad", "big"], correctIndex: 1, explanation: "Az ágy angolul bed. A bag táska, a bad rossz: a bed közepén e van, mint az „ebéd” szóban." },
  { id: "e43", prompt: "Hogy mondjuk angolul: óra (eszköz)?", options: ["calendar", "clock", "cloud", "class"], correctIndex: 1, explanation: "Az óra (a szerkezet) angolul clock. A cloud felhő, a class osztály — a clock végén kemény k hang van." },
  { id: "e44", prompt: "Mit jelent: See you later?", options: ["Viszlát később.", "Most azonnal jövök.", "Nem látlak.", "Hol vagy?"], correctIndex: 0, explanation: "A See you later azt jelenti: Viszlát később. Szó szerint „látlak később” — elköszönéskor mondjuk." },
  { id: "e45", prompt: "Mit jelent: Please?", options: ["Köszönöm", "Kérem / Legyen szíves", "Bocsánat", "Igen"], correctIndex: 1, explanation: "A Please jelentése: Kérem / Legyen szíves. Kéréshez tesszük hozzá; a köszönöm az angolban thank you." },
  { id: "e46", prompt: "Hogy mondjuk angolul: ceruza?", options: ["paper", "pencil", "parent", "purple"], correctIndex: 1, explanation: "A ceruza angolul pencil. A pen a toll: a pencilben benne van a pen, csak ceruza a vége." },
  { id: "e47", prompt: "Hogy mondjuk angolul: vonalzó?", options: ["rubber", "ruler", "riddle", "river"], correctIndex: 1, explanation: "A vonalzó angolul ruler. Ugyanez a szó jelent uralkodót is — mindkettő „szabályt szab”." },
  { id: "e48", prompt: "Hogy mondjuk angolul: táska?", options: ["box", "bag", "bus", "bed"], correctIndex: 1, explanation: "A táska angolul bag. A box doboz, a bus busz: a bag puha, a box kemény." },
  { id: "e49", prompt: "Hogy mondjuk angolul: narancs (gyümölcs)?", options: ["onion", "orange", "olive", "ocean"], correctIndex: 1, explanation: "A narancs angolul orange — a gyümölcs és a szín neve ugyanaz. Az onion a hagyma." },
  { id: "e50", prompt: "Hogy mondjuk angolul: szőlő?", options: ["grass", "grape", "green", "great"], correctIndex: 1, explanation: "A szőlő angolul grape. A grass a fű: mindkettő gr-rel kezdődik, a grape viszont hosszú éj hanggal szól." },
  { id: "e51", prompt: "Hogy mondjuk angolul: kenyér?", options: ["butter", "bread", "bridge", "brown"], correctIndex: 1, explanation: "A kenyér angolul bread. A butter a vaj — a kenyérre kenjük, ezért járnak együtt a tanulásban is." },
  { id: "e52", prompt: "Hogy mondjuk angolul: tej?", options: ["milk", "meal", "moon", "mouse"], correctIndex: 0, explanation: "A tej angolul milk. A moon a hold, a mouse az egér: a milk rövid i hanggal szól." },
  { id: "e53", prompt: "Hogy mondjuk angolul: vaj?", options: ["water", "butter", "button", "better"], correctIndex: 1, explanation: "A vaj angolul butter, két t-vel. A water a víz: mindkettő -er-re végződik, de a butter b-vel kezdődik." },
  { id: "e54", prompt: "Hogy mondjuk angolul: asztal?", options: ["table", "turtle", "ticket", "tiger"], correctIndex: 0, explanation: "Az asztal angolul table. A turtle a teknős — hasonlóan hangzanak, de a table-t „téjbl”-nek ejtjük." },
  { id: "e55", prompt: "Mit jelent: Thank you?", options: ["Kérem", "Köszönöm", "Bocsánat", "Szia"], correctIndex: 1, explanation: "A Thank you jelentése: Köszönöm. A kérem az angolban please — a kettő szokott felcserélődni." },
  { id: "e56", prompt: "Mit jelent: Sorry?", options: ["Köszönöm", "Bocsánat", "Viszlát", "Igen"], correctIndex: 1, explanation: "A Sorry jelentése: Bocsánat. Akkor is mondják, ha nem hallottak valamit — ilyenkor „Tessék?” értelme van." },
  { id: "e57", prompt: "Hogy mondjuk angolul: iskolatáska?", options: ["school bag", "school bell", "school bus", "school boy"], correctIndex: 0, explanation: "Az iskolatáska angolul school bag: a school az iskola, a bag a táska — két szó egymás mellett." },
  { id: "e58", prompt: "Hogy mondjuk angolul: tolltartó?", options: ["pencil case", "pencil race", "purple case", "paper chase"], correctIndex: 0, explanation: "A tolltartó angolul pencil case. A case tokot jelent: szó szerint „ceruza-tok”." },
  { id: "e59", prompt: "„Lovacska” (játék) angolul gyakran:", options: ["horse", "house", "hobby", "honey"], correctIndex: 0, explanation: "A ló angolul horse. A house a ház: egyetlen betű a különbség, de a horse-ban ott az r." },
  { id: "e60", prompt: "Hogy mondjuk angolul: bicikli?", options: ["boat", "bike", "bird", "book"], correctIndex: 1, explanation: "A bicikli angolul bike (hosszabban bicycle). A boat csónak, a bird madár — a bike-ot „bájk”-nak ejtjük." },
];

/** Szökőár: közép */
export const tsunamiQuizMedMore: FourChoiceQuiz[] = [
  { id: "em1", prompt: "Hogy mondjuk angolul: szerda?", options: ["Monday", "Wednesday", "Friday", "Sunday"], correctIndex: 1, explanation: "A szerda angolul Wednesday. Az első d-t nem ejtjük („vensz-dé”), de leírni kell — ez a leggyakoribb hiba." },
  { id: "em2", prompt: "Hogy mondjuk angolul: szombat?", options: ["Sunday", "Tuesday", "Saturday", "Thursday"], correctIndex: 2, explanation: "A szombat angolul Saturday. A Sunday a vasárnap: mindkettő S-sel kezdődik, a Saturday viszont hosszabb." },
  { id: "em3", prompt: "Hogy mondjuk angolul: április?", options: ["August", "April", "November", "January"], correctIndex: 1, explanation: "Az április angolul April. Az August az augusztus — mindkettő A-val kezdődik, de az April rövidebb." },
  { id: "em4", prompt: "Hogy mondjuk angolul: október?", options: ["October", "March", "May", "July"], correctIndex: 0, explanation: "Az október angolul October. A hónapneveket az angol mindig nagybetűvel írja." },
  { id: "em5", prompt: "Hogy mondjuk angolul: december?", options: ["November", "December", "October", "January"], correctIndex: 1, explanation: "A december angolul December. A November a november: a hónap sorrendje segít — a December az utolsó." },
  { id: "em6", prompt: "Mit jelent: Nice to meet you.", options: ["Örülök, hogy találkoztunk.", "Menj el.", "Hol a busz?", "Nem érdekel."], correctIndex: 0, explanation: "A Nice to meet you jelentése: Örülök, hogy találkoztunk. Bemutatkozáskor mondjuk, első találkozáskor." },
  { id: "em7", prompt: "Válaszd ki: I have a blue bag.", options: ["Kék táskám van.", "Piros cipőm van.", "Nagy kutya van.", "Hideg a víz."], correctIndex: 0, explanation: "Az I have a blue bag jelentése: Kék táskám van. A have birtoklást fejez ki, a blue a kék szín." },
  { id: "em8", prompt: "Hogy mondjuk angolul: folyó?", options: ["road", "river", "rain", "ring"], correctIndex: 1, explanation: "A folyó angolul river. A road az út, a rain az eső — mindhárom r-rel kezdődik, ezért érdemes együtt tanulni." },
  { id: "em9", prompt: "Hogy mondjuk angolul: hegy?", options: ["mouse", "mountain", "morning", "milk"], correctIndex: 1, explanation: "A hegy angolul mountain. A mouse az egér: az első három betű azonos, de a mountain hosszabb." },
  { id: "em10", prompt: "Hogy mondjuk angolul: tó?", options: ["lake", "lamp", "ladder", "lion"], correctIndex: 0, explanation: "A tó angolul lake. A lamp a lámpa, a lion az oroszlán — a lake-et „lék”-nek ejtjük." },
  { id: "em11", prompt: "Hogy mondjuk angolul: strand?", options: ["bridge", "beach", "bench", "bottle"], correctIndex: 1, explanation: "A strand angolul beach. A bench a pad: egyetlen magánhangzó a különbség, a beach-et hosszú í-vel ejtjük." },
  { id: "em12", prompt: "Hogy mondjuk angolul: szél?", options: ["snow", "wind", "wolf", "world"], correctIndex: 1, explanation: "A szél angolul wind. A snow a hó, a world a világ — a wind rövid i hanggal szól." },
  { id: "em13", prompt: "Hogy mondjuk angolul: felhő?", options: ["clock", "cloud", "clown", "class"], correctIndex: 1, explanation: "A felhő angolul cloud. A clock az óra, a clown a bohóc: a cloud végén d van." },
  { id: "em14", prompt: "Melyik illik: My name ___ Anna.", options: ["is", "are", "am", "be"], correctIndex: 0, explanation: "Egyes szám első személyben a name mellé is is kell: My name is Anna. Az am csak az I mellett áll." },
  { id: "em15", prompt: "Melyik illik: They ___ from Hungary.", options: ["is", "am", "are", "be"], correctIndex: 2, explanation: "A they mellé mindig are jár: They are from Hungary. Az is egyes számhoz, az am csak az I-hez tartozik." },
  { id: "em16", prompt: "Mit jelent: What time is it?", options: ["Hány óra van?", "Mi az időjárás?", "Hol vagy?", "Mi a neved?"], correctIndex: 0, explanation: "A What time is it? jelentése: Hány óra van? Szó szerint „mennyi idő van” — az időpontot kérdezi." },
  { id: "em17", prompt: "Hogy mondjuk angolul: fürdőszoba?", options: ["kitchen", "bedroom", "bathroom", "classroom"], correctIndex: 2, explanation: "A fürdőszoba angolul bathroom: a bath a fürdés, a room a szoba. A bedroom a hálószoba." },
  { id: "em18", prompt: "Hogy mondjuk angolul: konyha?", options: ["kitchen", "chicken", "children", "kitten"], correctIndex: 0, explanation: "A konyha angolul kitchen. A chicken a csirke — nagyon hasonlítanak, de a kitchen k-val kezdődik." },
  { id: "em19", prompt: "Hogy mondjuk angolul: hálószoba?", options: ["bathroom", "bedroom", "classroom", "living room"], correctIndex: 1, explanation: "A hálószoba angolul bedroom: a bed az ágy, a room a szoba. Ahol az ágy van, az a bedroom." },
  { id: "em20", prompt: "Hogy mondjuk angolul: nappali (szoba)?", options: ["living room", "leaving room", "library", "light room"], correctIndex: 0, explanation: "A nappali angolul living room — szó szerint „élő szoba”, ahol a család együtt van." },
  { id: "em21", prompt: "Mit jelent: How are you?", options: ["Hány óra van?", "Hogy vagy?", "Hol vagy?", "Mennyi az ára?"], correctIndex: 1, explanation: "A How are you? jelentése: Hogy vagy? A hogylétet kérdezi; a Hány óra van? az What time is it?." },
  { id: "em22", prompt: "Mit jelent: How old are you?", options: ["Hány éves vagy?", "Milyen magas vagy?", "Hol laksz?", "Mi a neved?"], correctIndex: 0, explanation: "A How old are you? jelentése: Hány éves vagy? Az old itt nem „öreg”, hanem az életkort kérdezi." },
  { id: "em23", prompt: "Melyik illik: I ___ a student.", options: ["am", "is", "are", "be"], correctIndex: 0, explanation: "Az I mellé mindig am jár: I am a student. Ez az egyetlen alany, amelyik am-mel áll." },
  { id: "em24", prompt: "Melyik illik: We ___ in the classroom.", options: ["am", "is", "are", "be"], correctIndex: 2, explanation: "A we mellé are jár: We are in the classroom. Többes számban mindig are, egyes számban is." },
  { id: "em25", prompt: "Hogy mondjuk angolul: busz?", options: ["bike", "bus", "boat", "box"], correctIndex: 1, explanation: "A busz angolul bus. A bike a bicikli, a boat a csónak — mind b-vel, de a bus a legrövidebb." },
  { id: "em26", prompt: "Hogy mondjuk angolul: vonat?", options: ["tree", "train", "truck", "ticket"], correctIndex: 1, explanation: "A vonat angolul train. A tree a fa, a truck a teherautó: a train-t „tréjn”-nek ejtjük." },
  { id: "em27", prompt: "Mit jelent: Excuse me?", options: ["Elnézést / Elnézést kérek", "Gyere ide", "Siess", "Nem érdekel"], correctIndex: 0, explanation: "Az Excuse me jelentése: Elnézést. Akkor mondjuk, ha megszólítunk valakit vagy át kell férnünk mellette." },
  { id: "em28", prompt: "Válaszd ki: She has a red hat.", options: ["Piros kalapja van.", "Kék cipője van.", "Nagy kutyája van.", "Hideg a víz."], correctIndex: 0, explanation: "A She has a red hat jelentése: Piros kalapja van. A has birtoklás, a red a piros, a hat a kalap." },
];

/** Szökőár: nehéz (4–5. oszt.) */
export const tsunamiQuizHardMore: FourChoiceQuiz[] = [
  { id: "eh1", prompt: "Melyik helyes: „Szeretek olvasni.”", options: ["I like read.", "I like reading.", "I like to reading.", "I am like reading."], correctIndex: 1, explanation: "A like után -ing alak áll: I like reading. A to reading kettőzött jelölés, a like read pedig hiányos." },
  { id: "eh2", prompt: "Melyik ige illik: He ___ TV every evening.", options: ["watch", "watches", "watching", "watched"], correctIndex: 1, explanation: "Egyes szám harmadik személyben az ige -s/-es végződést kap: he watches. A watch után -es jön, mert ch-ra végződik." },
  { id: "eh3", prompt: "Melyik mondat helyes?", options: ["She go to school.", "She goes to school.", "She going to school.", "She gos to school."], correctIndex: 1, explanation: "A she mellett az ige -es végződést kap: She goes to school. A go végén o van, ezért goes és nem gos." },
  { id: "eh4", prompt: "Mit jelent: I have never been to London.", options: ["Soha nem voltam Londonban.", "Londonban élek.", "Most megyek Londonba.", "London rossz."], correctIndex: 0, explanation: "Az I have never been to London jelentése: Soha nem voltam Londonban. A have been befejezett élményről szól." },
  { id: "eh5", prompt: "Melyik a helyes: „Ez a legnagyobb.”", options: ["This is the big.", "This is the bigger.", "This is the biggest.", "This is the most big."], correctIndex: 2, explanation: "A legnagyobb angolul the biggest. A rövid mellékneveknél -est a felsőfok, nem most — és a g megkettőződik." },
  { id: "eh6", prompt: "Melyik illik: If it rains, we ___ at home.", options: ["stay", "stays", "staying", "stayed"], correctIndex: 0, explanation: "Az if utáni mellékmondat jelen időben áll, a fő rész pedig: we stay at home. A we mellé nem kerül -s." },
  { id: "eh7", prompt: "Mit jelent: I would like some water.", options: ["Szeretnék egy kis vizet.", "Nem iszom vizet.", "Már ittam.", "Hol a víz?"], correctIndex: 0, explanation: "Az I would like some water jelentése: Szeretnék egy kis vizet. A would like udvarias kérés, nem múlt idő." },
  { id: "eh8", prompt: "Melyik helyes kérdés: „Hol születtél?”", options: ["Where are you born?", "Where were you born?", "Where did you born?", "Where you born?"], correctIndex: 1, explanation: "A helyes kérdés: Where were you born? A születést az angol szenvedő szerkezettel, múlt időben mondja." },
  { id: "eh9", prompt: "Melyik illik: She has lived here ___ 2018.", options: ["for", "since", "from", "at"], correctIndex: 1, explanation: "Időpont előtt since áll: since 2018. A for időtartam elé kerül (for five years) — ez a két szó szokott cserélődni." },
  { id: "eh10", prompt: "Mit jelent: Turn left at the corner.", options: ["Fordulj balra a sarkon.", "Menj egyenesen.", "Állj meg.", "Jobbra kanyarodj."], correctIndex: 0, explanation: "A Turn left at the corner jelentése: Fordulj balra a sarkon. A left a bal, a right a jobb." },
  { id: "eh11", prompt: "Melyik helyes: „Nem tudok úszni.”", options: ["I can't swim.", "I can swim not.", "I don't can swim.", "I not can swim."], correctIndex: 0, explanation: "A tagadás can't swim: a can mellé nem kell don't. A tagadószó az igéhez, nem a főnévhez tapad." },
  { id: "eh12", prompt: "Melyik szó illik: This is ___ interesting book.", options: ["a", "an", "the", "— (nincs)"], correctIndex: 1, explanation: "Magánhangzóval kezdődő szó előtt an áll: an interesting book. Az a csak mássalhangzó előtt jó." },
  { id: "eh13", prompt: "Melyik illik: How ___ apples do you want?", options: ["much", "many", "more", "most"], correctIndex: 1, explanation: "Megszámlálható főnév előtt many áll: How many apples. A much a nem számolható dolgokhoz jár (much water)." },
  { id: "eh14", prompt: "Mit jelent: Be careful!", options: ["Siess!", "Légy óvatos!", "Gyere ide!", "Ne nevess!"], correctIndex: 1, explanation: "A Be careful! jelentése: Légy óvatos! A care gondoskodást jelent, a -ful pedig „tele van vele”." },
  { id: "eh15", prompt: "Melyik helyes: „Segíteni fogok.”", options: ["I will help.", "I helping will.", "I am will help.", "I will helping."], correctIndex: 0, explanation: "A jövő idő: I will help. A will után az ige alapalakja áll, sem -ing, sem am nem kell mellé." },
];

/*
 * Szólétra: a bank 2026-09-29 óta a `wordLadder/en.ts`-ben él, szintekkel és kategóriákkal (spec
 * docs/specs/2026-09-29-palyak-szoletra-nyelvek.md, B szelet). A régi exportnevek a szintek aliasai maradnak
 * (0 = könnyű … 4 = B2); a `__PURE__` jelölés miatt a Szökőár csomagjába nem kerülnek be.
 */
const ladderTier = (tier: number): FourChoiceQuiz[] => WORD_LADDER_EN.filter((q) => q.tier === tier);

/** Szólétra: könnyű (A1) — a 0. szint. */
export const wordLadderEasyMore: FourChoiceQuiz[] = /*#__PURE__*/ ladderTier(0);
/** Szólétra: közepes (A1–A2) — az 1. szint. */
export const wordLadderMedMore: FourChoiceQuiz[] = /*#__PURE__*/ ladderTier(1);
/** Szólétra: nehéz (A2) — a 2. szint. */
export const wordLadderHardMore: FourChoiceQuiz[] = /*#__PURE__*/ ladderTier(2);
/** Szólétra: B1 — a 3. szint. */
export const wordLadderB1: FourChoiceQuiz[] = /*#__PURE__*/ ladderTier(3);
/** Szólétra: B2 — a 4. szint. */
export const wordLadderB2: FourChoiceQuiz[] = /*#__PURE__*/ ladderTier(4);
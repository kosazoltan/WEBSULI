import type { FourChoiceQuiz } from "@/types/gameQuiz";

export type TsunamiCoreSubject = "english" | "math" | "grammar" | "nature";
export type TsunamiSubject = TsunamiCoreSubject | "mixed";

export type TsunamiSubjectQuiz = FourChoiceQuiz & {
  subject: TsunamiCoreSubject;
  explanation?: string;
};

export type SubjectQuizPools = Record<"easy" | "med" | "hard", TsunamiSubjectQuiz[]>;

export const TSUNAMI_SUBJECT_ORDER: TsunamiCoreSubject[] = ["english", "math", "grammar", "nature"];

export const TSUNAMI_SUBJECT_META: Record<TsunamiSubject, { label: string; short: string; chip: string; mission: string }> = {
  english: {
    label: "Angol",
    short: "Szókincs és rövid mondatok",
    chip: "EN",
    mission: "Angol szavak, mondatok és gyors megértés a hullám ellen.",
  },
  math: {
    label: "Matek",
    short: "Fejszámolás és mértékek",
    chip: "MATEK",
    mission: "Számolj gyorsan: minden jó válasz visszanyomja a vizet.",
  },
  grammar: {
    label: "Nyelvtan",
    short: "Szófajok és helyesírás",
    chip: "NYELV",
    mission: "Magyar nyelvtani döntések rövid, játékos helyzetekben.",
  },
  nature: {
    label: "Környezet",
    short: "Élővilág és természet",
    chip: "KÖRNY",
    mission: "Élőlények, évszakok, víz és Föld témák kalandos kvízben.",
  },
  mixed: {
    label: "Vegyes kihívás",
    short: "Minden tantárgyból jön kérdés",
    chip: "MIX",
    mission: "Kaland mód: angol, matek, nyelvtan és környezet váltakozik.",
  },
};

export const TSUNAMI_SUBJECT_QUIZ_BANKS: Record<Exclude<TsunamiCoreSubject, "english">, SubjectQuizPools> = {
  math: {
    easy: [
      { id: "math-e1", subject: "math", prompt: "Mennyi 8 + 7?", options: ["13", "14", "15", "16"], correctIndex: 2, explanation: "8 + 7 = 15." },
      { id: "math-e2", subject: "math", prompt: "Mennyi 6 × 4?", options: ["20", "22", "24", "28"], correctIndex: 2, explanation: "6 négyszerese 24." },
      { id: "math-e3", subject: "math", prompt: "Mennyi 36 ÷ 6?", options: ["4", "5", "6", "8"], correctIndex: 2, explanation: "36-ban a 6 hatszor van meg." },
      { id: "math-e4", subject: "math", prompt: "Hány cm van 1 méterben?", options: ["10", "100", "1000", "60"], correctIndex: 1, explanation: "1 méter = 100 centiméter." },
      { id: "math-e5", subject: "math", prompt: "Melyik szám páros?", options: ["17", "21", "28", "35"], correctIndex: 2, explanation: "A 28 osztható 2-vel." },
    ],
    med: [
      { id: "math-m1", subject: "math", prompt: "Mennyi 48 + 27?", options: ["65", "75", "85", "95"], correctIndex: 1, explanation: "48 + 27 = 75." },
      { id: "math-m2", subject: "math", prompt: "Mennyi 9 × 8?", options: ["64", "72", "81", "98"], correctIndex: 1, explanation: "9 × 8 = 72." },
      { id: "math-m3", subject: "math", prompt: "Mennyi a 30 fele?", options: ["10", "12", "15", "20"], correctIndex: 2, explanation: "30 / 2 = 15." },
      { id: "math-m4", subject: "math", prompt: "Melyik nagyobb?", options: ["3/4", "1/2", "1/4", "2/8"], correctIndex: 0, explanation: "A 3/4 nagyobb, mint az 1/2." },
      { id: "math-m5", subject: "math", prompt: "Egy háromszögnek hány oldala van?", options: ["2", "3", "4", "5"], correctIndex: 1, explanation: "A háromszögnek 3 oldala van." },
    ],
    hard: [
      { id: "math-h1", subject: "math", prompt: "Mennyi 125 - 47?", options: ["68", "78", "88", "98"], correctIndex: 1, explanation: "125 - 47 = 78." },
      { id: "math-h2", subject: "math", prompt: "Mennyi 7 × 12?", options: ["74", "84", "92", "96"], correctIndex: 1, explanation: "7 × 12 = 84." },
      { id: "math-h3", subject: "math", prompt: "Melyik művelet eredménye 56?", options: ["7 × 8", "6 × 9", "64 - 6", "48 + 6"], correctIndex: 0, explanation: "7 × 8 = 56." },
      { id: "math-h4", subject: "math", prompt: "Ha 3 dobozban 8-8 ceruza van, összesen mennyi?", options: ["18", "21", "24", "32"], correctIndex: 2, explanation: "3 × 8 = 24." },
      { id: "math-h5", subject: "math", prompt: "Mennyi 2 óra percben?", options: ["60", "90", "100", "120"], correctIndex: 3, explanation: "1 óra 60 perc, 2 óra 120 perc." },
    ],
  },
  grammar: {
    easy: [
      { id: "gram-e1", subject: "grammar", prompt: "Melyik szó főnév?", options: ["fut", "kék", "asztal", "gyorsan"], correctIndex: 2, explanation: "Az asztal dolog neve, ezért főnév." },
      { id: "gram-e2", subject: "grammar", prompt: "Melyik mondat végére kell kérdőjel?", options: ["Süt a nap", "Hol a tollam", "Kinyitom az ajtót", "Szép a kert"], correctIndex: 1, explanation: "A 'Hol a tollam?' kérdés." },
      { id: "gram-e3", subject: "grammar", prompt: "Melyik szó ige?", options: ["ugrik", "piros", "ház", "lassú"], correctIndex: 0, explanation: "Az ugrik cselekvést fejez ki." },
      { id: "gram-e4", subject: "grammar", prompt: "Melyik a helyes írásmód?", options: ["hajó", "hajo", "hajjó", "hajóó"], correctIndex: 0, explanation: "A hosszú ó-t jelöljük: hajó." },
      { id: "gram-e5", subject: "grammar", prompt: "Melyik szó melléknév?", options: ["futás", "zöld", "iskola", "olvas"], correctIndex: 1, explanation: "A zöld tulajdonságot jelöl." },
    ],
    med: [
      { id: "gram-m1", subject: "grammar", prompt: "Melyik szó többes számú?", options: ["könyv", "könyvek", "könyves", "könyvet"], correctIndex: 1, explanation: "A -k többes szám jele." },
      { id: "gram-m2", subject: "grammar", prompt: "Melyik mondat felszólító?", options: ["Elolvasom.", "Olvasd el!", "Elolvastad?", "Olvasni jó."], correctIndex: 1, explanation: "Az 'Olvasd el!' felszólítás." },
      { id: "gram-m3", subject: "grammar", prompt: "Melyik a rokon értelmű szó a 'vidám' szóra?", options: ["szomorú", "boldog", "lassú", "hideg"], correctIndex: 1, explanation: "A vidám és a boldog hasonló jelentésű." },
      { id: "gram-m4", subject: "grammar", prompt: "Melyik az ellentéte: 'magas'?", options: ["hosszú", "alacsony", "széles", "erős"], correctIndex: 1, explanation: "A magas ellentéte az alacsony." },
      { id: "gram-m5", subject: "grammar", prompt: "Melyik toldalék jelöli gyakran a többes számot?", options: ["-ban", "-hoz", "-k", "-val"], correctIndex: 2, explanation: "A többes szám jele a -k." },
    ],
    hard: [
      { id: "gram-h1", subject: "grammar", prompt: "Melyik mondatban van helyesen a vessző?", options: ["Ha esik az eső, bemegyünk.", "Ha esik, az eső bemegyünk.", "Ha, esik az eső bemegyünk.", "Ha esik az eső bemegyünk,"], correctIndex: 0, explanation: "A tagmondatok közé vessző kerül." },
      { id: "gram-h2", subject: "grammar", prompt: "Melyik szó igekötős ige?", options: ["asztalon", "megír", "szépen", "pirosabb"], correctIndex: 1, explanation: "A megír igekötős ige." },
      { id: "gram-h3", subject: "grammar", prompt: "Melyik a helyes múlt idejű alak?", options: ["futot", "futott", "futottt", "futót"], correctIndex: 1, explanation: "A helyes alak: futott." },
      { id: "gram-h4", subject: "grammar", prompt: "Melyik szó összetett szó?", options: ["ablak", "napraforgó", "szép", "olvas"], correctIndex: 1, explanation: "A napraforgó összetett szó." },
      { id: "gram-h5", subject: "grammar", prompt: "Melyik mondat kijelentő?", options: ["Gyere ide!", "Hol vagy?", "Ma kirándulunk.", "De jó!"], correctIndex: 2, explanation: "A 'Ma kirándulunk.' kijelent valamit." },
    ],
  },
  nature: {
    easy: [
      { id: "nat-e1", subject: "nature", prompt: "Mivel lélegzik a hal?", options: ["tüdővel", "kopoltyúval", "szárnnyal", "levéllel"], correctIndex: 1, explanation: "A hal kopoltyúval lélegzik." },
      { id: "nat-e2", subject: "nature", prompt: "Melyik évszakban hullik le sok fa levele?", options: ["tavasz", "nyár", "ősz", "tél"], correctIndex: 2, explanation: "Ősszel sok lombhullató fa levele lehull." },
      { id: "nat-e3", subject: "nature", prompt: "Mi a Nap?", options: ["bolygó", "csillag", "hold", "felhő"], correctIndex: 1, explanation: "A Nap csillag." },
      { id: "nat-e4", subject: "nature", prompt: "Melyik élőlény növény?", options: ["kutya", "tölgy", "ponty", "veréb"], correctIndex: 1, explanation: "A tölgy fa, tehát növény." },
      { id: "nat-e5", subject: "nature", prompt: "Milyen halmazállapotú a jég?", options: ["folyékony", "szilárd", "légnemű", "por"], correctIndex: 1, explanation: "A jég szilárd halmazállapotú víz." },
    ],
    med: [
      { id: "nat-m1", subject: "nature", prompt: "Mi történik párolgáskor?", options: ["A víz jéggé válik", "A víz gőzzé válik", "A levegő kővé válik", "A talaj eltűnik"], correctIndex: 1, explanation: "Párolgáskor a folyékony vízből vízgőz lesz." },
      { id: "nat-m2", subject: "nature", prompt: "Melyik állat emlős?", options: ["béka", "ponty", "macska", "tyúk"], correctIndex: 2, explanation: "A macska emlős." },
      { id: "nat-m3", subject: "nature", prompt: "Mire van szüksége a növénynek a fotoszintézishez?", options: ["sötétségre", "napfényre", "sóra", "műanyagra"], correctIndex: 1, explanation: "A növény fényt használ a táplálékkészítéshez." },
      { id: "nat-m4", subject: "nature", prompt: "Melyik bolygón élünk?", options: ["Mars", "Föld", "Vénusz", "Jupiter"], correctIndex: 1, explanation: "Mi a Földön élünk." },
      { id: "nat-m5", subject: "nature", prompt: "Miért fontos a szelektív hulladékgyűjtés?", options: ["mert lassítja az órát", "mert segíti az újrahasznosítást", "mert melegíti a vizet", "mert eltünteti a szelet"], correctIndex: 1, explanation: "Az elkülönített hulladék könnyebben újrahasznosítható." },
    ],
    hard: [
      { id: "nat-h1", subject: "nature", prompt: "Mi a víz körforgásának egyik lépése?", options: ["párolgás", "rozsdásodás", "faragás", "hajtogatás"], correctIndex: 0, explanation: "A párolgás része a víz körforgásának." },
      { id: "nat-h2", subject: "nature", prompt: "Melyik változás visszafordítható könnyen?", options: ["papír elégetése", "jég olvadása", "tojás megsütése", "fa elkorhadása"], correctIndex: 1, explanation: "A víz megfagyasztható újra." },
      { id: "nat-h3", subject: "nature", prompt: "Mit nevezünk táplálékláncnak?", options: ["élőlények táplálkozási kapcsolatát", "könyvek sorát", "hegyek láncát", "iskolai sort"], correctIndex: 0, explanation: "A tápláléklánc azt mutatja, ki kit fogyaszt." },
      { id: "nat-h4", subject: "nature", prompt: "Mi védi a Földet a túl sok káros napsugárzástól?", options: ["ózonréteg", "homok", "mágnes", "köd"], correctIndex: 0, explanation: "Az ózonréteg sok káros UV-sugárzást elnyel." },
      { id: "nat-h5", subject: "nature", prompt: "Mi a környezetbarát döntés?", options: ["csöpögő csap nyitva hagyása", "kulacs használata eldobható palack helyett", "szemét erdőbe dobása", "lámpa égve hagyása"], correctIndex: 1, explanation: "A kulacs csökkenti a hulladékot." },
    ],
  },
};

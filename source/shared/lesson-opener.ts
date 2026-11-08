/**
 * Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): Célkártya, 5 mondatos mini mese és játékos (IQ-) kérdezés — gyártási szerződések.
 * Tudásbázis: docs/modszertan-nyitomese-jatekos-kerdezes.md. DOM-mentes, környezeti változót nem olvas (a kapcsoló a szerveren:
 * server/studio/lesson-opener-flag.ts).
 */
export const LESSON_OPENER_VERSION = "nyitomese-1";

export type OpenerStage = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

type StageSpec = {
  grades: string;
  storyForm: string;
  maxSentenceWords: number;
  goalLabels: readonly [goal: string, obstacle: string, why: string, overcome: string];
  lesson: string;
  tone: string;
};

export const OPENER_STAGES: Record<OpenerStage, StageSpec> = {
  L1: { grades: "1–2. évfolyam", storyForm: "állat- vagy fantáziamese bölcs segítővel; a stratégia egy „varázstárgy”, de kimondod, hogy valódi módszer", maxSentenceWords: 10, goalLabels: ["Mit tanulunk ma?", "Mi lehet nehéz?", "Miért?", "Így sikerül!"], lesson: "a recapben egyszerű mondattal kimondva", tone: "meleg, játékos" },
  L2: { grades: "3–4. évfolyam", storyForm: "kaland gyerek- vagy fantáziahőssel; az 5. mondat „Te mit tennél?” típusú kérdés", maxSentenceWords: 12, goalLabels: ["Mit tanulunk ma?", "Mi lehet nehéz?", "Miért?", "Így sikerül!"], lesson: "a recapben kimondva", tone: "meleg, kalandos" },
  L3: { grades: "5–6. évfolyam", storyForm: "életszerű kortárs helyzet vagy kis rejtély; a hős hibázik, a lecke adja a kulcsot", maxSentenceWords: 15, goalLabels: ["Célunk", "Ami nehezítheti", "Miért?", "Hogyan győzd le?"], lesson: "a recapben, a tanuló szemszögéből", tone: "életszerű, nem gyerekes" },
  L4: { grades: "7–8. évfolyam (és programozás)", storyForm: "dilemma, csoporthelyzet vagy döntés; vagy a térképben szereplő esemény jelenetként", maxSentenceWords: 18, goalLabels: ["Célunk", "Ami nehezítheti", "Miért?", "Hogyan győzd le?"], lesson: "a tanuló vonja le; a recap kérdésként zárja", tone: "egyenes, komoly, nem kioktató" },
  L5: { grades: "9–10. évfolyam", storyForm: "esetleírás valósághű helyzetben, ütköző nézőpontokkal, vagy gondolatkísérlet", maxSentenceWords: 22, goalLabels: ["Cél", "Tipikus buktató", "Oka", "Leküzdés"], lesson: "nyitott; a recap az elemzés eredményét mondja ki", tone: "érett, mesélő hang és gyerekes elem nélkül" },
  L6: { grades: "11–12. évfolyam", storyForm: "érett eset vagy szakmai / erkölcsi dilemma, érettségi- és életpálya-vonatkozással", maxSentenceWords: 22, goalLabels: ["Cél", "Tipikus buktató", "Oka", "Leküzdés"], lesson: "nyitott; a recap szintézisként zárja", tone: "érett, akadémiai, mesélő hang és gyerekes elem nélkül" },
};

/**
 * Review #403 (P2): a Célkártya első bekezdésének vezető célcímkéje (a kérdő „Mit tanulunk ma?”, vagy kettősponttal a „Célunk:” / „Cél:”)
 * a kártyaleírásban nem állhat önálló mondatként — a rövidítő különben csak a címkét hagyná meg. A címke nélküli szöveg nagy kezdőbetűvel.
 */
export function stripOpenerGoalLabel(paragraph: string): string {
  const stripped = paragraph.replace(/^(?:Mit tanulunk ma\?\s+|(?:Célunk|Cél)\s*:\s+)/u, "");
  return stripped === paragraph ? paragraph : stripped.charAt(0).toLocaleUpperCase("hu-HU") + stripped.slice(1);
}

/** 0 (programozás) és minden nem pozitív / nem véges érték → L4 (a learningAgeGroup 0 → 7-8 szabályával egyezően); 12 fölött L6. */
export function openerStageForClassroom(classroom: number): OpenerStage {
  if (!Number.isFinite(classroom) || classroom <= 0) return "L4";
  if (classroom <= 2) return "L1";
  if (classroom <= 4) return "L2";
  if (classroom <= 6) return "L3";
  if (classroom <= 8) return "L4";
  if (classroom <= 10) return "L5";
  return "L6";
}

/** A lelki réteg témái (spec 4.3); `minGrade` = a legalacsonyabb évfolyam, amelytől választható. */
export const OPENER_LEARNING_THEMES: ReadonlyArray<{ theme: string; minGrade: number }> = [
  { theme: "halogatás és szervezés", minGrade: 1 }, { theme: "figyelem", minGrade: 1 }, { theme: "türelem és önuralom", minGrade: 1 },
  { theme: "hibától vagy kudarctól való félelem", minGrade: 1 }, { theme: "kitartás", minGrade: 1 }, { theme: "segítségkérés", minGrade: 1 },
  { theme: "együttműködés", minGrade: 1 }, { theme: "változáshoz alkalmazkodás", minGrade: 1 }, { theme: "szükségletek kifejezése", minGrade: 1 },
  { theme: "másság és sokszínűség elfogadása", minGrade: 1 }, { theme: "kíváncsiság, a kérdezés bátorsága", minGrade: 1 },
  { theme: "tökéletességre törekvés", minGrade: 3 }, { theme: "megszólalás mások előtt", minGrade: 3 },
  { theme: "önbizalom, „nem vagyok elég jó” érzés", minGrade: 3 }, { theme: "izgulás dolgozat vagy felelés előtt", minGrade: 3 },
  { theme: "unalom, motiváció hiánya", minGrade: 3 }, { theme: "összehasonlítás és irigység", minGrade: 3 },
  { theme: "csalódás és kudarc feldolgozása", minGrade: 3 }, { theme: "időbeosztás", minGrade: 5 },
  { theme: "képernyő és figyelemelterelés", minGrade: 5 }, { theme: "vita és nézeteltérés kezelése", minGrade: 5 },
  { theme: "felelősségvállalás", minGrade: 5 }, { theme: "forráskritika, álhírek", minGrade: 7 }, { theme: "döntés bizonytalanságban", minGrade: 9 },
];

/** A tanuló évfolyamán választható témák (0 = programozás → 7. évfolyamként). */
export function learningThemesFor(classroom: number): string[] {
  const grade = !Number.isFinite(classroom) || classroom <= 0 ? 7 : classroom;
  return OPENER_LEARNING_THEMES.filter((t) => t.minGrade <= grade).map((t) => t.theme);
}

const SAFETY_ALL = "Biztonság: nincs diagnózis- vagy betegségcímke, terápiás ígéret, megszégyenítés, testi jellemzők kritikája; a nehézséget viselkedésként írod le, a hőst nem címkézed.";
const SAFETY_YOUNG = "1–6. évfolyamon tilos: halál, bántalmazás, válás, betegség, erőszak, félelemkeltő jelenet.";
const SAFETY_OLDER = "7–12. évfolyamon társas nehézség (kirekesztés, csoportnyomás) visszafogottan megengedett, naturalisztikus részlet nélkül.";
const NO_NEW_FACTS = "Új tény NEM kerülhet be: a kitalált keret (szereplő, helyszín, párbeszéd) nem tény; minden tantárgyi állítás a térképből jön. Valós személy vagy esemény csak akkor szerepelhet, ha a térképben van. A két könyv, amelyből a módszer származik, nem forrás: szereplőt, szöveget, feladatot nem veszel át.";
const STORY_ARC = "A mini mese PONTOSAN 5 mondat: (1) hős és helyzet; (2) a lecke tantárgyi problémája és az elakadás, az érzés megnevezésével; (3) segítő vagy felismerés, amely normalizál; (4) a Célkártya stratégiája működés közben; (5) NYITOTT kérdés, amelyre a lecke adja meg a választ.";

const isYoung = (stage: OpenerStage) => stage === "L1" || stage === "L2" || stage === "L3";

function stageLine(stage: OpenerStage): string {
  const s = OPENER_STAGES[stage];
  return `Lépcső: ${stage} — ${s.grades}. Mese: ${s.storyForm}; mondatonként legfeljebb ${s.maxSentenceWords} szó. Célkártya-címkék: ${s.goalLabels.join(" / ")}. Hangnem: ${s.tone}. Tanulság: ${s.lesson}.`;
}

function goalCardLines(labels: readonly string[]): string[] {
  return [
    `- CÉLKÁRTYA: az 1. fejezet ELSŐ blokkja egy \`explain\` blokk (depth "core"), négy rövid bekezdésben (bekezdésenként 1–2 mondat), a lépcső címkéivel, ebben a sorrendben: **${labels[0]}** mit akarunk elérni a lecke végére — megnevezi az 1. fejezet első fogalmát természetes mondatba illesztve (ragozva, kisbetűvel is; címszerű, nagybetűs alakot ne másolj be) és a fő képességet; **${labels[1]}** mi az, ami miatt a cél esetleg nem sikerül (a térkép tévhitei vagy a téma tipikus nehézsége, és/vagy a választott tanulási nehézség); **${labels[2]}** ennek az oka, megszégyenítés nélkül; **${labels[3]}** egy konkrét, megismételhető stratégia, amelyet a mini mese meg is mutat.`,
    "- Az első bekezdés (a cél) egész mondat, címke nélkül is érthető: ez lesz a főoldali kártya leírása.",
  ];
}

/** A Stúdió szerzői promptjának szerződése: Célkártya + 5 mondatos mini mese + visszatérés (évfolyamfüggő). */
export function lessonOpenerContract(classroom: number, opts: { section0InScope?: boolean } = {}): string {
  if (opts.section0InScope === false) {
    return `CÉLKÁRTYA ÉS MINI MESE (${LESSON_OPENER_VERSION}): ebben a célzott javításban az 1. fejezet nem része a kimenetnek — most nincs Célkártya és mini mese, a meglévőt nem érinted.`;
  }
  const stage = openerStageForClassroom(classroom);
  const s = OPENER_STAGES[stage];
  return [
    `CÉLKÁRTYA ÉS MINI MESE (${LESSON_OPENER_VERSION}; az 1. fejezet első két blokkja, utána a tanítás):`,
    `- ${stageLine(stage)}`,
    ...goalCardLines(s.goalLabels),
    `- MINI MESE: az 1. fejezet MÁSODIK blokkja egy \`explain\` blokk (depth "core"). ${STORY_ARC} Mese: ${s.storyForm}. A mese a fogalmat természetes szavakkal idézi fel (a pontos nevét, a term-et, nem kell szó szerint beillesztenie, és címszerű alakot ne másolj be idézőjelben), és azt jelöli.${isYoung(stage) ? " Az 5. mondat előtt egy félmondat arról is szólhat, mit érez a hős." : ""}`,
    "- Mindkét blokk coversConceptIds-ben az 1. fejezet első fogalmát jelöli; a címkét a fejezet tanító blokkja alapozza meg, amely a fogalom nevét (term) szó szerint kimondja. KIVÉTEL: a prompt későbbi, szó szerinti term-et kérő szabálya („A TÖMÖRÍTÉS NEM BONT KAPUT”) erre a két nyitóblokkra NEM vonatkozik — minden más blokkra igen. A tanítás a HARMADIK blokktól a didaktikai ív szerint halad.",
    `- Két réteg: a hős a lecke saját tantárgyi problémájával találkozik, és közben egy tanulási nehézséggel küzd, ezek közül a tantárgyhoz illővel: ${learningThemesFor(classroom).join("; ")}.`,
    "- A Célkártya és a mese a szókereten BELÜL van: a fejezet bevezető mondatait váltják ki, nem adódnak hozzájuk.",
    "- VISSZATÉRÉS: a lecke utolsó recap blokkjának ELSŐ pontja visszatér a mese hőséhez és a Célkártya céljához: mit tanult meg, hogyan segített a stratégia.",
    `- ${NO_NEW_FACTS}`,
    `- ${SAFETY_ALL} ${isYoung(stage) ? SAFETY_YOUNG : SAFETY_OLDER}`,
  ].join("\n");
}

/** A Tananyag lap `check` (kontroll-) kérdéseire vonatkozó IQ- és visszajelzési szabály (Stúdió szerző). */
export const PLAYFUL_AUTHOR_RULES = [
  `JÁTÉKOS (IQ-) ELLENŐRZÉS (${LESSON_OPENER_VERSION}; a Tananyag lap check blokkjai):`,
  "- Ha a leckében van check, legalább egy check IQ-formájú: kakukktojás (pontosan egy védhető helyes válasz), sorminta, analógia, „Melyik állítás hamis?”, vagy következtetés („Ha …, akkor mi igaz?”) — a tanított tartalomból.",
  "- A fejezet első check kérdése könnyű, sikerélményt adó; a nehezebb utána jön.",
  "- A hint (ha adsz) irányt mutat, NEM árulja el a választ.",
  "- feedbackPerOption: helyes válasznál röviden, miért jó; rossz válasznál az első mondat bátorító, utána mi tévesztett meg, mit kérdezett valójában a kérdés, és a helyes gondolatmenet egy mondatban. Az erőfeszítést dicséred, nem minősítesz.",
].join("\n");

/** Lektori ellenőrzőlista (nem blokkoló age jegyzetek; blokkoló biztonsági kapu: S3). */
export const LESSON_OPENER_LEKTOR_CHECKLIST = [
  `CÉLKÁRTYA- ÉS MESE-ELLENŐRZÉS (${LESSON_OPENER_VERSION}): az 1. fejezet első blokkja a Célkártya, a második a mini mese.`,
  "- A mese kitalált kerete (szereplő, helyszín, párbeszéd) NEM tény: emiatt ne adj not_in_map jegyzetet. A Célkártyában és a mesében kimondott TANTÁRGYI állítást ugyanúgy mérd a térképhez, mint bármely más blokkot.",
  "- Ellenőrizd: megvan-e a Célkártya négy eleme (cél, buktató, oka, leküzdés); a mese pontosan 5 mondat-e, benne a tantárgyi probléma, a stratégia és a nyitott kérdés; illik-e a tanuló évfolyamához; visszatér-e a recap első pontja a meséhez és a célhoz.",
  `- Biztonsági sértés (${SAFETY_ALL.replace(/^Biztonság: /, "")} ${SAFETY_YOUNG}): age jegyzet, a message „NYITÓMESE-BIZTONSÁG:” előtaggal, blockPath-tal.`,
  "- Hiányzó elem, rossz mondatszám, évfolyamhoz nem illő forma vagy hiányzó visszatérés: age jegyzet „NYITÓMESE:” előtaggal. Egyik sem blokkoló.",
].join("\n");

/** Játékos (IQ-) kérdezés a bankhoz (statikus: a bank gyorsítótárazott előtagjába kerül, ezért évfolyamfüggetlen). */
export const PLAYFUL_QUESTIONING_CONTRACT = [
  `JÁTÉKOS (IQ-) KÉRDEZÉS (${LESSON_OPENER_VERSION}; a bank minden tételére):`,
  "- Minden csomagban legalább EGY IQ-formájú kvízkérdés és legalább EGY IQ-formájú szöveges feladat — a meglévő darabszámokon belül, nem azokon felül.",
  "- IQ-formák a kvízben (egy helyes válasz): kakukktojás („Melyik nem illik közé?” — csak ha pontosan egy védhető helyes válasz van; a visszajelzés megnevezi a szempontot), sorminta / következő elem, analógia („A úgy aránylik B-hez, mint C …-hoz”), „Melyik állítás hamis?”, találós kérdés (tulajdonságleírásból a fogalom), következtetés („Ha …, akkor mi igaz?”).",
  "- IQ-formák a szöveges feladatban: „Magyarázd el, miért…”, ellenpélda keresése, kakukktojás indoklással, becslés indoklással, „Mi következik, ha…?” — csak olyan kérdés, amelynek a tanított tartalomból EGYÉRTELMŰ kulcsa van. A required SOHA nem üres: legalább egy kötelező csoport a helyes válasz megkülönböztető eleme (amelyet a tipikus hibás válasz nem tartalmaz); a sample teljes pontot ér. Nyitott, kulcs nélküli kreatív kérdés (pl. „írj találós kérdést”) NEM pontozott szöveges feladat.",
  "- Módszerek: prediction = előkérdés, becslés vagy kíváncsiságrés (hibázni szabad); myth = igaz-hamis csapda (hihető, de hamis állítás; a magyarázat megmondja, mi tévesztett meg); popup = találós kérdés; gate = kapurejtvény, csak egyértelmű, általad ellenőrzött megoldással; analogy = analógia; conflict = MINDEN évfolyamon kötelező: tantárgyi feltevés és tény ütköztetése (pl. „Peti szerint…, de a lecke szerint…”), társas vagy erkölcsi dilemma csak 7. évfolyamtól; selfCheck = „magyarázd el, miért”.",
  "- Nehézségi ív: minden csomagban könnyű, sikerélményt adó tétel az első, utána közepes, végül kihívást jelentő.",
  "- Évfolyam szerinti forma: 1–2. konkrét, egylépéses, csapda nélkül (kakukktojás képszerű szavakkal, egyszerű sorminta); 3–4. találós kérdés, kakukktojás, egyszerű analógia; 5–6. hamis állítás keresése indoklással, kétlépéses következtetés; 7–8. többlépéses és laterális kérdés, nyomozós kizárás; 9–12. dilemma, becslés, ellenpélda, „magyarázd el, miért”.",
  "- Visszajelzés a KIMENETI KERETEN belül (kvízopciónként 1 mondat, ≤ 200 karakter; módszer answer legfeljebb 2 mondat): helyes válasznál röviden, miért jó; rossz válasznál EGY mondatba sűrítve egy rövid bátorító nyitás és az, mi tévesztett meg, illetve mit kérdezett valójában a feladat (pl. „Jó próba, de itt a … a kérdés, ezért …”). Az erőfeszítést dicséred, nem minősítesz.",
  "- A játékos keret nem enged új tényt: továbbra is KIZÁRÓLAG a Tananyag lapon ténylegesen megtanított állítás kérdezhető.",
].join("\n");

/** Önálló HTML-út — statikus (évfolyamfüggetlen) rész a gyorsítótárazott spec mögé. */
export const LESSON_OPENER_HTML_CONTRACT = [
  `CÉLKÁRTYA ÉS MINI MESE (${LESSON_OPENER_VERSION}; az 1. lap első két kártyája, utána a tanítás):`,
  "- A tanuló lépcsőjét a téma-rész „Nyitány — Lépcső” sora adja meg. A lépcsők:",
  ...(Object.keys(OPENER_STAGES) as OpenerStage[]).map((st) => `  - ${stageLine(st)}`),
  "- CÉLKÁRTYA (1. kártya): négy rövid bekezdés a lépcső címkéivel: cél (megnevezi a lecke első fogalmát és a fő képességet), buktató (mi miatt nem sikerülhet), oka (megszégyenítés nélkül), leküzdés (konkrét, megismételhető stratégia, amelyet a mese meg is mutat).",
  `- MINI MESE (2. kártya): ${STORY_ARC}`,
  "- A tanuló évfolyamához illő tanulási nehézség a lelki réteg; a Célkártya és a mese a terjedelmen belül marad. A Tananyag lap záró összefoglalójának első pontja visszatér a meséhez és a célhoz.",
  `- ${NO_NEW_FACTS}`,
  `- ${SAFETY_ALL} ${SAFETY_YOUNG} ${SAFETY_OLDER}`,
].join("\n");

/** Önálló HTML-út — évfolyamfüggő sor a téma-részbe. */
export function lessonOpenerStageLine(classroom: number): string {
  return `- Nyitány — ${stageLine(openerStageForClassroom(classroom))} Választható tanulási nehézségek: ${learningThemesFor(classroom).join("; ")}.`;
}

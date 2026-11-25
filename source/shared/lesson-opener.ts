/**
 * Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): Célkártya, 5 mondatos mini mese és játékos (IQ-) kérdezés — gyártási szerződések.
 * Tudásbázis: docs/modszertan-nyitomese-jatekos-kerdezes.md. DOM-mentes, környezeti változót nem olvas (a kapcsoló a szerveren:
 * server/studio/lesson-opener-flag.ts).
 */
import { seedFrom, seededPick } from "./seeded";

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

/**
 * `variety` (S5b vak kör 1, L3): BE állapotban a lépcsősor csak a korosztályt, a mondathosszt, a címkéket, a hangnemet és a tanulságot
 * adja — a nyitás FORMÁJÁT és hosszát kizárólag a kiosztott nyitásforma írja elő (a régi kötött meseforma és az „5. mondat” ellentmondana
 * neki). KI állapotban a sor bájtra a régi.
 */
function stageLine(stage: OpenerStage, variety = false): string {
  const s = OPENER_STAGES[stage];
  const form = variety ? `Mondatonként legfeljebb ${s.maxSentenceWords} szó.` : `Mese: ${s.storyForm}; mondatonként legfeljebb ${s.maxSentenceWords} szó.`;
  return `Lépcső: ${stage} — ${s.grades}. ${form} Célkártya-címkék: ${s.goalLabels.join(" / ")}. Hangnem: ${s.tone}. Tanulság: ${s.lesson}.`;
}

function goalCardLines(labels: readonly string[]): string[] {
  return [
    `- CÉLKÁRTYA: az 1. fejezet ELSŐ blokkja egy \`explain\` blokk (depth "core"), négy rövid bekezdésben (bekezdésenként 1–2 mondat), a lépcső címkéivel, ebben a sorrendben: **${labels[0]}** mit akarunk elérni a lecke végére — megnevezi az 1. fejezet első fogalmát természetes mondatba illesztve (ragozva, kisbetűvel is; címszerű, nagybetűs alakot ne másolj be) és a fő képességet; **${labels[1]}** mi az, ami miatt a cél esetleg nem sikerül (a térkép tévhitei vagy a téma tipikus nehézsége, és/vagy a választott tanulási nehézség); **${labels[2]}** ennek az oka, megszégyenítés nélkül; **${labels[3]}** egy konkrét, megismételhető stratégia, amelyet a mini mese meg is mutat.`,
    `- Az első bekezdés (a cél) is a címkével kezdődik (**${labels[0]}**; a „Célunk” / „Cél” címke után kettősponttal); a címke utáni rész egész mondat: ez lesz a főoldali kártya leírása.`,
  ];
}

/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (11. szakasz): a változatossági kapcsolóval a nyitás formája és a hős neve a
 * kódból, a térkép magjából (a mért egyhangúság: 15 / 15 lecke ugyanazzal a mesével, 15 hősből 9 ugyanaz a három név).
 */
export type OpeningFormGroup = "young" | "middle" | "older";
export type OpeningForm = { id: string; description: string };

export const OPENING_FORMS: Record<OpeningFormGroup, readonly OpeningForm[]> = {
  young: [
    { id: "mese", description: "Állat- vagy fantáziamese bölcs segítővel. A hős elakad a lecke problémájánál, a segítő megmutatja a Célkártya stratégiáját." },
    { id: "rejtely", description: "Kis rejtély: valami eltűnt, furcsán viselkedik vagy nem stimmel. A hős nyomokat gyűjt, és a lecke tudása kell a megfejtéshez." },
    { id: "joslas", description: "„Mit gondolsz?” jóslás: a hős két lehetőség közül választana. A nyitás a tanulót is tippelésre hívja, a választ a lecke adja meg." },
    { id: "helyzet", description: "Hétköznapi helyzet otthon, az iskolában vagy játék közben. A hős valódi gondba kerül, amelyet a lecke tudása old meg." },
    { id: "kihivas", description: "Kihívás: a hős (és a tanuló) egy játékos feladatot kap, amit elsőre nem tud megoldani. A nyitás a kihívást mondja ki, a megoldáshoz a lecke tudása kell." },
    { id: "kepes", description: "Képtalálós: a nyitás egy élénken leírt jelenetet fest le, amelyben valami a lecke témájához kapcsolódik. A hős (és a tanuló) azt keresi, mi a furcsa vagy fontos a képen." },
  ],
  middle: [
    { id: "helyzet", description: "Életszerű kortárs helyzet (iskola, sport, család, internet). A hős hibázik vagy elakad, a lecke adja a kulcsot." },
    { id: "rejtely", description: "Nyomozós rejtély vagy meglepő megfigyelés. A szereplő ellentmondást vesz észre, és a magyarázat a lecke tartalmában rejlik." },
    { id: "joslas", description: "Becslés vagy jóslás: a szereplő (és a tanuló) előre tippel. A nyitás nyitva hagyja, kinek lesz igaza." },
    { id: "dilemma", description: "Döntés két út között egy csoportban vagy egyedül. A jó döntéshez a lecke tudása kell, a nyitás nem árulja el a választ." },
    { id: "kihivas", description: "Kihívás vagy verseny: a szereplő egy feladvány elé kerül, amelynek a megoldása elsőre nem nyilvánvaló. A nyitás a feladványt állítja fel, a megoldás a lecke végére derül ki." },
    { id: "kepes", description: "Képtalálós: a nyitás egy részletesen leírt jelenetet vagy ábrát mutat be. A szereplő (és a tanuló) egy apró, a lecke szempontjából fontos részletet vesz észre benne." },
    { id: "hires-tortenet", description: "Híres történet: egy valódi felfedezés, találmány vagy esemény pillanata, ahol a szereplők a lecke kérdésével néztek szembe. A nyitás a döntő pillanat előtt áll meg." },
  ],
  older: [
    { id: "eset", description: "Valósághű esetleírás ütköző nézőpontokkal. A szereplők érvelnek, és a lecke tartalma dönti el, kinek van igaza." },
    { id: "gondolatkiserlet", description: "Gondolatkísérlet: „Mi történne, ha…?”. A nyitás egy feltevést állít fel, amelynek a következményeit a lecke bontja ki." },
    { id: "dilemma", description: "Szakmai vagy erkölcsi dilemma, érettségi- vagy életpálya-vonatkozással. A nyitás a döntés tétjét mutatja meg, nem a megoldást." },
    { id: "megfigyeles", description: "Meglepő megfigyelés vagy adat a hétköznapokból. A nyitás a meglepetést fogalmazza meg, a magyarázatot a lecke adja." },
    { id: "kihivas", description: "Kihívás: egy nehéz, valós feladvány vagy versenyfeladat, amelynek a tétje világos. A nyitás a feladványt és a tétet mutatja meg, a megoldás módját a lecke adja." },
    { id: "hires-tortenet", description: "Híres történet: egy tudománytörténeti, történelmi vagy irodalmi pillanat, amelyben a lecke kérdése eldőlt. A nyitás a feszültséget építi fel, a magyarázatot a lecke adja." },
  ],
};

/** A nyitóblokk fejléce a kiosztott formából (kódszótár; a lejátszó a jelölő `openingForm` mezőjéből olvassa). */
export const OPENING_FORM_LABEL: Record<string, string> = {
  mese: "Mese", rejtely: "Rejtély", joslas: "Mit gondolsz?", helyzet: "Helyzet", dilemma: "Dilemma", eset: "Eset",
  gondolatkiserlet: "Gondolatkísérlet", megfigyeles: "Megfigyelés", kihivas: "Kihívás", kepes: "Képtalálós", "hires-tortenet": "Híres történet",
};

/** Vegyes nemű magyar keresztnevek — a mért három leggyakoribb (Bence, Dóra, Dóri) nélkül. */
export const HERO_NAMES: readonly string[] = [
  "Anna", "Ábel", "Lili", "Máté", "Zsófi", "Levente", "Emma", "Olivér", "Luca", "Marcell", "Hanna", "Botond", "Réka", "Dániel",
  "Kata", "Áron", "Noémi", "Gergő", "Panna", "Kristóf", "Flóra", "Milán", "Eszter", "Barnabás", "Boglárka", "Zalán", "Petra", "Vince",
  "Jázmin", "Tamás", "Nóra", "Benedek", "Csenge", "Ádám", "Virág", "Soma", "Liza", "Kende", "Rozi", "Huba", "Viktória", "Márk",
];

export function openingFormGroup(classroom: number): OpeningFormGroup {
  const stage = openerStageForClassroom(classroom);
  return stage === "L1" || stage === "L2" ? "young" : stage === "L3" || stage === "L4" ? "middle" : "older";
}

/** Mentett formaazonosító → forma (review #534: a job állapotában rögzített kiosztás visszaolvasása); ismeretlen azonosító → `undefined`. */
export function openingFormById(id: string, classroom?: number): OpeningForm | undefined {
  // S5b 3. vak kör (L8): ugyanaz az azonosító több korcsoportban is szerepel, eltérő leírással — az évfolyam csoportja az első.
  const own = classroom === undefined ? undefined : OPENING_FORMS[openingFormGroup(classroom)].find((f) => f.id === id);
  return own ?? Object.values(OPENING_FORMS).flat().find((f) => f.id === id);
}

/** A forma és a hős a magból (a mag: `seedFrom(mapId)`) — ugyanaz a térkép mindig ugyanazt kapja. */
export function openerVarietyPick(classroom: number, seed: number): { form: OpeningForm; hero: string } {
  return {
    form: seededPick(OPENING_FORMS[openingFormGroup(classroom)], seedFrom(`form\u0001${seed}`))!,
    hero: seededPick(HERO_NAMES, seedFrom(`hero\u0001${seed}`))!,
  };
}

const VARIETY_OPENING_ARC = "A nyitás 3–6 mondat: hős és helyzet; a lecke tantárgyi problémája és az elakadás; felismerés vagy segítő; a Célkártya stratégiája működés közben; a végén NYITOTT kérdés, amelyre a lecke adja meg a választ. A szerkezetet a kiosztott forma alakítja — nem kell minden elemnek külön mondat.";

/** A Stúdió szerzői promptjának szerződése: Célkártya + 5 mondatos mini mese + visszatérés (évfolyamfüggő). */
export function lessonOpenerContract(classroom: number, opts: { section0InScope?: boolean; variety?: { seed: number; form?: OpeningForm } } = {}): string {
  const version = opts.variety ? LESSON_OPENER_VERSION_VARIETY : LESSON_OPENER_VERSION;
  if (opts.section0InScope === false) {
    return `CÉLKÁRTYA ÉS MINI MESE (${version}): ebben a célzott javításban az 1. fejezet nem része a kimenetnek — most nincs Célkártya és mini mese, a meglévőt nem érinted.`;
  }
  const stage = openerStageForClassroom(classroom);
  const s = OPENER_STAGES[stage];
  // Review #611: a futás KIOSZTOTT formája (pl. a sorozatszabállyal eltolt) az előírás; a hős a magból marad.
  const seeded = opts.variety ? openerVarietyPick(classroom, opts.variety.seed) : undefined;
  const pick = seeded && opts.variety?.form ? { ...seeded, form: opts.variety.form } : seeded;
  return [
    `CÉLKÁRTYA ÉS MINI MESE (${version}; az 1. fejezet első két blokkja, utána a tanítás):`,
    `- ${stageLine(stage, Boolean(pick))}`,
    ...goalCardLines(s.goalLabels),
    pick
      ? `- NYITÁS: az 1. fejezet MÁSODIK blokkja egy \`explain\` blokk (depth "core"). Nyitásforma (a program osztotta ki, kötelező): ${OPENING_FORM_LABEL[pick.form.id]} — ${pick.form.description} A hős neve: ${pick.hero}. ${VARIETY_OPENING_ARC} A nyitás a fogalmat természetes szavakkal idézi fel (a pontos nevét, a term-et, nem kell szó szerint beillesztenie, és címszerű alakot ne másolj be idézőjelben), és azt jelöli.`
      : `- MINI MESE: az 1. fejezet MÁSODIK blokkja egy \`explain\` blokk (depth "core"). ${STORY_ARC} Mese: ${s.storyForm}. A mese a fogalmat természetes szavakkal idézi fel (a pontos nevét, a term-et, nem kell szó szerint beillesztenie, és címszerű alakot ne másolj be idézőjelben), és azt jelöli.${isYoung(stage) ? " Az 5. mondat előtt egy félmondat arról is szólhat, mit érez a hős." : ""}`,
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

/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a): a változatossági kapcsolóval (`STUDIO_LESSON_VARIETY`, a szerveren) a
 * bátorító / megerősítő nyitást a lejátszó adja kódszótárból (`shared/lesson-feedback-openers.ts`) — a modell csak az indoklást írja,
 * a szerződés verziója `nyitomese-3` (S5b óta). KI kapcsolónál a régi konstansok bájtra változatlanok.
 */
// S5b (terv 11. szakasz 5. pont): nyitásforma + hősnév a kódból → nyitomese-3.
const LESSON_OPENER_VERSION_VARIETY = "nyitomese-3";
const VARIETY_FEEDBACK_RULE = "Bátorító vagy megerősítő nyitást NE írj — azt a program adja. Rossz válasznál: mi tévesztett meg, mit kérdezett a kérdés, mi a helyes gondolatmenet. Helyes válasznál: röviden, miért jó.";

export function lessonOpenerVersion(variety: boolean): string {
  return variety ? LESSON_OPENER_VERSION_VARIETY : LESSON_OPENER_VERSION;
}

const lineStarting = (text: string, prefix: string): string => text.split("\n").find((l) => l.startsWith(prefix)) ?? prefix;

/** A régi szöveg két helyének cseréje: a verzió a fejlécben és a visszajelzés-sor. A csere pontosságát a teszt méri. */
function withVarietyFeedback(text: string, oldLine: string, newLine: string): string {
  return text.replace(`(${LESSON_OPENER_VERSION};`, `(${LESSON_OPENER_VERSION_VARIETY};`).replace(oldLine, newLine);
}

export function playfulAuthorRules(variety: boolean): string {
  if (!variety) return PLAYFUL_AUTHOR_RULES;
  return withVarietyFeedback(PLAYFUL_AUTHOR_RULES, lineStarting(PLAYFUL_AUTHOR_RULES, "- feedbackPerOption:"), `- feedbackPerOption: ${VARIETY_FEEDBACK_RULE} Az erőfeszítést elismered, nem minősítesz.`);
}

/** Lektori ellenőrzőlista (nem blokkoló age jegyzetek; blokkoló biztonsági kapu: S3). */
export const LESSON_OPENER_LEKTOR_CHECKLIST = [
  `CÉLKÁRTYA- ÉS MESE-ELLENŐRZÉS (${LESSON_OPENER_VERSION}): az 1. fejezet első blokkja a Célkártya, a második a mini mese.`,
  "- A mese kitalált kerete (szereplő, helyszín, párbeszéd) NEM tény: emiatt ne adj not_in_map jegyzetet. A Célkártyában és a mesében kimondott TANTÁRGYI állítást ugyanúgy mérd a térképhez, mint bármely más blokkot.",
  "- Ellenőrizd: megvan-e a Célkártya négy eleme (cél, buktató, oka, leküzdés); a mese pontosan 5 mondat-e, benne a tantárgyi probléma, a stratégia és a nyitott kérdés; illik-e a tanuló évfolyamához; visszatér-e a recap első pontja a meséhez és a célhoz.",
  `- Biztonsági sértés (${SAFETY_ALL.replace(/^Biztonság: /, "")} ${SAFETY_YOUNG}): age jegyzet, a message „NYITÓMESE-BIZTONSÁG:” előtaggal, blockPath-tal.`,
  "- Hiányzó elem, rossz mondatszám, évfolyamhoz nem illő forma vagy hiányzó visszatérés: age jegyzet „NYITÓMESE:” előtaggal. Egyik sem blokkoló.",
].join("\n");

/** S5b: a változatossági kapcsolóval a lektor a kiosztott forma 3–6 mondatos nyitását méri (KI: a régi konstans). */
/**
 * `form` (review #534, Copilot): a szerzőnek TÉNYLEG kiosztott nyitásforma — a lektor ehhez mér (címke + leírás). Forma nélkül (régi
 * checkpointból folytatott futás, régi jelölőjű lecke javítása) a lista nem állít kiosztást: csak a nyitás hosszát méri.
 */
export function lessonOpenerLektorChecklist(variety: boolean, form?: OpeningForm): string {
  if (!variety) return LESSON_OPENER_LEKTOR_CHECKLIST;
  const label = form ? OPENING_FORM_LABEL[form.id] : undefined;
  return LESSON_OPENER_LEKTOR_CHECKLIST
    .replace(`(${LESSON_OPENER_VERSION})`, `(${LESSON_OPENER_VERSION_VARIETY})`)
    .replace("a második a mini mese.", form && label ? `a második a nyitás — a szerzőnek kiosztott forma: ${label} (${form.description})` : "a második a nyitás.")
    .replace("a mese pontosan 5 mondat-e,", form && label ? `a nyitás 3–6 mondat-e és a kiosztott formát (${label}) követi-e,` : "a nyitás 3–6 mondat-e,");
}

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

export function playfulQuestioningContract(variety: boolean): string {
  if (!variety) return PLAYFUL_QUESTIONING_CONTRACT;
  // S5b: a „Peti szerint…” példamondat helyett leírás (a modell különben a példa nevét ismétli).
  const withoutPeti = PLAYFUL_QUESTIONING_CONTRACT.replace("(pl. „Peti szerint…, de a lecke szerint…”)", "(egy megnevezett szereplő téves állítása és a lecke ténye)");
  return withVarietyFeedback(withoutPeti, lineStarting(PLAYFUL_QUESTIONING_CONTRACT, "- Visszajelzés a KIMENETI KERETEN"),
    `- Visszajelzés a KIMENETI KERETEN belül (kvízopciónként 1 mondat, ≤ 200 karakter; módszer answer legfeljebb 2 mondat): ${VARIETY_FEEDBACK_RULE}`);
}

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

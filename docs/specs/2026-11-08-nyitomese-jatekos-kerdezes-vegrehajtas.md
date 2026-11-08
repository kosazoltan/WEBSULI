# Végrehajtás: Célkártya, nyitómese és játékos (IQ-) kérdezés (S1 + S2 + S2b)

> Spec: `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md` (JÓVÁHAGYVA 2026-11-08) · Ág: `feat/nyitomese-jatekos-kerdezes` · Kanban: #6
> Ügynöknek szól. Sorrend kötelező. Minden parancs a `source/` mappából fut, kivéve ahol `C:\Repo\WEBSULI` szerepel.
> Windows: `npm.cmd` / `npx.cmd`. Hookot megkerülni tilos. Meglévő tesztet módosítani tilos.
> Commit: `git -c user.name="Kz" -c user.email="236001384+kosazoltan@users.noreply.github.com" commit -F <scratchpad-fájl>` (C-14, C-19).

## T0 — Alapállapot

1. `git -C C:\Repo\WEBSULI status --short` → üres (a spec és a végrehajtás commitolva).
2. Ha nincs `source/node_modules`: `npm.cmd ci`. Natív hibánál: `npm.cmd run doctor:arch`.
3. Alapvonal: `node --import tsx --test tests/u4-author-pedagogue.test.ts tests/u5-lektor-verifiers.test.ts tests/lesson-html-spec.test.ts tests/prompt-cache.test.ts tests/web-research-agent.test.ts tests/web-research-completion.test.ts tests/lesson-experience.test.ts tests/instruction-bundles.test.ts tests/runtime-knowledge.test.ts tests/lesson-arc.test.ts`
   Elvárt: `# fail 0`. Ha nem 0: STOP, jelentés (nem e munka okozta).

## T1 — Tudásbázis (S1): `docs/modszertan-nyitomese-jatekos-kerdezes.md` (új)

Kötelező szerkezet (a címek szó szerint, ebben a sorrendben):

```
# Célkártya, nyitómese és játékos kérdezés — módszertani tudásbázis
## Miért (bizonyíték és korlát)
## A lecke nyitánya: Célkártya → mini mese → tanítás
## Évfolyamlépcső
### L1 — 1–2. évfolyam
### L2 — 3–4. évfolyam
### L3 — 5–6. évfolyam
### L4 — 7–8. évfolyam és programozás
### L5 — 9–10. évfolyam
### L6 — 11–12. évfolyam
## A lelki réteg: tanulási nehézségek és stratégiák
## Biztonsági és tartalmi korlátok
## Játékos (IQ-) kérdezés
### Formák és helyük
### Mennyiség és nehézségi ív
### Évfolyam szerinti forma
### Visszajelzés és segítség
## Forrásjegyzék és licencek
## Hol él a gyártásban (kódhivatkozások)
```

Tartalom:
- „Miért”: a spec 4.6 ellenőrzött forrásainak megállapításai saját szavakkal; kimondva, hogy az „alkalmazás-nyitó mese javítja a
  tanulást” állításra közvetlen nyílt bizonyíték nincs — ezért mérjük (S2b).
- Nyitány: a spec 4.1 teljes tartalma.
- Minden `### Lx` alatt: a spec 4.2 sora, és **egy saját minta**: Célkártya a lépcső címkéivel (4 bekezdés, 1–2 mondat) + **pontosan
  5 mondatos** mini mese a lépcső mondathosszán belül + egy IQ-kérdés a lecke tartalmából (forma, kérdés, helyes válasz, visszajelzés).
  Tantárgyak: L1 matematika — összeadás tízes átlépéssel; L2 környezetismeret — a víz körforgása; L3 matematika — törtek bővítése;
  L4 történelem — a honfoglalás (csak általánosan ismert tény, kitalált évszám nélkül); L5 fizika — Newton II. törvénye; L6 irodalom
  — a nézőpont szerepe az elbeszélésben. Minden minta alatt egy sor: lelki téma / stratégia / nyitott kérdés / a recap első pontja.
  A minták nem használhatnak szereplőt, nevet, tárgyat vagy cselekményt a két licencelt könyvből.
- Lelki réteg: a spec 4.3 táblázata változatlanul.
- Biztonság: a spec 4.4. Játékos kérdezés: a spec 4.5 (táblázat, mennyiség, ív, évfolyam szerinti forma, visszajelzés).
- Forrásjegyzék: a spec 4.6 táblázata; mondat: a két licencelt könyvből szöveg nem vehető át, csak a módszer.
- Kódhivatkozások: `source/shared/lesson-opener.ts`, `source/server/studio/lesson-opener-flag.ts`, a T5–T8 bekötési helyek.

Ellenőrzés: `rg -c "^### L[1-6]" C:\Repo\WEBSULI\docs\modszertan-nyitomese-jatekos-kerdezes.md` → `6`;
`rg -n "mókus|buborék|türelem köve|varázslista|Vivi|Linó|Roland" C:\Repo\WEBSULI\docs\modszertan-nyitomese-jatekos-kerdezes.md` → nincs találat.

## T2 — Hivatkozás: `docs/lesson-improvement.md`

A `## Kötelező közös módszer` szakasz utolsó bekezdése („Az öt évfolyamsáv (1–2, 3–4, …” kezdetű) után, a
`## Útvonalak, promptok, méret és hibakezelés` cím elé, üres sorral elválasztva:

```
**Célkártya, nyitómese és játékos kérdezés (2026-11-08, kapcsolóval, alapból KI):** tudásbázis
`docs/modszertan-nyitomese-jatekos-kerdezes.md`; gyártási szerződések `source/shared/lesson-opener.ts`. Bekapcsolás:
`STUDIO_LESSON_OPENER=on` — élesben csak az S2b mérés és tulajdonosi döntés után (spec: `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md`).
```

Ellenőrzés: `rg -n "modszertan-nyitomese" C:\Repo\WEBSULI\docs\lesson-improvement.md` → 1 találat.

## T3 — Szerződések: `source/shared/lesson-opener.ts` (új, DOM-mentes, `process.env` nélkül)

Pontosan ez a tartalom:

```ts
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
  "- Visszajelzés (feedbackPerOption és a módszer answer mezője): helyes válasznál röviden, miért jó; rossz válasznál az első mondat bátorító, utána mi tévesztett meg, mit kérdezett valójában a feladat, és a helyes gondolatmenet egy mondatban. Az erőfeszítést dicséred, nem minősítesz.",
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
```

Ellenőrzés: `npm.cmd run check` → hiba nélkül.

## T4 — Kapcsoló: `source/server/studio/lesson-opener-flag.ts` (új)

```ts
/** Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): a Célkártya / mini mese / IQ-kérdezés kapcsolója. Alapból KI. */
export function lessonOpenerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.STUDIO_LESSON_OPENER ?? "").trim().toLowerCase() === "on";
}
```

## T5 — Bekötés: `source/server/studio/step-io.ts`

1. Importok a meglévő `shared/...` importok mellé:
   `import { LESSON_OPENER_LEKTOR_CHECKLIST, PLAYFUL_AUTHOR_RULES, lessonOpenerContract } from "../../shared/lesson-opener";`
   `import { lessonOpenerEnabled } from "./lesson-opener-flag";`
2. `buildAuthorPrompt` `parts` tömbje: a `LESSON_METHOD_CONTRACT,` sor (jelenleg 494.) UTÁN:
   ```ts
   // Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): kapcsolóval (alapból KI) — kikapcsolva a prompt bájtra változatlan.
   ...(lessonOpenerEnabled() ? [lessonOpenerContract(map.classroom, { section0InScope: !repair || repair.targetSections.includes(0) }), PLAYFUL_AUTHOR_RULES] : []),
   ```
3. `buildLektorPrompt`: a `SOURCE_REVIEW_RULES,` sor (jelenleg 622.) UTÁN:
   ```ts
   ...(lessonOpenerEnabled() ? [LESSON_OPENER_LEKTOR_CHECKLIST] : []),
   ```

## T6 — Bekötés: `source/server/studio/experience-builder.ts`

1. Importok: `import { PLAYFUL_QUESTIONING_CONTRACT } from "../../shared/lesson-opener";`, `import { lessonOpenerEnabled } from "./lesson-opener-flag";`
2. `bankStaticPrefix` törzse:
   ```ts
   const base = `${roleSkillBlock("bank")}\n${LESSON_METHOD_CONTRACT}\n${OPEN_ANSWER_RULES_HU}`;
   // Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): kapcsolóval; a bankRequestBlocks ugyanezt hívja, az előtag-egyezés megmarad.
   return lessonOpenerEnabled() ? `${base}\n${PLAYFUL_QUESTIONING_CONTRACT}` : base;
   ```

## T7 — Bekötés: `source/server/ai/lesson-html-spec.ts`

1. Importok: `import { LESSON_OPENER_HTML_CONTRACT, PLAYFUL_QUESTIONING_CONTRACT, lessonOpenerStageLine } from "../../shared/lesson-opener";`,
   `import { lessonOpenerEnabled } from "../studio/lesson-opener-flag";`
2. `lessonHtmlSpecParts` teljes törzse:
   ```ts
   const theme = opts.theme ?? pickLessonTheme(opts.seed, opts.classroom, opts.subjectHint);
   const themeText = lessonThemePrompt(theme, opts.classroom);
   const spec = `${LESSON_HTML_SPEC_V74}\n\n${LESSON_METHOD_CONTRACT}\n\n${HTML_LESSON_DATA_CONTRACT}`;
   // Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): a statikus spec évfolyamfüggetlen marad (KV-cache), a lépcső a téma-részbe kerül.
   return lessonOpenerEnabled()
     ? { theme: `${themeText}\n${lessonOpenerStageLine(opts.classroom)}`, spec: `${spec}\n\n${LESSON_OPENER_HTML_CONTRACT}\n\n${PLAYFUL_QUESTIONING_CONTRACT}` }
     : { theme: themeText, spec };
   ```

## T8 — Bekötés: `source/server/studio/web-research-agent.ts`

1. Importok: `import { LESSON_OPENER_HTML_CONTRACT, PLAYFUL_QUESTIONING_CONTRACT, lessonOpenerStageLine } from "../../shared/lesson-opener";`,
   `import { lessonOpenerEnabled } from "./lesson-opener-flag";`
2. `webLessonAuthorPrompt` tömbje: a `LESSON_METHOD_CONTRACT,` sor (jelenleg 196.) UTÁN:
   ```ts
   ...(lessonOpenerEnabled() ? [LESSON_OPENER_HTML_CONTRACT, lessonOpenerStageLine(classroom), PLAYFUL_QUESTIONING_CONTRACT] : []),
   ```

## T9 — Tesztek: `source/tests/lesson-opener.test.ts` (új)

A kapcsolót állító tesztek a végén visszaállítják (`try … finally`, az előző érték vagy `delete`). Bemenetek:
`map = { title: "T", subject: "matek", classroom: 6, concepts: [{ localId: "c1", examWeight: "core", term: "terület" }] }`,
`sections = [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain"], animationSuggestions: [] }]` (a `tests/u4-author-pedagogue.test.ts`
mintája), lektorhoz `standardFusionFixture()` (`shared/fixtures/lesson-fusion`), HTML-hez `{ classroom: 5, seed: "Vulkánok", subjectHint: "földrajz" }`
és `{ classroom: 9, seed: "Petőfi", subjectHint: "irodalom" }`.

Esetek (külön `test`):
1. A2 `openerStageForClassroom`: 0→L4, 1→L1, 2→L1, 3→L2, 4→L2, 5→L3, 6→L3, 7→L4, 8→L4, 9→L5, 10→L5, 11→L6, 12→L6, −1→L4, 13→L6, NaN→L4.
2. A2 `OPENER_STAGES`: mondathossz-határok 10, 12, 15, 18, 22, 22; minden lépcsőn négy Célkártya-címke; `learningThemesFor(1)` nem
   tartalmazza az „időbeosztás” és a „döntés bizonytalanságban” témát, `learningThemesFor(12)` mind a 24 témát tartalmazza, `learningThemesFor(0)`
   tartalmazza a „forráskritika, álhírek” témát, de a „döntés bizonytalanságban” témát nem.
3. A3 kapcsoló: `lessonOpenerEnabled({})` false; `{ STUDIO_LESSON_OPENER: "on" }` true; `" ON "` true; `"1"` false.
4. A3 szerző: `off` kapcsoló nélkül, `on` `"on"`-nal; `on.replace("\n" + lessonOpenerContract(6, { section0InScope: true }) + "\n" + PLAYFUL_AUTHOR_RULES, "") === off`;
   `off` nem tartalmazza a „CÉLKÁRTYA” szót.
5. A4 szerző (`on`, 6. osztály): tartalmazza: `"Lépcső: L3"`, `"Célunk"`, `"Ami nehezítheti"`, `"Hogyan győzd le?"`, `"PONTOSAN 5 mondat"`,
   `"legfeljebb 15 szó"`, `"Új tény NEM kerülhet be"`, `"term"`, `"recap blokkjának ELSŐ pontja"`, `"1–6. évfolyamon tilos"`,
   `"legalább egy check IQ-formájú"`, `"A hint (ha adsz) irányt mutat"`. 11. osztállyal: `"Lépcső: L6"`, `"Tipikus buktató"`, `"7–12. évfolyamon"`,
   és nem tartalmazza: `"mit érez a hős"`.
6. A5 célzott javítás `on` mellett: `{ targetSections: [1] }` → tartalmazza `"most nincs Célkártya és mini mese"`; `{ targetSections: [0] }` → `"Lépcső: L3"`.
7. A3/A4 lektor: `on.replace("\n" + LESSON_OPENER_LEKTOR_CHECKLIST, "") === off`; `on` tartalmazza: `"NYITÓMESE-BIZTONSÁG:"`, `"ne adj not_in_map jegyzetet"`, `"pontosan 5 mondat"`.
8. A3/A4 bank: `on === off + "\n" + PLAYFUL_QUESTIONING_CONTRACT`; `on` tartalmazza: `"legalább EGY IQ-formájú kvízkérdés"`, `"Melyik állítás hamis?"`, `"mit kérdezett valójában"`.
9. A3/A3b/A4 HTML: `on.spec === off.spec + "\n\n" + LESSON_OPENER_HTML_CONTRACT + "\n\n" + PLAYFUL_QUESTIONING_CONTRACT`; `on.theme === off.theme + "\n" + lessonOpenerStageLine(5)`;
   két évfolyamra `on.spec` azonos; `on.spec`-ben a `/Lépcső: L[1-6]/g` hat találat.
10. A3/A4 webes szerző: `webLessonAuthorPrompt(5, "Törtek — 5. osztály")` `on` mellett tartalmazza a `LESSON_OPENER_HTML_CONTRACT`-ot és a `"Nyitány — Lépcső: L3"` sort;
    `off` nem tartalmazza a „CÉLKÁRTYA” szót.

Futtatás: `node --import tsx --test tests/lesson-opener.test.ts` → `# fail 0`.

## T10 — Teljes ellenőrzés (A6)

1. A T0 parancsa a `tests/lesson-opener.test.ts` fájllal kiegészítve → `# fail 0`.
2. `npm.cmd run check`, `npm.cmd run lint`, `npm.cmd run check:test` → 0 hiba; `npm.cmd test` → `# fail 0`.
3. Önreview: `git -C C:\Repo\WEBSULI diff origin/main --stat` és a teljes diff a spec 7. fejezetéhez mérve.
Bukásnál az implementációt javítod, a tesztet nem gyengíted; a bukó parancsot változatlan bemenettel nem futtatod újra.

## T11 — Csapda, kanban, commit

1. A C-19 bejegyzés kész. Új hiba / tévedés / rossz döntés esetén ugyanebben a körben új `C-2x` bejegyzés a `docs/agent-csapdak.md`-ben.
2. Kanban (`C:\Repo\WEBSULI` mappából): `node C:\Repo\Jack\qualcomm\skills\hermes-kanban-workflow\scripts\kanban.mjs note 6 "<eredmények>"`.
3. Atomi commitok: `docs: Célkártya és nyitómese módszertani tudásbázis (S1)`; `feat(studio): Célkártya, mini mese és IQ-kérdezés szerződései kapcsolóval (S2)`.
   Push és PR csak tulajdonosi kérésre.

## T12 — S2b mérés (jóváhagyva 2026-11-08; fizetős)

0. Módosítás (2026-11-08, végrehajtás közben): a `source/.env`-be került `DATABASE_URL` egy régi adatbázisra mutatott
   (`knowledge_maps` tábla nélkül), ezért a mérés a szkript helyi forrásfájlos módjával (`file:<útvonal>`) fut, éles adatbázis nélkül.
   A három saját forrásszöveg: `docs/measurements/2026-11-08-nyitomese-sources/` (3., 6., 10. évfolyam, általánosan ismert tananyag).
   A kézi rubrikához a `single-run-measure.mts` opcionális `MEASURE_SAVE_LESSON=1` kapcsolója a teljes lecke-JSON-t is kimenti
   (alapból ki; a régi mérések kimenete változatlan). Mindkét ág ugyanazt a fájlt kapja; a kinyerés véletlenje ágonként eltérhet.
1. Térképválasztás (csak olvasás, ha van érvényes éles `DATABASE_URL`): a végrehajtó a `source/scripts/lib/read-only-db.ts` (`withReadOnlyDb`) segítségével egy scratchpad-szkripttel
   listázza a közzétett leckével rendelkező térképeket évfolyammal; sávonként (1–4., 5–8., 9–12.) azt választja, amelynek forrásszövege
   300–2000 szó (közepes forrás, a 2026-10-14-i mérés sávja), azonos feltételnél a legutóbb frissítettet. A választás és indoka a mérési fájlba kerül.
2. Térképenként, a `source/` mappából, háttérfolyamatként, egymás után (egy helyi Docker-Postgres egyszerre):
   ```
   Remove-Item Env:STUDIO_LESSON_OPENER -ErrorAction SilentlyContinue
   npx.cmd tsx scripts/measure/single-run-measure.mts <térkép> nyito-off-<sáv> C:\Repo\WEBSULI\docs\measurements
   $env:STUDIO_LESSON_OPENER = "on"
   npx.cmd tsx scripts/measure/single-run-measure.mts <térkép> nyito-on-<sáv> C:\Repo\WEBSULI\docs\measurements
   Remove-Item Env:STUDIO_LESSON_OPENER
   ```
   Futás közben aktív ellenőrzés (AGENTS.md „Aktív munkafázis-követés”); a várakozás a T1 tudásbázis befejezésével / csapdakatalógussal telik.
3. Összesítés: `docs/measurements/2026-11-08-nyitomese-ab.json` (a futás tényleges dátumával): ágonként látható szó, kapu- és ív-eredmény,
   Célkártya és mese szó-/mondatszáma, IQ-formájú kvíz / feladat / `check` darabszám (kézi számolás), rubrika (spec A7). A specbe rövid
   összegzés (Állapot sor + 7. fejezet A7 pipa vagy NOT DONE + ok).

## T13 — Review #403 javításai (Copilot, 2026-11-08)

1. `source/server/studio/experience-builder.ts` `unitTeaching`: bekapcsolt kapcsolónál `opener: LESSON_OPENER_VERSION` a csomag
   hash-bemenetében; bekapcsolva a bankterv egysége `opener: LESSON_OPENER_VERSION` jelölőt kap (`bankUnitSchema.opener`, opcionális),
   és a korábbi bank (`unchangedPreviousUnit`) csak azonos jelölővel vehető át (Vercel-review: a lektorált csomag `sourceHash`-e nem a
   tanítás hash-e, ezért nem a hash-egyezés dönt). Kikapcsolva a hash, az átvétel és a kimenet változatlan.
   Teszt: `tests/lesson-opener-bank-reuse.test.ts` (KI: nincs jelölő; KI → BE: újragyártás; BE → BE: átvétel azonos azonosítókkal).
2. `lessonOpenerContract`: kivétel a két nyitóblokkra a prompt későbbi szó szerinti term-szabálya („A TÖMÖRÍTÉS NEM BONT KAPUT”) alól.
3. `PLAYFUL_QUESTIONING_CONTRACT`: a `conflict` minden évfolyamon kötelező (tantárgyi feltevés–tény ütköztetés), dilemma csak 7.-től.
4. `stripOpenerGoalLabel` (`lesson-opener.ts`) + `source/shared/lesson-teaser.ts`: a vezető célcímke („Mit tanulunk ma?”, „Célunk:”,
   „Cél:”) nem maradhat a kártyaleírás egyetlen mondata.
5. `docs/measurements/2026-11-08-nyitomese-ab.json` `opus.rubrika`: a teljes kézi rubrika (forma, biztonság, új tény).
Tesztek: `tests/lesson-opener.test.ts` két új eset (term-kivétel + conflict; célcímke és hosszú célbekezdés teaser).
6. `source/shared/lesson-teaser.ts` `descriptionAfterLessonChange`: a címkeleválasztás előtti (régi) automatikus leírást is automatikusnak veszi (Copilot-review, 2026-11-08); teszt a `lesson-opener.test.ts`-ben (rövid és levágott célbekezdés).

# Végrehajtás: Nyitómese és játékos kérdezés (S1 + S2, S2b előkészítve)

> Spec: `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md` · Ág: `feat/nyitomese-jatekos-kerdezes` · Kanban: #6
> Ügynöknek szól. Sorrend kötelező. Minden parancs a `source/` mappából fut, kivéve ahol `C:\Repo\WEBSULI` szerepel.
> Windows: `npm.cmd` / `npx.cmd`. Hookot megkerülni (`--no-verify`) tilos. Meglévő tesztet módosítani tilos.

## T0 — Alapállapot

1. `git -C C:\Repo\WEBSULI status --short` → csak a két spec-fájl (vagy üres, ha már commitolva).
2. Ha nincs `source/node_modules`: `npm.cmd ci`. Natív hibánál: `npm.cmd run doctor:arch`.
3. Alapvonal (a változás előtt):
   `node --import tsx --test tests/u4-author-pedagogue.test.ts tests/u5-lektor-verifiers.test.ts tests/lesson-html-spec.test.ts tests/prompt-cache.test.ts tests/web-research-agent.test.ts tests/web-research-completion.test.ts tests/lesson-experience.test.ts tests/instruction-bundles.test.ts tests/runtime-knowledge.test.ts tests/lesson-arc.test.ts`
   Elvárt: `# fail 0`. Ha nem 0: STOP, a hibát jelentsd (nem e munka okozta).

## T1 — Tudásbázis (S1): `docs/modszertan-nyitomese-jatekos-kerdezes.md` (új)

Kötelező szerkezet, ebben a sorrendben (a címek szó szerint):

```
# Nyitómese és játékos kérdezés — módszertani tudásbázis
## Miért (bizonyíték és korlát)
## A nyitómese dramaturgiája
## Évfolyamlépcső
### L1 — 1–2. évfolyam
### L2 — 3–4. évfolyam
### L3 — 5–6. évfolyam
### L4 — 7–8. évfolyam és programozás
### L5 — 9–10. évfolyam
### L6 — 11–12. évfolyam
## A lelki réteg: tanulási nehézségek és stratégiák
## Biztonsági és tartalmi korlátok
## Játékos kérdezés
### Formák és a meglévő módszertípusok
### Visszajelzés és segítség
### Évfolyam szerinti feladatforma
## Forrásjegyzék és licencek
## Hol él a gyártásban (kódhivatkozások)
```

Tartalmi követelmények:
- „Miért”: a spec 4.6 ellenőrzött forrásainak megállapításai saját szavakkal (SAGA: a mese utáni „mit érezhetett?” beszélgetés hatása;
  biblioterápia: iskolai keret, nem klinikai; tesztelési hatás: a felidézés tartósabb, mint az újraolvasás). Kimondva: az „alkalmazás-nyitó
  mese javítja a tanulást” állításra közvetlen nyílt bizonyíték NINCS — ez következtetés, ezért mérjük (S2b).
- Dramaturgia: a spec 4.1 hét lépése.
- Minden `### Lx` alatt: a spec 4.2 sora (forma, hossz, tanulság), hangnem, és **egy saját mintamese** a lépcső hosszhatárán belül, a lépcső
  tantárgyával: L1 matematika — összeadás tízes átlépéssel; L2 környezetismeret — a víz körforgása; L3 matematika — törtek bővítése;
  L4 történelem — a honfoglalás (csak általánosan ismert, térképbe illő tény, nincs kitalált évszám); L5 fizika — Newton II. törvénye;
  L6 irodalom — a nézőpont szerepe az elbeszélésben. Minden mintamese után egy sor: tantárgyi probléma / lelki réteg / stratégia /
  nyitott kérdés / a recap első pontja. A mintamesék nem használhatnak szereplőt, nevet, tárgyat vagy cselekményt a két licencelt könyvből
  (nincs mókus-lista, halbuborék, türelemkő, „varázslista”).
- Lelki réteg: a spec 4.3 listája; mindegyikhez egy konkrét, megismételhető stratégia egy mondatban.
- Biztonság: a spec 4.4 teljes szövege.
- Játékos kérdezés: a spec 4.5 teljes tartalma, plusz egy táblázat: forma | módszertípus | készség | évfolyam | segítség | visszajelzés.
- Forrásjegyzék: a spec 4.6 táblázata változatlanul, a licencállapottal; külön mondat: a két licencelt könyvből szöveg nem vehető át,
  csak a módszer.
- Kódhivatkozások: `source/shared/lesson-opener.ts`, `source/server/studio/lesson-opener-flag.ts`, és a T5–T8 bekötési helyek.

Ellenőrzés: `rg -c "^### L[1-6]" C:\Repo\WEBSULI\docs\modszertan-nyitomese-jatekos-kerdezes.md` → `6`.
`rg -n "mókus|buborék|türelem köve|varázslista" C:\Repo\WEBSULI\docs\modszertan-nyitomese-jatekos-kerdezes.md` → nincs találat.

## T2 — Hivatkozás: `docs/lesson-improvement.md`

A `## Kötelező közös módszer` szakasz (jelenleg 27. sor) utolsó bekezdése („Az öt évfolyamsáv (1–2, 3–4, …” kezdetű) után,
a `## Útvonalak, promptok, méret és hibakezelés` cím elé, üres sorral elválasztva, új bekezdés:

```
**Nyitómese és játékos kérdezés (2026-11-08, kapcsolóval, alapból KI):** a módszertani tudásbázis
`docs/modszertan-nyitomese-jatekos-kerdezes.md`; a gyártási szerződések `source/shared/lesson-opener.ts`. Bekapcsolás:
`STUDIO_LESSON_OPENER=on` — élesben csak a `story` blokktípus (S3) után (spec: `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md`).
```

Ellenőrzés: `rg -n "modszertan-nyitomese" C:\Repo\WEBSULI\docs\lesson-improvement.md` → 1 találat.

## T3 — Szerződések: `source/shared/lesson-opener.ts` (új, DOM-mentes, `process.env` nélkül)

Pontosan ez a tartalom (a szövegek a spec 4. fejezetének gyártási alakjai; tulajdonosi átnézés tárgya):

```ts
/**
 * Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): a nyitómese és a játékos kérdezés gyártási szerződései.
 * Tudásbázis: docs/modszertan-nyitomese-jatekos-kerdezes.md. DOM-mentes, környezeti változót nem olvas (a kapcsoló a
 * szerveren: server/studio/lesson-opener-flag.ts).
 */
export const LESSON_OPENER_VERSION = "nyitomese-1";

export type OpenerStage = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

type StageSpec = { grades: string; form: string; minWords: number; maxWords: number; lesson: string; tone: string };

export const OPENER_STAGES: Record<OpenerStage, StageSpec> = {
  L1: { grades: "1–2. évfolyam", form: "állat- vagy fantáziamese bölcs segítővel; a stratégia egy „varázstárgy”, de kimondod, hogy valódi módszer", minWords: 50, maxWords: 90, lesson: "a mese végén kimondva, és a recapben is", tone: "meleg, játékos; mondatonként legfeljebb 12 szó" },
  L2: { grades: "3–4. évfolyam", form: "kaland gyerek- vagy fantáziahőssel, küldetéssel; a mese végén „Te mit tennél?” kérdés", minWords: 70, maxWords: 110, lesson: "a recapben kimondva", tone: "meleg, kalandos, rövid mondatok" },
  L3: { grades: "5–6. évfolyam", form: "életszerű kortárs helyzet vagy kis rejtély; a hős hibázik, a lecke adja a kulcsot", minWords: 80, maxWords: 130, lesson: "a recapben, a tanuló szemszögéből", tone: "életszerű, nem gyerekes" },
  L4: { grades: "7–8. évfolyam (és programozás)", form: "dilemma, csoporthelyzet, igazságosság vagy döntés; vagy a térképben szereplő esemény jelenetként", minWords: 90, maxWords: 140, lesson: "a tanuló vonja le; a recap kérdésként zárja", tone: "egyenes, komoly, nem kioktató" },
  L5: { grades: "9–10. évfolyam", form: "esetleírás valósághű helyzetben, ütköző nézőpontokkal, vagy gondolatkísérlet", minWords: 100, maxWords: 160, lesson: "nyitott; a recap az elemzés eredményét mondja ki", tone: "érett, mesélő hang és gyerekes elem nélkül" },
  L6: { grades: "11–12. évfolyam", form: "érett eset vagy szakmai / erkölcsi dilemma, érettségi- és életpálya-vonatkozással", minWords: 100, maxWords: 170, lesson: "nyitott; a recap szintézisként zárja", tone: "érett, akadémiai, mesélő hang és gyerekes elem nélkül" },
};

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

export const OPENER_LEARNING_THEMES = [
  "halogatás és szervezés", "figyelem", "türelem és önuralom", "hibától vagy kudarctól való félelem", "kitartás",
  "segítségkérés", "együttműködés", "tökéletességre törekvés", "megszólalás mások előtt",
] as const;

const SAFETY_ALL = "Biztonság: nincs diagnózis- vagy betegségcímke, terápiás ígéret, megszégyenítés, testi jellemzők kritikája; a nehézséget viselkedésként írod le, a hőst nem címkézed.";
const SAFETY_YOUNG = "1–6. évfolyamon tilos: halál, bántalmazás, válás, betegség, erőszak, félelemkeltő jelenet.";
const SAFETY_OLDER = "7–12. évfolyamon társas nehézség (kirekesztés, csoportnyomás) visszafogottan megengedett, naturalisztikus részlet nélkül.";
const NO_NEW_FACTS = "Új tény NEM kerülhet be: a kitalált keret (szereplő, helyszín, párbeszéd) nem tény; minden tantárgyi állítás a térképből jön. Valós személy vagy esemény csak akkor szerepelhet, ha a térképben van. A két könyv, amelyből a módszer származik, nem forrás: szereplőt, szöveget, feladatot nem veszel át.";
const ARC = "Ív: hős → a lecke tantárgyi problémája egy konkrét helyzetben → elakadás vagy hiba, az érzés megnevezése → segítő vagy felismerés, amely normalizál → egy konkrét, otthon is megismételhető stratégia → a mese NYITOTT kérdéssel ér véget, amelyre a lecke adja meg a választ.";

function stageLine(stage: OpenerStage): string {
  const s = OPENER_STAGES[stage];
  return `Lépcső: ${stage} — ${s.grades}. Forma: ${s.form}. Hossz: ${s.minWords}–${s.maxWords} látható szó. Hangnem: ${s.tone}. Tanulság: ${s.lesson}.`;
}

/** A Stúdió szerzői promptjának nyitómese-szerződése (évfolyamfüggő). */
export function lessonOpenerContract(classroom: number, opts: { section0InScope?: boolean } = {}): string {
  if (opts.section0InScope === false) {
    return `NYITÓMESE (${LESSON_OPENER_VERSION}): ebben a célzott javításban az 1. fejezet nem része a kimenetnek — most nem írsz nyitómesét, a meglévőt nem érinted.`;
  }
  const stage = openerStageForClassroom(classroom);
  return [
    `NYITÓMESE (${LESSON_OPENER_VERSION}; a lecke első blokkja):`,
    `- ${stageLine(stage)}`,
    "- Hely és alak: az 1. fejezet ELSŐ blokkja egy `explain` blokk (depth \"core\"), amely a nyitómesét tartalmazza. A mese szó szerint tartalmazza az 1. fejezet első fogalmának nevét (term), és coversConceptIds-ben azt jelöli. A mese UTÁNI explain blokk mondja el, miről fogunk tanulni és miért, és ott történik a fogalom tényleges tanítása.",
    "- A mese a szókereten BELÜL van: a fejezet bevezető mondatait váltja ki, nem adódik hozzájuk.",
    `- Két réteg: (1) a hős a lecke saját tantárgyi problémájával találkozik; (2) közben egy tanulási nehézséggel küzd, a tantárgyhoz illőt választva: ${OPENER_LEARNING_THEMES.join("; ")}.`,
    `- ${ARC}${stage === "L1" || stage === "L2" ? " A stratégiát egy „varázstárgyba” csomagolhatod, de kimondod, hogy valódi módszer, nem varázslat." : ""}`,
    ...(stage === "L1" || stage === "L2" || stage === "L3" ? ["- A mese végén egy kérdés arról is, mit érezhetett a hős."] : []),
    "- Visszatérés: a lecke utolsó recap blokkjának ELSŐ pontja visszatér a hőshöz vagy az esethez: mit tanult meg, és hogyan segített a stratégia.",
    `- ${NO_NEW_FACTS}`,
    `- ${SAFETY_ALL} ${stage === "L1" || stage === "L2" || stage === "L3" ? SAFETY_YOUNG : SAFETY_OLDER}`,
  ].join("\n");
}

/** A Tananyag lap `check` blokkjaira vonatkozó játékos szabály (Stúdió szerző). */
export const PLAYFUL_AUTHOR_RULES = [
  `JÁTÉKOS ELLENŐRZÉS (${LESSON_OPENER_VERSION}; a Tananyag lap check blokkjai):`,
  "- A fejezet első check kérdése könnyű, sikerélményt adó; a nehezebb utána jön.",
  "- A hint (ha adsz) irányt mutat, NEM árulja el a választ.",
  "- feedbackPerOption: helyes válasznál röviden, miért jó; rossz válasznál az első mondat bátorító, utána mi tévesztett meg, mit kérdezett valójában a kérdés, és a helyes gondolatmenet egy mondatban. Az erőfeszítést dicséred, nem minősítesz.",
].join("\n");

/** Lektori ellenőrzőlista (nem blokkoló age jegyzetek; a blokkoló biztonsági kapu S3). */
export const LESSON_OPENER_LEKTOR_CHECKLIST = [
  `NYITÓMESE-ELLENŐRZÉS (${LESSON_OPENER_VERSION}): az 1. fejezet első explain blokkja nyitómese.`,
  "- A mese kitalált kerete (szereplő, helyszín, párbeszéd) NEM tény: emiatt ne adj not_in_map jegyzetet. A mesében kimondott TANTÁRGYI állítást ugyanúgy mérd a térképhez, mint bármely más blokkot.",
  "- Ellenőrizd: illik-e a tanuló évfolyamához (forma, hossz, hangnem); benne van-e a lecke tantárgyi problémája, egy konkrét stratégia és egy nyitott kérdés; visszatér-e a hős vagy az eset a recap első pontjában.",
  `- Biztonsági sértés (${SAFETY_ALL.replace(/^Biztonság: /, "")} ${SAFETY_YOUNG}): age jegyzet, a message „NYITÓMESE-BIZTONSÁG:” előtaggal, blockPath-tal.`,
  "- Évfolyamhoz nem illő forma, hiányzó elem vagy hiányzó visszatérés: age jegyzet „NYITÓMESE:” előtaggal. Egyik sem blokkoló.",
].join("\n");

/** Játékos kérdezés a bankhoz (statikus: a bank gyorsítótárazott előtagjába kerül, ezért évfolyamfüggetlen). */
export const PLAYFUL_QUESTIONING_CONTRACT = [
  `JÁTÉKOS KÉRDEZÉS (${LESSON_OPENER_VERSION}; a bank minden tételére):`,
  "- Nehézségi ív: minden csomagban könnyű, sikerélményt adó tétel az első, utána közepes, végül kihívást jelentő.",
  "- Formák a meglévő módszertípusokban: prediction = előkérdés, becslés vagy kíváncsiságrés (hibázni szabad, a magyarázat a lecke tartalmára mutat); myth = igaz/hamis csapda (hihető, de hamis állítás; a magyarázat megmondja, mi tévesztett meg); popup = találós kérdés (tulajdonságleírásból a fogalom); gate = kapurejtvény, csak egyértelmű, általad ellenőrzött megoldással; analogy = „olyan, mint…”; conflict = dilemma (7. évfolyamtól); selfCheck = „magyarázd el, miért”.",
  "- Kvízben „Melyik nem illik közé?” kérdés csak akkor, ha pontosan egy védhető helyes válasz van; a visszajelzés megnevezi a szempontot.",
  "- Nyílt feladatban „Mi lenne, ha…?” kérdés megengedett; a pontozás (required) a tanított fogalom alkalmazását méri, a sample egy lehetséges jó válasz.",
  "- Visszajelzés (feedbackPerOption és a módszer answer mezője): helyes válasznál röviden, miért jó; rossz válasznál az első mondat bátorító, utána mi tévesztett meg, mit kérdezett valójában a feladat, és a helyes gondolatmenet egy mondatban. Az erőfeszítést dicséred, nem minősítesz.",
  "- Évfolyam szerinti forma: 1–2. konkrét, egylépéses, csapda nélkül; 3–4. találós kérdés, kakukktojás; 5–6. igaz/hamis csapda indoklással, kétlépéses kérdés; 7–8. többlépéses és laterális kérdés; 9–12. dilemma, becslés, ellenpélda, „magyarázd el, miért”.",
  "- A játékos keret nem enged új tényt: továbbra is KIZÁRÓLAG a Tananyag lapon ténylegesen megtanított állítás kérdezhető.",
].join("\n");

/** Önálló HTML-út — statikus (évfolyamfüggetlen) rész a gyorsítótárazott spec mögé. */
export const LESSON_OPENER_HTML_CONTRACT = [
  `NYITÓMESE (${LESSON_OPENER_VERSION}; az 1. lap első kártyája):`,
  "- Az 1. lap (Tananyag) első kártyája a nyitómese-kártya; a tanuló lépcsőjét a téma-rész „Nyitómese — Lépcső” sora adja meg. A lépcsők:",
  ...(Object.keys(OPENER_STAGES) as OpenerStage[]).map((st) => `  - ${stageLine(st)}`),
  `- Két réteg: (1) a lecke saját tantárgyi problémája; (2) egy tanulási nehézség: ${OPENER_LEARNING_THEMES.join("; ")}.`,
  `- ${ARC} 1–4. évfolyamon a stratégia „varázstárgyba” csomagolható, de kimondod, hogy valódi módszer.`,
  "- A mese a terjedelmen belül marad: a bevezető mondatokat váltja ki. A Tananyag lap záró összefoglalójának első pontja visszatér a hőshöz vagy az esethez.",
  `- ${NO_NEW_FACTS}`,
  `- ${SAFETY_ALL} ${SAFETY_YOUNG} ${SAFETY_OLDER}`,
].join("\n");

/** Önálló HTML-út — évfolyamfüggő sor a téma-részbe. */
export function lessonOpenerStageLine(classroom: number): string {
  const stage = openerStageForClassroom(classroom);
  return `- Nyitómese — ${stageLine(stage)}`;
}
```

Ellenőrzés: `npm.cmd run check` → hiba nélkül.

## T4 — Kapcsoló: `source/server/studio/lesson-opener-flag.ts` (új)

```ts
/** Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): a nyitómese és a játékos kérdezés kapcsolója. Alapból KI; élesben csak S3 után. */
export function lessonOpenerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.STUDIO_LESSON_OPENER ?? "").trim().toLowerCase() === "on";
}
```

## T5 — Bekötés: `source/server/studio/step-io.ts`

1. Importok a meglévő `shared/...` importok mellé:
   `import { LESSON_OPENER_LEKTOR_CHECKLIST, PLAYFUL_AUTHOR_RULES, lessonOpenerContract } from "../../shared/lesson-opener";`
   `import { lessonOpenerEnabled } from "./lesson-opener-flag";`
2. `buildAuthorPrompt` (`parts` tömb, jelenleg 493–494. sor): a `LESSON_METHOD_CONTRACT,` sor UTÁN:
   ```ts
   // Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): kapcsolóval (alapból KI) — kikapcsolva a prompt bájtra változatlan.
   ...(lessonOpenerEnabled() ? [lessonOpenerContract(map.classroom, { section0InScope: !repair || repair.targetSections.includes(0) }), PLAYFUL_AUTHOR_RULES] : []),
   ```
3. `buildLektorPrompt` (jelenleg 622. sor): a `SOURCE_REVIEW_RULES,` sor UTÁN:
   ```ts
   ...(lessonOpenerEnabled() ? [LESSON_OPENER_LEKTOR_CHECKLIST] : []),
   ```

## T6 — Bekötés: `source/server/studio/experience-builder.ts`

1. Import: `import { PLAYFUL_QUESTIONING_CONTRACT } from "../../shared/lesson-opener";` és `import { lessonOpenerEnabled } from "./lesson-opener-flag";`
2. `bankStaticPrefix` (34–35. sor) törzse:
   ```ts
   const base = `${roleSkillBlock("bank")}\n${LESSON_METHOD_CONTRACT}\n${OPEN_ANSWER_RULES_HU}`;
   return lessonOpenerEnabled() ? `${base}\n${PLAYFUL_QUESTIONING_CONTRACT}` : base;
   ```
   (A `bankRequestBlocks` (`single-run/engine.ts:180-188`) ugyanezt a függvényt hívja, így az előtag-egyezés megmarad.)

## T7 — Bekötés: `source/server/ai/lesson-html-spec.ts`

1. Import: `import { LESSON_OPENER_HTML_CONTRACT, PLAYFUL_QUESTIONING_CONTRACT, lessonOpenerStageLine } from "../../shared/lesson-opener";`
   és `import { lessonOpenerEnabled } from "../studio/lesson-opener-flag";`
2. `lessonHtmlSpecParts` (545–548. sor) teljes törzse a mai helyett:
   ```ts
   const theme = opts.theme ?? pickLessonTheme(opts.seed, opts.classroom, opts.subjectHint);
   const themeText = lessonThemePrompt(theme, opts.classroom);
   const spec = `${LESSON_HTML_SPEC_V74}\n\n${LESSON_METHOD_CONTRACT}\n\n${HTML_LESSON_DATA_CONTRACT}`;
   // Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): a statikus spec évfolyamfüggetlen marad (KV-cache), a lépcső a téma-részbe kerül.
   return lessonOpenerEnabled()
     ? { theme: `${themeText}\n${lessonOpenerStageLine(opts.classroom)}`, spec: `${spec}\n\n${LESSON_OPENER_HTML_CONTRACT}\n\n${PLAYFUL_QUESTIONING_CONTRACT}` }
     : { theme: themeText, spec };
   ```
   A kikapcsolt ág visszatérése bájtra a mai.

## T8 — Bekötés: `source/server/studio/web-research-agent.ts`

1. Import: `import { LESSON_OPENER_HTML_CONTRACT, PLAYFUL_QUESTIONING_CONTRACT, lessonOpenerStageLine } from "../../shared/lesson-opener";`
   és `import { lessonOpenerEnabled } from "./lesson-opener-flag";`
2. `webLessonAuthorPrompt` tömbje (jelenleg 196. sor): a `LESSON_METHOD_CONTRACT,` sor UTÁN:
   ```ts
   ...(lessonOpenerEnabled() ? [LESSON_OPENER_HTML_CONTRACT, lessonOpenerStageLine(classroom), PLAYFUL_QUESTIONING_CONTRACT] : []),
   ```

## T9 — Tesztek: `source/tests/lesson-opener.test.ts` (új)

Minden teszt, amely a kapcsolót állítja, a végén visszaállítja: `const prev = process.env.STUDIO_LESSON_OPENER; try { … } finally { if (prev === undefined) delete process.env.STUDIO_LESSON_OPENER; else process.env.STUDIO_LESSON_OPENER = prev; }`.
Bemenetek: a `tests/u4-author-pedagogue.test.ts` mintája (`map = { title: "T", subject: "matek", classroom: 6, concepts: [{ localId: "c1", examWeight: "core", term: "terület" }] }`,
`sections = [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain"], animationSuggestions: [] }]`), a lektorhoz `standardFusionFixture()`
(`shared/fixtures/lesson-fusion`), a HTML-hez `{ classroom: 5, seed: "Vulkánok", subjectHint: "földrajz" }` és `{ classroom: 9, seed: "Petőfi", subjectHint: "irodalom" }`.

Esetek (mindegyik külön `test`):
1. **A2** `openerStageForClassroom`: 0→L4, 1→L1, 2→L1, 3→L2, 4→L2, 5→L3, 6→L3, 7→L4, 8→L4, 9→L5, 10→L5, 11→L6, 12→L6, −1→L4, 13→L6, `NaN`→L4.
2. **A2** `OPENER_STAGES`: minden lépcsőn `minWords < maxWords`, és a hosszhatárok a spec 4.2 táblázatával egyeznek (50–90, 70–110, 80–130, 90–140, 100–160, 100–170).
3. **A3** kapcsoló: `lessonOpenerEnabled({})` false; `{ STUDIO_LESSON_OPENER: "on" }` true; `" ON "` true; `"1"` false.
4. **A3** szerző: `off = buildAuthorPrompt(sections, map, [])` (kapcsoló nélkül); `on` ugyanígy `"on"`-nal. Elvárás:
   `on.replace("\n" + lessonOpenerContract(6, { section0InScope: true }) + "\n" + PLAYFUL_AUTHOR_RULES, "") === off`, és `off` nem tartalmazza a „NYITÓMESE” szót.
5. **A4** szerző (`on`): tartalmazza: `"Lépcső: L3"`, `"80–130 látható szó"`, `"Új tény NEM kerülhet be"`, `"term"`, `"recap blokkjának ELSŐ pontja"`, `"1–6. évfolyamon tilos"`, `"A hint (ha adsz) irányt mutat"`.
   `map.classroom = 11` mellett: `"Lépcső: L6"` és `"7–12. évfolyamon"`, és NEM tartalmazza a „mit érezhetett a hős” kifejezést.
6. **A5** célzott javítás: `buildAuthorPrompt(sections, map, [], { targetSections: [1] })` `on` mellett tartalmazza: `"most nem írsz nyitómesét"`;
   `{ targetSections: [0] }` mellett `"Lépcső: L3"`.
7. **A3/A4** lektor: `off = buildLektorPrompt(lesson, map)`, `on` ugyanígy; `on.replace("\n" + LESSON_OPENER_LEKTOR_CHECKLIST, "") === off`; `on` tartalmazza: `"NYITÓMESE-BIZTONSÁG:"`, `"ne adj not_in_map jegyzetet"`.
8. **A3/A4** bank: `on = bankStaticPrefix()` kapcsolóval; `on === off + "\n" + PLAYFUL_QUESTIONING_CONTRACT`; `on` tartalmazza: `"prediction = előkérdés"`, `"mit kérdezett valójában"`.
9. **A3/A3b/A4** HTML: `on.spec === off.spec + "\n\n" + LESSON_OPENER_HTML_CONTRACT + "\n\n" + PLAYFUL_QUESTIONING_CONTRACT`;
   `on.theme === off.theme + "\n" + lessonOpenerStageLine(5)`; két évfolyamra `on.spec` azonos; a spec mind a hat lépcsőt tartalmazza (`/Lépcső: L[1-6]/g` 6 találat).
10. **A3/A4** webes szerző: `webLessonAuthorPrompt(5, "Törtek — 5. osztály")` `on` mellett tartalmazza a `LESSON_OPENER_HTML_CONTRACT`-ot és a `"Nyitómese — Lépcső: L3"` sort; `off` nem tartalmazza a „NYITÓMESE” szót.

Futtatás: `node --import tsx --test tests/lesson-opener.test.ts` → `# fail 0`.

## T10 — Teljes ellenőrzés (A6)

1. `node --import tsx --test tests/lesson-opener.test.ts tests/u4-author-pedagogue.test.ts tests/u5-lektor-verifiers.test.ts tests/lesson-html-spec.test.ts tests/prompt-cache.test.ts tests/web-research-agent.test.ts tests/web-research-completion.test.ts tests/lesson-experience.test.ts tests/instruction-bundles.test.ts tests/runtime-knowledge.test.ts tests/lesson-arc.test.ts` → `# fail 0`.
2. `npm.cmd run check` → 0 hiba. `npm.cmd run lint` → 0 hiba, 0 figyelmeztetés. `npm.cmd run check:test` → 0 hiba. `npm.cmd test` → `# fail 0`.
3. Önreview: `git -C C:\Repo\WEBSULI diff origin/main --stat` és a teljes diff a spec 7. fejezetéhez mérve; a kikapcsolt ág bájt-azonosságát a 4., 7., 8., 9. teszt bizonyítja.
Bukásnál: az implementációt javítod, a tesztet nem gyengíted; ugyanazt a bukó parancsot változatlan bemenettel nem futtatod újra.

## T11 — Csapda, kanban, commit

1. `docs/agent-csapdak.md` végére új bejegyzés a meglévő formátumban (`## C-19 — …`, **Tünet** / **Megelőzés**): a kutatóügynök az OpenStax
   *Psychology 2e* / *Lifespan Development* licencét általánosításból CC BY-nak vélte, az oldal szerint CC BY-NC-SA 4.0. Megelőzés: licencet
   csak a forrás saját oldalán olvasott licencsorral rögzítünk; a keresési kivonat és a kiadói „általában” állítás UNVERIFIED.
2. Kanban: `node C:\Repo\Jack\qualcomm\skills\hermes-kanban-workflow\scripts\kanban.mjs note 6 "<S1+S2 kész, parancseredményekkel>"` a
   `C:\Repo\WEBSULI` mappából, majd `review 6`.
3. Commitok (atomi): `docs: nyitómese + játékos kérdezés — spec és végrehajtás` (ha még nincs), `docs: módszertani tudásbázis (S1)`,
   `feat(studio): nyitómese és játékos kérdezés szerződései kapcsolóval (S2)`, `docs(csapdak): C-19 …`. A commit-üzenet a rendszer által
   előírt Co-Authored-By sorral zárul. Push és PR csak tulajdonosi kérésre.

## T12 — S2b mérés (CSAK tulajdonosi jóváhagyás után; fizetős)

Bemenet: a tulajdonos által megadott három térkép-azonosító (spec 10/3. kérdés): egy 1–4., egy 5–8., egy 9–12. évfolyamos.
Térképenként, a `source/` mappából, PowerShellben:

```
Remove-Item Env:STUDIO_LESSON_OPENER -ErrorAction SilentlyContinue
npx.cmd tsx scripts/measure/single-run-measure.mts <térkép> nyito-off-<rövid név> C:\Repo\WEBSULI\docs\measurements
$env:STUDIO_LESSON_OPENER = "on"
npx.cmd tsx scripts/measure/single-run-measure.mts <térkép> nyito-on-<rövid név> C:\Repo\WEBSULI\docs\measurements
Remove-Item Env:STUDIO_LESSON_OPENER
```

A futások háttérben indulnak (egyenként 25–27 perc), a várakozás alatt aktív ellenőrzés (AGENTS.md „Aktív munkafázis-követés”).
Összesítés: `docs/measurements/2026-11-xx-nyitomese-ab.json` (a tényleges dátummal): ágonként látható szó, kapu- és ív-eredmény, a
nyitómese szószáma (az 1. fejezet első explain blokkja), és a kézi rubrika (spec A7) — plusz egy rövid összegzés a specbe (Állapot sor).

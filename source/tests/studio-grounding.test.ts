import assert from "node:assert/strict";
import test from "node:test";

import { checkGrounding, groundingReport, quoteNumbersPresent } from "../server/studio/grounding";
import type { MapConcept } from "../server/studio/coverage";

test("a pi matematikai jel is mérhető, de idegen szöveg nem igazolja", () => {
  const concept = { localId: "pi", term: "π" } as MapConcept;
  assert.equal(checkGrounding("A π irracionális szám, közelítő értéke 3,14.", concept), true);
  assert.equal(checkGrounding("A háromszög területe az alap és magasság szorzatának fele.", concept), false);
  assert.equal(checkGrounding("π", concept), false);
});

test("folyamatábra látható lépése igazolhat fogalmat, rejtett adat nem", () => {
  const concepts = [{ localId: "C", term: "Kör kerülete" } as MapConcept];
  const block = { kind: "animate", animKind: "process", coversConceptIds: ["C"], params: { steps: ["A kör kerülete két sugár és π szorzata."] } };
  assert.equal(groundingReport([block], concepts).ok, true);
  assert.equal(groundingReport([{ ...block, params: { hidden: block.params.steps } }], concepts).ok, false);
});

test("try látható szövege mérhető, rejtett megoldása és címkéje nem bizonyíték", () => {
  const c = [{ localId: "area", term: "Háromszög területe", examWeight: "core" }] as MapConcept[];
  for (const [tryKind, spec] of [
    ["fillBlank", { text: "A háromszög területe alap szor magasság osztva ___.", answers: ["2"] }],
    ["dragSort", { items: ["A háromszög területe", "Alap szor magasság osztva kettővel"], correctOrder: ["A háromszög területe", "Alap szor magasság osztva kettővel"] }],
    ["match", { pairs: [{ left: "A háromszög területe", right: "Alap szor magasság fele" }] }],
  ]) {
    assert.equal(groundingReport([{kind:"try",tryKind,spec,coversConceptIds:["area"]}],c).ok,true);
  }
  assert.equal(groundingReport([{kind:"try",tryKind:"fillBlank",spec:{text:"Írd be a hiányzó szót: ___",answers:["Háromszög területe"],concept:"Háromszög területe"},coversConceptIds:["area"]}],c).ok,false);
});

/**
 * #196 — a szerző MEGKERÜLTE a forrást, és hamis címkékkel átcsúszott a kapun.
 *
 * MÉRVE ÉLESBEN (Kristóf-lecke, 2026-09-06, map c53973f8):
 *  - a feltöltött forrás 8. osztályos geometria volt: „T = a · ma / 2",
 *    „K = d · π", „T = r²π", körgyűrű, körcikk, „(n-2)·180°";
 *  - a tudás-térkép ezt HELYESEN kivonatolta (28 fogalom, verbatim idézetekkel);
 *  - a lecke mégis 4. osztályos helyiértéket, írásbeli összeadást és
 *    „24 ceruzát 6 gyerek között" feladatot tanított;
 *  - a fedettségi kapu mégis `ok: true`, `core 7/7`, `supporting 15/15`.
 *
 * Miért: a `checkCoverageGate` KIZÁRÓLAG a `coversConceptIds` címkéket számolja
 * (`ids.has(c.localId)`), a blokk SZÖVEGÉT soha nem nézi. A modell ráírta a
 * `C01`("Háromszög területe") címkét egy helyiérték-magyarázatra, és a kapu
 * 100%-ot mért. Egy ID-egyezés nem bizonyíték arra, hogy a blokk tanítja is a
 * fogalmat — a lefedettség állítás, amit igazolni kell.
 */

const CONCEPTS: MapConcept[] = [
  { localId: "C01", term: "Háromszög területe", examWeight: "core" },
  { localId: "C05", term: "Kör területe", examWeight: "core" },
  { localId: "C21", term: "Körgyűrű területe", examWeight: "supporting" },
] as MapConcept[];

test("a valós Kristóf-eset: helyiérték-szöveg geometriai címkékkel MEGBUKIK", () => {
  // Szó szerint a publikált leckéből (lessons.json, map c53973f8).
  const blocks = [
    {
      kind: "explain",
      text:
        "A természetes számokat számjegyekkel írjuk le. Egy számjegy értéke attól is függ, " +
        "melyik helyen áll. Jobbról balra haladva az egyesek, tízesek, százasok és ezresek helye következik.",
      coversConceptIds: ["C01", "C05"],
    },
    {
      kind: "example",
      problem: "24 ceruzát 6 gyermek között egyenlően osztunk szét. Hány ceruzát kap egy gyermek?",
      coversConceptIds: ["C21"],
    },
  ];

  const report = groundingReport(blocks, CONCEPTS);
  assert.equal(report.ok, false, "a hamis címkézésnek buknia kell");
  assert.ok(
    report.ungrounded.length >= 2,
    `legalább két megalapozatlan címke várt, kapott: ${report.ungrounded.length}`,
  );
  const ids = report.ungrounded.map((u) => u.conceptId);
  assert.ok(ids.includes("C01"), "a 'Háromszög területe' címke helyiérték-szövegen megalapozatlan");
  assert.ok(ids.includes("C21"), "a 'Körgyűrű területe' címke ceruzaosztáson megalapozatlan");
});

test("a valódi tanítás átmegy: a fogalom szava szerepel a blokkban", () => {
  const blocks = [
    {
      kind: "explain",
      text:
        "A háromszög területe a T = a · ma / 2 képlettel számolható, ahol ma az a oldalhoz " +
        "tartozó magasság.",
      coversConceptIds: ["C01"],
    },
  ];
  const r = groundingReport(blocks, CONCEPTS);
  assert.equal(r.ok, true, `helyes blokk nem bukhat: ${JSON.stringify(r.ungrounded)}`);
});

test("ékezet- és toldalék-tűrő: a magyar ragozás nem okoz hamis bukást", () => {
  // „Kör területe" -> „a kör területét" — a szótő egyezik, ez elfogadott.
  assert.equal(
    checkGrounding("Kiszámoljuk a kör területét: T = r²π.", { localId: "C05", term: "Kör területe" } as MapConcept),
    true,
  );
  // Nem elég egyetlen közös szó: a „terület" önmagában nem bizonyítja a kört.
  assert.equal(
    checkGrounding("A téglalap területe a · b.", { localId: "C05", term: "Kör területe" } as MapConcept),
    false,
  );
});

test("üres/rövid blokkszöveg nem alapozhat meg címkét", () => {
  assert.equal(checkGrounding("", { localId: "C01", term: "Háromszög területe" } as MapConcept), false);
  assert.equal(checkGrounding("Lásd fent.", { localId: "C01", term: "Háromszög területe" } as MapConcept), false);
});

test("`term` nélküli fogalom NEM buktat vakon, de láthatóan mérhetetlen marad", () => {
  // Régi térkép-sorok/fixture-ök nem tartalmaznak megnevezést. Egy kapu, ami
  // mérés nélkül ítél, ugyanolyan hazug, mint amelyik mérés nélkül átenged —
  // ezért itt nem buktatunk, de a `measurable` számláló megmutatja, hogy erről
  // a leckéről a kapu NEM mondott ítéletet.
  const blocks = [{ kind: "explain", text: "Bármi.", coversConceptIds: ["X1"] }];
  const r = groundingReport(blocks, [{ localId: "X1", examWeight: "core" } as MapConcept]);
  assert.equal(r.ok, true, "mérhetetlen fogalom nem buktathat");
  assert.equal(r.measurable, 0, "és látszania kell, hogy semmit nem mértünk");
  assert.deepEqual(r.groundedIds, [], "mérés nélkül nem is igazolunk semmit");
});

test("a mérhető és a mérhetetlen fogalmak keveredhetnek — a mérhetőt megítéli", () => {
  const blocks = [
    { kind: "explain", text: "A természetes számokat számjegyekkel írjuk le, helyiérték szerint.", coversConceptIds: ["X1", "C01"] },
  ];
  const r = groundingReport(blocks, [
    { localId: "X1", examWeight: "core" } as MapConcept,
    { localId: "C01", term: "Háromszög területe", examWeight: "core" } as MapConcept,
  ]);
  assert.equal(r.measurable, 1, "csak a term-mel rendelkező fogalom mérhető");
  assert.equal(r.ok, false, "a mérhető címke viszont megbukik a helyiérték-szövegen");
});

/* ---------- M-5: a ragozás nem lehet ok a bukásra ---------- */

/**
 * Próbafuttatáson mérve (2026-09-07, 7. osztályos geometria füzetfotókból):
 * a „kör kerülete" fogalmat a természetes magyar mondatok NEM alapozták meg —
 * „a körön", „egy körnél", „a körvonal" mind megbukott, és csak a ragtalan
 * „kör kerülete" ment át.
 *
 * Ennek az a következménye, hogy a kapu a SZÁRAZ, kulcsszó-ismétlő szöveget
 * jutalmazza: a szerzőnek szó szerint bele kell írnia a fogalom nevét ahhoz,
 * hogy a mondata „megalapozottnak" számítson. A tulajdonos épp ezt kifogásolta
 * a leckéken.
 *
 * Az ok a szótő-vágás aszimmetriája: a `stem` az első 5 karaktert veszi, tehát
 * egy HÁROM betűs szó („kör" → „kor") sosem egyezik meg egy ragozott alak
 * ötkarakteres tövével („körön" → „koron"). A hosszú szavaknál ez működik
 * („terület"/„területét" → „terul"), a rövideknél soha.
 */

test("M-5 a rövid fogalomszó ragozott alakja is megalapoz", () => {
  const kor: MapConcept = {
    id: "u1",
    localId: "kor-kerulete",
    examWeight: "core",
    term: "kör kerülete",
  };

  for (const mondat of [
    "A sugár a középponttól a körvonalig ér, az átmérő átér a körön. A kerület a körvonal hossza.",
    "Egy körnél négy mennyiség fordul elő: a sugár, az átmérő, a kerület és a terület.",
    "A kör kerülete K = 2rπ.",
    "A kör kerületét a K = 2rπ képlettel számoljuk ki.",
  ]) {
    assert.equal(checkGrounding(mondat, kor), true, `megbukott: „${mondat.slice(0, 60)}…"`);
  }
});

test("M-5 a lazítás NEM engedi át a más témájú szöveget", () => {
  // Ez a #196 élő hibája: helyiérték-magyarázatra ráírt geometriai címke.
  const haromszog: MapConcept = {
    id: "u2",
    localId: "haromszog-terulete",
    examWeight: "core",
    term: "háromszög területe",
  };

  assert.equal(
    checkGrounding(
      "A 3524 szám számjegyei helyiértéket jelölnek: az ezres, a százas, a tízes és az egyes helyiértéket.",
      haromszog,
    ),
    false,
    "a más témájú blokk továbbra sem alapozhat meg geometriai fogalmat",
  );
});

test("M-5 egyetlen egyező szó nem elég — MINDEN érdemi szó kell", () => {
  const korTerulete: MapConcept = {
    id: "u3",
    localId: "kor-terulete",
    examWeight: "core",
    term: "kör területe",
  };

  // „terület" megvan, „kör" nincs — ez a téglalapos mondat nem taníthatja a kör területét.
  assert.equal(
    checkGrounding("A téglalap területe a két oldal szorzata: T = a · b, a kerülete pedig 2(a+b).", korTerulete),
    false,
  );
});

test("M-5 a rövid szó eleje nem illeszkedhet bármibe, ami vele kezdődik", () => {
  const kor: MapConcept = { id: "u4", localId: "kor", examWeight: "core", term: "kör sugara" };

  // „korszak" és „kórház" is „kor"-ral kezdődik ékezet nélkül — de a „sugara"
  // hiánya miatt a konjunkció megvéd. Ez a lazítás biztonsági korlátja.
  assert.equal(
    checkGrounding("A korszak végén a kórházak száma jelentősen megnőtt az országban.", kor),
    false,
  );
});

test("M-5 az összetett szó belsejében álló fogalomszó is megalapoz", () => {
  // Próbafuttatáson mérve: „Négy darab 4 cm sugarú kör ÖSSZTERÜLETE" nem
  // alapozta meg a „kör területe" fogalmat, mert az „összterülete" szótöve
  // „osszt". A magyar összetett szavak (összterület, alapterület, félkör,
  // körvonal) a tananyagban mindennaposak; ha ezek buknak, a szerző kénytelen
  // széttagolt, mesterkélt mondatokat írni.
  const korTerulete: MapConcept = {
    id: "u5",
    localId: "kor-terulete",
    examWeight: "core",
    term: "kör területe",
  };

  assert.equal(
    checkGrounding("Négy darab 4 cm sugarú kör összterülete mennyi lesz összesen?", korTerulete),
    true,
  );
});

test("M-5 az összetett-szó lazítás sem enged át idegen témát", () => {
  const haromszog: MapConcept = {
    id: "u6",
    localId: "haromszog-terulete",
    examWeight: "core",
    term: "háromszög területe",
  };

  assert.equal(
    checkGrounding("A lakás alapterülete 64 négyzetméter, a bérleti díj ezen alapul.", haromszog),
    false,
    "a terület szó megvan, a háromszög nem — a fogalom nincs megalapozva",
  );
});

/* ------------------------------------------------------------------------- *
 * Spec 2026-09-19 — stripUngroundedAnimateLabels: az animációs blokk címkéje
 * kozmetika; ami a felirat saját szövegéből nem igazolható, lekerül róla, a
 * tanító blokkokhoz nem nyúl. Az első eset az éles PDF-futás (3ed5ca90) blokkja.
 * ------------------------------------------------------------------------- */

import { stripUngroundedAnimateLabels } from "../server/studio/grounding";

test("animációs blokk szinonimás címkéje lekerül, a megalapozott címkék és a tanító blokkok maradnak", () => {
  const concepts = [
    { localId: "talaj-kialakulasa", term: "A talaj kialakulása", examWeight: "core" },
    { localId: "mallas", term: "Mállás", examWeight: "core" },
    { localId: "humusz", term: "Humusz", examWeight: "core" },
  ] as MapConcept[];
  const animate = { kind: "animate", animKind: "process", caption: "A talajképződés egymásra épülő lépései a kőzet feldarabolódásától a termékenyebb talajig.",
    params: { steps: ["A mállás során a víz és a levegő kémiailag átalakítja a kőzetdarabokat.", "Az elhalt maradványok lebomlanak, és humusz keletkezik."] },
    coversConceptIds: ["talaj-kialakulasa", "mallas", "humusz"] };
  const explain = { kind: "explain", text: "A talaj kialakulása hosszú folyamat.", coversConceptIds: ["talaj-kialakulasa"] };
  const lesson = { sections: [{ title: "1", blocks: [explain, animate] }] };
  const result = stripUngroundedAnimateLabels(lesson, concepts);
  assert.deepEqual(result.stripped.map(s => s.conceptId), ["talaj-kialakulasa"]);
  assert.deepEqual(result.lesson.sections[0].blocks[1].coversConceptIds, ["mallas", "humusz"]);
  assert.deepEqual(result.lesson.sections[0].blocks[0], explain, "a tanító blokk érintetlen");
  assert.equal(groundingReport(result.lesson.sections[0].blocks, concepts).ok, true);
});

test("címke nélkül maradó animációs blokk eltűnik; ismeretlen id és term nélküli fogalom nem itt dől el", () => {
  const concepts = [{ localId: "kor", term: "Kör kerülete" }, { localId: "nevtelen", term: "" }] as MapConcept[];
  const lesson = { sections: [{ blocks: [
    { kind: "explain", text: "A kör kerülete a sugár és a π kétszerese.", coversConceptIds: ["kor"] },
    { kind: "animate", animKind: "process", caption: "Színes átmenet a lapon.", params: { steps: ["Villan a háttér."] }, coversConceptIds: ["kor"] },
    { kind: "animate", animKind: "process", caption: "Ismeretlen és névtelen címke marad, mert a kapu méri.", params: { steps: ["x"] }, coversConceptIds: ["ismeretlen", "nevtelen"] },
  ] }] };
  const result = stripUngroundedAnimateLabels(lesson, concepts);
  assert.equal(result.lesson.sections[0].blocks.length, 2);
  assert.equal(result.lesson.sections[0].blocks[1].coversConceptIds.length, 2);
  assert.equal(result.stripped.length, 1);
  const untouched = { sections: [{ blocks: [{ kind: "explain", text: "csak tanítás", coversConceptIds: ["kor"] }] }] };
  assert.equal(stripUngroundedAnimateLabels(untouched, concepts).lesson, untouched, "változatlan lecke ugyanaz az objektum marad");
});

/* Spec 2026-09-19 — a concept named in the source language is grounded by its curated (Hungarian) definition. */
test("mérve run 03542f43: a fejezet példája a fejezet explain-je által megalapozott fogalmat gyakoroltatja → megalapozott; más fejezet példája nem", () => {
  const rule = { localId: "elsobbseg", term: "Műveleti sorrend: szorzás és osztás elsőbbsége", definition: "Ha egy műveletsorban összeadás vagy kivonás mellett szorzás vagy osztás is szerepel, akkor először a szorzás vagy az osztás műveleteket végezzük el.", examWeight: "core" } as MapConcept;
  const explain = { kind: "explain", text: "A műveleti sorrend: szorzás és osztás elsőbbsége azt jelenti, hogy vegyes műveletsorban először a szorzást vagy az osztást végezzük el, csak utána az összeadást és kivonást.", coversConceptIds: ["elsobbseg"] };
  const example = { kind: "example", problem: "Számítsd ki: 148 + 6 · 8", steps: ["Először a szorzást végezzük el: 6 · 8 = 48.", "Ezután összeadunk: 148 + 48 = 196."], answer: "196", coversConceptIds: ["elsobbseg"] };
  assert.equal(checkGrounding(`${example.problem} ${example.steps.join(" ")} ${example.answer}`, rule), false, "a példa önmagában nem tartalmazza a fogalom nevét");
  const same = groundingReport([explain, example], [rule], [0, 0]);
  assert.equal(same.ok, true, JSON.stringify(same.ungrounded));
  assert.deepEqual(same.groundedIds, ["elsobbseg"]);
  const other = groundingReport([explain, example], [rule], [0, 1]);
  assert.equal(other.ok, false, "más fejezet példája nem örökli a megalapozottságot");
  assert.equal(other.ungrounded[0].kind, "example");
  const noSections = groundingReport([explain, example], [rule]);
  assert.equal(noSections.ok, false, "fejezet-információ nélkül a régi szabály marad");
  // #196 eredeti esete: az explain sem alapozza meg a címkét (más témát tanít) → a példa sem menekül.
  const offTopic = { kind: "explain", text: "A helyiérték táblázatban az egyesek, tízesek és százasok helye számít, ezt gyakoroljuk.", coversConceptIds: ["elsobbseg"] };
  assert.equal(groundingReport([offTopic, example], [rule], [0, 0]).ok, false);
});

test("mérve run 525b2797: a forrás kidolgozott példája (számokkal) a blokkban → a címke megalapozott, idegen számokkal nem", () => {
  const example = { localId: "muveleti-sorrend-zarojel-szorzas-36-osztva", term: "Zárójeles szorzás és osztás példája", definition: "36 ÷ (3 · 2) – 3\n36 ÷ 6 – 3\n6 – 3\n3", quote: "36 ÷ (3 · 2) – 3\n36 ÷ 6 – 3\n6 – 3\n3", examWeight: "core" } as MapConcept;
  assert.equal(checkGrounding("Gyakorlás: 4. Végezd el a műveleteket! Írd le lépésenként a 36 ÷ (3 · 2) – 3 műveletsor megoldását! 36 ÷ (3 · 2) – 3 = 3", example), true, "a forrás példájának számai a blokkban");
  assert.equal(checkGrounding("Írd le lépésenként a 48 : (4 · 2) + 5 műveletsor megoldását, figyelj a zárójelre!", example), false, "más számok: nem ez a példa");
  const rule = { localId: "zarojel-hasznalata", term: "Zárójel használata", definition: "Zárójelet akkor használunk, ha a műveletek sorrendjét meg akarjuk határozni.", quote: "Zárójelet akkor használunk, ha a műveletek sorrendjét meg akarjuk határozni.", examWeight: "core" } as MapConcept;
  assert.equal(checkGrounding("Hasonlítsd össze a hibás és a helyes megoldást a szorzás és osztás elsőbbsége szabályával: 148 + 6 · 8", rule), false, "szám nélküli idézetnél a szavas szabály dönt");
  assert.equal(quoteNumbersPresent("36 ÷ 6", "a 36 osztva 6"), true);
  assert.equal(quoteNumbersPresent("csak 36", "36"), false, "egy szám nem elég");
});

test("angol nevű fogalom magyar tanításban: a kurált definíció érdemi szavai igazolják a címkét, más témájú szöveget nem", () => {
  const uk = { localId: "united-kingdom", term: "The United Kingdom (UK)", definition: "Az Egyesült Királyság négy országból áll: England, Scotland, Wales és Northern Ireland.", examWeight: "core" } as MapConcept;
  assert.equal(checkGrounding("Az Egyesült Királyság négy országból áll: England, Scotland, Wales és Northern Ireland. Fővárosa London.", uk), true, "magyar szöveg, magyar definíció");
  assert.equal(checkGrounding("The United Kingdom has four countries and its capital is London.", uk), true, "angol név közvetlenül");
  assert.equal(checkGrounding("A háromszög területe az alap és a magasság szorzatának fele, ezt könnyű kiszámolni.", uk), false, "idegen téma nem alapoz meg");
  const shire = { localId: "shire-county-names", term: "shire county names", definition: "Sok angol megye nevében szerepel a „shire” szó.", examWeight: "core" } as MapConcept;
  assert.equal(checkGrounding("Yorkshire és Lancashire angol megyék: nevükben szerepel a shire szó, ez a megye régi neve.", shire), true);
  const bare = { localId: "x", term: "Kör kerülete", examWeight: "core" } as MapConcept;
  assert.equal(checkGrounding("Ez a mondat semmit sem mond a témáról, csak hosszú.", bare), false, "definíció nélkül a régi szabály marad");
});

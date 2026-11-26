import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { auditExperience, classifyOpenTask, classifyQuizItem, practiceTarget, PRACTICE_POLICY_VERSION } from "../shared/practice-policy";
import { fusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * TANANYAG-GYAKORLATI P1 (docs/specs/2026-11-26-tananyag-gyakorlati.md): közös mérce — tételenként alkalmazás / fogalmi / meta /
 * bizonytalan. A modell saját `intent` címkéje nem bizonyíték; a meta-szűrőnek kötelező negatív kontrolljai vannak.
 */
const q = (question: string, options: string[] = ["a", "b", "c"], extra: Record<string, unknown> = {}) =>
  ({ question, options, ...extra });

describe("practice-policy: meta-kérdés (a feladatlap szerkezetére kérdez)", () => {
  for (const text of [
    "Hány pontot ér ez a feladattípus?",
    "Milyen két feladatfajta szerepel ezen a feladatlapon?",
    "A feladatban szokások és közmondások vannak. Mi a harmadik csoport?",
    "A javítási útmutató szerint hány pont jár a helyes elválasztásért?",
    "Hányadik feladat a felvételi feladatlapon a szólások kiegészítése?",
  ]) {
    it(`meta: ${text}`, () => {
      const r = classifyQuizItem(q(text));
      assert.equal(r.kind, "meta", r.reason);
      assert.equal(r.version, PRACTICE_POLICY_VERSION);
    });
  }

  it("a modell `apply` címkéje sem teszi alkalmazássá a pontszámos kérdést", () => {
    assert.equal(classifyQuizItem(q("Hány pontot ér ez a feladat a felvételin?", ["1", "2", "3"], { intent: "apply" })).kind, "meta");
  });

  it("opcióba rejtett meta: pontérték-opciók konkrét adat nélkül", () => {
    assert.equal(classifyQuizItem(q("Mennyit ér a szólás-kiegészítés?", ["1 pont", "2 pont", "3 pont"])).kind, "meta");
  });
});

describe("practice-policy: negatív kontrollok (nem meta)", () => {
  it("sportpontszám konkrét adattal — alkalmazás", () => {
    assert.equal(classifyQuizItem(q("Hány ponttal vezet a csapat 8–5-nél?", ["2", "3", "13"])).kind, "alkalmazas");
  });
  it("geometriai pont — nem meta", () => {
    assert.notEqual(classifyQuizItem(q("Hány pont határoz meg egy egyenest?", ["1", "2", "3"])).kind, "meta");
  });
  it("szöveges feladat versenypontokkal — alkalmazás", () => {
    assert.equal(classifyQuizItem(q("Anna az első fordulóban 12, a másodikban 15 pontot szerzett. Hány pontja lett összesen?", ["27", "3", "25"])).kind, "alkalmazas");
  });
});

describe("practice-policy: alkalmazás (használat, felismerés, kiegészítés, döntés, számolás)", () => {
  for (const [text, options, extra] of [
    ["Sok lúd ___ győz.", ["disznót", "tyúkot", "ludat"], { format: "fillGap" }],
    ["Melyik helyzetre illik a „Sok lúd disznót győz” közmondás?", ["Hárman könnyen elbírnak egy nehéz szekrényt.", "Valaki egyedül tanul.", "Esik az eső."], {}],
    ["Melyik sortörés helyes az „osztály” szóban?", ["osz-tály", "oszt-ály", "o-sztály"], {}],
    ["A „lakatos” szó két javasolt elválasztása: A = la-katos, B = laka-tos. Melyik helyes?", ["Csak A", "Csak B", "A és B is"], {}],
    ["A háromszög alapja 6 cm, magassága 4 cm. Mekkora a területe?", ["12 cm²", "24 cm²", "10 cm²"], {}],
  ] as const) {
    it(`alkalmazás: ${text}`, () => {
      const r = classifyQuizItem(q(text, [...options], extra));
      assert.equal(r.kind, "alkalmazas", r.reason);
    });
  }
});

describe("practice-policy: fogalmi tudás (felidézés)", () => {
  for (const text of [
    "Mit jelent a „Sok lúd disznót győz” közmondás?",
    "Hogyan nevezzük a rövid, tanító célzatú népi mondást?",
    "Mi a háromszög területének képlete?",
  ]) {
    it(`fogalmi: ${text}`, () => assert.equal(classifyQuizItem(q(text)).kind, "fogalmi"));
  }
});

describe("practice-policy: helyzet vs. helyzet nélküli kérdés (élő bankból vett minták)", () => {
  for (const [text, options, kind] of [
    ["Kiránduláskor a Mátrában feljutsz a Kékesre. Milyen magasra érsz a tenger szintje fölé?", ["500 m-re", "1014 m-re", "1500 m-re"], "alkalmazas"],
    ["Egy gyerek szerint a Nap azért kel fel, mert valóban végigvonul az égen. Mi a helyes magyarázat?", ["Látszat: a Föld forog.", "Igaza van.", "A Hold miatt."], "alkalmazas"],
    ["Melyik kivonásnál kell kölcsönözni az egyesek helyén?", ["48 − 25", "63 − 27", "79 − 34"], "alkalmazas"],
    ["Melyik angol mondat jelenti ezt: Ő egy művész.", ["He is a chef.", "He is an artist.", "He is a pilot."], "alkalmazas"],
    ["Melyik növénycsoport hódította meg elsőként a szárazföldeket?", ["Harasztok", "Mohák", "Zöldmoszatok"], "fogalmi"],
    ["Hogy mondod angolul: kedvel?", ["hate", "be fond of", "don't mind"], "fogalmi"],
    ["Két mozgó ugyanonnan indul, az egyik később, mégis ugyanoda ér. Melyik feladattípus ez?", ["utolérés", "árral evezés", "ár ellen evezés"], "fogalmi"],
  ] as const) {
    it(`${kind}: ${text}`, () => assert.equal(classifyQuizItem(q(text, [...options])).kind, kind));
  }
  it("konkrét adatos szöveges feladat a „feladatban” szóval sem meta", () => {
    assert.notEqual(classifyOpenTask({ q: "6 doboz van, mindegyikben 4 ceruza. Mi a csoportszám ebben a feladatban, és miért?", sample: "4" }).kind, "meta");
  });
  it("a felvételi pontozására kérdező tétel opciói pontértékek — meta", () => {
    assert.equal(classifyQuizItem(q("Lili jól aláhúzta a szót, de csak az egyik jelentést írta le helyesen. Hány pontot kap?", ["1 pont", "2 pont", "0 pont"])).kind, "meta");
  });
});

describe("practice-policy: nyílt feladat", () => {
  it("konkrét mondat javítása — alkalmazás", () => {
    assert.equal(classifyOpenTask({ q: "Javítsd ki az elválasztást ebben a sorban: „oszt-ály”.", sample: "osz-tály" }).kind, "alkalmazas");
  });
  it("feladatlap-szerkezet — meta", () => {
    assert.equal(classifyOpenTask({ q: "Sorold fel, milyen feladattípusok szerepelnek a felvételi feladatlapon!", sample: "szólás, elválasztás" }).kind, "meta");
  });
});

describe("practice-policy: arány-cél (tulajdonosi döntés: 60–75%, célérték kétharmad)", () => {
  it("75 kérdés, 10 kötelező fogalompár", () => {
    assert.deepEqual(practiceTarget(75, 10), { lower: 45, upper: 56, goal: 50, max: 65, limited: false });
  });
  it("fogalompár-korlát: 75 kérdés, 35 pár → legfeljebb 40, korlátozott", () => {
    assert.deepEqual(practiceTarget(75, 35), { lower: 45, upper: 56, goal: 40, max: 40, limited: true });
  });
});

describe("practice-policy: audit (csak olvas, determinisztikus)", () => {
  it("a tesztlecke kvízeit a TARTALOM szerint sorolja (recall címke ellenére számolós = alkalmazás), két futás azonos", () => {
    const lesson = standardFusionFixture();
    const before = JSON.stringify(lesson);
    const a = auditExperience(lesson.experience!), b = auditExperience(lesson.experience!);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(lesson), before, "az audit nem ír");
    assert.equal(a.quiz.total, lesson.experience!.quiz.length);
    assert.equal(a.quiz.counts.meta, 0);
    // Egyetlen felidéző tétel van: „Melyik műveletsor adja a háromszög területét?” (képlet); a többi konkrét adaton számol vagy
    // változást következtet ki — a „recall” címke ellenére alkalmazás.
    assert.deepEqual(a.quiz.items.filter((i) => i.kind !== "alkalmazas").map((i) => [i.id, i.kind]), [["q1", "fogalmi"]]);
    assert.equal(a.quiz.counts.alkalmazas, a.quiz.total - 1);
    for (const bank of [a.quiz, a.tasks]) assert.equal(bank.counts.alkalmazas + bank.counts.fogalmi + bank.counts.meta + bank.counts.bizonytalan, bank.total);
  });

  it("egy meta-kérdés a bankban: az audit megtalálja és a bank nem teljesül", () => {
    const lesson = fusionFixture();
    lesson.experience!.quiz[0] = { ...lesson.experience!.quiz[0]!, question: "Hány pontot ér ez a feladattípus a felvételin?", intent: "apply" };
    const a = auditExperience(lesson.experience!);
    assert.equal(a.quiz.counts.meta, 1);
    assert.equal(a.quiz.status, "meta");
    assert.deepEqual(a.quiz.items.filter((i) => i.kind === "meta").map((i) => i.id), [lesson.experience!.quiz[0]!.id]);
  });
});

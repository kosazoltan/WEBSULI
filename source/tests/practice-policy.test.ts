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

describe("practice-policy: review #625", () => {
  it("a formátum önmagában nem alkalmazás (number)", () => {
    assert.equal(classifyQuizItem(q("Mikor volt a mohácsi csata?", ["1526", "1541", "1456"], { format: "number" })).kind, "fogalmi");
    assert.equal(classifyQuizItem(q("Hány csont alkotja a felnőtt ember csontvázát?", ["206", "106", "306"], { format: "number" })).kind, "fogalmi");
  });
  it("képlet hiányzó tagjának felidézése fogalmi", () => {
    assert.equal(classifyQuizItem(q("A háromszög területe = alap × magasság / ___", ["2", "3", "4"], { format: "fillGap" })).kind, "fogalmi");
  });
  it("sport-pontérték nem a feladatlap pontozása", () => {
    assert.notEqual(classifyQuizItem(q("Hány pontot ér egy büntetődobás a kosárlabdában?", ["1", "2", "3"])).kind, "meta");
    assert.notEqual(classifyQuizItem(q("Egy kosárlabdázó büntetőt dobott, és bement. Hány pontot kap?", ["1 pont", "2 pont", "3 pont"])).kind, "meta");
  });
  it("idézet vagy két szám nem menti fel a feladatlap szerkezetére kérdező tételt", () => {
    assert.equal(classifyQuizItem(q("Milyen feladattípus szerepel a „Szólások” feladatlapon?", ["párosítás", "esszé", "teszt"])).kind, "meta");
    assert.equal(classifyQuizItem(q("Hány feladat szerepel a 2026-os felvételi 1. lapján?", ["8", "10", "12"])).kind, "meta");
  });
  it("review #625/2: konkrét számolás hiánnyal (12 + ___ = 20) alkalmazás, a szimbolikus képlet fogalmi", () => {
    assert.equal(classifyQuizItem(q("12 + ___ = 20", ["6", "8", "10"], { format: "fillGap" })).kind, "alkalmazas");
    assert.equal(classifyQuizItem(q("A háromszög területe = alap × magasság / ___", ["2", "3", "4"], { format: "fillGap" })).kind, "fogalmi");
  });
  it("review #625/2: fogalompár-korlátos banknál a maximum fölötti alkalmazás sem teljesül", async () => {
    const { practiceTarget } = await import("../shared/practice-policy");
    const t = practiceTarget(12, 10);
    assert.equal(t.limited, true);
    const units = [{ sectionIndex: 0, conceptIds: Array.from({ length: 10 }, (_, i) => `c${i}`) }];
    const exp = { quiz: Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, question: i < 5 ? `Számold ki: ${i} + 7 = ?` : `Mi a(z) c${i} jelentése?`, options: ["1", "2", "3"], sectionIndex: 0 })), tasks: [], bankPlan: { units } };
    const a = auditExperience(exp as never);
    assert.ok(a.quiz.counts.alkalmazas > a.quiz.target.max, `alkalmazás ${a.quiz.counts.alkalmazas} > max ${a.quiz.target.max}`);
    assert.equal(a.quiz.status, "magas");
  });
  it("a felső határ (75%) fölött nem teljesül", () => {
    const exp = { quiz: Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, question: `Számold ki: ${i} + 7 = ?`, options: ["1", "2", "3"] })), tasks: [] };
    const a = auditExperience(exp as never);
    assert.equal(a.quiz.counts.alkalmazas, 12);
    assert.equal(a.quiz.status, "magas");
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

describe("TG-P4a: meta-kapu a bankcsomag elfogadásán", () => {
  it("a meta-kvíz és a meta-nyílt feladat hibát ad, a gyakorlati és a fogalmi nem", async () => {
    const { practiceMetaProblems } = await import("../shared/practice-policy");
    const p = practiceMetaProblems({
      quiz: [q("Hány pontot ér a felvételi 2. feladata?", ["2 pont", "4 pont", "6 pont"]), q("Melyik mondatban helyes az elválasztás?", ["a-lma", "al-ma", "alm-a"]), q("Mit jelent a szólás?", ["a", "b", "c"])],
      tasks: [{ q: "Mondd el, hány pontot ér a felvételin a szólásos feladat!", sample: "4" }, { q: "Egészítsd ki: Lassan járj, tovább ___!", sample: "érsz" }],
    });
    assert.equal(p.length, 2);
    // review #629: a `bank-repair.ts` `repairPermissions` útvonal-formája (`quiz.0` / `tasks.0`) — célzott csere, nem teljes újraírás.
    assert.match(p[0], /^quiz\.0: /);
    assert.match(p[1], /^tasks\.0: /);
    assert.match(p.join(" "), /tanított tartalom/);
  });
  it("review #629: a geometriai pont nem meta, a tanuló válaszának pontozása nyílt feladatként is meta", async () => {
    const { practiceMetaProblems } = await import("../shared/practice-policy");
    assert.notEqual(classifyQuizItem(q("Hány pont határoz meg egy egyenest?", ["1 pont", "2 pont", "3 pont"])).kind, "meta");
    assert.equal(classifyOpenTask({ q: "Lili jól aláhúzta a szót, de csak az egyik jelentést írta le helyesen. Hány pontot kap?", sample: "1 pont" }).kind, "meta");
    assert.equal(practiceMetaProblems({ tasks: [{ q: "Lili jól aláhúzta a szót, de csak az egyik jelentést írta le helyesen. Hány pontot kap?", sample: "1 pont" }] }).length, 1);
  });
  it("review #629/2: azonosítós tételnél `<id>: …` — a célzott javítás és a tartalékos kivétel (salvagePacket) is a tételhez köti", async () => {
    const { practiceMetaProblems } = await import("../shared/practice-policy");
    const { salvagePacket } = await import("../server/studio/experience-builder");
    const meta = { id: "q-meta", ...q("Hány pontot ér a felvételi 2. feladata?", ["2 pont", "4 pont", "6 pont"]) };
    const ok = { id: "q-ok", ...q("Melyik mondatban helyes az elválasztás?", ["a-lma", "al-ma", "alm-a"]) };
    const p = practiceMetaProblems({ quiz: [meta, ok] });
    assert.deepEqual(p.map((s) => s.split(":")[0]), ["q-meta"]);
    const packet = { methods: [], tasks: [], quiz: [meta, ok] };
    const saved = salvagePacket(packet, (pk) => practiceMetaProblems(pk), 3);
    assert.deepEqual(saved?.removed, ["q-meta"]);
  });
  it("a bankcsomag-validátor hívja", async () => {
    const { readFileSync } = await import("node:fs");
    assert.match(readFileSync(new URL("../server/studio/experience-builder.ts", import.meta.url), "utf8"), /practiceMetaProblems\(/);
  });
});

describe("TG-P4b: gyakorlati kvóta a bankcsomagon", () => {
  const app = (i: number) => q(`Számold ki: ${i} + 7 = ?`, ["1", "2", "3"]);
  const rec = (i: number) => q(`Mit jelent a(z) fogalom${i}?`, ["a", "b", "c"]);
  it("10 kvízből 4 alkalmazás bukik, 6 átmegy (a feladatbankra is)", async () => {
    const { practiceQuotaProblems } = await import("../shared/practice-policy");
    const tasks = (k: number) => Array.from({ length: 5 }, (_, i) => (i < k ? { q: `Számold ki: ${i} · 3 = ?`, sample: "x" } : { q: `Mit jelent a fogalom${i}?`, sample: "x" }));
    const bad = practiceQuotaProblems({ quiz: [...[0, 1, 2, 3].map(app), ...[4, 5, 6, 7, 8, 9].map(rec)], tasks: tasks(3) }, 2);
    assert.equal(bad.length, 1);
    assert.match(bad[0], /^quiz: 10 tételből 4 igazolt alkalmazás; legalább 6/);
    assert.deepEqual(practiceQuotaProblems({ quiz: [...[0, 1, 2, 3, 4, 5].map(app), ...[6, 7, 8, 9].map(rec)], tasks: tasks(3) }, 2), []);
    assert.match(practiceQuotaProblems({ quiz: [...[0, 1, 2, 3, 4, 5].map(app), ...[6, 7, 8, 9].map(rec)], tasks: tasks(1) }, 2).join(" "), /^tasks: 5 tételből 1/);
  });
  it("korlátozott csomag (12 tétel, 10 kötelező pár) a maximumot kéri, a bizonytalan nem számít", async () => {
    const { practiceQuota, practiceQuotaProblems } = await import("../shared/practice-policy");
    assert.deepEqual(practiceQuota(12, 10, 0).quiz, { min: 2, max: 2 });
    const unsure = q("Melyik a legszebb?", ["a", "b", "c"]);
    assert.equal(practiceQuotaProblems({ quiz: [unsure, unsure, ...Array.from({ length: 10 }, (_, i) => rec(i))], tasks: [] }, 10).length, 1);
  });
  it("a szerződés tartalmazza a számokat, és a csomag-validátor hívja", async () => {
    const { bankPacketContract } = await import("../shared/lesson-experience");
    const args = { sectionIndex: 0, conceptIds: ["a", "b"], methodKinds: ["guided"], taskCount: 4, taskTarget: 5, quizCount: 8, quizTarget: 10 };
    const prev = process.env.STUDIO_PRACTICE_QUOTA;
    try {
      delete process.env.STUDIO_PRACTICE_QUOTA;
      assert.doesNotMatch(bankPacketContract(args), /GYAKORLATI ARÁNY/, "kapcsoló KI: a szerződés változatlan");
      process.env.STUDIO_PRACTICE_QUOTA = "on";
      assert.match(bankPacketContract(args), /GYAKORLATI ARÁNY[^\n]*quiz: legalább 6, legfeljebb 7[^\n]*tasks: legalább 3/);
    } finally {
      if (prev === undefined) delete process.env.STUDIO_PRACTICE_QUOTA; else process.env.STUDIO_PRACTICE_QUOTA = prev;
    }
    const { readFileSync } = await import("node:fs");
    assert.match(readFileSync(new URL("../server/studio/experience-builder.ts", import.meta.url), "utf8"), /if \(practiceQuotaEnabled\(\)\) problems\.push\(\.\.\.practiceQuotaProblems\(packet, unit\.conceptIds\.length\)\)/);
  });
});

describe("review #631: kvóta-sáv és a csomag-validátor viselkedése", () => {
  it("a felső határ a fogalompár-maximumnál nem lehet nagyobb, és min ≤ max; a cél is a sorban", async () => {
    const { practiceQuota, practiceQuotaLine } = await import("../shared/practice-policy");
    // N=10, C=4: alsó 6, felső 7, maximum 6 → a sáv 6–6 (nem 6–7).
    assert.deepEqual(practiceQuota(10, 4, 0).quiz, { min: 6, max: 6, goal: 6 });
    for (let n = 0; n <= 40; n++) for (let c = 0; c <= n; c++) { const q = practiceQuota(n, c, n).quiz; assert.ok(q.min <= q.max && q.max <= Math.max(0, n - c), `${n}/${c}`); }
    assert.match(practiceQuotaLine(9, 2, 6), /cél: 6/);
  });
  it("kapcsoló BE: a valódi banképítő a kevés alkalmazású csomagot javító körre küldi (a hibaüzenet a kérésben), KI: nem", async () => {
    const { buildLessonExperience } = await import("../server/studio/experience-builder");
    const { standardFusionFixture } = await import("../shared/fixtures/lesson-fusion");
    const run = async (flag: string | undefined) => {
      const prev = process.env.STUDIO_PRACTICE_QUOTA;
      if (flag === undefined) delete process.env.STUDIO_PRACTICE_QUOTA; else process.env.STUDIO_PRACTICE_QUOTA = flag;
      const seen: string[] = [];
      try {
        const lesson = standardFusionFixture(); const e = lesson.experience!;
        const recall = e.quiz.map((q, i) => ({ ...q, question: `Mit jelent a(z) ${i}. fogalom a fejezetben?` }));
        await buildLessonExperience(lesson, [], { call: async (...args: unknown[]) => { seen.push(JSON.stringify(args)); return { methods: e.methods, tasks: e.tasks, quiz: recall, glossary: [] }; } }).catch(() => undefined);
      } finally {
        if (prev === undefined) delete process.env.STUDIO_PRACTICE_QUOTA; else process.env.STUDIO_PRACTICE_QUOTA = prev;
      }
      return seen.join("\n");
    };
    assert.match(await run("on"), /igazolt alkalmazás; legalább/);
    assert.doesNotMatch(await run(undefined), /igazolt alkalmazás; legalább/);
  });
});

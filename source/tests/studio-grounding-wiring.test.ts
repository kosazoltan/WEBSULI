import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkCoverageGate, type MapConcept } from "../server/studio/coverage";
import { scopeRequestParams } from "../server/studio/one-step";
import type { Lesson } from "../shared/lesson-schema";

/**
 * #196 — a MEGALAPOZOTTSÁGI kapu BEKÖTÉSÉNEK őrzése.
 *
 * A `studio-grounding.test.ts` a mérő logikáját fedi. Ezek a tesztek azt őrzik,
 * hogy a mérő tényleg BE VAN KÖTVE a publikálási útba, és hogy a bemenete
 * (a fogalom megnevezése) egyáltalán megérkezik a DB-ből.
 *
 * MÉRVE (reverz-mutáció): enélkül négy mutáció TÚLÉLT — a kapu kikapcsolása,
 * a `term` betöltésének törlése, a rövid-blokk szűrő és a kép-felbontás
 * visszaállítása mind zöld suite mellett ment volna át. Egy be nem kötött kapu
 * pontosan annyit ér, mint a hiányzó kapu.
 */

const CONCEPTS: MapConcept[] = [
  { localId: "C01", term: "Háromszög területe", examWeight: "core" },
  { localId: "C21", term: "Körgyűrű területe", examWeight: "supporting" },
];

/** A valós Kristóf-eset kicsinyítve: geometriai címkék helyiérték-szövegen. */
const MISLABELLED = {
  title: "Teszt",
  subject: "Matematika",
  classroom: 4,
  mapId: "m1",
  sourceOnly: true,
  misconceptions: [],
  sections: [
    {
      heading: "Helyiérték",
      probaEnabled: false,
      blocks: [
        {
          kind: "explain",
          depth: "core",
          readAloud: false,
          text: "A természetes számokat számjegyekkel írjuk le, és a helyiérték számít.",
          coversConceptIds: ["C01", "C21"],
        },
      ],
    },
  ],
} as unknown as Lesson;

test("a publikálási kapu ELUTASÍTJA a hamisan címkézett leckét", () => {
  const g = checkCoverageGate(MISLABELLED, CONCEPTS);
  assert.equal(g.ok, false, "a megalapozottsági mérésnek hatnia kell a kapu döntésére");
  assert.ok(g.ungrounded.length >= 2, "a megalapozatlan címkéket jelenteni kell");
  assert.ok(
    g.reasons.some((r) => /nem a forrásból dolgozott/.test(r)),
    `a kapu indoklásában szerepelnie kell az okot megnevező szövegnek: ${g.reasons.join(" | ")}`,
  );
});

test("a valóban tanító lecke ÁTMEGY (a kapu nem vaktában buktat)", () => {
  const good = JSON.parse(JSON.stringify(MISLABELLED)) as Lesson;
  good.sections[0].blocks[0] = {
    ...good.sections[0].blocks[0],
    text: "A háromszög területe T = a · ma / 2, a körgyűrű területe pedig π(R² − r²).",
  } as never;
  const g = checkCoverageGate(good, CONCEPTS);
  assert.equal(g.ok, true, `helyes lecke nem bukhat: ${g.reasons.join(" | ")}`);
  assert.deepEqual(g.ungrounded, []);
});

test("egy pár szavas blokk nem alapozhat meg fogalmat (rövid-blokk szűrő él)", () => {
  // A szűrő nélkül a puszta cím-ismétlés („Háromszög területe.") megalapozott
  // tanításnak számítana, holott nem tanít semmit. Mérve: a szűrő kikapcsolása
  // ezt a blokkot átengedi, ezért itt PONTOSAN a határon mérünk.
  const terse = JSON.parse(JSON.stringify(MISLABELLED)) as Lesson;
  terse.sections[0].blocks[0] = {
    kind: "explain",
    depth: "core",
    readAloud: false,
    text: "Háromszög területe.",
    coversConceptIds: ["C01"],
  } as never;

  const g = checkCoverageGate(terse, CONCEPTS);
  assert.equal(g.ok, false, "három szó nem tanít fogalmat, bármit állít a címke");
  assert.ok(
    g.ungrounded.some((u) => u.conceptId === "C01"),
    `a rövid blokknak megalapozatlannak kell lennie: ${JSON.stringify(g.ungrounded)}`,
  );
});

test("a fogalom megnevezése BETÖLTŐDIK a térkép-lekérdezésekben", () => {
  // Statikus kötés: a `term` nélkül a kapu némán nem mérne semmit — ez a
  // csendes kikapcsolás legvalószínűbb útja egy későbbi refaktorban.
  const src = readFileSync(new URL("../server/studio/step-runner.ts", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const selects = code.match(/localId:\s*kmConcepts\.localId/g) ?? [];
  const terms = code.match(/term:\s*kmConcepts\.term/g) ?? [];
  assert.ok(selects.length > 0, "legalább egy fogalom-lekérdezésnek lennie kell");
  assert.equal(
    terms.length,
    selects.length,
    `minden fogalom-lekérdezésnek be kell töltenie a term mezőt (${terms.length}/${selects.length})`,
  );
});

test("a scope-hívás képei NAGY felbontással mennek (a szint a tartalomból jön)", () => {
  const params = scopeRequestParams("m", [
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,AA", detail: "high" } },
  ]);
  const content = params.messages[1].content as Array<{ type: string; image_url?: { detail: string } }>;
  assert.equal(content.find((p) => p.type === "image_url")?.image_url?.detail, "high");

  // És a hívó tényleg `high`-t ad át — különben a fenti csak önmagát bizonyítja.
  const src = readFileSync(new URL("../server/studio/one-step.ts", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(
    code,
    /image_url:\s*\{\s*url:\s*file\.content,\s*detail:\s*"high"\s*\}/,
    "a callScopeModel nem eshet vissza low felbontásra",
  );
});

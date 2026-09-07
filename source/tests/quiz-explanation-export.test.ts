import assert from "node:assert/strict";
import test from "node:test";

import { exportQuizItemsFromChecks } from "../server/studio/quiz-export";
import type { Lesson } from "../shared/lesson-schema";

/**
 * T-1 — a lecke magyarázatai jussanak el a JÁTÉKOKBA.
 *
 * A lecke-séma LS-2 óta megköveteli, hogy a `check` blokk MINDEN
 * válaszlehetőségéhez tartozzon visszajelzés — a rossz válasz az, ahol a
 * tanulás történik. A játékokba exportált kérdések viszont csak a kérdést, a
 * válaszokat és a helyes indexet vitték magukkal: ugyanaz a kérdés a leckében
 * tanított, a játékban némán büntetett.
 *
 * Az export mostantól a magyarázatot is átadja. A választás — a HELYES opció
 * visszajelzése — azért ez, mert az mondja meg, MIÉRT jó a jó válasz; a
 * konkrét rossz opcióhoz tartozó mondatot a játék nem tudná kiválasztani, mert
 * a kevert sorrend miatt az indexek nem őrizhetők meg.
 */

const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  title: "A víz körforgása",
  subject: "Természetismeret",
  classroom: 4,
  mapId: "map-1",
  sourceOnly: true,
  misconceptions: [],
  sections: [
    {
      heading: "Szakasz",
      probaEnabled: true,
      blocks: [
        {
          kind: "check",
          question: "Mi történik a vízzel, amikor a magasban lehűl?",
          options: ["Elpárolog", "Lecsapódik"],
          correctIndex: 1,
          feedbackPerOption: [
            "A párolgás a felszálló ág, nem a lehűlés.",
            "Így van: a gőz lehűlve apró cseppekké áll össze — ez a lecsapódás.",
          ],
          coversConceptIds: ["lecsapodas"],
        },
      ],
    },
  ],
  ...over,
});

test("az exportált kérdés magával viszi a magyarázatot", () => {
  const rows = exportQuizItemsFromChecks(lesson(), "space-asteroid-quiz");

  assert.equal(rows.length, 1);
  assert.equal(
    rows[0]?.explanation,
    "Így van: a gőz lehűlve apró cseppekké áll össze — ez a lecsapódás.",
    "a helyes opció visszajelzése a magyarázat",
  );
});

test("hiányzó visszajelzésnél nem talál ki semmit", () => {
  const broken = lesson();
  // Romlott adat: a séma ezt nem engedné, de a DB-ben régi sor is lehet.
  (broken.sections[0]!.blocks[0] as { feedbackPerOption: string[] }).feedbackPerOption = [];

  const rows = exportQuizItemsFromChecks(broken, "space-asteroid-quiz");

  assert.equal(rows[0]?.explanation, null, "üres magyarázat helyett kitalált mondat sosem mehet ki");
});

test("a helyes index a visszajelzés-tömbön kívülre mutat: nincs magyarázat", () => {
  const broken = lesson();
  (broken.sections[0]!.blocks[0] as { correctIndex: number }).correctIndex = 9;

  const rows = exportQuizItemsFromChecks(broken, "space-asteroid-quiz");

  assert.equal(rows[0]?.explanation, null);
});

test("a magyarázat nem hosszabb, mint amit a kártya elbír", () => {
  const long = lesson();
  (long.sections[0]!.blocks[0] as { feedbackPerOption: string[] }).feedbackPerOption = [
    "rövid",
    "x".repeat(900),
  ];

  const rows = exportQuizItemsFromChecks(long, "space-asteroid-quiz");

  // A játék kártyája néhány sort mutat; a 900 karakteres szöveg ott olvashatatlan.
  assert.ok((rows[0]?.explanation?.length ?? 0) <= 300, `${rows[0]?.explanation?.length} karakter`);
});

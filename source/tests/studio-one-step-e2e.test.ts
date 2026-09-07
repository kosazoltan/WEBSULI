import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceJob,
  runPipelineStep,
  type JobPatch,
  type JobView,
  type MapMeta,
  type PipelineStore,
  type PublishInput,
} from "../server/studio/step-runner";
import { MAX_CHAIN_STEPS } from "../server/studio/pipeline";
import { lessonSchema, type Lesson } from "../shared/lesson-schema";
import type { IAIProvider } from "../server/ai/AIProvider";
import type { MapConcept } from "../server/studio/coverage";

/**
 * T-2 — a tananyaggyártás TELJES lánca, egyben.
 *
 * Minden darab külön tesztelt volt (a séma, a fedettség, a lépés-hívó, az
 * állapotgép), a lánc egyben viszont nem. Márpedig az élesben egyben fut, és a
 * hibák a darabok KÖZÖTT szoktak lenni.
 *
 * Ez a suite végigviszi a pedagógus → szerző → animátor → lektor → kapu utat egy
 * memóriabeli tárolóval és egy szkriptelt ál-modellel. Se hálózat, se
 * adatbázis, se API-kulcs: a futtató környezetnek nem kell semmi.
 *
 * Amit bizonyít — mind a négy állítás olyan, ami a GYEREKNEK számít:
 *
 *  1. a kész lecke átmegy a `lessonSchema`-n;
 *  2. minden `check` blokkhoz MINDEN válaszlehetőséghez tartozik visszajelzés
 *     (a rossz válasz az, ahol a tanulás történik);
 *  3. a lecke `sourceOnly: true` — nem állíthatja, hogy a forráson túlról merített;
 *  4. a lánc `done`-ban áll meg, a `MAX_CHAIN_STEPS` korláton belül, és a leckét
 *     tényleg PUBLIKÁLJA — a nem publikált lecke a gyereknek nem létezik.
 *
 * Amit NEM bizonyít, és ezt fontos kimondani: azt nem, hogy a modell JÓ
 * tananyagot ír. Azt csak valódi forrás és valódi modellhívás mutatja meg. Ez a
 * teszt a gépezetet méri, nem a tartalom minőségét.
 */

/* --------------------------- a próba-tudástérkép --------------------------- */

const MAP_META: MapMeta = {
  id: "map-e2e",
  title: "A víz körforgása",
  subject: "Természetismeret",
  classroom: 4,
};

/**
 * A tárolóból érkező fogalmak alakja `MapConcept` (`server/studio/coverage.ts`),
 * NEM a nyers `Concept` a tudástérkép-sémából: a futószalag csak az
 * azonosítót, a súlyt és a megnevezést kapja meg. Az első próbámban a nyers
 * alakot használtam `as` átvezetéssel — a teszt futott, a típusellenőrzés
 * viszont kibukott, és jogosan: a `localId` hiányzott volna.
 */
const CONCEPTS: MapConcept[] = [
  { localId: "parolgas", term: "Párolgás", examWeight: "core" },
  { localId: "lecsapodas", term: "Lecsapódás", examWeight: "core" },
  { localId: "csapadek", term: "Csapadék", examWeight: "supporting" },
];

const ALL_IDS = CONCEPTS.map((c) => c.localId);

/* ------------------------------ a kész lecke ------------------------------ */

const LESSON: Lesson = {
  title: "A víz körforgása",
  subject: "Természetismeret",
  classroom: 4,
  mapId: MAP_META.id,
  sourceOnly: true,
  misconceptions: [
    { conceptId: "parolgas", text: "A párolgáshoz nem kell forrás — a tócsa is elpárolog." },
  ],
  sections: [
    {
      heading: "A víz útja",
      probaEnabled: true,
      blocks: [
        {
          kind: "explain",
          depth: "core",
          readAloud: true,
          text: "A víz a Nap melegétől vízgőzzé válik, felszáll, majd lehűlve cseppekké áll össze.",
          coversConceptIds: ["parolgas", "lecsapodas"],
        },
        {
          kind: "example",
          problem: "Miért tűnik el a tócsa a napsütésben?",
          steps: ["A Nap melegíti a vizet.", "A víz vízgőzzé válik.", "A gőz felszáll a levegőbe."],
          answer: "Elpárolog.",
          coversConceptIds: ["parolgas"],
        },
        {
          kind: "check",
          question: "Mi történik a vízzel, amikor a magasban lehűl?",
          options: ["Elpárolog", "Lecsapódik", "Megfagy a talajon", "Eltűnik"],
          correctIndex: 1,
          feedbackPerOption: [
            "A párolgás lefelé nem működik: az a felszálló ág, a lehűlés a másik.",
            "Így van: a gőz lehűlve apró cseppekké áll össze — ez a lecsapódás.",
            "A talajon fagyás külön jelenség; itt a magasban vagyunk.",
            "A víz nem tűnik el, csak halmazállapotot vált.",
          ],
          coversConceptIds: ["lecsapodas"],
        },
        {
          kind: "check",
          question: "Hogyan jut vissza a víz a földre?",
          options: ["Csapadékként", "Párolgással", "Sehogy"],
          correctIndex: 0,
          feedbackPerOption: [
            "Pontosan: esőként vagy hóként, ez a csapadék.",
            "A párolgás felfelé viszi a vizet, nem vissza.",
            "Visszajut — különben elfogyna a földi víz.",
          ],
          coversConceptIds: ["csapadek"],
        },
        { kind: "recap", bullets: ["Párolgás → lecsapódás → csapadék."] },
      ],
    },
  ],
};

const OUTLINE = {
  sections: [
    {
      heading: "A víz útja",
      conceptIds: ALL_IDS,
      plannedBlocks: ["explain", "example", "check", "recap"],
      animationSuggestions: ["A körforgás nyilakkal"],
    },
  ],
  misconceptions: [
    { conceptId: "parolgas", text: "A párolgáshoz nem kell forrás — a tócsa is elpárolog." },
  ],
};

/* ---------------------------- memóriabeli tároló ---------------------------- */

type Recorded = { published: PublishInput | null; lessons: unknown[] };

function makeStore(job: JobView, recorded: Recorded): PipelineStore {
  return {
    loadJob: async () => ({ ...job }),
    loadMap: async () => ({ meta: MAP_META, concepts: CONCEPTS }),
    loadBlockerNotes: async () => [],
    /**
     * A Drizzle `.set()` szemantikáját utánozza: az `undefined` mezőket KIHAGYJA
     * (`mapUpdateSet` a drizzle-orm/utils.js-ben szűri őket).
     *
     * Ez nem apró részlet: a `successPatch` minden lépésben kiírja a
     * `lessonId`-t, animátornál és lektornál `undefined` értékkel. Egy naiv
     * `Object.assign` ezzel TÖRÖLNÉ a szerző lépés által mentett azonosítót, és
     * a kapu „nincs lecke a jobban" hibával állna meg — egy hibával, ami
     * élesben nem létezik, csak a tesztben. (Én is beleestem: az első futásom
     * pontosan ezen bukott, és percekig valódi hibának látszott.)
     */
    saveStep: async (_id: string, patch: JobPatch) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) (job as Record<string, unknown>)[key] = value;
      }
    },
    saveNotes: async () => {},
    upsertLesson: async (lessonId, _mapId, json) => {
      recorded.lessons.push(json);
      return lessonId ?? "lesson-e2e";
    },
    publishLesson: async (input) => {
      recorded.published = input;
      return { htmlFileId: "html-e2e", exportedQuizItems: 2 };
    },
    createJob: async () => "job-e2e",
  };
}

/** Szkriptelt ál-modell: lépésenként a séma szerinti választ adja. */
function scriptedProvider(step: () => string): IAIProvider {
  return {
    name: "stub",
    model: "stub/model",
    chat: async () => ({
      content: step(),
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }),
    isAvailable: async () => true,
  } as unknown as IAIProvider;
}

async function runChain(): Promise<{ job: JobView; recorded: Recorded; steps: number }> {
  const job: JobView = {
    id: "job-e2e",
    lessonId: null,
    mapId: MAP_META.id,
    step: "pedagogue",
    status: "running",
    round: 0,
    inputHash: "",
    output: null,
    error: null,
  };
  const recorded: Recorded = { published: null, lessons: [] };
  const store = makeStore(job, recorded);

  const deps = {
    store,
    keyConfigured: () => true,
    promptLookup: async (_name: string, fallback: string) => fallback,
    providerFactory: () =>
      scriptedProvider(() => {
        switch (job.step) {
          case "pedagogue":
            return JSON.stringify(OUTLINE);
          case "author":
          case "animator":
            return JSON.stringify(LESSON);
          case "lektor":
            // Kifogástalan lecke: nincs blokkoló jegyzet.
            return JSON.stringify({ notes: [] });
          default:
            return "{}";
        }
      }),
  };

  let steps = 0;
  while (job.step !== "done" && job.step !== "error" && steps < MAX_CHAIN_STEPS + 2) {
    steps += 1;
    const outcome = await runPipelineStep(job.id, deps);

    // A vázlat automatikus jóváhagyása: a gépi fedettség-mérés a pedagógus
    // lépésben már lefutott, ezért nincs mire várni (LS-6 egygombos gyártás).
    if (job.step === "pedagogue" && outcome.ok) {
      job.output = { ...(job.output ?? {}), approvedOutline: OUTLINE };
    }
    await advanceJob(job.id, outcome.next, { status: outcome.ok ? "ok" : "running" }, deps);
    if (!outcome.ok && !("parked" in outcome && outcome.parked)) break;
  }

  return { job, recorded, steps };
}

/* --------------------------------- tesztek --------------------------------- */

test("a lánc végigfut és `done` állapotban áll meg", async () => {
  const { job, steps } = await runChain();

  assert.equal(job.step, "done", `a lánc ${job.step} állapotban állt meg: ${job.error ?? ""}`);
  assert.ok(steps <= MAX_CHAIN_STEPS, `${steps} lépés, a korlát ${MAX_CHAIN_STEPS}`);
});

test("a kész lecke átmegy a séma-ellenőrzésen", async () => {
  const { recorded } = await runChain();

  assert.ok(recorded.lessons.length > 0, "egyetlen leckét sem mentett a lánc");
  const parsed = lessonSchema.safeParse(recorded.lessons[recorded.lessons.length - 1]);
  assert.ok(parsed.success, `a mentett lecke alakilag hibás: ${JSON.stringify(parsed.error?.issues)}`);
});

test("minden válaszlehetőséghez tartozik visszajelzés — a rossz válasz is tanít", async () => {
  const { recorded } = await runChain();
  const lesson = lessonSchema.parse(recorded.lessons[recorded.lessons.length - 1]);

  let checks = 0;
  for (const section of lesson.sections) {
    for (const block of section.blocks) {
      if (block.kind !== "check") continue;
      checks += 1;
      assert.equal(
        block.feedbackPerOption.length,
        block.options.length,
        `"${block.question}": ${block.options.length} válasz, ${block.feedbackPerOption.length} visszajelzés`,
      );
      for (const text of block.feedbackPerOption) {
        assert.ok(text.trim().length > 0, "üres visszajelzés");
      }
    }
  }
  assert.ok(checks > 0, "a lecke egyetlen kérdést sem tartalmaz");
});

test("a lecke nem állíthatja, hogy a forráson túlról merített", async () => {
  const { recorded } = await runChain();
  const lesson = lessonSchema.parse(recorded.lessons[recorded.lessons.length - 1]);

  assert.equal(lesson.sourceOnly, true);
});

test("a kapu a `core` fogalmakra teljes fedettséget mér, és publikál", async () => {
  const { recorded } = await runChain();

  assert.ok(recorded.published, "a lánc lefutott, de a leckét nem publikálta — a gyereknek így nem létezik");
  const coverage = recorded.published!.coverage;

  assert.equal(coverage.core.total, 2, "két core fogalom van a térképen");
  assert.equal(coverage.core.covered, 2, "minden core fogalmat tanítania kell");
  assert.ok(coverage.supporting.ratio >= 0.9, `kiegészítő fedettség: ${coverage.supporting.ratio}`);
});

test("API-kulcs nélkül a lánc nem indul el, és ezt meg is mondja", async () => {
  const job: JobView = {
    id: "job-nokey",
    lessonId: null,
    mapId: MAP_META.id,
    step: "pedagogue",
    status: "running",
    round: 0,
    inputHash: "",
    output: null,
    error: null,
  };
  const recorded: Recorded = { published: null, lessons: [] };

  const outcome = await runPipelineStep(job.id, {
    store: makeStore(job, recorded),
    keyConfigured: () => false,
    promptLookup: async (_n, fallback) => fallback,
    providerFactory: () => scriptedProvider(() => "{}"),
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.next.step, "error");
  assert.ok(
    !outcome.ok && outcome.reason.includes("OPENROUTER_API_KEY"),
    "a hibaüzenetnek meg kell mondania, mi hiányzik",
  );
});

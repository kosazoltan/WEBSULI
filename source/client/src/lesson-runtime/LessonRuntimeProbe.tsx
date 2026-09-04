import { LessonRuntime } from "./LessonRuntime";
import type { Lesson } from "@shared/lesson-schema";

/**
 * A fixed lesson used to render the runtime in a browser test (LS-2).
 *
 * The runtime is what a child actually touches, so the properties that matter — does it
 * fit a 360 px phone, is every answer reachable with a thumb, does a wrong answer
 * explain itself — can only be measured by rendering it. A unit test asserting on
 * className strings would prove none of that.
 *
 * Mounted only when the build sets VITE_ENABLE_RUNTIME_PROBE=1 (see App.tsx and the
 * `build:e2e` script), so it never ships in the released bundle.
 */
const PROBE_LESSON: Lesson = {
  title: "Fotoszintézis",
  subject: "biológia",
  classroom: 7,
  mapId: "probe-map",
  sourceOnly: true,
  misconceptions: [{ conceptId: "c1", text: "Sokan a gyökérre gondolnak." }],
  sections: [
    {
      heading: "Hol zajlik?",
      probaEnabled: true,
      blocks: [
        {
          kind: "explain",
          text: "A fotoszintézis a levél sejtjeiben, a kloroplasztiszokban zajlik. A növény a fény energiáját használja fel ahhoz, hogy szén-dioxidból és vízből szerves anyagot állítson elő.",
          depth: "core",
          readAloud: true,
          coversConceptIds: ["c1"],
        },
        {
          kind: "example",
          problem: "Miért nem tud a növény éjszaka fotoszintetizálni?",
          steps: [
            "A fotoszintézishez fényenergia kell.",
            "Éjszaka nincs napfény.",
            "Ezért a folyamat leáll, de a légzés folytatódik.",
          ],
          answer: "Mert nincs fény, ami hajtaná a folyamatot.",
          coversConceptIds: ["c1"],
        },
        {
          kind: "check",
          question: "A növény melyik részében zajlik a fotoszintézis?",
          options: [
            "A levél kloroplasztiszaiban",
            "A gyökér csúcsán",
            "A virág porzójában",
          ],
          correctIndex: 0,
          feedbackPerOption: [
            "Így van! A zöld színtestek, a kloroplasztiszok végzik a munkát.",
            "Nem a gyökér: az vizet és ásványi anyagot vesz fel, de fény nem éri.",
            "A virág a szaporodásé; a fotoszintézis a zöld levélben történik.",
          ],
          hint: "Gondolj arra, melyik rész zöld — mitől zöld egy levél?",
          coversConceptIds: ["c1"],
        },
        {
          kind: "recap",
          bullets: [
            "A fotoszintézis a kloroplasztiszokban zajlik.",
            "Fény, víz és szén-dioxid kell hozzá.",
          ],
        },
      ],
    },
  ],
};

export default function LessonRuntimeProbe() {
  return <LessonRuntime lesson={PROBE_LESSON} />;
}

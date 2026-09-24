import { LessonRuntime } from "./LessonRuntime";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
import type { CouponSession } from "@/game-engine/useCouponSession";
import { lessonSchema, type AnimKind, type Lesson } from "@shared/lesson-schema";
import { useEffect, useState } from "react";
import { fusionFixture } from "@shared/fixtures/lesson-fusion";
import { EXPERIENCE_THEMES } from "@shared/lesson-experience";

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
          kind: "animate",
          animKind: "numberLine",
          params: { from: 0, to: 10, highlightTo: 7 },
          caption: "A fényerősség skálája",
          coversConceptIds: ["c1"],
        },
        {
          kind: "try",
          tryKind: "fillBlank",
          spec: {
            text: "A fotoszintézis a ___ részében zajlik, és ___ energiáját használja.",
            answers: ["levél", "fény"],
          },
          coversConceptIds: ["c1"],
        },
        {
          kind: "try",
          tryKind: "dragSort",
          spec: {
            prompt: "Rendezd a folyamat lépéseit helyes sorrendbe:",
            items: ["Fény éri a levelet", "A kloroplasztisz energiát köt meg", "Szerves anyag keletkezik"],
            correctOrder: ["Fény éri a levelet", "A kloroplasztisz energiát köt meg", "Szerves anyag keletkezik"],
          },
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

/**
 * LS-9: `?classroom=N` switches the age band (default 7 → teen) and `?sections=N`
 * repeats the single section N times, so the progress bar's 2+ branch can be rendered.
 * Non-numeric or out-of-range values fall back to the defaults — the probe must never
 * crash on a typo in a test URL.
 */
/**
 * Spec 2026-09-24 (magyarázó ábrák): `?visuals=1` — az új ábrafajták a mért esetekkel (holdciklus,
 * kiskockás téglatest, átlagár, halmazok, kerekítés), valódi böngészős render-ellenőrzéshez.
 */
const visualSection = (heading: string, text: string, animKind: AnimKind, params: Record<string, unknown>, caption: string): Lesson["sections"][number] => ({
  heading, probaEnabled: false,
  blocks: [
    { kind: "explain", text, depth: "core", readAloud: false, coversConceptIds: ["c1"] },
    { kind: "animate", animKind, params, caption, coversConceptIds: ["c1"] },
  ],
});
const VISUALS_LESSON: Lesson = {
  ...PROBE_LESSON,
  title: "Ábrák próbája",
  misconceptions: [],
  sections: [
    visualSection("A Hold fázisai", "A Hold nem világít, a Nap fényét veri vissza. Ahogy a Föld körül kering, a megvilágított oldalából mindig más részt látunk.", "cycle", {
      center: "Föld",
      phases: [
        { label: "Újhold", moon: 0, note: "a Hold a Nap és a Föld között van, nem látszik" },
        { label: "Növő sarló", moon: 0.2, waxing: true },
        { label: "Első negyed", moon: 0.5, waxing: true, note: "jobb oldali fele világos" },
        { label: "Növő hold", moon: 0.8, waxing: true },
        { label: "Telihold", moon: 1, note: "a teljes korong világos" },
        { label: "Fogyó hold", moon: 0.8, waxing: false },
        { label: "Utolsó negyed", moon: 0.5, waxing: false, note: "bal oldali fele világos" },
        { label: "Fogyó sarló", moon: 0.2, waxing: false },
      ],
    }, "A holdfázisok körforgása: kb. 29,5 nap alatt ér körbe."),
    visualSection("Téglatest kiskockákból", "Az alsó réteg 77 = 7 · 11 kiskocka. Az oldallap a réteg fölé épül: 7 · 5 = 35 kocka, így a magasság 6 egység.", "labeledShape",
      { shape: "cuboid", width: 11, depth: 7, height: 6, unit: "egység", layers: 6, note: "7 · 11 · 6 = 462 kiskocka" }, "A téglatest élei: 11, 7 és 6 egység, hat réteggel."),
    visualSection("Átlagár", "Két bolt ára 500 Ft és 480 Ft; az átlag (500 + 480) : 2 = 490 Ft.", "barChart",
      { bars: [{ label: "1. bolt", value: 500 }, { label: "2. bolt", value: 480 }], unit: "Ft/kg", average: true }, "A két ár és az átlaguk."),
    visualSection("Halmazok", "A 30 fős osztályból 22 gyereknek kék a kabátja, 23-nak kék a sapkája; legalább 15 gyereknél mindkettő kék.", "venn",
      { sets: ["kék kabát", "kék sapka"], regions: { A: "≤ 7", AB: "≥ 15", B: "≤ 8" }, universe: "30 fős osztály" }, "Kék kabát és kék sapka: a közös rész legalább 15."),
    visualSection("Kerekítés", "Százasokra kerekítve 1452 → 1500, mert 1450 és 1549 között minden szám 1500-ra kerekül.", "numberLine",
      { from: 1400, to: 1600, step: 50, marks: [{ value: 1452, label: "1452" }], jumps: [{ from: 1452, to: 1500, label: "→ 1500" }] }, "1452 százasokra kerekítve 1500."),
  ],
};

function probeLesson(search: string): Lesson {
  const q = new URLSearchParams(search);
  if (q.has("visuals")) return VISUALS_LESSON;
  if (q.has("fusion")) {
    const lesson = fusionFixture();
    const theme = EXPERIENCE_THEMES.find(t => t === q.get("theme"));
    if (theme) lesson.experience!.theme = theme;
    return lesson;
  }
  const classroom = Number(q.get("classroom"));
  const sections = Number(q.get("sections"));
  const lesson: Lesson = {
    ...PROBE_LESSON,
    classroom: Number.isInteger(classroom) && classroom >= 0 && classroom <= 12 ? classroom : PROBE_LESSON.classroom,
  };
  if (Number.isInteger(sections) && sections >= 2 && sections <= 8) {
    lesson.sections = Array.from({ length: sections }, (_, i) => ({
      ...PROBE_LESSON.sections[0],
      heading: `${PROBE_LESSON.sections[0].heading} (${i + 1})`,
    }));
  }
  return lesson;
}

export default function LessonRuntimeProbe() {
  const [candidate, setCandidate] = useState<Lesson | null>(null);
  const [error, setError] = useState("");
  const live = new URLSearchParams(window.location.search).get("candidate") === "1";
  useEffect(() => {
    if (!live) return;
    const abort = new AbortController();
    void fetch("/tmp/lesson-fusion.json", { signal: abort.signal }).then(r => { if (!r.ok) throw new Error("Hiányzó helyi jelölt."); return r.json(); }).then(value => setCandidate(lessonSchema.parse(value))).catch(e => { if (!abort.signal.aborted) setError(String(e)); });
    return () => abort.abort();
  }, [live]);
  if (live && !candidate) return <p>{error || "Helyi jelölt betöltése…"}</p>;
  // Stable persistId so B7 localStorage round-trips work; no lessonId → no Próba API.
  const practice = new URLSearchParams(window.location.search).get("practice") === "1";
  return <LessonRuntime lesson={candidate ?? probeLesson(window.location.search)} lessonId={practice ? "practice-probe" : undefined} persistId={live ? "local-candidate" : "probe-lesson"} />;
}

/**
 * The coupon HUD, rendered with a fixed session (LS-3b).
 *
 * The HUD is a fixed-position overlay on top of a game, so the questions worth asking
 * are geometric: does it stay inside a 360 px phone, is it readable, and does the
 * expiry dialog offer a real way back. None of that is visible to a unit test.
 *
 * The session is a literal rather than the real hook: this measures the rendering, and
 * `tests/game-engine.test.ts` already measures the clock.
 */
export function CouponHudProbe() {
  const session: CouponSession = {
    active: true,
    remaining: 45,
    expired: false,
    lessonId: "probe-lesson",
    sectionIdx: 0,
    minutes: 2,
    claimBonus: async () => {},
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <CouponHud session={session} />
      <CouponExpiredOverlay session={{ ...session, active: false, expired: true }} />
    </div>
  );
}

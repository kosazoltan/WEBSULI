/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (12. szakasz; alap: docs/specs/2026-11-18-tananyag-gyartas-minoseg.md S6a):
 * fejezetív-készlet. A mért egyhangúság oka a szerződés volt (egyetlen ív a tervezőnek, kétszer): a fejezetek 61,6%-a pontosan azonos
 * blokksorú. A készlet minden mintája megfelel az ívkapunak (`shared/lesson-arc.ts`) — a kapu nem lazul. Tiszta modul.
 */
import { sectionRoleOf } from "./lesson-ui-text";
import { mulberry32, seedFrom } from "./seeded";

export const SECTION_KINDS = ["procedure", "description", "comparison", "any"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];
type PlannedKind = "explain" | "example" | "check" | "recap" | "animate" | "try";

export type SectionShape = { id: string; blocks: readonly PlannedKind[]; fits: readonly SectionKind[]; note: string };

export const SECTION_SHAPES: readonly SectionShape[] = [
  { id: "alap", blocks: ["explain", "example", "animate", "check", "recap"], fits: ["any", "procedure", "description", "comparison"], note: "magyarázat, kidolgozott példa, ábra, kérdés, összefoglaló" },
  { id: "megmutatas", blocks: ["explain", "animate", "example", "try", "check"], fits: ["any", "procedure", "description"], note: "előbb megmutatja (ábra), aztán levezeti és kipróbáltatja" },
  { id: "kerdesfelveto", blocks: ["explain", "example", "check", "explain", "recap"], fits: ["any", "description"], note: "a kérdés után a magyarázat mélyebbre visz (miért?)" },
  { id: "gyakorlo", blocks: ["explain", "example", "try", "check", "recap"], fits: ["any", "procedure"], note: "levezetés után kézzelfogható gyakorlás" },
  { id: "osszehasonlito", blocks: ["explain", "animate", "example", "example", "check"], fits: ["any", "comparison"], note: "két eset egymás mellett, ábrával" },
  { id: "donteshelyzet", blocks: ["explain", "example", "animate", "check"], fits: ["any", "procedure", "comparison"], note: "példa, majd döntési helyzet ábrán" },
];

const byId = new Map(SECTION_SHAPES.map((s) => [s.id, s]));

/**
 * Mintakiosztás: a típushoz illő minták közül a magból; szomszéd nem azonos; egy minta a fejezetek legfeljebb 40%-a (felfelé
 * kerekítve). Ütközésnél előbb a 40%-os, majd a szomszéd-szabály enged (rövid leckénél és szűk típusnál).
 */
export function assignSectionShapes(kinds: readonly SectionKind[], seed: number): string[] {
  const random = mulberry32(seed);
  const cap = Math.ceil(0.4 * kinds.length);
  const used = new Map<string, number>();
  const out: string[] = [];
  for (const kind of kinds) {
    const fitting = SECTION_SHAPES.filter((s) => kind === "any" || s.fits.includes(kind)).map((s) => s.id);
    const prev = out.at(-1);
    const strict = fitting.filter((id) => id !== prev && (used.get(id) ?? 0) < cap);
    const noNeighbour = fitting.filter((id) => id !== prev);
    const pool = strict.length ? strict : noNeighbour.length ? noNeighbour : fitting;
    const pick = pool[Math.floor(random() * pool.length)];
    out.push(pick);
    used.set(pick, (used.get(pick) ?? 0) + 1);
  }
  // Az ívkapu lecke-szintű szabálya: legalább egy animate / try (`no_engagement_layer`). Ha egyik kiosztott minta sem ilyen (csak a
  // `kerdesfelveto` az), az első fejezet egy illő, megmutató mintát kap — a szomszéd-szabály megtartásával, ha lehet.
  if (out.length && !out.some(engaging)) {
    const fitting = SECTION_SHAPES.filter((s) => (kinds[0] === "any" || s.fits.includes(kinds[0])) && engaging(s.id)).map((s) => s.id);
    const pool = fitting.filter((id) => id !== out[1]);
    const choice = (pool.length ? pool : fitting)[0];
    if (choice) out[0] = choice;
  }
  return out;
}

const engaging = (id: string) => byId.get(id)!.blocks.some((b) => b === "animate" || b === "try");

export type TryKind = "dragSort" | "fillBlank" | "match";
const TRY_ROTATION: readonly TryKind[] = ["dragSort", "fillBlank", "match"];
const KIND_TRY: Record<Exclude<SectionKind, "any">, TryKind> = { procedure: "dragSort", comparison: "match", description: "fillBlank" };

export type PlannedSection = { shape: string; blocks: PlannedKind[]; tryKind?: TryKind };

/**
 * S6b (terv 13. szakasz): a minták kiosztása + `try`-minimum (a fejezetek legalább harmada, felfelé kerekítve) + `try`-fajta. Ha a minták
 * kevesebb `try`-t adnak, a magból választott fejezetekbe a `check` elé (ha nincs, a záró recap elé, különben a végére) kerül `try`.
 * Fajta: a típusból; `any`-nél a magból, az előző `try` fajtáját kerülve.
 */
export function planSections(kinds: readonly SectionKind[], seed: number): PlannedSection[] {
  const ids = assignSectionShapes(kinds, seed);
  const random = mulberry32(seedFrom(`try\u0001${seed}`));
  const plan: PlannedSection[] = ids.map((id) => ({ shape: id, blocks: [...byId.get(id)!.blocks] }));
  const need = Math.ceil(plan.length / 3);
  const without = plan.map((p, i) => ({ p, i })).filter(({ p }) => !p.blocks.includes("try"));
  let missing = need - (plan.length - without.length);
  while (missing > 0 && without.length) {
    const { p } = without.splice(Math.floor(random() * without.length), 1)[0];
    const check = p.blocks.indexOf("check");
    const at = check >= 0 ? check : p.blocks.at(-1) === "recap" ? p.blocks.length - 1 : p.blocks.length;
    p.blocks.splice(at, 0, "try");
    missing--;
  }
  let previous: TryKind | undefined;
  plan.forEach((p, i) => {
    if (!p.blocks.includes("try")) return;
    const kind = kinds[i];
    if (kind !== "any") p.tryKind = KIND_TRY[kind];
    else {
      const pool = TRY_ROTATION.filter((t) => t !== previous);
      p.tryKind = pool[Math.floor(random() * pool.length)];
    }
    previous = p.tryKind;
  });
  return plan;
}

/** A kész lecke `try`-t tartalmazó fejezeteinek aránya (két tizedes). */
export function tryShare(lesson: { sections: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string }> }> }): number {
  if (!lesson.sections.length) return 0;
  const share = lesson.sections.filter((s) => s.blocks.some((b) => b.kind === "try")).length / lesson.sections.length;
  return Math.round(share * 100) / 100;
}

type OutlineLike = { sections: Array<{ heading: string; plannedBlocks: string[]; sectionKind?: unknown; tryKind?: unknown }> };

/**
 * A terv átírása a kiosztott mintákra (BE kapcsoló: `seed` megadva). A különleges fejezetek (`sectionRoleOf`) változatlanok; az utolsó
 * fejezet recap-pal zárul; a `try`-t tartalmazó fejezet `tryKind`-ot kap (a szerző a vázlat JSON-jában látja). `seed` nélkül (KI)
 * ugyanaz az objektum jön vissza — csak a modell kéretlen `sectionKind` / `tryKind` mezője esik ki. A `sectionKind` sosem megy tovább.
 */
export function applySectionShapes<T extends OutlineLike>(outline: T, seed: number | undefined): T {
  const strip = <S extends T["sections"][number]>(s: S): S => {
    if (!("sectionKind" in s) && !("tryKind" in s)) return s;
    const { sectionKind: _kind, tryKind: _try, ...rest } = s;
    return rest as S;
  };
  if (seed === undefined) {
    return outline.sections.some((s) => "sectionKind" in s || "tryKind" in s) ? { ...outline, sections: outline.sections.map(strip) } : outline;
  }
  const regular = outline.sections.map((s, i) => ({ i, s })).filter(({ s }) => sectionRoleOf(s.heading) === null);
  const kinds = regular.map(({ s }) => ((SECTION_KINDS as readonly unknown[]).includes(s.sectionKind) ? s.sectionKind as SectionKind : "any"));
  const plan = planSections(kinds, seed);
  const assigned = new Map(regular.map(({ i }, k) => [i, plan[k]]));
  const last = outline.sections.length - 1;
  const sections = outline.sections.map((s, i) => {
    const planned = assigned.get(i);
    const base = strip(s);
    if (planned === undefined) return base;
    const blocks: string[] = [...planned.blocks];
    if (i === last && blocks.at(-1) !== "recap") blocks.push("recap");
    return { ...base, plannedBlocks: blocks, ...(planned.tryKind ? { tryKind: planned.tryKind } : {}) };
  });
  return { ...outline, sections };
}

/**
 * A kiosztás modellhívás nélküli szimulációja (TGM-terv E19 / V16, V20): minden fejezet `any`, a fejezetszámok a megadott eloszlásból.
 * Kimenet: a leggyakoribb fejezetminta (blokksor) aránya és két véletlen fejezet azonos mintájának valószínűsége (Σ p²).
 */
export function shapeSimulation(sectionCounts: readonly number[], lessons: number): { topShare: number; samePatternProbability: number; sections: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (let k = 0; k < lessons; k++) {
    const n = sectionCounts[k % sectionCounts.length];
    const plan = planSections(Array.from({ length: n }, () => "any" as const), seedFrom(`sim\u0001${k}`));
    plan.forEach((p, i) => {
      const blocks = [...p.blocks];
      if (i === n - 1 && blocks.at(-1) !== "recap") blocks.push("recap");
      const key = blocks.join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    });
  }
  const shares = [...counts.values()].map((c) => c / total);
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return { topShare: round(Math.max(...shares)), samePatternProbability: round(shares.reduce((a, p) => a + p * p, 0)), sections: total };
}

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

/** A fejezet VÉGLEGES blokksora: a lecke záró fejezete recap-pal zárul (a program hozzáfűzi). */
export function shapeBlocks(id: string, closing: boolean): string[] {
  const blocks: string[] = [...byId.get(id)!.blocks];
  if (closing && blocks.at(-1) !== "recap") blocks.push("recap");
  return blocks;
}

/**
 * Mintakiosztás a magból. Követelmény (1. vak kör L1, L2): a szabályokat a szerzőnek átadott VÉGLEGES blokksorokon mérjük (a záró
 * `recap` hozzáfűzése után a `donteshelyzet` sora az `alap` soráéval azonos) — szomszédos fejezet nem kap azonos sort, és egy sor (meg
 * egy mintaazonosító) a fejezetek legfeljebb 40%-a (felfelé kerekítve); legalább egy fejezet megmutató (animate / try). Ha van a
 * szabályoknak megfelelő kiosztás, a program megtalálja: determinisztikus visszalépéses keresés, fejezetenként a magból kevert
 * jelöltsorrenddel (a mohó választás sarokba szorulhatott). Csak ha nincs ilyen kiosztás (rövid lecke, szűk típus), enged előbb a
 * 40%-os, majd a szomszéd-szabály. `closingLast`: az utolsó kiosztott fejezet a lecke záró fejezete-e (különleges záró fejezet előtt nem).
 */
export function assignSectionShapes(kinds: readonly SectionKind[], seed: number, closingLast = true): string[] {
  const n = kinds.length;
  if (!n) return [];
  const random = mulberry32(seed);
  const cap = Math.ceil(0.4 * n);
  const order = kinds.map((kind) => {
    const fitting = SECTION_SHAPES.filter((s) => kind === "any" || s.fits.includes(kind)).map((s) => s.id);
    for (let i = fitting.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [fitting[i], fitting[j]] = [fitting[j], fitting[i]];
    }
    return fitting;
  });
  const key = (id: string, i: number) => shapeBlocks(id, closingLast && i === n - 1).join(",");
  const search = (useCap: boolean, useNeighbour: boolean): string[] | null => {
    const out: string[] = [];
    const keys: string[] = [];
    const count = new Map<string, number>();
    const bump = (k: string, d: number) => count.set(k, (count.get(k) ?? 0) + d);
    let budget = 200_000; // 12 fejezet × 6 minta mellett bőven elég; a keresés így mindig véges
    const step = (i: number): boolean => {
      if (i === n) return out.some(engaging);
      for (const id of order[i]) {
        if (budget-- <= 0) return false;
        const k = key(id, i);
        if (useNeighbour && i > 0 && (keys[i - 1] === k || out[i - 1] === id)) continue;
        if (useCap && ((count.get(`id:${id}`) ?? 0) >= cap || (count.get(k) ?? 0) >= cap)) continue;
        out.push(id); keys.push(k); bump(`id:${id}`, 1); bump(k, 1);
        if (step(i + 1)) return true;
        out.pop(); keys.pop(); bump(`id:${id}`, -1); bump(k, -1);
      }
      return false;
    };
    return step(0) ? out : null;
  };
  return search(true, true) ?? search(false, true) ?? search(false, false) ?? order.map((ids) => ids[0]);
}

const engaging = (id: string) => byId.get(id)!.blocks.some((b) => b === "animate" || b === "try");

export type TryKind = "dragSort" | "fillBlank" | "match";
const TRY_ROTATION: readonly TryKind[] = ["dragSort", "fillBlank", "match"];
const KIND_TRY: Record<Exclude<SectionKind, "any">, TryKind> = { procedure: "dragSort", comparison: "match", description: "fillBlank" };

export type PlannedSection = { shape: string; blocks: string[]; tryKind?: TryKind };

/**
 * S6b (terv 13. szakasz): a minták kiosztása + `try`-minimum (a fejezetek legalább harmada, felfelé kerekítve) + `try`-fajta. Ha a minták
 * kevesebb `try`-t adnak, a magból választott fejezetekbe a `check` elé (ha nincs, a záró recap elé, különben a végére) kerül `try`.
 * Fajta: a típusból; `any`-nél a magból, az előző `try` fajtáját kerülve. A `blocks` a fejezet VÉGLEGES sora (a záró recap-pal együtt).
 * Az S6a követelménye a `try` beszúrása UTÁN is áll: a pótlás olyan fejezetbe kerül, ahol a végleges sor nem lesz azonos a szomszédjával,
 * és nem lépi túl a 40%-ot — csak ha nincs ilyen fejezet, enged a szabály (a `try`-minimum az erősebb).
 */
export function planSections(kinds: readonly SectionKind[], seed: number, closingLast = true): PlannedSection[] {
  const n = kinds.length;
  const ids = assignSectionShapes(kinds, seed, closingLast);
  const random = mulberry32(seedFrom(`try\u0001${seed}`));
  const plan: PlannedSection[] = ids.map((id, i) => ({ shape: id, blocks: shapeBlocks(id, closingLast && i === n - 1) }));
  const cap = Math.ceil(0.4 * n);
  const withTry = (blocks: readonly string[]) => {
    const out = [...blocks];
    const check = out.indexOf("check");
    out.splice(check >= 0 ? check : out.at(-1) === "recap" ? out.length - 1 : out.length, 0, "try");
    return out;
  };
  const without = plan.map((_, i) => i).filter((i) => !plan[i].blocks.includes("try"));
  for (let i = without.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [without[i], without[j]] = [without[j], without[i]];
  }
  let missing = Math.ceil(n / 3) - (n - without.length);
  for (const strict of [true, false]) {
    for (const i of [...without]) {
      if (missing <= 0) break;
      const row = withTry(plan[i].blocks).join(",");
      const same = plan.filter((p, k) => k !== i && p.blocks.join(",") === row).length;
      if (strict && (plan[i - 1]?.blocks.join(",") === row || plan[i + 1]?.blocks.join(",") === row || same + 1 > cap)) continue;
      plan[i].blocks = row.split(",");
      without.splice(without.indexOf(i), 1);
      missing--;
    }
  }
  // 1. vak kör (L3): előbb a kötött fajták (a típusból), aztán az `any` fejezetek — az `any` az ELŐZŐ try fajtáját és a KÖVETKEZŐ
  // kötött try fajtáját is kerüli (három fajtából így mindig marad jelölt), ezért két egymást követő try csak akkor azonos, ha mindkettő
  // kötött típusú.
  const carriers = plan.map((p, i) => ({ p, kind: kinds[i] })).filter(({ p }) => p.blocks.includes("try"));
  for (const { p, kind } of carriers) if (kind !== "any") p.tryKind = KIND_TRY[kind];
  carriers.forEach(({ p, kind }, k) => {
    if (kind !== "any") return;
    const before = carriers[k - 1]?.p.tryKind;
    const after = carriers[k + 1]?.kind !== "any" ? carriers[k + 1]?.p.tryKind : undefined;
    const pool = TRY_ROTATION.filter((t) => t !== before && t !== after);
    p.tryKind = pool[Math.floor(random() * pool.length)];
  });
  return plan;
}

/** A kész lecke `try`-t tartalmazó fejezeteinek aránya (két tizedes). */
export function tryShare(lesson: { sections: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string }> }> }): number {
  if (!lesson.sections.length) return 0;
  const share = lesson.sections.filter((s) => s.blocks.some((b) => b.kind === "try")).length / lesson.sections.length;
  return Math.round(share * 100) / 100;
}

/** 1. vak kör (L2): a jelzés feltétele a NYERS darabszám (pontosan 1/3 megfelel) — a kerekített `tryShare` csak a telemetria értéke. */
export function tryShareLow(lesson: { sections: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string }> }> }): boolean {
  const total = lesson.sections.length;
  return total > 0 && 3 * lesson.sections.filter((s) => s.blocks.some((b) => b.kind === "try")).length < total;
}

/** A `try`-arány minőségi jelzése a megadott (végleges) leckére: a korábbi `try_share_low` bejegyzést lecseréli vagy törli, a többit megtartja. */
export function withTryShareNote<N extends { reason?: unknown }>(notes: readonly N[], lesson: { sections: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string }> }> }): Array<N | { reason: "try_share_low"; note: string; round: number }> {
  const others = notes.filter((n) => n?.reason !== "try_share_low");
  if (!tryShareLow(lesson)) return others;
  return [...others, { reason: "try_share_low", note: `A fejezetek ${Math.round(tryShare(lesson) * 100)}%-ában van kipróbálható feladat (try) — a cél legalább a harmaduk.`, round: 0 }];
}

type OutlineLike = { sections: Array<{ heading: string; plannedBlocks: string[]; sectionKind?: unknown; tryKind?: unknown }> };

/**
 * A terv átírása a kiosztott mintákra (BE kapcsoló: `seed` megadva). A különleges fejezetek (`sectionRoleOf`) változatlanok; az utolsó
 * fejezet recap-pal zárul. `seed` nélkül (KI) ugyanaz az objektum jön vissza — csak a modell kéretlen `sectionKind` mezője esik ki.
 * A `sectionKind` sosem megy tovább (a szerző a kiosztott `plannedBlocks`-ot kapja).
 */
export function applySectionShapes<T extends OutlineLike>(outline: T, seed: number | undefined, keepAssignedTryKind = false): T {
  // 1. vak kör (L1): `keepAssignedTryKind` — a MENTETT, program által kiosztott terv folytatásánál (a job `sectionShapes` jelzője) a
  // `tryKind` a program kiosztása, megmarad; a modell friss tervénél, a jóváhagyott tervnél és KI állapotban kéretlen mező, kiesik.
  const strip = <S extends T["sections"][number]>(s: S): S => {
    const dropTry = !keepAssignedTryKind && "tryKind" in s;
    if (!("sectionKind" in s) && !dropTry) return s;
    const { sectionKind: _kind, ...withTry } = s;
    if (!dropTry) return withTry as S;
    const { tryKind: _try, ...rest } = withTry;
    return rest as S;
  };
  if (seed === undefined) {
    return outline.sections.some((s) => "sectionKind" in s || (!keepAssignedTryKind && "tryKind" in s)) ? { ...outline, sections: outline.sections.map(strip) } : outline;
  }
  const regular = outline.sections.map((s, i) => ({ i, s })).filter(({ s }) => sectionRoleOf(s.heading) === null);
  const kinds = regular.map(({ s }) => ((SECTION_KINDS as readonly unknown[]).includes(s.sectionKind) ? s.sectionKind as SectionKind : "any"));
  const last = outline.sections.length - 1;
  const plan = planSections(kinds, seed, regular.at(-1)?.i === last);
  const assigned = new Map(regular.map(({ i }, k) => [i, plan[k]]));
  const sections = outline.sections.map((s, i) => {
    const planned = assigned.get(i);
    const base = strip(s);
    // 1. vak kör (L3): a különleges záró fejezet változatlan, EGY kivétellel — ha a modell terve nem recap-pal zárja a leckét, a program
    // hozzáfűzi (az ívkapu `no_recap` szabálya; ez az egyetlen automatikus pótlás a különleges fejezeten).
    if (planned === undefined) return i === last && base.plannedBlocks.at(-1) !== "recap" ? { ...base, plannedBlocks: [...base.plannedBlocks, "recap"] } : base;
    return { ...base, plannedBlocks: [...planned.blocks], ...(planned.tryKind ? { tryKind: planned.tryKind } : {}) };
  });
  return { ...outline, sections };
}

/**
 * A kiosztás modellhívás nélküli szimulációja (TGM-terv E19 / V16): minden fejezet `any`, a fejezetszámok a megadott eloszlásból.
 * Kimenet: a leggyakoribb fejezetminta (blokksor) aránya és két véletlen fejezet azonos mintájának valószínűsége (Σ p²).
 */
export function shapeSimulation(sectionCounts: readonly number[], lessons: number): { topShare: number; samePatternProbability: number; sections: number } {
  // 1. vak kör (L5): üres mintán nincs mérés — ne adjon „megfelelt” eredményt.
  if (!sectionCounts.length || sectionCounts.some((n) => !Number.isInteger(n) || n < 1)) throw new Error("A szimulációhoz legalább egy érvényes (pozitív egész) fejezetszám kell.");
  if (!Number.isInteger(lessons) || lessons < 1) throw new Error("A szimulációhoz pozitív egész leckeszám kell.");
  const counts = new Map<string, number>();
  let total = 0;
  for (let k = 0; k < lessons; k++) {
    const n = sectionCounts[k % sectionCounts.length];
    const plan = planSections(Array.from({ length: n }, () => "any" as const), seedFrom(`sim\u0001${k}`));
    plan.forEach((p) => {
      const key = p.blocks.join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    });
  }
  const shares = [...counts.values()].map((c) => c / total);
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return { topShare: round(Math.max(...shares)), samePatternProbability: round(shares.reduce((a, p) => a + p * p, 0)), sections: total };
}

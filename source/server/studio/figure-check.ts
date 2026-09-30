import type { Lesson } from "../../shared/lesson-schema";
import { ungroundedLabels } from "../../shared/illustration-svg";
import { illustrationFacts } from "./lektor-view";

/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (U5, ábra-szerződés / §C-V/12): ÁBRA-KAPU.
 *
 * A szerződés szerint a lektor a feliratok TÉNY-egyezését méri, a térbeli/kapcsolati helyességet egy második, független
 * ellenőrzés. Ez a modul a DETERMINISZTIKUS részt adja az `illustration` SVG-jére: a feliratai és számai a saját
 * fejezetének tanításában (explain/example/recap/check) vagy a caption-ben álljanak — a fejezetből nem levezethető
 * felirat új állítás (H14: „adat csak a fejezetből”). A strukturált fajták (process, timeline, scene3d …) teljes
 * params-a a lektor kiírt nézetében áll, azokat a lektor tanításként olvassa — itt nem mérjük.
 *
 * A renderelt (PNG) + „mit mutat?” látás-alapú ellenőrzés NEM része: a szolgáltatói absztrakció (`AIMessage.content:
 * string`) nem visz képet, és a futtató környezetben nincs SVG→PNG renderelő — a status-fájl blokkolóként rögzíti; a
 * felismerési arány mérése nélkül a lelet csak FIGYELMEZTETÉS (nem buktat), ahogy a spec előírja.
 */
export const FIGURE_CHECK_VERSION = "v1-labels";

export type FigureFinding = { path: string; animKind: string; ungrounded: string[]; message: string };

function sectionCorpus(section: Lesson["sections"][number]): string {
  return section.blocks.flatMap((b) => {
    if (b.kind === "explain") return [b.text];
    if (b.kind === "example") return [b.problem, ...b.steps, b.answer];
    if (b.kind === "recap") return b.bullets;
    if (b.kind === "check") return [b.question, ...b.options];
    return [];
  }).join("\n");
}

/** Illusztrációnként: a fejezetből (és a caption-ből) nem levezethető feliratok — figyelmeztetés, nem blokkoló. */
export function figureCheck(lesson: Lesson): FigureFinding[] {
  const findings: FigureFinding[] = [];
  lesson.sections.forEach((section, i) => {
    const corpus = `${section.heading}\n${sectionCorpus(section)}`;
    section.blocks.forEach((block, j) => {
      if (block.kind !== "animate") return;
      const b = block as unknown as { animKind: string; caption?: string; params?: Record<string, unknown> };
      if (b.animKind !== "illustration") return;
      const labels = illustrationFacts(b.params?.svg).labels;
      if (!labels.length) return;
      const ungrounded = ungroundedLabels(labels, `${corpus}\n${b.caption ?? ""}`);
      if (!ungrounded.length) return;
      findings.push({ path: `sections[${i}].blocks[${j}]`, animKind: b.animKind, ungrounded,
        message: `Az ábra ${ungrounded.length} felirata nem a fejezet tanításából való (${ungrounded.slice(0, 4).map((l) => `„${l}”`).join(", ")}${ungrounded.length > 4 ? ", …" : ""}) — új állítás vagy elírás lehet; az ábra-kapu ${FIGURE_CHECK_VERSION} mérése nélkül figyelmeztetés.` });
    });
  });
  return findings;
}

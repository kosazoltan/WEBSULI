/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (12. szakasz; V16): a fejezetminta-kiosztás modellhívás nélküli szimulációja.
 * Használat (a `source/` mappából): node --import tsx scripts/measure/shape-simulation.mts [--counts 3,4,5,…] [--lessons 400]
 * Alapvonal (TGM-terv 3.3, 239 kiadott lecke): leggyakoribb fejezetminta 61,6%, azonos minta valószínűsége 40,4%. Küszöb: < 35% / < 20%.
 */
import { shapeSimulation } from "../../shared/lesson-section-shapes";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const counts = (arg("--counts") ?? "3,4,4,5,5,5,6,6,7,8,9,10,12").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
const lessons = Number(arg("--lessons") ?? 400);
const sim = shapeSimulation(counts, lessons);
const ok = sim.topShare < 0.35 && sim.samePatternProbability < 0.2;
const lines = [
  "| mutató | alapvonal | most | küszöb | megfelel |",
  "|---|---:|---:|---:|---|",
  `| leggyakoribb fejezetminta | 0,616 | ${sim.topShare} | < 0,35 | ${sim.topShare < 0.35 ? "igen" : "NEM"} |`,
  `| azonos minta valószínűsége | 0,404 | ${sim.samePatternProbability} | < 0,20 | ${sim.samePatternProbability < 0.2 ? "igen" : "NEM"} |`,
  `(${lessons} szimulált lecke, ${sim.sections} fejezet)`,
];
process.stdout.write(`${lines.join("\n")}\n`);
process.exitCode = ok ? 0 : 1;

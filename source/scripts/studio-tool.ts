/**
 * Studio eszközök parancssorból (2026-09-19). Ugyanazok a determinisztikus szkriptek futnak,
 * mint a pipeline-ban — modellhívás és adatbázis nélkül.
 *
 *   npm run studio:tool -- outline-autofix <vazlat.json> <terkep.json>
 *   npm run studio:tool -- bank-packet-autofix <csomag.json> <sectionIndex> <conceptId,conceptId,…>
 *   npm run studio:tool -- section-visuals <lecke.json> [terkep.json]
 *   npm run studio:tool -- arithmetic-claims <csomag.json>
 *
 * Kimenet: JSON {tool, fixes|added, result}. Kilépési kód 2 = rossz használat.
 */
import { readFileSync } from "node:fs";
import { autofixOutline } from "../server/studio/tools/outline-autofix";
import { autofixBankPacket } from "../server/studio/tools/bank-packet-autofix";
import { arithmeticClaimProblems } from "../server/studio/tools/arithmetic-claims";
import { ensureSectionVisuals, deterministicSectionVisuals } from "../server/studio/section-visuals";
import { lessonSchema } from "../shared/lesson-schema";
import { TOOL_SKILLS } from "../server/studio/role-skills";

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8")) as unknown;
const [tool, ...args] = process.argv.slice(2);

function usage(): never {
  console.error(`Használat:\n${Object.keys(TOOL_SKILLS).map(t => `  npm run studio:tool -- ${t} …`).join("\n")}\nRészletek: server/studio/role-skills.ts TOOL_SKILLS`);
  process.exit(2);
}

let out: unknown;
switch (tool) {
  case "outline-autofix": {
    if (args.length < 2) usage();
    const map = readJson(args[1]) as { concepts?: { localId: string }[] } | { localId: string }[];
    const concepts = Array.isArray(map) ? map : (map.concepts ?? []);
    const r = autofixOutline(readJson(args[0]), concepts);
    out = { tool, fixes: r.fixes, result: r.outline };
    break;
  }
  case "bank-packet-autofix": {
    if (args.length < 3) usage();
    const r = autofixBankPacket(readJson(args[0]), { sectionIndex: Number(args[1]), allowedConceptIds: args[2].split(",").map(s => s.trim()).filter(Boolean) });
    out = { tool, fixes: r.fixes, result: r.packet };
    break;
  }
  case "arithmetic-claims": {
    if (args.length < 1) usage();
    const problems = arithmeticClaimProblems(readJson(args[0]) as Parameters<typeof arithmeticClaimProblems>[0]);
    out = { tool, problems };
    break;
  }
  case "section-visuals": {
    if (args.length < 1) usage();
    const lesson = lessonSchema.parse(readJson(args[0]));
    const map = args[1] ? (readJson(args[1]) as { concepts?: { localId: string; term?: string }[] } | { localId: string; term?: string }[]) : [];
    const concepts = Array.isArray(map) ? map : (map.concepts ?? []);
    const r = ensureSectionVisuals(lesson, concepts);
    out = { tool, added: r.added, modelCallNeeded: deterministicSectionVisuals(lesson, concepts) === null, result: r.lesson };
    break;
  }
  default:
    usage();
}
process.stdout.write(JSON.stringify(out, null, 2) + "\n");

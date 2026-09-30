import { LESSON_QUALITY_CONTRACT } from "./lesson-quality";
import { LESSON_SKILL_CHECK_RUNBOOK } from "./lesson-skill-checks";
import { RUNTIME_KNOWLEDGE_VERSION, SKILL_RULES, skillMarkdown, type SkillSnapshot, type SkillLesson } from "./lesson-skill";
import { WORKFLOW_MODES, workflowDefinition, type WorkflowMode } from "./lesson-workflow";
import { bundleRunbook } from "./instruction-bundles";
import { isFrozenBundle, type PromptRole } from "./instruction-bundles/roles";
import { IAM_V2, RECOVERY_V2, SOUL_V2 } from "./instruction-bundles/websuli-runtime-2";

// A lélek/identitás/helyreállítás szövege a dokumentum-nézetekhez (a hívásokhoz a csomagfeloldó adja verzió szerint).
const soul = SOUL_V2;
const iam = IAM_V2;
const recovery = RECOVERY_V2;
const chain = (mode: WorkflowMode) => workflowDefinition(mode).steps.map(step => step.label).join(" → ");

/**
 * Immutable version is pinned in the workflow snapshot; legacy continuations stay unchanged.
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (B0/B5): a szövegek a csomagverzió archívumából jönnek (a régi futás a
 * régit kapja, verzióemelés nem töri meg), és az élő csomagban a szerep dönti el, kapja-e a tanítási minőségi
 * szerződést és a 45/75-ös bank-mondatot.
 */
export function runtimePrompt(snapshot: SkillSnapshot, mode: WorkflowMode, role?: PromptRole): string {
  if (!snapshot.runtimeVersion) return "";
  const texts = bundleRunbook(snapshot.runtimeVersion, role);
  // Élő csomag: a fejléc a tapasztalat-pillanatkép verzióját is hordozza (a szabályszöveg szerepre szűrve el is maradhat,
  // a kérésből mégis látszik, melyik pillanatkép érvényes). A befagyasztott verzió fejléce bájtra a régi.
  const header = isFrozenBundle(snapshot.runtimeVersion) ? snapshot.runtimeVersion : `${snapshot.runtimeVersion}, tapasztalat ${snapshot.version}`;
  return `\n\nWEBSULI SAJÁT RUNBOOK (${header})\n${texts.soul}\n${texts.iam}\nA teljes folyamat: ${chain(mode)}. Ebben a modellhívásban csak a kért részfeladatot végezd el; a szerver hajtja végre a lépéseket.\n${texts.recovery}\n${texts.quality}\n`;
}

/** QMD/Cogni are internal projections, not connections to similarly named external products. */
export function runtimeKnowledge(snapshot: SkillSnapshot, lessons: SkillLesson[], query = "") {
  const modes = WORKFLOW_MODES.filter(mode => snapshot.skill === "tananyag-keszito"
    ? ["upload", "studio", "web"].includes(mode) : ["repair", "concept", "html", "apply"].includes(mode));
  const terms = query.slice(0, 200).toLocaleLowerCase("hu").split(/\s+/).filter(Boolean);
  const index = Object.entries(SKILL_RULES).map(([code, [title, instruction]]) => ({
    code, title, instruction, active: snapshot.rules.includes(code as keyof typeof SKILL_RULES),
  }));
  const results = index.filter(item => terms.every(term => `${item.code} ${item.title} ${item.instruction}`.toLocaleLowerCase("hu").includes(term)));
  const cards = lessons.map(item => ({
    fingerprint: item.fingerprint, code: item.code,
    column: item.state === "disabled" ? "disabled" : item.state === "observed" ? "investigate" : "monitor",
    occurrences: item.occurrences, recovered: item.recovered,
    evidence: `/api/studio/workflows/${encodeURIComponent(item.lastRun)}`,
  }));
  const cognition = {
    observedTypes: lessons.length,
    activeRules: snapshot.rules.length,
    pendingInvestigation: cards.filter(card => card.column === "investigate").length,
    limitation: "A recovered érték hibamegfigyelést tartalmazó sikeres futásokat számol; nem bizonyítja a szabály hatását vagy a hibaarány csökkenését. Nincs automatikusan készre jelölt javítás.",
  };
  const runbook = modes.map(mode => `## ${workflowDefinition(mode).label}\n\n${chain(mode)}`).join("\n\n") + `\n\n${recovery}\n${snapshot.runtimeVersion === RUNTIME_KNOWLEDGE_VERSION ? LESSON_QUALITY_CONTRACT + "\n\n" + LESSON_SKILL_CHECK_RUNBOOK : ""}`;
  const memory = cards.length ? cards.map(card => `- ${card.code}: ${card.occurrences} megfigyelés; ${card.recovered} sikeres futás mellett; [bizonyíték](${card.evidence})`).join("\n") : "Még nincs mért futási tapasztalat.";
  const documents = {
    "SOUL.md": `# Websuli identitás\n\n${soul}`,
    "IAM.md": `# Hatáskör\n\n${iam}`,
    "RUNBOOK.md": `# ${snapshot.skill} futási eljárás\n\n${runbook}`,
    "QMD.md": "# Belső módszerindex\n\n" + index.map(item => `- ${item.title} (${item.code}): ${item.instruction}`).join("\n"),
    "COGNI.md": `# Mért állapot és következtetési korlát\n\n${JSON.stringify(cognition, null, 2)}`,
    "MEMORY.md": `# Tartós futási memória\n\n${memory}`,
    "KANBAN.md": "# Javítási munkalista\n\n" + (cards.map(card => `- ${card.column}: ${card.code} · [bizonyíték](${card.evidence})`).join("\n") || "Még nincs megfigyelés."),
    "SKILL.md": skillMarkdown(snapshot, lessons),
  };
  return { version: snapshot.runtimeVersion ?? "legacy", snapshot, index: results, cognition, cards, documents };
}

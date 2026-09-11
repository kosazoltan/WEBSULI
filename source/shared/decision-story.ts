import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
export const decisionStoryParamsSchema = z.object({
  title: text(100), start: text(40),
  nodes: z.array(z.object({
    id: text(40), text: text(600),
    choices: z.array(z.object({ label: text(120), feedback: text(350), next: text(40) })).max(3),
    conclusion: text(600).optional(),
  }).strict()).min(3).max(12),
}).strict().superRefine((story, ctx) => {
  const nodes = new Map(story.nodes.map(n => [n.id, n]));
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (nodes.size !== story.nodes.length || !nodes.has(story.start)) { fail("Egyedi csomópont és létező kezdőpont szükséges."); return; }
  const seen = new Set<string>(); const path = new Set<string>();
  function visit(id: string) {
    if (path.has(id)) { fail("A történet nem tartalmazhat végtelen kört."); return; }
    if (seen.has(id)) return;
    const node = nodes.get(id);
    if (!node) { fail("A választás nem létező pontra vezet."); return; }
    seen.add(id); path.add(id);
    if (!node.choices.length && !node.conclusion) fail("Minden végponthoz tanulási következtetés szükséges.");
    if (node.choices.length === 1) fail("A döntéshez legalább két választás szükséges.");
    for (const choice of node.choices) visit(choice.next);
    path.delete(id);
  }
  visit(story.start);
  if (seen.size !== nodes.size) fail("Minden történetrész legyen elérhető.");
});
export type DecisionStoryParams = z.infer<typeof decisionStoryParamsSchema>;

export const DECISION_STORY_CONTRACT = `decisionStory params: {title, start, nodes:[{id,text,choices:[{label,feedback,next}],conclusion?}]}. 3–12 egyedi csomópont, döntésenként 2–3 választás. Minden pont elérhető a start-ból, nincs kör, minden ág végkövetkeztetésben zárul (choices:[] és conclusion). Kizárólag a fejezetben tanított, coversConceptIds-szel hivatkozott ismeretből. A helyzetet jelöld szemléltető példának; ne találj ki forrásbeli történelmi eseményt vagy személyt. Minden választás magyarázatot kap. A diák a végén saját következtetést mond vagy ír; ez gyakorlás, nem automatikus szóbeli osztályzat.`;

import { parse, type DefaultTreeAdapterMap } from "parse5";
import type { LessonExperience } from "../../shared/lesson-experience";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
const element = (n: Node): n is Element => "tagName" in n;
const attr = (n: Node, key: string) => element(n) ? n.attrs.find(a => a.name === key)?.value : undefined;
const descendants = (n: Node): Element[] => "childNodes" in n ? n.childNodes.flatMap(child => [...(element(child) ? [child] : []), ...descendants(child)]) : [];
function text(n: Node): string {
  if (element(n) && ["script", "style", "template"].includes(n.tagName)) return "";
  if ("value" in n) return n.value;
  return "childNodes" in n ? n.childNodes.map(text).join(" ").replace(/\s+/g, " ").trim() : "";
}
function concealed(n: Element, panel: Element): boolean {
  if (n === panel) return false; // The teaching tab may initially be inactive.
  if (attr(n, "hidden") !== undefined || attr(n, "aria-hidden") === "true" || n.tagName === "details" || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(n, "style") ?? "")) return true;
  return !!n.parentNode && element(n.parentNode) && concealed(n.parentNode, panel);
}

export function verifyHtmlNavigation(html: string): string[] {
  const nodes = descendants(parse(html));
  const panels = nodes.filter(n => attr(n, "data-lesson-panel") !== undefined);
  const problems: string[] = [];
  for (const name of ["teaching", "methods", "tasks", "quiz"]) {
    if (panels.filter(n => attr(n, "data-lesson-panel") === name).length !== 1) problems.push(`Pontosan egy data-lesson-panel="${name}" szükséges.`);
    if (nodes.filter(n => n.tagName === "button" && attr(n, "data-lesson-tab") === name).length !== 1) problems.push(`Pontosan egy valódi navigációs gomb szükséges: data-lesson-tab="${name}".`);
  }
  if (panels.some(panel => descendants(panel).some(child => panels.includes(child)))) problems.push("A tanulási lapok nem ágyazhatók egymásba.");
  return problems;
}

/** Structural evidence only. Semantic depth is assessed independently against fetched sources. */
export function verifyHtmlTeaching(html: string, experience: LessonExperience): string[] {
  const all = descendants(parse(html));
  const panels = all.filter(n => attr(n, "data-lesson-panel") === "teaching");
  if (panels.length !== 1) return ["Pontosan egy Tananyag panel szükséges."];
  const panel = panels[0], nodes = descendants(panel);
  const sections = nodes.filter(n => attr(n, "data-teaching-section") !== undefined);
  const problems: string[] = [];
  const planned = experience.bankPlan?.units ?? [...new Set([...experience.tasks, ...experience.quiz].map(t => t.sectionIndex))].map(sectionIndex => ({ sectionIndex, conceptIds: [...new Set([...experience.tasks, ...experience.quiz].filter(t => t.sectionIndex === sectionIndex).flatMap(t => t.coversConceptIds))] }));
  const indices = [...new Set(planned.map(u => u.sectionIndex))].sort((a, b) => a - b);
  if (!sections.length || sections.length !== indices.length) problems.push("A Tananyag fejezetei hiányosak vagy nem egyeznek a banktervvel.");
  sections.forEach((section, i) => {
    if (attr(section, "data-teaching-section") !== String(i) || indices[i] !== i) problems.push("A tanítási fejezetek sorszámai nem folytonosak vagy ismétlődnek.");
    const expected = [...new Set(planned.filter(u => u.sectionIndex === i).flatMap(u => u.conceptIds))].sort();
    const actual = (attr(section, "data-teaching-concepts") ?? "").split(/\s+/).filter(Boolean).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) problems.push(`${i + 1}. fejezet: a tanítás fogalmai nem egyeznek a banktervvel.`);
    const children = descendants(section);
    if (!children.some(n => /^h[1-6]$/.test(n.tagName) && text(n).length > 0)) problems.push(`${i + 1}. fejezet: hiányzó cím.`);
    for (const kind of ["explanation", "example", "summary"]) {
      const blocks = children.filter(n => attr(n, `data-teaching-${kind}`) !== undefined);
      if (!blocks.length || blocks.some(n => text(n).length < 20 || concealed(n, panel))) problems.push(`${i + 1}. fejezet: hiányos vagy rejtett tanítás (${kind}).`);
    }
    if (concealed(section, panel)) problems.push(`${i + 1}. fejezet: elrejtett tanítás.`);
  });
  const visuals = nodes.filter(n => attr(n, "data-teaching-visual") !== undefined && !concealed(n, panel));
  if (!visuals.some(n => text(n).length >= 20 && descendants(n).some(child => ["svg", "img", "li"].includes(child.tagName)))) problems.push("Hiányzó tanítási szemléltetés: feliratozott ábra vagy lépéses kártyasor szükséges.");
  return problems;
}

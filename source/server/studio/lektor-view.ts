import type { Lesson } from "../../shared/lesson-schema";

/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (U5, C5/H8): a lektor TÖMÖR, KIÍRT ÚTVONALAS bemenete.
 *
 * Mért ok (H8, `evidence-visits-tokens.txt`): a lektor-lépés a három mért futás bemeneti tokenjeinek ~45%-a volt —
 * behúzott, számozatlan JSON (a modell számolta az indexet, és tévesztett), a teljes SVG-törzs, a minőségi szerződés
 * háromszor. Itt minden elem a saját útvonalával áll (`sections[i].blocks[j]`, `experience.tasks[n]`), az ábrából
 * csak az ELLENŐRIZHETŐ tény megy (fajta, caption, feliratok, számok, elemszám; strukturált fajtánál a teljes params),
 * az SVG-törzs nem. A bank-ellenőr által már igazolt tételek jelöltek, hogy a lektor ne járja be újra őket.
 */

const TEXT_TAG = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
const ELEMENT_TAG = /<(path|circle|ellipse|rect|line|polyline|polygon|text|g|tspan)\b/gi;
const NUMBER = /-?\d+(?:[.,]\d+)?/g;

/** Az illusztráció SVG-jéből az ellenőrizhető adat — DOM nélkül (a szerveren nincs böngésző). */
export function illustrationFacts(svg: unknown): { labels: string[]; numbers: string[]; elements: number } {
  if (typeof svg !== "string") return { labels: [], numbers: [], elements: 0 };
  const labels = [...svg.matchAll(TEXT_TAG)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const numbers = [...new Set(labels.flatMap((l) => l.match(NUMBER) ?? []))];
  const elements = (svg.match(ELEMENT_TAG) ?? []).length;
  return { labels: [...new Set(labels)], numbers, elements };
}

const cut = (s: unknown, max = 600) => { const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : JSON.stringify(s ?? ""); return t.length > max ? `${t.slice(0, max)}…` : t; };
const ids = (b: { coversConceptIds?: readonly string[] }) => (b.coversConceptIds?.length ? ` [${b.coversConceptIds.join(",")}]` : "");
const list = (items: readonly string[] | undefined, max = 300) => (items ?? []).map((o, k) => `${k}) ${cut(o, max)}`).join(" ");

function animateLine(block: Record<string, unknown>): string {
  const kind = String(block.animKind ?? "?");
  const caption = cut(block.caption, 300);
  const params = (block.params ?? {}) as Record<string, unknown>;
  if (kind === "illustration") {
    const facts = illustrationFacts(params.svg);
    return `animate/illustration: caption: ${caption} | feliratok: ${facts.labels.map((l) => `„${l}”`).join(", ") || "(nincs)"} | számok: ${facts.numbers.join(", ") || "(nincs)"} | elemek: ${facts.elements} (az SVG-törzs nem a lektor bemenete; a térbeli helyességet az ábra-kapu méri)`;
  }
  return `animate/${kind}: caption: ${caption} | params: ${cut(params, 1200)}`;
}

function blockLine(block: Record<string, unknown>): string {
  const b = block as { kind: string; coversConceptIds?: string[] } & Record<string, unknown>;
  switch (b.kind) {
    case "explain": return `explain(${String(b.depth ?? "")})${ids(b)}: ${cut(b.text, 4000)}`;
    case "example": return `example${ids(b)}: ${cut(b.problem, 2000)} | lépések: ${list(b.steps as string[], 1000)} | answer: ${cut(b.answer, 1000)}`;
    case "check": return `check${ids(b)}: ${cut(b.question, 1000)} | opciók: ${list(b.options as string[], 500)} | helyes: ${String(b.correctIndex)} | visszajelzés: ${list(b.feedbackPerOption as string[], 1000)}${b.hint ? ` | hint: ${cut(b.hint, 300)}` : ""}`;
    case "try": return `try/${String(b.tryKind)}${ids(b)}: ${cut(b.spec, 1500)}`;
    case "recap": return `recap: ${((b.bullets as string[]) ?? []).map((x) => `• ${cut(x, 500)}`).join(" ")}`;
    case "animate": return `${animateLine(b)}${ids(b)}`;
    default: return `${b.kind}: ${cut(b, 800)}`;
  }
}

export function lektorLessonView(lesson: Lesson, options: { verifiedPaths?: ReadonlySet<string> } = {}): string {
  const lines: string[] = [
    "LECKE — kiírt útvonalakkal (a blockPath-ot pontosan így add vissza; a tétel útvonala a sor eleje):",
    `title: ${lesson.title} | subject: ${lesson.subject} | classroom: ${lesson.classroom}`,
  ];
  lesson.sections.forEach((section, i) => {
    lines.push(`sections[${i}].heading: ${section.heading}${section.probaEnabled ? " (Próba)" : ""}${section.emoji ? ` ${section.emoji}` : ""}`);
    section.blocks.forEach((block, j) => lines.push(`sections[${i}].blocks[${j}] ${blockLine(block as unknown as Record<string, unknown>)}`));
  });
  if (lesson.misconceptions.length) lines.push(`misconceptions: ${lesson.misconceptions.map((m) => `[${m.conceptId}] ${cut(m.text, 300)}`).join(" | ")}`);
  const e = lesson.experience;
  if (e) {
    lines.push("BANK (experience):");
    e.methods.forEach((m, n) => lines.push(`experience.methods[${n}] ${m.kind}${ids(m)} s${m.sectionIndex}: ${cut(m.title, 120)} | prompt: ${cut(m.prompt, 1500)} | answer: ${cut(m.answer, 2000)}${m.options ? ` | opciók: ${list(m.options, 500)} | helyes: ${String(m.correctIndex)}` : ""}${m.steps ? ` | steps: ${list(m.steps, 500)}` : ""}`));
    e.tasks.forEach((t, n) => lines.push(`experience.tasks[${n}]${ids(t)} s${t.sectionIndex} ${t.mode}: ${cut(t.q, 1500)} | required: ${JSON.stringify(t.required)}${t.bonus?.length ? ` | bonus: ${JSON.stringify(t.bonus)}` : ""}${t.typedAnswers ? ` | typedAnswers: ${JSON.stringify(t.typedAnswers)}` : ""}${t.requiredDistinct ? ` | requiredDistinct: ${JSON.stringify(t.requiredDistinct)}` : ""} | minWords: ${t.minWords}${t.needsSentence ? " | needsSentence" : ""} | sample: ${cut(t.sample, 2000)}`));
    e.quiz.forEach((q, n) => lines.push(`experience.quiz[${n}]${ids(q)} s${q.sectionIndex} ${q.intent ?? ""}: ${cut(q.question, 1500)} | opciók: ${list(q.options, 500)} | helyes: ${q.correctIndex} | visszajelzés: ${list(q.feedbackPerOption, 1000)}`));
    if (e.glossary?.length) lines.push(`glossary: ${e.glossary.map((g) => `${g.word} — ${g.translation} (${g.partOfSpeech}; „${cut(g.example, 200)}”)`).join(" | ")}`);
  }
  const verified = [...(options.verifiedPaths ?? [])].sort();
  if (verified.length) lines.push(`IGAZOLT TÉTELEK (a bank-ellenőr korábbi körben tételenként hibátlannak találta, a tartalom azóta változatlan — ne járd be újra, blokkolót rájuk csak új, bizonyított tényhibára írj): ${verified.join(", ")}`);
  return lines.join("\n");
}

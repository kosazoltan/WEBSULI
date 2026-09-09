import { z } from "zod";

/**
 * Internetses tananyag-ügynök — tiszta séma és HTML-kivonat (nincs SDK-hívás).
 * A route a Claude Opus 5 + web_search tool-t köti ide.
 */

export const webResearchChatSchema = z.object({
  message: z.string().trim().min(1).max(8000),
  classroom: z.number().int().min(0).max(12),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(50)
    .optional(),
  title: z.string().trim().max(255).optional(),
});

export type WebResearchChatRequest = z.infer<typeof webResearchChatSchema>;

export const HTML_START = "<!-- HTML_START -->";

/** A marker utáni önálló HTML, a komment nélkül. Marker nélkül null. */
export function extractGeneratedHtml(fullText: string): string | null {
  const i = fullText.indexOf(HTML_START);
  if (i < 0) return null;
  const html = fullText.slice(i).replace(HTML_START, "").trim();
  if (html.length < 100) return null;
  if (!html.toLowerCase().includes("<html")) return null;
  return html;
}

export function webResearchSystemPrompt(classroom: number): string {
  const grade =
    classroom === 0 ? "programozási alapismeretek (osztály 0)" : `${classroom}. osztály`;
  return [
    "Te a WEBSULI tananyagkészítő ügynöke vagy (Tananyag Készítő v7.1).",
    `Célosztály: ${grade}.`,
    "Ha a felhasználó tananyagot vagy forrást kér, KERESS az interneten (web_search) magyar tantervi, tankönyvi vagy NAT/OFI-hoz illő forrásokat.",
    "Csak a megtalált, idézhető forrásokból dolgozz. Minden ténymegállapításhoz URL.",
    "Ha a felhasználó kéri a tananyag elkészítését, adj TELJES önálló HTML-t, és kezdd így: <!-- HTML_START -->",
    "A HTML 4 tab: Tananyag, Módszerek (min. 10 kognitív elem), Feladatok (45 bank → 15), Kvíz (75 bank → 25, A/B/C).",
    "TILOS: alert/confirm/prompt; Google Fonts; külső CSS/JS.",
    "IIFE wrapper, egyedi CSS prefix, min. 44px érintési terület, touch events a drag&drop-hoz.",
  ].join("\n");
}

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 8,
  allowed_callers: ["direct"] as Array<"direct">,
};

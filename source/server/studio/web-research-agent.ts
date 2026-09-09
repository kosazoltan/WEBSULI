import { z } from "zod";

/**
 * Internetes tananyag-ügynök — tiszta séma, prompt és HTML-kivonat (nincs SDK-hívás).
 * A route (web-research-routes.ts) köti hozzá a Claude Opus 5 + web_search tool-t.
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
  let html = fullText.slice(i).replace(HTML_START, "").trim();
  // Éles próba 2026-09-09: a modell a marker után ```html … ``` markdown-kerítésbe tette a
  // dokumentumot; a kerítés a mentett fájl tetején/alján szövegként jelent volna meg.
  html = html.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "").trim();
  if (html.length < 100) return null;
  if (!html.toLowerCase().includes("<html")) return null;
  return html;
}

/**
 * Igaz, ha a HTML-nek van záró </html> címkéje. A `max_tokens` miatt levágott vagy
 * félbeszakadt kimenetet így nem kínáljuk fel mentésre.
 */
export function htmlLooksComplete(html: string): boolean {
  return /<\/html\s*>/i.test(html);
}

export type WebSource = { url: string; title: string };

/** A route által küldött SSE-események (a kliens ugyanezt a formát olvassa). */
export type WebResearchEvent =
  | { type: "content_delta"; content: string }
  | { type: "content_replace"; content: string }
  | { type: "status"; message: string }
  | { type: "sources"; sources: WebSource[] }
  | { type: "html_generated"; html: string; sources: WebSource[]; warnings?: string[] }
  | { type: "error"; message: string }
  | { type: "complete" };

import { LESSON_HTML_SPEC_V74, lessonHtmlSpecPrompt } from "../ai/lesson-html-spec";

/**
 * A v7.4 közös specifikáció (server/ai/lesson-html-spec.ts). Az alias a régi
 * névvel marad, mert a tesztek és a route erre hivatkoznak.
 */
export const LESSON_HTML_REQUIREMENTS = LESSON_HTML_SPEC_V74;

/**
 * @param topicSeed a téma-választó seedje (első felhasználói üzenet) — a cím mellett
 *   ettől függ, melyik megjelenítési témát kapja a tananyag (változatosság).
 */
export function webResearchSystemPrompt(classroom: number, title?: string, topicSeed?: string): string {
  const grade =
    classroom === 0 ? "programozási alapismeretek (osztály 0)" : `${classroom}. osztály`;
  const requestedTitle = title?.trim();
  const lines = [
    "Te a WEBSULI tananyagkészítő ügynöke vagy (Tananyag Készítő v7.1).",
    `Célosztály: ${grade}.`,
    requestedTitle ? `A tananyag kért címe: ${requestedTitle}` : null,
    "",
    "FELADATOD:",
    "1. Ha a felhasználó tananyagot vagy forrást kér, KERESS az interneten (web_search) magyar tantervi, tankönyvi vagy NAT/OFI-hoz illő forrásokat, az adott évfolyamhoz igazítva.",
    "2. Csak a megtalált, idézhető forrásokból dolgozz. Minden ténymegállapításhoz URL. Foglald össze röviden magyarul, mit találtál, és kérdezd meg, készülhet-e a tananyag, ha a felhasználó még nem kérte kifejezetten.",
    '3. Ha a felhasználó kéri a tananyag elkészítését ("készítsd el", "generáld", "csináld meg"), adj TELJES, önálló HTML-t, és MINDIG így kezdd: <!-- HTML_START -->',
    "4. A HTML-t a <!-- HTML_START --> után azonnal <!DOCTYPE html>-lel kezdd, és </html>-lel zárd; a HTML után ne írj semmit. NE tedd markdown kódblokkba (```), nyers HTML-t adj.",
    "",
    lessonHtmlSpecPrompt({
      classroom,
      seed: `${requestedTitle ?? ""} ${topicSeed ?? ""}`.trim() || "websuli",
      subjectHint: `${requestedTitle ?? ""} ${topicSeed ?? ""}`,
    }),
    "",
    "BESZÉLGETÉS: tömör, magyar. Ha kész a HTML, egy rövid mondattal jelezd ELŐTTE, hogy készül.",
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 8,
  allowed_callers: ["direct"] as Array<"direct">,
};

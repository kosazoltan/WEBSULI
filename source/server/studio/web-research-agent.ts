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

/** Prefer the marker; a complete raw document is also a candidate, subject to the same gate. */
export function extractGeneratedHtml(fullText: string): string | null {
  const i = fullText.indexOf(HTML_START);
  const start = i >= 0 ? i : fullText.search(/<!doctype\s+html\b|<html\b/i);
  if (start < 0) return null;
  let html = fullText.slice(start).replace(HTML_START, "").trim();
  // Éles próba 2026-09-09: a modell a marker után ```html … ``` markdown-kerítésbe tette a
  // dokumentumot; a kerítés a mentett fájl tetején/alján szövegként jelent volna meg.
  html = html.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "").trim();
  if (html.length < 100) return null;
  if (!html.toLowerCase().includes("<html")) return null;
  return html;
}

type Completion = { type: "ready"; html: string } | { type: "retry"; instruction: string; reason: string } | { type: "error"; message: string };
const MAX_ARTIFACT_REPAIRS = 2;

/** An SDK turn finishing is not evidence that the requested lesson exists. */
export function decideWebResearchResult(
  result: { stopReason: string | null; fullContent: string; repairAttempts: number },
  verify: (html: string) => { ok: boolean; problems: string[] },
): Completion {
  const { stopReason, fullContent, repairAttempts } = result;
  if (stopReason === "max_tokens" || stopReason === "model_context_window_exceeded") {
    return { type: "error", message: "A válasz elérte a hosszkorlátot. A csonka tananyag nem menthető; új készítés szükséges." };
  }
  if (stopReason === "refusal") return { type: "error", message: "A modell elutasította a tananyagkészítést." };
  if (stopReason !== "end_turn") return { type: "error", message: "A keresés nem fejeződött be szabályosan. Nem készült menthető tananyag." };
  const html = extractGeneratedHtml(fullContent);
  const problems = !html ? ["Csak keresési összefoglaló érkezett, tananyag nem."]
    : !htmlLooksComplete(html) ? ["A HTML dokumentum nincs lezárva."] : verify(html).problems;
  if (html && problems.length === 0) return { type: "ready", html };
  const reason = problems.join("; ");
  if (repairAttempts >= MAX_ARTIFACT_REPAIRS) {
    return { type: "error", message: `A tananyag az automatikus javítás után sem készült el: ${reason}` };
  }
  return {
    type: "retry", reason,
    instruction: `A felhasználó már kérte a tananyag elkészítését. A korábbi válasz nem teljesítette a készítési szerződést: ${reason}\n`
      + "Most készítsd el a TELJES, ellenőrizhető négyoldalas tananyagot az előző körben megismert források alapján. Őrizd meg a forrásokat és az összes helyes tartalmat, a konkrét hibát javítsd. Ne kérj újabb engedélyt, ne adj puszta ígéretet vagy tervet. Ne rövidítsd vagy lazítsd a bankkövetelményt.\n"
      + `${HTML_START}\n<!DOCTYPE html> kezdetű, </html>-lel lezárt teljes dokumentumot adj; minden bank és működő interakció legyen benne.`,
  };
}

/**
 * Igaz, ha a HTML-nek van záró </html> címkéje. A `max_tokens` miatt levágott vagy
 * félbeszakadt kimenetet így nem kínáljuk fel mentésre.
 */
export function htmlLooksComplete(html: string): boolean {
  return /<\/html\s*>/i.test(html);
}

export type { WebSource, WebResearchEvent } from "../../shared/web-research-stream";

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
    "Te a WEBSULI tananyagkészítő ügynöke vagy (Tananyag Készítő v7.4 fúzió).",
    `Keresési támpont: ${grade}. A végső évfolyamot a tananyag fogalmaiból te állapítod meg, nem a készítő.`,
    requestedTitle ? `A tananyag kért címe: ${requestedTitle}` : null,
    "",
    "FELADATOD:",
    "1. Ha a felhasználó tananyagot vagy forrást kér, KERESS az interneten (web_search) magyar tantervi, tankönyvi vagy NAT/OFI-hoz illő forrásokat, az adott évfolyamhoz igazítva.",
    "2. Ez tananyagkészítő felület: a keresés a készítés része. Csak a megtalált, idézhető forrásokból dolgozz. A tanítás forráshivatkozásai a HTML-ben is maradjanak meg. A találati cím/snippet nem bizonyítja a teljes dokumentum olvasását. Ha a forrás ezt nem támasztja alá, ne állíts országosan kötelező havi témasort.",
    '3. A feladat akkor kész, ha TELJES, önálló HTML-t adsz, MINDIG így kezdve: <!-- HTML_START -->. Egy összefoglaló, ígéret vagy "Készül a tananyag" mondat nem eredmény. Ne zárd le ezzel a válaszodat és ne kérj újabb engedélyt.',
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

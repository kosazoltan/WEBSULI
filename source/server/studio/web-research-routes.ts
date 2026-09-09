import express, { type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";

import { isAuthenticatedAdmin } from "../auth";
import { effortFor, resolveLegacyModel } from "../ai/models";
import { logger } from "../lib/logger";
import {
  extractGeneratedHtml,
  webResearchChatSchema,
  webResearchSystemPrompt,
  WEB_SEARCH_TOOL,
} from "./web-research-agent";

/**
 * POST /api/studio/web-research/chat — SSE. Admin. Claude Opus 5, effort low, web_search.
 * A kulcs értéke soha nem kerül logba.
 */
export const webResearchRouter = express.Router();
webResearchRouter.use(isAuthenticatedAdmin);

const STREAM_TIMEOUT_MS = 180_000;

webResearchRouter.post("/web-research/chat", async (req: Request, res: Response) => {
  const parsed = webResearchChatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Hibás kérés. Adj meg szöveget és osztályt (0–12)." });
  }

  const key = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!key || !key.trim()) {
    return res.status(503).json({ message: "Az Anthropic API kulcs nincs beállítva." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const anthropic = new Anthropic({
      apiKey: key,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });

    const history = parsed.data.conversationHistory ?? [];
    const messages: Array<{ role: "user" | "assistant"; content: string }> = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    messages.push({ role: "user", content: parsed.data.message });

    req.on("close", () => {
      controller.abort();
      clearTimeout(timeout);
    });

    const stream = anthropic.messages.stream(
      {
        model: resolveLegacyModel("webResearch"),
        output_config: { effort: effortFor("webResearch") },
        max_tokens: 16384,
        system: webResearchSystemPrompt(parsed.data.classroom),
        tools: [WEB_SEARCH_TOOL],
        messages,
      },
      { signal: controller.signal },
    );

    let fullContent = "";

    for await (const event of stream) {
      if (!event || typeof event !== "object") continue;
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const text = event.delta.text;
        if (!text || typeof text !== "string") continue;
        fullContent += text;
        res.write(`data: ${JSON.stringify({ type: "content_delta", content: text })}\n\n`);
      }
    }

    const html = extractGeneratedHtml(fullContent);
    if (html) {
      res.write(`data: ${JSON.stringify({ type: "html_generated", html })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    clearTimeout(timeout);
  } catch (error: unknown) {
    clearTimeout(timeout);
    const err = error instanceof Error ? error : new Error(String(error));
    const aborted = err.name === "AbortError" || controller.signal.aborted;
    const message = aborted
      ? "Időtúllépés: a keresés vagy a tananyagkészítés túl sokáig tartott."
      : "AI hiba történt a webes keresés közben.";
    logger.error("[WEB-RESEARCH]", aborted ? "aborted" : err.message);
    if (!res.headersSent) {
      return res.status(aborted ? 408 : 500).json({ message });
    }
    res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    res.end();
  }
});

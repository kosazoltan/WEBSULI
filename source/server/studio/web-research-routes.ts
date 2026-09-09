import express, { type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

import { isAuthenticatedAdmin } from "../auth";
import { effortFor, resolveLegacyModel } from "../ai/models";
import { logger } from "../lib/logger";
import { verifyImprovedHtml } from "../improve/verify-html";
import {
  extractGeneratedHtml,
  htmlLooksComplete,
  HTML_START,
  webResearchChatSchema,
  webResearchSystemPrompt,
  WEB_SEARCH_TOOL,
  type WebResearchEvent,
  type WebSource,
} from "./web-research-agent";

/**
 * POST /api/studio/web-research/chat — SSE. Admin. Claude Opus 5, effort low, web_search.
 * A kulcs értéke soha nem kerül logba.
 *
 * Felülvizsgálat 2026-09-09 (2. kör):
 * - `pause_turn`: a szerveroldali keresőciklus szünetelhet; a szüneteltetett assistant-
 *   üzenetet változatlanul visszaküldve folytatjuk (hivatalos doksi), legfeljebb 5×.
 * - `stop_reason` kapu: `max_tokens` / `refusal` esetén hiba, nem csonka HTML.
 * - Időkorlát: nem abszolút (a keresés + hosszú HTML 3 percnél tovább tarthat), hanem
 *   tétlenségi (esemény nélküli) + kemény plafon.
 * - A HTML nem ömlik a chatbe: a marker után a kliens csak státuszt kap.
 */
export const webResearchRouter = express.Router();
webResearchRouter.use(isAuthenticatedAdmin);

const IDLE_TIMEOUT_MS = 120_000;
const HARD_TIMEOUT_MS = 20 * 60_000;
const MAX_CONTINUATIONS = 5;
// v7.4 mérés (2026-09-09): a teljes spec szerinti anyag 32K tokennél csonkult a kvízbank
// elején (46 feladat + motor + TTS kész volt). Opus 5 128K-ig ad kimenetet, streamelve.
const MAX_TOKENS = 64_000;

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
  let idleTimer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const hardTimer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, HARD_TIMEOUT_MS);
  const touch = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IDLE_TIMEOUT_MS);
  };
  const clearTimers = () => {
    clearTimeout(hardTimer);
    if (idleTimer) clearTimeout(idleTimer);
  };
  const send = (event: WebResearchEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const anthropic = new Anthropic({
      apiKey: key,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });

    const messages: MessageParam[] = (parsed.data.conversationHistory ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    messages.push({ role: "user", content: parsed.data.message });
    const firstUser = messages.find((m) => m.role === "user" && typeof m.content === "string");
    const topicSeed = typeof firstUser?.content === "string" ? firstUser.content.slice(0, 200) : parsed.data.message.slice(0, 200);

    req.on("close", () => {
      controller.abort();
      clearTimers();
    });

    let fullContent = "";
    let htmlStarted = false;
    const sources: WebSource[] = [];
    const seenUrls = new Set<string>();
    let stopReason: string | null = null;
    let continuations = 0;

    touch();
    for (;;) {
      const stream = anthropic.messages.stream(
        {
          model: resolveLegacyModel("webResearch"),
          output_config: { effort: effortFor("webResearch") },
          max_tokens: MAX_TOKENS,
          // A system blokk stabil (spec + téma) → prompt-cache; a téma seedje az első
          // felhasználói üzenet, így egy beszélgetésen belül nem változik.
          system: [
            {
              type: "text",
              text: webResearchSystemPrompt(parsed.data.classroom, parsed.data.title, topicSeed),
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: [WEB_SEARCH_TOOL],
          messages,
        },
        { signal: controller.signal },
      );

      for await (const event of stream) {
        touch();
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "server_tool_use") {
            send({ type: "status", message: "Keresés az interneten…" });
          } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const r of block.content) {
              if (r.type === "web_search_result" && r.url && !seenUrls.has(r.url)) {
                seenUrls.add(r.url);
                sources.push({ url: r.url, title: r.title || r.url });
              }
            }
            send({ type: "sources", sources });
            send({ type: "status", message: `Források feldolgozása (${sources.length})…` });
          }
          continue;
        }
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const text = event.delta.text;
          if (!text) continue;
          fullContent += text;
          if (htmlStarted) continue;
          const markerAt = fullContent.indexOf(HTML_START);
          if (markerAt >= 0) {
            htmlStarted = true;
            // A marker egy része már kimehetett a chatbe — a buborékot a marker előtti
            // szövegre cseréljük, a HTML az előnézetbe megy, nem a beszélgetésbe.
            send({ type: "content_replace", content: fullContent.slice(0, markerAt).trimEnd() });
            send({ type: "status", message: "A HTML tananyag készül…" });
            continue;
          }
          send({ type: "content_delta", content: text });
        }
      }

      const final = await stream.finalMessage();
      stopReason = final.stop_reason;
      if (stopReason === "pause_turn" && continuations < MAX_CONTINUATIONS) {
        continuations += 1;
        messages.push({ role: "assistant", content: final.content });
        logger.info(`[WEB-RESEARCH] pause_turn → folytatás #${continuations}`);
        continue;
      }
      break;
    }
    clearTimers();

    logger.info(
      `[WEB-RESEARCH] kész: stop=${stopReason}, folytatás=${continuations}, szöveg=${fullContent.length}, források=${sources.length}`,
    );

    if (stopReason === "max_tokens") {
      send({
        type: "error",
        message:
          "A válasz elérte a hosszkorlátot, a tananyag csonka lett. Kérj rövidebb tananyagot vagy kevesebb feladatot.",
      });
    } else if (stopReason === "refusal") {
      send({ type: "error", message: "A modell elutasította a kérést. Fogalmazd át az utasítást." });
    } else {
      const html = extractGeneratedHtml(fullContent);
      if (html && !htmlLooksComplete(html)) {
        send({
          type: "error",
          message: "A HTML nem záródott le (</html> hiányzik), ezért nem menthető. Kérd újra a készítést.",
        });
      } else if (html) {
        // v7.4: determinisztikus kapu (teljes dokumentum, JS parse, onclick-export, alert-tilalom).
        // Nem blokkol — az admin a figyelmeztetések ismeretében dönt a mentésről.
        const verification = verifyImprovedHtml(html);
        send({ type: "html_generated", html, sources, warnings: verification.problems });
      } else if (htmlStarted) {
        send({ type: "error", message: "A HTML-jelölő után nem érkezett teljes HTML-dokumentum." });
      }
    }

    send({ type: "complete" });
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: unknown) {
    clearTimers();
    const err = error instanceof Error ? error : new Error(String(error));
    const aborted = err.name === "AbortError" || controller.signal.aborted;
    const message = timedOut
      ? "Időtúllépés: a keresés vagy a tananyagkészítés túl sokáig nem adott választ."
      : aborted
        ? "A kérés megszakadt."
        : "AI hiba történt a webes keresés közben.";
    logger.error("[WEB-RESEARCH]", aborted ? `aborted (timeout=${timedOut})` : err.message);
    if (!res.headersSent) {
      return res.status(timedOut ? 408 : 500).json({ message });
    }
    if (!res.writableEnded) {
      send({ type: "error", message });
      res.end();
    }
  }
});

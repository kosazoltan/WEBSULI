import Anthropic from "@anthropic-ai/sdk";
import { studioConnection } from "../ai/studio-provider";
import { CROSS_FAMILY_FALLBACK_EFFORT } from "../ai/models";
import { claudeSourceBlock } from "./ocr";

/**
 * Spec 2026-10-14-tartalek-b-szelet (B2, tulajdonosi döntés): az OpenAI-formátumú (chat-completions) tartalomrészek — szöveg,
 * kép (`image_url` data URL), PDF (`file.file_data` data URL) — Claude-tartalomblokká alakítva, hogy a tantárgy-felismerés és a
 * kivonatoló ellentétes családú tartaléka (Opus 5.5, medium) ugyanazt a forrást lássa. Nem data URL-es kép/fájl → hiba (a Claude
 * nem kapná meg a tartalmat; csendes kihagyás tilos).
 */
export type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } }
  | { type: "image_url"; image_url: { url: string; detail?: string } };

export function openAiPartsToClaude(parts: readonly OpenAiContentPart[]): Anthropic.ContentBlockParam[] {
  return parts.map((part, index): Anthropic.ContentBlockParam => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image_url") return claudeSourceBlock({ name: `kép ${index + 1}`, kind: "image", content: part.image_url.url });
    return claudeSourceBlock({ name: part.file.filename, kind: "pdf", content: part.file.file_data });
  });
}

/** Egy Claude-hívás a fenti tartalommal; adaptív gondolkodás, `output_config.effort`. Csonka válasz → hiba (nem menthető). */
export async function callClaudeParts(opts: {
  model: string;
  system: string;
  parts: readonly OpenAiContentPart[];
  maxTokens: number;
  timeoutMs: number;
  effort?: "low" | "medium" | "high";
  /** Review #220: a hívó megszakítása (pl. a kliens lezárta a kapcsolatot). */
  signal?: AbortSignal;
}): Promise<string> {
  const connection = studioConnection(opts.model);
  const client = new Anthropic({ apiKey: connection.apiKey, baseURL: connection.baseURL, timeout: opts.timeoutMs, maxRetries: 1 });
  const message = await client.messages.stream({
    model: connection.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? CROSS_FAMILY_FALLBACK_EFFORT },
    messages: [{ role: "user", content: openAiPartsToClaude(opts.parts) }],
  }, opts.signal ? { signal: opts.signal } : undefined).finalMessage();
  if (message.stop_reason !== "end_turn") throw new Error(`A Claude-tartalék válasza nem teljes (stop_reason: ${message.stop_reason ?? "?"}).`);
  return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim();
}

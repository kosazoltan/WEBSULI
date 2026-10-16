/**
 * A forrásfájl Claude-tartalomblokkja (docs/specs/2026-10-16-egy-futas.md, S4b: a kivezetett OCR-modulból áthelyezve). A kép és a PDF
 * natív blokként megy a modellnek (az egyfutásos beszélgetés és a régi AI-funkciók képelemzése is ezt használja).
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ExtractorFile } from "./extractor";

const CLAUDE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number];
/** A forrásfájl Claude-tartalomblokkja: kép → `image`, PDF → `document` (base64). */
export function claudeSourceBlock(file: ExtractorFile): Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(file.content);
  if (!m) throw new Error(`A(z) ${file.name} tartalma nem base64 data URL — a Claude-olvasó nem kapja meg.`);
  const [, mediaType, data] = m;
  if (file.kind === "pdf" || mediaType === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  if (!(CLAUDE_IMAGE_TYPES as readonly string[]).includes(mediaType)) throw new Error(`A Claude-olvasó nem támogatja a(z) ${mediaType} formátumot.`);
  return { type: "image", source: { type: "base64", media_type: mediaType as ClaudeImageType, data } };
}

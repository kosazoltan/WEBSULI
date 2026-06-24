/**
 * C1: AI payload limit middleware.
 * Prevents cost explosions and prompt-injection via oversized payloads.
 */
import { Request, Response, NextFunction } from 'express';

export interface AIPayloadLimits {
  maxFiles?: number;          // default 20
  maxBytesPerFile?: number;   // default 256 KB
  maxHistoryItems?: number;   // default 20 conversation turns
  maxCustomPromptChars?: number; // default 2000
  maxExtractedTextChars?: number; // default 50 000
}

const DEFAULTS: Required<AIPayloadLimits> = {
  maxFiles: 20,
  maxBytesPerFile: 256 * 1024,
  maxHistoryItems: 20,
  maxCustomPromptChars: 2_000,
  maxExtractedTextChars: 50_000,
};

export function aiPayloadGuard(limits: AIPayloadLimits = {}) {
  const cfg = { ...DEFAULTS, ...limits };

  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body as Record<string, unknown> | null | undefined;
    if (!body) return next();

    // --- files array ---
    if (Array.isArray(body.files)) {
      if (body.files.length > cfg.maxFiles) {
        res.status(413).json({
          error: `Too many files: max ${cfg.maxFiles}, got ${body.files.length}`,
        });
        return;
      }
      for (const f of body.files as Array<{ content?: string; extractedText?: string }>) {
        const bytes = Buffer.byteLength(f?.content ?? '', 'utf8');
        if (bytes > cfg.maxBytesPerFile) {
          res.status(413).json({
            error: `File content too large: max ${cfg.maxBytesPerFile} bytes`,
          });
          return;
        }
      }
    }

    // --- extractedText ---
    if (typeof body.extractedText === 'string') {
      if (body.extractedText.length > cfg.maxExtractedTextChars) {
        // Silently truncate rather than reject (non-breaking for most callers)
        (body as Record<string, unknown>).extractedText = body.extractedText.slice(
          0,
          cfg.maxExtractedTextChars,
        );
      }
    }

    // --- conversationHistory ---
    if (Array.isArray(body.conversationHistory)) {
      if (body.conversationHistory.length > cfg.maxHistoryItems) {
        // Keep most recent turns (drop oldest)
        (body as Record<string, unknown>).conversationHistory =
          body.conversationHistory.slice(-cfg.maxHistoryItems);
      }
    }

    // --- customPrompt ---
    if (typeof body.customPrompt === 'string' && body.customPrompt.length > cfg.maxCustomPromptChars) {
      res.status(413).json({
        error: `customPrompt too long: max ${cfg.maxCustomPromptChars} chars`,
      });
      return;
    }

    next();
  };
}

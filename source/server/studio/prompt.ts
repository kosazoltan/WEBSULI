import { and, eq } from "drizzle-orm";

import { createPromptStore } from "../lib/prompt-store";

/**
 * LS-2c — studio step prompts served from the `system_prompts` table.
 *
 * The owner can revise the pedagogue/author/lektor system prompts without a deploy.
 * Same fail-open contract as the extractor store (see lib/prompt-store.ts): a missing
 * row, a blank row or an unreachable database falls back to the inline prompt the
 * runner built with `buildPedagoguePrompt` / `buildAuthorPrompt` / `buildLektorPrompt`,
 * so an unseeded database never breaks the pipeline.
 *
 * `db` is imported lazily: importing this module in a unit test must not open a
 * database connection (the lazy import also keeps a test process from hanging on an
 * idle pool).
 */

export const STUDIO_PROMPT_NAMES = {
  pedagogue: "studio.pedagogue.v1",
  author: "studio.author.v1",
  /** Audit 2026-09-05: dedicated key — a DB-seeded general author prompt must not replace the scoped fix contract. */
  authorFix: "studio.author.fix.v1",
  animator: "studio.animator.v1",
  lektor: "studio.lektor.v1",
} as const;

export const studioPromptStore = createPromptStore({
  load: async (name) => {
    const { db } = await import("../db");
    const { systemPrompts } = await import("../../shared/schema");
    const [row] = await db
      .select({ prompt: systemPrompts.prompt })
      .from(systemPrompts)
      .where(and(eq(systemPrompts.name, name), eq(systemPrompts.isActive, true)))
      .limit(1);
    return row?.prompt ?? null;
  },
});

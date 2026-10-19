import { skillStore } from "./learning-store";
import { logger } from "../lib/logger";

export const LEARNING_AUDIT_INTERVAL_MS = 30 * 60_000;

export function startSkillLearningAudit() {
  let busy = false;
  const sweep = async () => {
    if (busy) return;
    busy = true;
    try {
      const count = await skillStore.reconcile();
      if (count) logger.info("[LESSON-SKILLS] Pótolt futásellenőrzések", { count });
    } catch { logger.error("[LESSON-SKILLS] Az utóellenőrzés nem menthető; a következő ellenőrzés újrapróbálja."); }
    finally { busy = false; }
  };
  void sweep();
  // Spec 2026-10-19-eroforras-s1: 30 percenként (korábban percenként — a Neon-adatbázist soha nem hagyta elaludni).
  const timer = setInterval(() => { void sweep(); }, LEARNING_AUDIT_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

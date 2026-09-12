import { skillStore } from "./learning-store";
import { logger } from "../lib/logger";

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
  const timer = setInterval(() => { void sweep(); }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

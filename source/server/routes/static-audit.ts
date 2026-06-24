/**
 * GET /api/static-audit
 * Returns static audit results (admin-only, disabled in production)
 */
import { Router, type Request, type Response } from "express";
import { runStaticAudit } from "../lib/static-audit";
import { isAuthenticatedAdmin } from "../auth";

const router = Router();

router.get("/", isAuthenticatedAdmin, async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const results = await runStaticAudit();
    const allPass = results.every((r) => r.status !== "FAIL");
    res.status(allPass ? 200 : 207).json({
      ok: allPass,
      timestamp: new Date().toISOString(),
      checks: results,
    });
  } catch (err) {
    console.error("[static-audit]", err);
    res.status(500).json({ error: "Audit failed" });
  }
});

export default router;

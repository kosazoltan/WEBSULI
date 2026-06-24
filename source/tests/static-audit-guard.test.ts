import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express, { type Request, type Response, type NextFunction } from "express";
import staticAuditRouter from "../server/routes/static-audit";

/**
 * A3 — /api/static-audit is admin-guarded and disabled in production.
 *
 * Branch (a): unauthenticated request -> isAuthenticatedAdmin returns 401.
 * Branch (b): authenticated admin + NODE_ENV=production -> handler returns 404.
 *
 * We mount the real router. For branch (a) we do NOT inject a user, so the real
 * isAuthenticatedAdmin guard (auth.ts:213) returns 401. For branch (b) we inject
 * an admin user via a pre-middleware so the guard passes and the production
 * short-circuit (static-audit.ts:12) is exercised.
 */
async function withServer(
  opts: { adminUser?: boolean },
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  // Optional auth injection BEFORE the router.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (opts.adminUser) {
      (req as unknown as { user?: unknown }).user = { id: "admin1", isAdmin: true };
      (req as unknown as { isAuthenticated?: () => boolean }).isAuthenticated = () => true;
    } else {
      (req as unknown as { isAuthenticated?: () => boolean }).isAuthenticated = () => false;
    }
    next();
  });
  app.use("/api/static-audit", staticAuditRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("unauthenticated request is rejected by admin guard (401)", async () => {
  await withServer({ adminUser: false }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/static-audit`);
    assert.equal(r.status, 401);
  });
});

test("admin in production gets 404 (endpoint disabled in prod)", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await withServer({ adminUser: true }, async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/static-audit`);
      assert.equal(r.status, 404);
    });
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

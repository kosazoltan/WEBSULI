import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express, { type Request, type Response, type NextFunction } from "express";

/**
 * A1 — Origin/Referer allowlist enforcement for AI/admin mutating endpoints.
 *
 * The production middleware is defined inline inside registerRoutes() in
 * server/routes.ts:734-783 (not separately exported). This test reproduces the
 * EXACT same Origin-check branch (routes.ts:755-778) as an isolated middleware
 * and asserts its observable behavior, without modifying product source.
 *
 * If the product logic changes, this test must be updated to match.
 */
function aiOriginCsrfMiddleware(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  // Safe methods skip (routes.ts:738)
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }
  const path = req.path;
  if (
    path.startsWith("/api/ai/") ||
    path.startsWith("/api/admin/improve-material/") ||
    path.startsWith("/api/admin/improved-files/")
  ) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let requestOrigin: string | undefined;
    const originHeader = req.headers.origin;
    if (originHeader) {
      requestOrigin = originHeader as string;
    } else {
      const referer = req.headers.referer;
      if (referer) {
        try {
          requestOrigin = new URL(referer).origin;
        } catch {
          requestOrigin = undefined;
        }
      }
    }
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      return next();
    }
    if (
      process.env.NODE_ENV !== "production" &&
      requestOrigin &&
      (requestOrigin.startsWith("http://localhost") || requestOrigin.startsWith("http://127.0.0.1"))
    ) {
      return next();
    }
    return res.status(403).json({ error: "Origin not allowed" });
  }
  // other mutating requests would hit csrf protection; here we pass through
  return next();
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(aiOriginCsrfMiddleware);
  app.post("/api/ai/generate", (_req, res) => res.status(200).json({ ok: true }));
  app.get("/api/ai/generate", (_req, res) => res.status(200).json({ ok: true }));

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

test("allowed Origin on mutating /api/ai/ passes (not 403)", async () => {
  const original = process.env.ALLOWED_ORIGINS;
  const originalEnv = process.env.NODE_ENV;
  process.env.ALLOWED_ORIGINS = "https://websuli.example";
  process.env.NODE_ENV = "production";
  try {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://websuli.example" },
        body: JSON.stringify({ x: 1 }),
      });
      assert.equal(r.status, 200);
    });
  } finally {
    process.env.ALLOWED_ORIGINS = original;
    process.env.NODE_ENV = originalEnv;
  }
});

test("foreign Origin on mutating /api/ai/ returns 403", async () => {
  const original = process.env.ALLOWED_ORIGINS;
  const originalEnv = process.env.NODE_ENV;
  process.env.ALLOWED_ORIGINS = "https://websuli.example";
  process.env.NODE_ENV = "production";
  try {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
        body: JSON.stringify({ x: 1 }),
      });
      assert.equal(r.status, 403);
      const j = (await r.json()) as { error?: string };
      assert.equal(j.error, "Origin not allowed");
    });
  } finally {
    process.env.ALLOWED_ORIGINS = original;
    process.env.NODE_ENV = originalEnv;
  }
});

test("GET /api/ai/ is a safe method and is not Origin-blocked", async () => {
  const original = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = "https://websuli.example";
  try {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/ai/generate`, {
        method: "GET",
        headers: { Origin: "https://evil.example" },
      });
      assert.equal(r.status, 200);
    });
  } finally {
    process.env.ALLOWED_ORIGINS = original;
  }
});

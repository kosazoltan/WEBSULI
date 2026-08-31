import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express, { type Request, type Response, type NextFunction } from "express";

import { isOriginAllowed, getAllowedOrigins } from "../server/lib/allowed-origins";

/**
 * A1 — Origin/Referer allowlist enforcement for the mutating endpoints that cannot carry
 * a CSRF synchroniser token: the AI/admin-improve endpoints and, since the 2026-08 audit,
 * /api/login and /api/logout as well.
 *
 * The middleware itself is defined inline inside registerRoutes() in server/routes.ts and
 * is not exported, but its decision function — isOriginAllowed() — now lives in
 * server/lib/allowed-origins.ts and IS imported here, so these tests exercise the real
 * production allowlist rather than a copy of it. Only the thin request-routing wrapper is
 * reproduced below.
 */
const ORIGIN_GUARDED_PATHS = [
  "/api/login",
  "/api/logout",
];

function isOriginGuardedPath(path: string): boolean {
  return (
    ORIGIN_GUARDED_PATHS.includes(path) ||
    path.startsWith("/api/ai/") ||
    path.startsWith("/api/admin/improve-material/") ||
    path.startsWith("/api/admin/improved-files/")
  );
}

/** Mirrors getRequestOrigin() in server/routes.ts. */
function requestOrigin(req: Request): string | undefined {
  const originHeader = req.headers.origin;
  if (originHeader) return originHeader as string;
  const referer = req.headers.referer;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function originCsrfMiddleware(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  // Safe methods skip
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }
  if (isOriginGuardedPath(req.path)) {
    const origin = requestOrigin(req);
    if (isOriginAllowed(origin)) {
      return next();
    }
    // same-origin is never cross-site
    if (origin && origin === `${req.protocol}://${req.get("host")}`) {
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
  app.use(originCsrfMiddleware);
  const ok = (_req: Request, res: Response) => res.status(200).json({ ok: true });
  app.post("/api/ai/generate", ok);
  app.get("/api/ai/generate", ok);
  app.post("/api/login", ok);
  app.post("/api/logout", ok);

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

/** Runs `body` with ALLOWED_ORIGINS/NODE_ENV set, restoring both afterwards. */
async function withEnv(
  env: { ALLOWED_ORIGINS?: string; NODE_ENV?: string },
  body: () => Promise<void>,
): Promise<void> {
  const originalAllowed = process.env.ALLOWED_ORIGINS;
  const originalNodeEnv = process.env.NODE_ENV;
  if (env.ALLOWED_ORIGINS !== undefined) process.env.ALLOWED_ORIGINS = env.ALLOWED_ORIGINS;
  if (env.NODE_ENV !== undefined) process.env.NODE_ENV = env.NODE_ENV;
  try {
    await body();
  } finally {
    process.env.ALLOWED_ORIGINS = originalAllowed;
    process.env.NODE_ENV = originalNodeEnv;
  }
}

test("allowed Origin on mutating /api/ai/ passes (not 403)", async () => {
  await withEnv({ ALLOWED_ORIGINS: "https://websuli.example", NODE_ENV: "production" }, async () => {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://websuli.example" },
        body: JSON.stringify({ x: 1 }),
      });
      assert.equal(r.status, 200);
    });
  });
});

test("foreign Origin on mutating /api/ai/ returns 403", async () => {
  await withEnv({ ALLOWED_ORIGINS: "https://websuli.example", NODE_ENV: "production" }, async () => {
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
  });
});

test("GET /api/ai/ is a safe method and is not Origin-blocked", async () => {
  await withEnv({ ALLOWED_ORIGINS: "https://websuli.example" }, async () => {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/ai/generate`, {
        method: "GET",
        headers: { Origin: "https://evil.example" },
      });
      assert.equal(r.status, 200);
    });
  });
});

test("login CSRF: a foreign Origin cannot POST /api/login", async () => {
  await withEnv({ ALLOWED_ORIGINS: "", NODE_ENV: "production" }, async () => {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
        body: JSON.stringify({ email: "a@b.c", password: "x" }),
      });
      assert.equal(r.status, 403);
    });
  });
});

test("login from a production domain is allowed without ALLOWED_ORIGINS being set", async () => {
  await withEnv({ ALLOWED_ORIGINS: "", NODE_ENV: "production" }, async () => {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://websuli.org" },
        body: JSON.stringify({ email: "a@b.c", password: "x" }),
      });
      assert.equal(r.status, 200);
    });
  });
});

test("a same-origin login is allowed even when the domain is not in the allowlist", async () => {
  await withEnv({ ALLOWED_ORIGINS: "https://websuli.example", NODE_ENV: "production" }, async () => {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: baseUrl },
        body: JSON.stringify({ email: "a@b.c", password: "x" }),
      });
      assert.equal(r.status, 200);
    });
  });
});

test("logout with no Origin/Referer at all is rejected (fail-closed)", async () => {
  await withEnv({ ALLOWED_ORIGINS: "https://websuli.example", NODE_ENV: "production" }, async () => {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/logout`, { method: "POST" });
      assert.equal(r.status, 403);
    });
  });
});

test("Referer is used as the origin when the Origin header is absent", async () => {
  await withEnv({ ALLOWED_ORIGINS: "https://websuli.example", NODE_ENV: "production" }, async () => {
    await withServer(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/ai/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: "https://websuli.example/admin/materials",
        },
        body: JSON.stringify({ x: 1 }),
      });
      assert.equal(r.status, 200);
    });
  });
});

test("localhost is only trusted outside production", async () => {
  await withEnv({ ALLOWED_ORIGINS: "", NODE_ENV: "production" }, async () => {
    assert.equal(isOriginAllowed("http://localhost:5173"), false);
  });
  await withEnv({ ALLOWED_ORIGINS: "", NODE_ENV: "development" }, async () => {
    assert.equal(isOriginAllowed("http://localhost:5173"), true);
    assert.equal(isOriginAllowed("http://127.0.0.1:4321"), true);
  });
});

test("the allowlist always contains the production domains and normalises env entries", async () => {
  await withEnv(
    { ALLOWED_ORIGINS: " https://extra.example/some/path , ", NODE_ENV: "production" },
    async () => {
      const origins = getAllowedOrigins();
      assert.ok(origins.includes("https://websuli.org"));
      assert.ok(origins.includes("https://www.websuli.vip"));
      // a URL with a path is reduced to its origin, blank entries are dropped
      assert.ok(origins.includes("https://extra.example"));
      assert.ok(!origins.some((o) => o === "" || o.includes("/some/path")));
      // no duplicates
      assert.equal(new Set(origins).size, origins.length);
    },
  );
});

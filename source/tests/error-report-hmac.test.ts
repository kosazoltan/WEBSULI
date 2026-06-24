import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import test from "node:test";
import express from "express";
import { createErrorReportRouter } from "../server/routes/error-report";

const SECRET = "test-error-report-secret";

function sign(body: unknown): string {
  return crypto
    .createHmac("sha256", SECRET)
    .update(JSON.stringify(body ?? {}))
    .digest("hex");
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/error-report", createErrorReportRouter(async () => undefined));

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

async function post(baseUrl: string, body: unknown, signature = sign(body)): Promise<Response> {
  return fetch(`${baseUrl}/api/error-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
    },
    body: JSON.stringify(body),
  });
}

test("valid HMAC signature returns 202", async () => {
  const originalSecret = process.env.ERRORLOG_HMAC_SECRET;
  process.env.ERRORLOG_HMAC_SECRET = SECRET;
  try {
    await withServer(async (baseUrl) => {
      const body = { errorType: "TestError", message: "signed request" };
      const response = await post(baseUrl, body);

      assert.equal(response.status, 202);
    });
  } finally {
    process.env.ERRORLOG_HMAC_SECRET = originalSecret;
  }
});

test("invalid HMAC signature returns 401", async () => {
  const originalSecret = process.env.ERRORLOG_HMAC_SECRET;
  process.env.ERRORLOG_HMAC_SECRET = SECRET;
  try {
    await withServer(async (baseUrl) => {
      const response = await post(baseUrl, { message: "bad signature" }, "0".repeat(64));

      assert.equal(response.status, 401);
    });
  } finally {
    process.env.ERRORLOG_HMAC_SECRET = originalSecret;
  }
});

test("production without HMAC secret returns 503", async () => {
  const originalSecret = process.env.ERRORLOG_HMAC_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.ERRORLOG_HMAC_SECRET;
  process.env.NODE_ENV = "production";
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/error-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "unsigned production request" }),
      });

      assert.equal(response.status, 503);
    });
  } finally {
    process.env.ERRORLOG_HMAC_SECRET = originalSecret;
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test("sixth request within a minute returns 429", async () => {
  const originalSecret = process.env.ERRORLOG_HMAC_SECRET;
  process.env.ERRORLOG_HMAC_SECRET = SECRET;
  try {
    await withServer(async (baseUrl) => {
      const body = { errorType: "TestError", message: "rate limit" };
      for (let i = 0; i < 5; i += 1) {
        const response = await post(baseUrl, { ...body, requestId: String(i) });
        assert.equal(response.status, 202);
      }

      const limited = await post(baseUrl, { ...body, requestId: "limited" });
      assert.equal(limited.status, 429);
    });
  } finally {
    process.env.ERRORLOG_HMAC_SECRET = originalSecret;
  }
});

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import test from "node:test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { DEV_CSP_NONCE_PLACEHOLDER, lessonCspDirectives } from "../server/lib/csp-profiles";

test("development CSP permits only the request nonce, not inline handlers or eval", () => {
  const nonce = randomBytes(24).toString("base64");
  const csp = lessonCspDirectives({ allowedOrigins: [], isDevelopment: true, devScriptNonce: nonce });
  assert.deepEqual(csp.scriptSrc, ["'self'", `'nonce-${nonce}'`]);
  assert.deepEqual(csp.scriptSrcAttr, ["'none'"]);
  assert.ok(!Object.values(csp).flat().includes("'unsafe-eval'"));
  assert.deepEqual(lessonCspDirectives({ allowedOrigins: [], isDevelopment: true }).scriptSrc, ["'self'"]);
});

test("production CSP ignores development nonces, malformed development nonces fail closed", () => {
  for (const nonce of [randomBytes(24).toString("base64"), "", "x' 'unsafe-inline", "a\r\nb", "__PLACEHOLDER__"]) {
    assert.deepEqual(lessonCspDirectives({ allowedOrigins: [], isDevelopment: false, devScriptNonce: nonce }).scriptSrc, ["'self'"]);
  }
  for (const nonce of ["", "x' 'unsafe-inline", "a\r\nb", "__PLACEHOLDER__"]) {
    assert.throws(() => lessonCspDirectives({ allowedOrigins: [], isDevelopment: true, devScriptNonce: nonce }), /Invalid development CSP nonce/);
  }
});

test("actual Vite + React transformation nonces its refresh preamble and HMR meta tag", async () => {
  const httpServer = createHttpServer();
  const vite = await createServer({
    configFile: false,
    plugins: [react()],
    html: { cspNonce: DEV_CSP_NONCE_PLACEHOLDER },
    server: { middlewareMode: true, hmr: { server: httpServer } },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  try {
    const html = await vite.transformIndexHtml("/lesson/test", "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>");
    assert.match(html, /import[^\n]+from ["']\/@react-refresh["']/);
    assert.match(html, /injectIntoGlobalHook\(window\)/);
    assert.match(html, new RegExp(`property="csp-nonce" nonce="${DEV_CSP_NONCE_PLACEHOLDER}"`));
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)];
    assert.ok(scripts.length >= 2, "React preamble and Vite client must both be transformed");
    for (const [tag] of scripts) assert.ok(tag.includes(`nonce="${DEV_CSP_NONCE_PLACEHOLDER}"`));
  } finally {
    await vite.close();
  }
});
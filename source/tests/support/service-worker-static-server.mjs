// Minimal static server for the service-worker install/activate browser test.
// Serves client/public as-is, plus a test-only control endpoint that can
// (a) rewrite CACHE_VERSION in /service-worker.js to simulate a new release and
// (b) make chosen static assets fail with 500 to simulate a broken install.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/public");
const port = Number(process.env.SW_TEST_PORT || 5179);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

let version = null;
let fail = new Set();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const send = (status, body, type = "text/plain; charset=utf-8") => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  };

  if (url.pathname === "/__sw-test/reset") {
    version = null;
    fail = new Set();
    return send(200, "ok");
  }
  if (url.pathname === "/__sw-test/set") {
    version = url.searchParams.get("version");
    fail = new Set((url.searchParams.get("fail") || "").split(",").filter(Boolean));
    return send(200, "ok");
  }
  if (url.pathname === "/") {
    return send(200, "<!doctype html><title>sw test</title><p>sw test</p>", types[".html"]);
  }
  if (fail.has(url.pathname)) return send(500, "forced failure");

  const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) return send(403, "forbidden");
  try {
    let body = await readFile(file);
    if (url.pathname === "/service-worker.js" && version) {
      const src = body.toString("utf8");
      const replaced = src.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${version}';`);
      if (replaced === src) return send(500, "CACHE_VERSION line not found");
      body = replaced;
    }
    send(200, body, types[path.extname(file)] || "application/octet-stream");
  } catch {
    send(404, "not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[sw-test-server] http://127.0.0.1:${port} serving ${root}`);
});

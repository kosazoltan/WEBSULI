import assert from "node:assert/strict";
import test from "node:test";

import {
  getAllowedOrigins,
  isOriginAllowed,
  isLoopbackOrigin,
} from "../server/lib/allowed-origins";

/**
 * SEC #100 — no environment variable may smuggle localhost into the production allowlist.
 *
 * getAllowedOrigins() gates its own literal localhost entries on NODE_ENV, but it also
 * folds in FRONTEND_URL, BASE_URL and ALLOWED_ORIGINS unconditionally. On a deployment
 * where any of those still points at a developer value, `http://localhost:5173` becomes a
 * trusted origin in production — and since this same list guards the mutating endpoints
 * that cannot carry a CSRF token (login/logout, the AI routes), a page on the attacker's
 * machine could drive them.
 *
 * The rule these tests pin: in production the allowlist contains no loopback origin,
 * whatever the environment says. Outside production localhost stays trusted, because
 * that is how the app is developed.
 */

async function withEnv(
  env: Record<string, string | undefined>,
  body: () => void | Promise<void>,
): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    saved.set(key, process.env[key]);
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    await body();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const PROD = {
  NODE_ENV: "production",
  CUSTOM_DOMAIN: undefined,
  ALLOWED_ORIGINS: undefined,
  FRONTEND_URL: undefined,
  BASE_URL: undefined,
};

test("isLoopbackOrigin recognises the loopback family", () => {
  for (const origin of [
    "http://localhost",
    "http://localhost:5173",
    "https://localhost:8443",
    "http://127.0.0.1",
    "http://127.0.0.1:4321",
    "http://127.1.2.3:80",
    "http://[::1]:5000",
    "http://0.0.0.0:3000",
  ]) {
    assert.equal(isLoopbackOrigin(origin), true, `${origin} must count as loopback`);
  }
});

test("isLoopbackOrigin does not misclassify real hosts", () => {
  for (const origin of [
    "https://websuli.vip",
    "https://localhost.attacker.com",
    "https://notlocalhost.example",
    "https://127.0.0.1.attacker.com",
    "https://mylocalhost.hu",
  ]) {
    assert.equal(isLoopbackOrigin(origin), false, `${origin} must NOT count as loopback`);
  }
});

test("production: FRONTEND_URL pointing at localhost does not become trusted", async () => {
  await withEnv({ ...PROD, FRONTEND_URL: "http://localhost:5173" }, () => {
    assert.equal(isOriginAllowed("http://localhost:5173"), false);
    assert.ok(!getAllowedOrigins().includes("http://localhost:5173"));
  });
});

test("production: BASE_URL pointing at localhost does not become trusted", async () => {
  await withEnv({ ...PROD, BASE_URL: "http://localhost:5000" }, () => {
    assert.equal(isOriginAllowed("http://localhost:5000"), false);
  });
});

test("production: ALLOWED_ORIGINS cannot list a loopback origin either", async () => {
  await withEnv(
    { ...PROD, ALLOWED_ORIGINS: "https://websuli.vip,http://127.0.0.1:4321" },
    () => {
      assert.equal(isOriginAllowed("http://127.0.0.1:4321"), false);
      // The legitimate entry alongside it must still work.
      assert.equal(isOriginAllowed("https://websuli.vip"), true);
    },
  );
});

test("production: CUSTOM_DOMAIN of 'localhost' cannot open the door", async () => {
  await withEnv({ ...PROD, CUSTOM_DOMAIN: "localhost" }, () => {
    assert.equal(isOriginAllowed("https://localhost"), false);
  });
});

test("production: a real deployment URL is still trusted", async () => {
  // The fix must not break the reason those variables exist.
  await withEnv({ ...PROD, BASE_URL: "https://websuli.onrender.com" }, () => {
    assert.equal(isOriginAllowed("https://websuli.onrender.com"), true);
  });
});

test("production: the static production domains remain trusted", async () => {
  await withEnv(PROD, () => {
    assert.equal(isOriginAllowed("https://websuli.vip"), true);
    assert.equal(isOriginAllowed("https://www.websuli.org"), true);
  });
});

test("development: localhost from FRONTEND_URL stays trusted", async () => {
  // Removing the developer's own workflow would be a different kind of bug.
  await withEnv(
    { ...PROD, NODE_ENV: "development", FRONTEND_URL: "http://localhost:5173" },
    () => {
      assert.equal(isOriginAllowed("http://localhost:5173"), true);
      assert.equal(isOriginAllowed("http://127.0.0.1:4321"), true);
    },
  );
});

test("development: the allowlist ITSELF still contains the localhost entries", async () => {
  // isOriginAllowed() has a second, independent dev-only branch for loopback, so it
  // answers `true` even if the list were wrongly stripped. Reverse-mutation
  // (2026-09-04, MUT-5) showed the suite stayed green when the production filter was
  // applied in development too. Assert on the list to close that blind spot: CORS in
  // server/index.ts reads getAllowedOrigins() directly and has no such fallback.
  await withEnv({ ...PROD, NODE_ENV: "development" }, () => {
    const list = getAllowedOrigins();
    assert.ok(list.includes("http://localhost:5173"), "vite dev server must stay trusted");
    assert.ok(list.includes("http://localhost:5000"), "local API must stay trusted");
  });
});

test("isLoopbackOrigin is what actually strips the entries in production", async () => {
  // Guards against a hollow implementation: if isLoopbackOrigin stopped recognising
  // localhost, the production filter would silently pass everything through.
  assert.equal(isLoopbackOrigin("http://localhost:5173"), true);
  await withEnv({ ...PROD, FRONTEND_URL: "http://localhost:5173" }, () => {
    const list = getAllowedOrigins();
    assert.equal(
      list.filter((o) => isLoopbackOrigin(o)).length,
      0,
      "no loopback origin may survive into the production allowlist",
    );
  });
});

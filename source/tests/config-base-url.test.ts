import assert from "node:assert/strict";
import test from "node:test";

import { getBaseUrl, getMaterialPreviewUrl } from "../server/utils/config";

/**
 * server/utils/config.ts — resolves the public base URL. It feeds the QR codes, the
 * sitemap, the e-mail links and the material preview URLs, so a wrong value silently
 * ships broken links to every subscriber.
 */

const ENV_KEYS = ["CUSTOM_DOMAIN", "BASE_URL", "PORT"] as const;

function withEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, body: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    body();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("CUSTOM_DOMAIN wins and is served over HTTPS", () => {
  withEnv({ CUSTOM_DOMAIN: "websuli.vip", BASE_URL: "http://ignored.example" }, () => {
    assert.equal(getBaseUrl(), "https://websuli.vip");
  });
});

test("BASE_URL is used when no custom domain is set", () => {
  withEnv({ BASE_URL: "https://websuli.onrender.com" }, () => {
    assert.equal(getBaseUrl(), "https://websuli.onrender.com");
  });
});

test("falls back to localhost on the configured port", () => {
  withEnv({ PORT: "3000" }, () => {
    assert.equal(getBaseUrl(), "http://localhost:3000");
  });
  withEnv({}, () => {
    assert.equal(getBaseUrl(), "http://localhost:5000");
  });
});

test("the resolved base URL always parses as a URL", () => {
  for (const env of [
    { CUSTOM_DOMAIN: "websuli.vip" },
    { BASE_URL: "https://websuli.org" },
    {},
  ]) {
    withEnv(env, () => {
      assert.doesNotThrow(() => new URL(getBaseUrl()), JSON.stringify(env));
    });
  }
});

test("the base URL never ends in a slash, so joined paths keep a single separator", () => {
  // getMaterialPreviewUrl concatenates `${base}/preview/${id}`; a trailing slash would
  // produce //preview/... which breaks the client router and canonical links.
  withEnv({ BASE_URL: "https://websuli.org/" }, () => {
    assert.ok(!getBaseUrl().endsWith("/"), getBaseUrl());
  });
});

test("getMaterialPreviewUrl builds a valid preview link", () => {
  withEnv({ CUSTOM_DOMAIN: "websuli.vip" }, () => {
    assert.equal(
      getMaterialPreviewUrl("abc-123"),
      "https://websuli.vip/preview/abc-123",
    );
  });
});

test("getMaterialPreviewUrl never emits a doubled slash", () => {
  withEnv({ BASE_URL: "https://websuli.org/" }, () => {
    const url = getMaterialPreviewUrl("abc-123");
    assert.ok(!url.includes("//preview"), url);
    assert.equal(new URL(url).pathname, "/preview/abc-123");
  });
});

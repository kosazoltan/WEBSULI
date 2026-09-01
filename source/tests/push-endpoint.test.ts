import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PUSH_ENDPOINT_LENGTH,
  validatePushEndpoint,
  validatePushKeys,
} from "../server/lib/push-endpoint";

/**
 * SSRF guard for POST /api/push/subscribe.
 *
 * The endpoint is public and the URL it stores is later requested by the server
 * (web-push POSTs to it on every notification), so anything outside the real browser
 * push services must be rejected at write time.
 */

test("accepts the real browser push services over HTTPS", () => {
  const valid = [
    "https://updates.push.services.mozilla.com/wpush/v2/abc123",
    "https://fcm.googleapis.com/fcm/send/abc123",
    "https://android.googleapis.com/gcm/send/abc123",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QAbc123",
  ];
  for (const endpoint of valid) {
    assert.equal(validatePushEndpoint(endpoint), new URL(endpoint).toString(), endpoint);
  }
});

test("rejects internal and attacker-controlled hosts", () => {
  const invalid = [
    "https://127.0.0.1/internal",
    "https://localhost:5432/",
    "https://169.254.169.254/latest/meta-data/", // cloud metadata service
    "https://10.0.0.5/admin",
    "https://evil.example/collect",
    // suffix confusion: must not match on a substring
    "https://fcm.googleapis.com.evil.example/fcm/send/x",
    "https://notfcm.googleapis.comevil.example/x",
  ];
  for (const endpoint of invalid) {
    assert.equal(validatePushEndpoint(endpoint), null, endpoint);
  }
});

test("rejects non-HTTPS schemes", () => {
  assert.equal(validatePushEndpoint("http://fcm.googleapis.com/fcm/send/x"), null);
  assert.equal(validatePushEndpoint("file:///etc/passwd"), null);
  assert.equal(validatePushEndpoint("gopher://fcm.googleapis.com/x"), null);
});

test("rejects non-strings, empty values and oversized URLs", () => {
  assert.equal(validatePushEndpoint(undefined), null);
  assert.equal(validatePushEndpoint(null), null);
  assert.equal(validatePushEndpoint(42), null);
  assert.equal(validatePushEndpoint({ toString: () => "https://fcm.googleapis.com/x" }), null);
  assert.equal(validatePushEndpoint("   "), null);
  assert.equal(validatePushEndpoint("not a url"), null);
  const tooLong = `https://fcm.googleapis.com/fcm/send/${"a".repeat(MAX_PUSH_ENDPOINT_LENGTH)}`;
  assert.equal(validatePushEndpoint(tooLong), null);
});

test("push keys must be a well-formed p256dh/auth pair", () => {
  assert.deepEqual(validatePushKeys({ p256dh: "BEl62iUYgUivx", auth: "k8JV6sjd7" }), {
    p256dh: "BEl62iUYgUivx",
    auth: "k8JV6sjd7",
  });

  assert.equal(validatePushKeys(null), null);
  assert.equal(validatePushKeys("nope"), null);
  assert.equal(validatePushKeys({ p256dh: "ok" }), null);
  assert.equal(validatePushKeys({ p256dh: "", auth: "k8JV" }), null);
  assert.equal(validatePushKeys({ p256dh: "has spaces", auth: "k8JV" }), null);
  assert.equal(validatePushKeys({ p256dh: "a".repeat(201), auth: "k8JV" }), null);
  assert.equal(validatePushKeys({ p256dh: "BEl6", auth: "a".repeat(101) }), null);
});

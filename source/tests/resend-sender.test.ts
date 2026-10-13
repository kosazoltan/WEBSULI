import { test } from "node:test";
import assert from "node:assert/strict";
import { checkResendSender, extractSenderAddress } from "../server/lib/resend-sender";

test("verified own-domain senders are accepted", () => {
  for (const from of [
    "WEBSULI <noreply@websuli.vip>", "noreply@websuli.vip", "x@notresend.dev", "x@resend.dev.example.com",
    "<noreply@websuli.vip>", "\"WebSuli Értesítő\" <no-reply+x@mail.web-suli.vip>",
  ]) {
    assert.deepEqual(checkResendSender(from), { ok: true }, from);
  }
});

test("Resend sandbox sender (resend.dev) is rejected with an actionable reason", () => {
  for (const from of ["WebSuli <onboarding@resend.dev>", "ONBOARDING@RESEND.DEV", "x@mail.resend.dev"]) {
    const r = checkResendSender(from);
    assert.equal(r.ok, false, from);
    if (!r.ok) {
      assert.match(r.reason, /resend\.dev/);
      assert.match(r.reason, /websuli\.vip/);
    }
  }
});

test("malformed sender is rejected as invalid", () => {
  for (const from of [
    "WebSuli", "<>", "a@b",
    // review #205: the whole value must match, not just a bracketed fragment
    "WebSuli <noreply@websuli.vip> trailing", "<a@websuli.vip> <b@websuli.vip>", "x <a@websuli.vip",
    // invalid domain labels
    "a@-websuli.vip", "a@websuli-.vip", "a@websuli..vip", "a@web_suli.vip",
  ]) {
    const r = checkResendSender(from);
    assert.equal(r.ok, false, from);
    if (!r.ok) assert.match(r.reason, /érvénytelen/);
  }
});

test("extractSenderAddress handles display-name form and casing", () => {
  assert.equal(extractSenderAddress("Név <A@B.hu>"), "a@b.hu");
  assert.equal(extractSenderAddress("  noreply@websuli.vip "), "noreply@websuli.vip");
  assert.equal(extractSenderAddress("WebSuli"), null);
});

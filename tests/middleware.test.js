"use strict";

/**
 * Tests for verifySlackSignature middleware.
 *
 * The middleware is not exported from index.js, so we recreate it here
 * using the same logic — this also acts as a specification test that
 * the algorithm itself is correct, independent of Express wiring.
 */

const crypto = require("crypto");

// ── Replicate the middleware logic under test ─────────────────

const SIGNING_SECRET = "test-signing-secret-32-bytes-ok!";
const MAX_AGE_SECONDS = 300;

function makeSignature(secret, timestamp, rawBody) {
  return "v0=" + crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");
}

function verifySlackSignature(signingSecret, timestamp, slackSig, rawBody) {
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) {
    return { ok: false, status: 401, error: "Request too old or missing timestamp" };
  }
  const expected = makeSignature(signingSecret, timestamp, rawBody);

  // Guard: timingSafeEqual requires equal-length buffers (matches production behaviour)
  const expectedBuf = Buffer.from(expected, "utf8");
  const sigBuf      = Buffer.from(slackSig ?? "", "utf8");

  if (expectedBuf.length !== sigBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
    return { ok: false, status: 401, error: "Invalid Slack signature" };
  }
  return { ok: true };
}

// ── Helpers ───────────────────────────────────────────────────

const freshTimestamp = () => String(Math.floor(Date.now() / 1000));
const staleTimestamp = () => String(Math.floor(Date.now() / 1000) - 400);

// ── Tests ─────────────────────────────────────────────────────

describe("verifySlackSignature", () => {
  const body = "token=abc&command=%2Fask&text=hello";

  test("accepts a valid signature", () => {
    const ts = freshTimestamp();
    const sig = makeSignature(SIGNING_SECRET, ts, body);
    const result = verifySlackSignature(SIGNING_SECRET, ts, sig, body);
    expect(result.ok).toBe(true);
  });

  test("rejects a tampered body", () => {
    const ts = freshTimestamp();
    const sig = makeSignature(SIGNING_SECRET, ts, body);
    const tamperedBody = body + "&injected=true";
    const result = verifySlackSignature(SIGNING_SECRET, ts, sig, tamperedBody);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toMatch(/Invalid Slack signature/);
  });

  test("rejects a wrong signing secret", () => {
    const ts = freshTimestamp();
    const sig = makeSignature("wrong-secret-xxxxxxxxxxxxxxxxxxx", ts, body);
    const result = verifySlackSignature(SIGNING_SECRET, ts, sig, body);
    expect(result.ok).toBe(false);
  });

  test("rejects a stale timestamp (replay attack)", () => {
    const ts = staleTimestamp();
    const sig = makeSignature(SIGNING_SECRET, ts, body);
    const result = verifySlackSignature(SIGNING_SECRET, ts, sig, body);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too old/);
  });

  test("rejects a missing timestamp", () => {
    const result = verifySlackSignature(SIGNING_SECRET, undefined, "v0=abc", body);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing timestamp/);
  });

  test("rejects a missing signature", () => {
    const ts = freshTimestamp();
    // undefined sig → empty string → different length from expected → early reject
    const result = verifySlackSignature(SIGNING_SECRET, ts, undefined, body);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid Slack signature/);
  });

  test("rejects an empty body with a signature built for non-empty body", () => {
    const ts = freshTimestamp();
    const sig = makeSignature(SIGNING_SECRET, ts, body);
    const result = verifySlackSignature(SIGNING_SECRET, ts, sig, "");
    expect(result.ok).toBe(false);
  });

  test("accepts an empty body when signature matches", () => {
    const ts = freshTimestamp();
    const sig = makeSignature(SIGNING_SECRET, ts, "");
    const result = verifySlackSignature(SIGNING_SECRET, ts, sig, "");
    expect(result.ok).toBe(true);
  });
});

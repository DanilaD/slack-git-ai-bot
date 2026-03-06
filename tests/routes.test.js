"use strict";

/**
 * Integration tests for HTTP routes in src/index.js.
 *
 * Uses supertest to spin up the Express app without binding a port.
 * All external dependencies (GitHub, AI, Jira) are mocked.
 */

const crypto = require("crypto");
const request = require("supertest");

// ── Env vars required at module load ─────────────────────────
process.env.SLACK_SIGNING_SECRET = "test-slack-secret-32-bytes-ok!!";
process.env.GITHUB_TOKEN   = "test-github-token";
process.env.GROQ_API_KEY   = "test-groq-key";
process.env.JIRA_TOKEN     = "test-jira-token";

// ── Mock all external modules ─────────────────────────────────

jest.mock("../config/ai", () => ({
  ACTIVE_PROVIDER: "groq",
  name: "Groq",
  model: "test-model",
  apiUrl: "https://api.groq.com/openai/v1/chat/completions",
  apiKeyEnv: "GROQ_API_KEY",
  maxTokens: 100,
}));

jest.mock("../config/github", () => ({
  repo: "testowner/testrepo",
  maxCodeFiles: 2,
  maxFileChars: 500,
  maxPRs: 5,
  maxIssues: 5,
  maxCommits: 5,
}));

jest.mock("../config/jira", () => ({
  host: "https://test.atlassian.net",
  email: "test@example.com",
  project: "TEST",
  defaultIssueType: "Task",
}));

jest.mock("../src/github", () => ({
  fetchGitHubContext: jest.fn().mockResolvedValue({ text: "mocked context", sources: [] }),
}));

jest.mock("../src/ai", () => ({
  askQuestion:         jest.fn().mockResolvedValue("mocked answer"),
  analyzeTask:         jest.fn().mockResolvedValue("mocked plan"),
  generateJiraContent: jest.fn().mockResolvedValue("mocked ticket body"),
}));

jest.mock("../src/jira", () => ({
  createJiraTicket: jest.fn().mockResolvedValue({ key: "TEST-1", url: "https://test.atlassian.net/browse/TEST-1" }),
}));

// Mock global fetch (used by slackPost)
global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "ok" });

// ── Load the app ──────────────────────────────────────────────

// We need to export the app from index.js OR we recreate a minimal version.
// Since index.js calls app.listen() at module load, we need to prevent that.
// Strategy: use supertest which handles unclosed servers gracefully, and
// extract the app by temporarily suppressing listen().

// index.js only calls app.listen() when run directly (require.main === module),
// so requiring it in tests gives us the plain Express app with no port bound.
const app = require("../src/index");

// ── Helpers ───────────────────────────────────────────────────

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

function signedSlackRequest(body) {
  const rawBody = new URLSearchParams(body).toString();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = "v0=" + crypto
    .createHmac("sha256", SIGNING_SECRET)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");
  return { rawBody, timestamp, sig };
}

// ── GET /health ───────────────────────────────────────────────

describe("GET /health", () => {
  test("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("includes ai, model, and repo fields", async () => {
    const res = await request(app).get("/health");
    expect(res.body).toMatchObject({
      status: "ok",
      ai: "Groq",
      model: "test-model",
      repo: "testowner/testrepo",
    });
  });
});

// ── POST /slack/ask ───────────────────────────────────────────

describe("POST /slack/ask", () => {
  test("returns 401 with missing signature headers", async () => {
    const res = await request(app)
      .post("/slack/ask")
      .type("form")
      .send({ text: "hello", user_id: "U123", response_url: "https://hooks.slack.com/test" });
    expect(res.status).toBe(401);
  });

  test("returns ephemeral message when text is empty", async () => {
    const body = { text: "", user_id: "U123", response_url: "https://hooks.slack.com/test" };
    const { rawBody, timestamp, sig } = signedSlackRequest(body);

    const res = await request(app)
      .post("/slack/ask")
      .set("x-slack-request-timestamp", timestamp)
      .set("x-slack-signature", sig)
      .type("form")
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body.response_type).toBe("ephemeral");
  });

  test("acks immediately with 200 when text is provided", async () => {
    const body = { text: "how does auth work", user_id: "U456", response_url: "https://hooks.slack.com/test" };
    const { rawBody, timestamp, sig } = signedSlackRequest(body);

    const res = await request(app)
      .post("/slack/ask")
      .set("x-slack-request-timestamp", timestamp)
      .set("x-slack-signature", sig)
      .type("form")
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body.response_type).toBe("in_channel");
    expect(res.body.text).toContain("U456");
  });

  test("rejects a stale timestamp", async () => {
    const body = { text: "test", user_id: "U123", response_url: "https://hooks.slack.com/test" };
    const rawBody = new URLSearchParams(body).toString();
    const staleTs = String(Math.floor(Date.now() / 1000) - 400);
    const sig = "v0=" + crypto.createHmac("sha256", SIGNING_SECRET).update(`v0:${staleTs}:${rawBody}`).digest("hex");

    const res = await request(app)
      .post("/slack/ask")
      .set("x-slack-request-timestamp", staleTs)
      .set("x-slack-signature", sig)
      .type("form")
      .send(rawBody);

    expect(res.status).toBe(401);
  });
});

// ── POST /slack/events (URL verification) ────────────────────

describe("POST /slack/events", () => {
  test("responds to Slack URL verification challenge", async () => {
    const res = await request(app)
      .post("/slack/events")
      .send({ type: "url_verification", challenge: "abc123xyz" });
    expect(res.status).toBe(200);
    expect(res.body.challenge).toBe("abc123xyz");
  });
});

"use strict";

/**
 * Unit tests for src/ai.js
 *
 * We mock fetch globally so no real HTTP calls are made.
 * We also mock config/ai.js and config/prompts.js to isolate the module.
 */

// Must set env vars before requiring the module
process.env.GROQ_API_KEY = "test-groq-key";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

// ── Mock config ───────────────────────────────────────────────

jest.mock("../config/ai", () => ({
  ACTIVE_PROVIDER: "groq",
  name: "Groq",
  model: "test-model",
  apiUrl: "https://api.groq.com/openai/v1/chat/completions",
  apiKeyEnv: "GROQ_API_KEY",
  maxTokens: 100,
}));

jest.mock("../config/prompts", () => ({
  ASK:  { system: "You are a helpful assistant.", user: "Q: {question}\nCtx: {context}" },
  TASK: { system: "You plan tasks.",               user: "Task: {question}\nCtx: {context}" },
  JIRA: { system: "You write Jira tickets.",        user: "Ticket: {question}\nCtx: {context}" },
}));

// ── Mock global fetch ─────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

const okJsonResponse = (body) => ({
  ok: true,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const errorResponse = (status, text) => ({
  ok: false,
  status,
  text: async () => text,
  json: async () => ({ error: text }),
});

// ── Load module after mocks are set ──────────────────────────

let ai;
beforeAll(() => {
  ai = require("../src/ai");
});

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────

describe("askQuestion", () => {
  test("calls fetch with rendered prompt and returns AI text", async () => {
    mockFetch.mockResolvedValue(
      okJsonResponse({ choices: [{ message: { content: "The registration uses JWT." } }] })
    );

    const result = await ai.askQuestion("How does registration work?", { text: "// auth code" });

    expect(result).toBe("The registration uses JWT.");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("test-model");
    expect(body.messages[1].content).toContain("How does registration work?");
    expect(body.messages[1].content).toContain("// auth code");
  });

  test("throws when API returns non-ok response", async () => {
    mockFetch.mockResolvedValue(errorResponse(429, "rate limit exceeded"));
    await expect(ai.askQuestion("test", { text: "" })).rejects.toThrow("Groq API error");
  });

  test("uses 'No context available.' when ctx.text is empty", async () => {
    mockFetch.mockResolvedValue(
      okJsonResponse({ choices: [{ message: { content: "answer" } }] })
    );
    await ai.askQuestion("question", { text: "" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain("No context available.");
  });
});

describe("analyzeTask", () => {
  test("uses the TASK prompt system message", async () => {
    mockFetch.mockResolvedValue(
      okJsonResponse({ choices: [{ message: { content: "plan" } }] })
    );
    await ai.analyzeTask("Add login", { text: "code" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toBe("You plan tasks.");
    expect(body.messages[1].content).toContain("Add login");
  });
});

describe("generateJiraContent", () => {
  test("uses the JIRA prompt system message", async () => {
    mockFetch.mockResolvedValue(
      okJsonResponse({ choices: [{ message: { content: "ticket body" } }] })
    );
    await ai.generateJiraContent("Add dark mode", { text: "styles" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toBe("You write Jira tickets.");
  });
});

describe("missing API key", () => {
  test("throws if env var is not set", async () => {
    // The apiKeyEnv value is read from process.env at call time (not module load).
    // Temporarily remove it, verify the throw, then restore.
    const savedKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    let threw = false;
    try {
      await ai.askQuestion("test", { text: "" });
    } catch (err) {
      threw = true;
      expect(err.message).toContain("GROQ_API_KEY");
    } finally {
      process.env.GROQ_API_KEY = savedKey;
    }
    expect(threw).toBe(true);
  });
});

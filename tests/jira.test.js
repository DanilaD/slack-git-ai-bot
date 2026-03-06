"use strict";

/**
 * Unit tests for src/jira.js
 *
 * Tests: createJiraTicket success, error handling, ADF body shape,
 * and missing-token validation at module load.
 */

// ── Mock config ───────────────────────────────────────────────

jest.mock("../config/jira", () => ({
  host: "https://test.atlassian.net",
  email: "test@example.com",
  project: "TEST",
  defaultIssueType: "Task",
}));

// ── Mock global fetch ─────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Set env before module load ────────────────────────────────

process.env.JIRA_TOKEN = "test-jira-token";

// ── Load module ───────────────────────────────────────────────

let jira;
beforeAll(() => {
  jira = require("../src/jira");
});

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Helpers ───────────────────────────────────────────────────

const okResponse = (body) => ({
  ok: true,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const errorResponse = (status, text) => ({
  ok: false,
  status,
  text: async () => text,
  json: async () => ({}),
});

// ── Tests ─────────────────────────────────────────────────────

describe("createJiraTicket", () => {
  test("creates a ticket and returns key + url", async () => {
    mockFetch.mockResolvedValue(okResponse({ key: "TEST-42" }));

    const result = await jira.createJiraTicket({
      summary: "Fix login bug",
      description: "Users cannot log in after password reset.",
    });

    expect(result.key).toBe("TEST-42");
    expect(result.url).toBe("https://test.atlassian.net/browse/TEST-42");
  });

  test("sends correct Authorization header (Basic base64)", async () => {
    mockFetch.mockResolvedValue(okResponse({ key: "TEST-1" }));

    await jira.createJiraTicket({ summary: "Test", description: "desc" });

    const [, opts] = mockFetch.mock.calls[0];
    const expected = "Basic " + Buffer.from("test@example.com:test-jira-token").toString("base64");
    expect(opts.headers.Authorization).toBe(expected);
  });

  test("POSTs to the correct Jira REST URL", async () => {
    mockFetch.mockResolvedValue(okResponse({ key: "TEST-2" }));

    await jira.createJiraTicket({ summary: "Test", description: "desc" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test.atlassian.net/rest/api/3/issue");
  });

  test("sends description as Atlassian Document Format (ADF)", async () => {
    mockFetch.mockResolvedValue(okResponse({ key: "TEST-3" }));

    await jira.createJiraTicket({ summary: "Test", description: "My description text." });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.fields.description).toEqual({
      type: "doc",
      version: 1,
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "My description text." }],
      }],
    });
  });

  test("uses defaultIssueType from config when not specified", async () => {
    mockFetch.mockResolvedValue(okResponse({ key: "TEST-4" }));
    await jira.createJiraTicket({ summary: "Test", description: "desc" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.fields.issuetype.name).toBe("Task");
  });

  test("accepts a custom issue type", async () => {
    mockFetch.mockResolvedValue(okResponse({ key: "TEST-5" }));
    await jira.createJiraTicket({ summary: "Test", description: "desc", issueType: "Bug" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.fields.issuetype.name).toBe("Bug");
  });

  test("throws on Jira API error with descriptive message", async () => {
    mockFetch.mockResolvedValue(errorResponse(400, "Field 'project' is required"));
    await expect(
      jira.createJiraTicket({ summary: "Fail", description: "desc" })
    ).rejects.toThrow("Jira API error");
  });

  test("uses correct project key from config", async () => {
    mockFetch.mockResolvedValue(okResponse({ key: "TEST-6" }));
    await jira.createJiraTicket({ summary: "Test", description: "desc" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.fields.project.key).toBe("TEST");
  });
});

describe("module load validation", () => {
  test("throws at load time if JIRA_TOKEN is missing", () => {
    // Reset modules so we can re-require with missing token
    jest.resetModules();
    jest.mock("../config/jira", () => ({
      host: "https://test.atlassian.net",
      email: "test@example.com",
      project: "TEST",
      defaultIssueType: "Task",
    }));

    const savedToken = process.env.JIRA_TOKEN;
    delete process.env.JIRA_TOKEN;

    expect(() => require("../src/jira")).toThrow("Missing JIRA_TOKEN");

    process.env.JIRA_TOKEN = savedToken;
  });
});

"use strict";

/**
 * Unit tests for src/github.js
 *
 * We mock @octokit/rest to avoid real GitHub API calls.
 * Tests cover: keyword extraction, `wants` matcher, and fetchGitHubContext routing.
 */

process.env.GITHUB_TOKEN = "test-github-token";

// ── Mock config ───────────────────────────────────────────────

jest.mock("../config/github", () => ({
  repo: "testowner/testrepo",
  maxCodeFiles: 2,
  maxFileChars: 500,
  maxPRs: 5,
  maxIssues: 5,
  maxCommits: 5,
}));

// ── Mock Octokit ──────────────────────────────────────────────

const mockOctokit = {
  pulls: {
    list: jest.fn(),
  },
  issues: {
    listForRepo: jest.fn(),
  },
  repos: {
    listCommits: jest.fn(),
    getContent: jest.fn(),
    get: jest.fn(),
    getReadme: jest.fn(),
  },
  search: {
    code: jest.fn(),
  },
};

jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn(() => mockOctokit),
}));

// ── Load module ───────────────────────────────────────────────

let github;
beforeAll(() => {
  github = require("../src/github");
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helpers for mock data ─────────────────────────────────────

const makePR = (n) => ({
  number: n,
  title: `PR ${n}`,
  html_url: `https://github.com/t/r/pull/${n}`,
  user: { login: "dev" },
  head: { ref: "feature" },
  base: { ref: "main" },
  body: null,
});

const makeIssue = (n, isPR = false) => ({
  number: n,
  title: `Issue ${n}`,
  html_url: `https://github.com/t/r/issues/${n}`,
  labels: [],
  body: null,
  pull_request: isPR ? {} : undefined,
});

const makeCommit = (sha, msg) => ({
  sha,
  html_url: `https://github.com/t/r/commit/${sha}`,
  commit: {
    message: msg,
    author: { name: "dev", date: "2025-01-01T00:00:00Z" },
  },
});

const makeCodeItem = (path) => ({
  path,
  html_url: `https://github.com/t/r/blob/main/${path}`,
});

// ── Tests ─────────────────────────────────────────────────────

describe("fetchGitHubContext — PR queries", () => {
  test("fetches PRs when question mentions 'pull request'", async () => {
    mockOctokit.pulls.list.mockResolvedValue({ data: [makePR(1), makePR(2)] });
    mockOctokit.search.code.mockResolvedValue({ data: { items: [] } });
    mockOctokit.repos.get.mockResolvedValue({ data: { full_name: "t/r", description: "", default_branch: "main", open_issues_count: 0, html_url: "https://github.com/t/r" } });
    mockOctokit.repos.getContent.mockResolvedValue({ data: [] });
    mockOctokit.repos.getReadme.mockRejectedValue(new Error("no readme"));

    const ctx = await github.fetchGitHubContext("show open pull requests");

    expect(mockOctokit.pulls.list).toHaveBeenCalledTimes(1);
    expect(ctx.text).toContain("PR 1");
    expect(ctx.text).toContain("PR 2");
    expect(ctx.sources).toHaveLength(2);
  });

  test("returns 'No open pull requests' when list is empty", async () => {
    mockOctokit.pulls.list.mockResolvedValue({ data: [] });
    mockOctokit.search.code.mockResolvedValue({ data: { items: [] } });
    mockOctokit.repos.get.mockResolvedValue({ data: { full_name: "t/r", description: "", default_branch: "main", open_issues_count: 0, html_url: "https://github.com/t/r" } });
    mockOctokit.repos.getContent.mockResolvedValue({ data: [] });
    mockOctokit.repos.getReadme.mockRejectedValue(new Error("no readme"));

    const ctx = await github.fetchGitHubContext("any open prs?");
    expect(ctx.text).toContain("No open pull requests");
  });
});

describe("fetchGitHubContext — issue queries", () => {
  test("fetches issues and excludes PRs from the list", async () => {
    // mix: one real issue + one item that is also a PR
    mockOctokit.issues.listForRepo.mockResolvedValue({
      data: [makeIssue(10), makeIssue(11, true)],
    });
    mockOctokit.search.code.mockResolvedValue({ data: { items: [] } });
    mockOctokit.repos.get.mockResolvedValue({ data: { full_name: "t/r", description: "", default_branch: "main", open_issues_count: 1, html_url: "https://github.com/t/r" } });
    mockOctokit.repos.getContent.mockResolvedValue({ data: [] });
    mockOctokit.repos.getReadme.mockRejectedValue(new Error("no readme"));

    const ctx = await github.fetchGitHubContext("open bugs and issues");

    expect(mockOctokit.issues.listForRepo).toHaveBeenCalledTimes(1);
    // only the real issue, not the PR-shaped one
    expect(ctx.text).toContain("Issue 10");
    expect(ctx.text).not.toContain("Issue 11");
  });
});

describe("fetchGitHubContext — commit queries", () => {
  test("fetches commits when question mentions 'recent commits'", async () => {
    mockOctokit.repos.listCommits.mockResolvedValue({
      data: [makeCommit("abc1234", "Fix login bug"), makeCommit("def5678", "Add tests")],
    });
    mockOctokit.search.code.mockResolvedValue({ data: { items: [] } });
    mockOctokit.repos.get.mockResolvedValue({ data: { full_name: "t/r", description: "", default_branch: "main", open_issues_count: 0, html_url: "https://github.com/t/r" } });
    mockOctokit.repos.getContent.mockResolvedValue({ data: [] });
    mockOctokit.repos.getReadme.mockRejectedValue(new Error("no readme"));

    const ctx = await github.fetchGitHubContext("show recent commits");

    expect(mockOctokit.repos.listCommits).toHaveBeenCalledTimes(1);
    expect(ctx.text).toContain("Fix login bug");
    expect(ctx.text).toContain("Add tests");
  });
});

describe("fetchGitHubContext — code search", () => {
  test("searches code and returns file content", async () => {
    const fileContent = Buffer.from("function login() { /* ... */ }").toString("base64");
    mockOctokit.search.code.mockResolvedValue({
      data: { items: [makeCodeItem("src/auth.js")] },
    });
    mockOctokit.repos.getContent.mockResolvedValue({
      data: { content: fileContent },
    });

    const ctx = await github.fetchGitHubContext("how does login work");

    expect(mockOctokit.search.code).toHaveBeenCalledTimes(1);
    expect(ctx.text).toContain("src/auth.js");
    expect(ctx.sources[0].label).toBe("src/auth.js");
  });

  test("falls back to repo overview when no keywords can be extracted", async () => {
    // "what is this" is all stop words → extractKeywords returns [] →
    // fetchCode returns { text: "", sources: [] } → overview fallback runs.
    mockOctokit.repos.get.mockResolvedValue({
      data: { full_name: "testowner/testrepo", description: "test repo", default_branch: "main", open_issues_count: 0, html_url: "https://github.com/t/r" },
    });
    mockOctokit.repos.getContent.mockResolvedValue({ data: [] });
    mockOctokit.repos.getReadme.mockRejectedValue(new Error("no readme"));

    const ctx = await github.fetchGitHubContext("what is this");

    expect(mockOctokit.repos.get).toHaveBeenCalledTimes(1);
    expect(ctx.text).toContain("testowner/testrepo");
    expect(mockOctokit.search.code).not.toHaveBeenCalled();
  });
});

describe("fetchGitHubContext — error handling", () => {
  test("returns graceful error message on GitHub API failure", async () => {
    mockOctokit.search.code.mockRejectedValue(new Error("GitHub rate limit exceeded"));
    mockOctokit.repos.get.mockRejectedValue(new Error("GitHub rate limit exceeded"));
    mockOctokit.repos.getContent.mockRejectedValue(new Error("GitHub rate limit exceeded"));

    const ctx = await github.fetchGitHubContext("something");

    expect(ctx.text).toContain("GitHub fetch failed");
    expect(ctx.sources).toHaveLength(0);
  });
});

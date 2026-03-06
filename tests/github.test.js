"use strict";

/**
 * Unit tests for src/github.js
 *
 * We mock @octokit/rest to avoid real GitHub API calls.
 * Tests cover: keyword extraction, `wants` matcher, parallel fetch,
 * code search, overview fallback, and error handling.
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
  docPaths: ["README.md", "CONTRIBUTING.md"],
  maxDocChars: 1000,
}));

// Use the real stopwords file so keyword filtering is tested accurately
jest.mock("../config/stopwords", () => jest.requireActual("../config/stopwords"));

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
    mockOctokit.repos.get.mockResolvedValue({
      data: {
        full_name: "t/r",
        description: "",
        default_branch: "main",
        open_issues_count: 0,
        html_url: "https://github.com/t/r",
      },
    });
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
    mockOctokit.repos.get.mockResolvedValue({
      data: {
        full_name: "t/r",
        description: "",
        default_branch: "main",
        open_issues_count: 0,
        html_url: "https://github.com/t/r",
      },
    });
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
    mockOctokit.repos.get.mockResolvedValue({
      data: {
        full_name: "t/r",
        description: "",
        default_branch: "main",
        open_issues_count: 1,
        html_url: "https://github.com/t/r",
      },
    });
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
    mockOctokit.repos.get.mockResolvedValue({
      data: {
        full_name: "t/r",
        description: "",
        default_branch: "main",
        open_issues_count: 0,
        html_url: "https://github.com/t/r",
      },
    });
    mockOctokit.repos.getContent.mockResolvedValue({ data: [] });
    mockOctokit.repos.getReadme.mockRejectedValue(new Error("no readme"));

    const ctx = await github.fetchGitHubContext("show recent commits");

    expect(mockOctokit.repos.listCommits).toHaveBeenCalledTimes(1);
    expect(ctx.text).toContain("Fix login bug");
    expect(ctx.text).toContain("Add tests");
  });
});

describe("fetchGitHubContext — parallel fetch", () => {
  test("fetches PRs and issues in parallel when question matches both", async () => {
    // "status" triggers both prs and issues matchers
    mockOctokit.pulls.list.mockResolvedValue({ data: [makePR(5)] });
    mockOctokit.issues.listForRepo.mockResolvedValue({ data: [makeIssue(20)] });
    mockOctokit.search.code.mockResolvedValue({ data: { items: [] } });
    mockOctokit.repos.get.mockResolvedValue({
      data: {
        full_name: "t/r",
        description: "",
        default_branch: "main",
        open_issues_count: 1,
        html_url: "https://github.com/t/r",
      },
    });
    mockOctokit.repos.getContent.mockResolvedValue({ data: [] });
    mockOctokit.repos.getReadme.mockRejectedValue(new Error("no readme"));

    const ctx = await github.fetchGitHubContext("project status");

    // Both should have been called (run in parallel via Promise.all)
    expect(mockOctokit.pulls.list).toHaveBeenCalledTimes(1);
    expect(mockOctokit.issues.listForRepo).toHaveBeenCalledTimes(1);
    // Both results should appear in output
    expect(ctx.text).toContain("PR 5");
    expect(ctx.text).toContain("Issue 20");
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

  test("does NOT call search.code when question has no extractable keywords", async () => {
    // "what is this" → all stop words → extractKeywords returns [] → no API call
    mockOctokit.repos.get.mockResolvedValue({
      data: {
        full_name: "testowner/testrepo",
        description: "test repo",
        default_branch: "main",
        open_issues_count: 0,
        html_url: "https://github.com/t/r",
      },
    });
    mockOctokit.repos.getContent.mockResolvedValue({ data: [] });
    mockOctokit.repos.getReadme.mockRejectedValue(new Error("no readme"));

    const ctx = await github.fetchGitHubContext("what is this");

    expect(mockOctokit.search.code).not.toHaveBeenCalled();
    expect(mockOctokit.repos.get).toHaveBeenCalledTimes(1);
    expect(ctx.text).toContain("testowner/testrepo");
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

describe("fetchMarkdownDocs", () => {
  test("returns doc content and sources for found files", async () => {
    const readmeContent = Buffer.from("# Project README\nThis is the readme.").toString("base64");
    const contributingContent = Buffer.from("# Contributing\nHow to contribute.").toString(
      "base64"
    );

    mockOctokit.repos.getContent
      .mockResolvedValueOnce({
        data: { content: readmeContent, html_url: "https://github.com/t/r/blob/main/README.md" },
      })
      .mockResolvedValueOnce({
        data: {
          content: contributingContent,
          html_url: "https://github.com/t/r/blob/main/CONTRIBUTING.md",
        },
      });

    const result = await github.fetchMarkdownDocs();

    expect(result.text).toContain("## Documentation");
    expect(result.text).toContain("README.md");
    expect(result.text).toContain("Project README");
    expect(result.text).toContain("CONTRIBUTING.md");
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].label).toBe("README.md");
  });

  test("skips missing docs gracefully (404)", async () => {
    const readmeContent = Buffer.from("# README").toString("base64");

    mockOctokit.repos.getContent
      .mockResolvedValueOnce({
        data: { content: readmeContent, html_url: "https://github.com/t/r/blob/main/README.md" },
      })
      .mockRejectedValueOnce(new Error("Not Found"));

    const result = await github.fetchMarkdownDocs();

    expect(result.text).toContain("README.md");
    expect(result.sources).toHaveLength(1); // only README, CONTRIBUTING was 404
  });

  test("returns empty result when all docs are 404", async () => {
    mockOctokit.repos.getContent.mockRejectedValue(new Error("Not Found"));

    const result = await github.fetchMarkdownDocs();

    expect(result.text).toBe("");
    expect(result.sources).toHaveLength(0);
  });

  test("fetchGitHubContext includes docs when includeDocs is true", async () => {
    const readmeContent = Buffer.from("# README content").toString("base64");
    mockOctokit.search.code.mockResolvedValue({ data: { items: [] } });
    mockOctokit.repos.get.mockResolvedValue({
      data: {
        full_name: "t/r",
        description: "",
        default_branch: "main",
        open_issues_count: 0,
        html_url: "https://github.com/t/r",
      },
    });
    mockOctokit.repos.getContent
      .mockResolvedValueOnce({
        data: { content: readmeContent, html_url: "https://github.com/t/r/blob/main/README.md" },
      })
      .mockRejectedValue(new Error("Not Found"));
    mockOctokit.repos.getReadme.mockRejectedValue(new Error("no readme"));

    const ctx = await github.fetchGitHubContext("how do I set up the project", {
      includeDocs: true,
    });

    expect(ctx.text).toContain("Documentation");
    expect(ctx.text).toContain("README content");
  });

  test("fetchGitHubContext does NOT include docs by default", async () => {
    const fileContent = Buffer.from("function login() {}").toString("base64");
    mockOctokit.search.code.mockResolvedValue({
      data: { items: [makeCodeItem("src/auth.js")] },
    });
    mockOctokit.repos.getContent.mockResolvedValue({ data: { content: fileContent } });

    const ctx = await github.fetchGitHubContext("login function");

    // getContent called once (for the code file), not for README/CONTRIBUTING
    expect(ctx.text).not.toContain("## Documentation");
  });
});

describe("module load validation", () => {
  test("throws at load time if GITHUB_TOKEN is missing", () => {
    jest.resetModules();
    jest.mock("../config/github", () => ({
      repo: "testowner/testrepo",
      maxCodeFiles: 2,
      maxFileChars: 500,
      maxPRs: 5,
      maxIssues: 5,
      maxCommits: 5,
    }));
    jest.mock("../config/stopwords", () => jest.requireActual("../config/stopwords"));
    jest.mock("@octokit/rest", () => ({ Octokit: jest.fn(() => mockOctokit) }));

    const savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    expect(() => require("../src/github")).toThrow("Missing GITHUB_TOKEN");

    process.env.GITHUB_TOKEN = savedToken;
  });
});

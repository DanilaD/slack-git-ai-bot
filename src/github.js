"use strict";

const { Octokit } = require("@octokit/rest");
const {
  repo: repoSlug,
  maxCodeFiles,
  maxFileChars,
  maxPRs,
  maxIssues,
  maxCommits,
  docPaths,
  maxDocChars,
  codebaseOverviewPath,
} = require("../config/github");
const STOP_WORDS = require("../config/stopwords");

// Fail fast if token is missing (mirrors jira.js behaviour)
if (!process.env.GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN in .env");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Parse once at module load
const [owner, repo] = repoSlug.split("/");
if (!owner || !repo)
  throw new Error(`config/github.js: repo must be "owner/repo", got "${repoSlug}"`);

// ── Keyword extraction ────────────────────────────────────────

const extractKeywords = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 3);

// ── Matchers — decide which data types to fetch ───────────────

const matches = (q, ...terms) => terms.some((t) => q.includes(t));

const wants = {
  prs: (q) => matches(q, "pr", "pull request", "merge", "progress", "status"),
  issues: (q) => matches(q, "issue", "bug", "task", "todo", "progress", "status"),
  commits: (q) => matches(q, "commit", "recent", "latest", "last change", "who changed"),
};

// ── Data fetchers ─────────────────────────────────────────────

const fetchPRs = async () => {
  const { data } = await octokit.pulls.list({ owner, repo, state: "open", per_page: maxPRs });
  if (!data.length) return { text: "No open pull requests.", sources: [] };

  return {
    sources: data.map((pr) => ({ label: `PR #${pr.number}: ${pr.title}`, url: pr.html_url })),
    text:
      `## Open Pull Requests (${data.length})\n` +
      data
        .map(
          (pr) =>
            `- PR #${pr.number} "${pr.title}" by @${pr.user.login} | ${pr.head.ref} → ${pr.base.ref}\n  ${pr.html_url}${pr.body ? `\n  ${pr.body.slice(0, 200)}` : ""}`
        )
        .join("\n\n"),
  };
};

const fetchIssues = async () => {
  const { data } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: "open",
    per_page: maxIssues,
  });
  const issues = data.filter((i) => !i.pull_request);
  if (!issues.length) return { text: "No open issues.", sources: [] };

  return {
    sources: issues.map((i) => ({ label: `Issue #${i.number}: ${i.title}`, url: i.html_url })),
    text:
      `## Open Issues (${issues.length})\n` +
      issues
        .map(
          (i) =>
            `- #${i.number} "${i.title}" [${i.labels.map((l) => l.name).join(", ") || "no labels"}]\n  ${i.html_url}${i.body ? `\n  ${i.body.slice(0, 150)}` : ""}`
        )
        .join("\n\n"),
  };
};

const fetchCommits = async () => {
  const { data } = await octokit.repos.listCommits({ owner, repo, per_page: maxCommits });
  return {
    sources: data.map((c) => ({
      label: c.commit.message.split("\n")[0].slice(0, 60),
      url: c.html_url,
    })),
    text:
      `## Recent Commits\n` +
      data
        .map(
          (c) =>
            `- ${c.sha.slice(0, 7)} by ${c.commit.author.name} (${c.commit.author.date.slice(0, 10)}): "${c.commit.message.split("\n")[0]}"`
        )
        .join("\n"),
  };
};

const fetchFileContent = async (path) => {
  const { data } = await octokit.repos.getContent({ owner, repo, path });
  return Buffer.from(data.content, "base64").toString("utf-8").slice(0, maxFileChars);
};

const fetchCode = async (question) => {
  const keywords = extractKeywords(question);
  if (!keywords.length) return { text: "", sources: [] };

  const q = `${keywords.join(" ")} repo:${owner}/${repo}`;
  console.log(`[github] Code search: "${q}"`);

  const { data } = await octokit.search.code({ q, per_page: maxCodeFiles + 1 });
  if (!data.items.length) return { text: `No code found for: ${keywords.join(", ")}`, sources: [] };

  const sources = data.items.map((item) => ({ label: item.path, url: item.html_url }));

  const files = await Promise.allSettled(
    data.items.slice(0, maxCodeFiles).map(async (item) => {
      try {
        const content = await fetchFileContent(item.path);
        return `### ${item.path}\n\`\`\`\n${content}\n\`\`\``;
      } catch {
        return `### ${item.path}\n(could not fetch content)`;
      }
    })
  );

  return {
    sources,
    text:
      `## Relevant Code Files\n` +
      files
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value)
        .join("\n\n"),
  };
};

const fetchOverview = async () => {
  const [{ data: r }, { data: entries }] = await Promise.all([
    octokit.repos.get({ owner, repo }),
    octokit.repos.getContent({ owner, repo, path: "" }).catch(() => ({ data: [] })),
  ]);

  let readme = "(No README found)";
  try {
    const { data: rm } = await octokit.repos.getReadme({ owner, repo });
    readme = Buffer.from(rm.content, "base64").toString("utf-8").slice(0, 1000);
  } catch {
    /* ignore */
  }

  const tree = Array.isArray(entries)
    ? entries.map((f) => `${f.type === "dir" ? "📁" : "📄"} ${f.name}`).join("\n")
    : "";

  return {
    sources: [{ label: `${r.full_name} on GitHub`, url: r.html_url }],
    text: `## Repo: ${r.full_name}\n${r.description || ""}\nBranch: ${r.default_branch} | Issues: ${r.open_issues_count}\n\n### Files\n${tree}\n\n### README\n${readme}`,
  };
};

// ── Markdown doc fetcher ──────────────────────────────────────

const fetchMarkdownDocs = async () => {
  if (!docPaths || !docPaths.length) return { text: "", sources: [] };

  const results = await Promise.allSettled(
    docPaths.map(async (path) => {
      try {
        const { data } = await octokit.repos.getContent({ owner, repo, path });
        const content = Buffer.from(data.content, "base64").toString("utf-8").slice(0, maxDocChars);
        return {
          text: `### ${path}\n${content}`,
          source: { label: path, url: data.html_url },
        };
      } catch {
        return null; // 404 or other error — skip silently
      }
    })
  );

  const docs = results
    .filter((r) => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);

  if (!docs.length) return { text: "", sources: [] };

  return {
    text: `## Documentation\n\n` + docs.map((d) => d.text).join("\n\n"),
    sources: docs.map((d) => d.source),
  };
};

// ── Codebase overview fetcher ─────────────────────────────────
// Fetches CODEBASE.md (or the path set in config) from the repo root.
// Skips silently when the file doesn't exist, is empty, or path is null.

const fetchCodebaseOverview = async () => {
  if (!codebaseOverviewPath) return { text: "", sources: [] };

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: codebaseOverviewPath,
    });
    const content = Buffer.from(data.content, "base64").toString("utf-8").trim();
    if (!content) return { text: "", sources: [] };

    return {
      text: `## Codebase Overview\n\n${content.slice(0, maxDocChars)}`,
      sources: [{ label: codebaseOverviewPath, url: data.html_url }],
    };
  } catch {
    return { text: "", sources: [] }; // 404 or other error — skip silently
  }
};

// ── Main entry ────────────────────────────────────────────────

const fetchGitHubContext = async (question, { includeDocs = false } = {}) => {
  const q = question.toLowerCase();
  const parts = [];
  const sources = [];

  const add = ({ text, sources: s }) => {
    parts.push(text);
    sources.push(...s);
  };

  try {
    // Build all fetchers — type-specific + code search — then run in parallel
    const fetchers = [];
    if (wants.prs(q)) fetchers.push(fetchPRs);
    if (wants.issues(q)) fetchers.push(fetchIssues);
    if (wants.commits(q)) fetchers.push(fetchCommits);
    fetchers.push(() => fetchCode(question));
    if (includeDocs) {
      fetchers.push(fetchMarkdownDocs);
      fetchers.push(fetchCodebaseOverview);
    }

    const results = await Promise.all(fetchers.map((fn) => fn()));
    results.forEach((r) => {
      if (r.text) add(r);
    });

    // No results at all — fall back to repo overview
    if (!parts.length) {
      add(await fetchOverview());
    }
  } catch (err) {
    console.error("[github] Error:", err.message);
    return { text: `(GitHub fetch failed: ${err.message})`, sources: [] };
  }

  return { text: parts.join("\n\n---\n\n"), sources };
};

module.exports = { fetchGitHubContext, fetchMarkdownDocs, fetchCodebaseOverview };

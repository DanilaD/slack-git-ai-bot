// ============================================================
// GitHub Integration Module
// Fetches relevant context from your repo to answer questions
// ============================================================

const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Parse "owner/repo" from env
function getRepo() {
  const [owner, repo] = (process.env.GITHUB_REPO || "").split("/");
  if (!owner || !repo) throw new Error("GITHUB_REPO must be in format owner/repo");
  return { owner, repo };
}

// ── Main entry point ─────────────────────────────────────────
// Decides what GitHub data to fetch based on the question
async function fetchGitHubContext(question) {
  const q = question.toLowerCase();
  const context = { text: "", sources: [] };
  const parts = [];

  try {
    // Always include recent PR & issue summary for project awareness
    if (q.includes("pr") || q.includes("pull request") || q.includes("merge") || q.includes("progress") || q.includes("status")) {
      const prs = await getOpenPRs();
      parts.push(prs.text);
      context.sources.push(...prs.sources);
    }

    if (q.includes("issue") || q.includes("bug") || q.includes("task") || q.includes("todo") || q.includes("progress") || q.includes("status")) {
      const issues = await getOpenIssues();
      parts.push(issues.text);
      context.sources.push(...issues.sources);
    }

    // Code questions → search for relevant files
    if (q.includes("file") || q.includes("function") || q.includes("class") || q.includes("module") || q.includes("how does") || q.includes("what does") || q.includes("explain") || q.includes("code")) {
      const search = await searchCode(question);
      parts.push(search.text);
      context.sources.push(...search.sources);
    }

    // Commits / recent activity
    if (q.includes("commit") || q.includes("recent") || q.includes("latest") || q.includes("last change") || q.includes("who changed")) {
      const commits = await getRecentCommits();
      parts.push(commits.text);
      context.sources.push(...commits.sources);
    }

    // Repo structure overview (default fallback if nothing else matched)
    if (parts.length === 0) {
      const overview = await getRepoOverview();
      parts.push(overview.text);
      context.sources.push(...overview.sources);
    }

    context.text = parts.join("\n\n---\n\n");
  } catch (err) {
    console.error("[github] Error fetching context:", err.message);
    context.text = `(Could not fetch full GitHub context: ${err.message})`;
  }

  return context;
}

// ── Open Pull Requests ───────────────────────────────────────
async function getOpenPRs() {
  const { owner, repo } = getRepo();
  const { data } = await octokit.pulls.list({ owner, repo, state: "open", per_page: 10 });

  const sources = data.map((pr) => ({
    label: `PR #${pr.number}: ${pr.title}`,
    url: pr.html_url,
  }));

  const text = data.length === 0
    ? "No open pull requests."
    : `## Open Pull Requests (${data.length})\n` +
      data.map((pr) =>
        `- PR #${pr.number} [${pr.state}] "${pr.title}" by @${pr.user.login}\n  Branch: ${pr.head.ref} → ${pr.base.ref}\n  URL: ${pr.html_url}\n  Opened: ${pr.created_at}\n  ${pr.body ? "Description: " + pr.body.slice(0, 200) : ""}`
      ).join("\n\n");

  return { text, sources };
}

// ── Open Issues ──────────────────────────────────────────────
async function getOpenIssues() {
  const { owner, repo } = getRepo();
  const { data } = await octokit.issues.listForRepo({ owner, repo, state: "open", per_page: 15 });

  // Filter out PRs (GitHub returns PRs as issues too)
  const issues = data.filter((i) => !i.pull_request);

  const sources = issues.map((i) => ({
    label: `Issue #${i.number}: ${i.title}`,
    url: i.html_url,
  }));

  const text = issues.length === 0
    ? "No open issues."
    : `## Open Issues (${issues.length})\n` +
      issues.map((i) =>
        `- Issue #${i.number} "${i.title}" [Labels: ${i.labels.map((l) => l.name).join(", ") || "none"}]\n  URL: ${i.html_url}\n  ${i.body ? "Description: " + i.body.slice(0, 150) : ""}`
      ).join("\n\n");

  return { text, sources };
}

// ── Code Search ──────────────────────────────────────────────
async function searchCode(question) {
  const { owner, repo } = getRepo();

  // Extract meaningful keywords from question
  const stopWords = new Set(["what", "does", "how", "the", "is", "are", "can", "explain", "tell", "me", "about", "a", "an", "in", "for", "of", "and", "to", "this"]);
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 3);

  if (keywords.length === 0) {
    return { text: "", sources: [] };
  }

  const searchQuery = `${keywords.join(" ")} repo:${owner}/${repo}`;
  console.log(`[github] Code search: "${searchQuery}"`);

  try {
    const { data } = await octokit.search.code({ q: searchQuery, per_page: 5 });

    const sources = data.items.map((item) => ({
      label: item.path,
      url: item.html_url,
    }));

    // Fetch file contents for top results
    const fileContents = await Promise.allSettled(
      data.items.slice(0, 3).map(async (item) => {
        try {
          const { data: fileData } = await octokit.repos.getContent({ owner, repo, path: item.path });
          const content = Buffer.from(fileData.content, "base64").toString("utf-8");
          return `### File: ${item.path}\n\`\`\`\n${content.slice(0, 1500)}\n\`\`\``;
        } catch {
          return `### File: ${item.path}\n(Could not fetch content)`;
        }
      })
    );

    const filesText = fileContents
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .join("\n\n");

    const text = data.items.length === 0
      ? `No code found matching: ${keywords.join(", ")}`
      : `## Relevant Code Files\n${filesText}`;

    return { text, sources };
  } catch (err) {
    return { text: `(Code search unavailable: ${err.message})`, sources: [] };
  }
}

// ── Recent Commits ───────────────────────────────────────────
async function getRecentCommits() {
  const { owner, repo } = getRepo();
  const { data } = await octokit.repos.listCommits({ owner, repo, per_page: 10 });

  const sources = data.map((c) => ({
    label: c.commit.message.split("\n")[0].slice(0, 60),
    url: c.html_url,
  }));

  const text = `## Recent Commits\n` +
    data.map((c) =>
      `- ${c.sha.slice(0, 7)} by @${c.commit.author.name} (${c.commit.author.date.slice(0, 10)})\n  "${c.commit.message.split("\n")[0]}"`
    ).join("\n");

  return { text, sources };
}

// ── Repo Overview ────────────────────────────────────────────
async function getRepoOverview() {
  const { owner, repo } = getRepo();

  const [repoData, contents] = await Promise.all([
    octokit.repos.get({ owner, repo }),
    octokit.repos.getContent({ owner, repo, path: "" }).catch(() => ({ data: [] })),
  ]);

  const r = repoData.data;
  const files = Array.isArray(contents.data)
    ? contents.data.map((f) => `${f.type === "dir" ? "📁" : "📄"} ${f.name}`).join("\n")
    : "";

  // Try to fetch README
  let readme = "";
  try {
    const { data: readmeData } = await octokit.repos.getReadme({ owner, repo });
    readme = Buffer.from(readmeData.content, "base64").toString("utf-8").slice(0, 1000);
  } catch {
    readme = "(No README found)";
  }

  const text = `## Repository: ${r.full_name}\n` +
    `Description: ${r.description || "N/A"}\n` +
    `Default branch: ${r.default_branch}\n` +
    `Stars: ${r.stargazers_count} | Forks: ${r.forks_count} | Open Issues: ${r.open_issues_count}\n\n` +
    `### Root Files/Folders:\n${files}\n\n` +
    `### README (first 1000 chars):\n${readme}`;

  const sources = [{ label: `${r.full_name} on GitHub`, url: r.html_url }];

  return { text, sources };
}

module.exports = { fetchGitHubContext };

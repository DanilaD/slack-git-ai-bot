// ============================================================
// GitHub Configuration
// ============================================================
// Non-secret settings live here.
// The GITHUB_TOKEN secret stays in .env
// ============================================================

module.exports = {
  repo: "techaxy/rv-tracker", // owner/repo to search
  maxCodeFiles: 4, // max files to fetch per search
  maxFileChars: 2000, // max characters to read per file
  maxPRs: 10, // max open PRs to fetch
  maxIssues: 15, // max open issues to fetch
  maxCommits: 10, // max recent commits to fetch
  docPaths: ["README.md", "CONTRIBUTING.md"], // markdown docs to include in /ask context
  maxDocChars: 3000, // max characters to read per doc file
};

// ============================================================
// Jira Configuration
// ============================================================
// Non-secret settings live here.
// The JIRA_TOKEN secret stays in .env
// ============================================================

module.exports = {
  host: "https://techaxy.atlassian.net", // your Atlassian domain
  email: "dan@techaxy.com", // account used to create tickets
  project: "INTEL", // Jira project key
  defaultIssueType: "Task", // Task, Bug, Story, etc.
};

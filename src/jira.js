// ============================================================
// Jira Integration Module
// Settings: config/jira.js
// Secret token: JIRA_TOKEN in .env
// ============================================================

require("dotenv").config();
const jiraConfig = require("../config/jira");

function getAuthHeader() {
  const token = process.env.JIRA_TOKEN;
  if (!token) throw new Error("Missing JIRA_TOKEN in .env");
  return "Basic " + Buffer.from(`${jiraConfig.email}:${token}`).toString("base64");
}

async function createJiraTicket({ summary, description, issueType }) {
  const authHeader = getAuthHeader();
  const type = issueType || jiraConfig.defaultIssueType;

  const response = await fetch(`${jiraConfig.host}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
    },
    body: JSON.stringify({
      fields: {
        project: { key: jiraConfig.project },
        summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: description }],
            },
          ],
        },
        issuetype: { name: type },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Jira API error: ${err}`);
  }

  const data = await response.json();
  return {
    key: data.key,
    url: `${jiraConfig.host}/browse/${data.key}`,
  };
}

module.exports = { createJiraTicket };

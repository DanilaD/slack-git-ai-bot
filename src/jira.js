"use strict";

require("dotenv").config();
const { host, email, project, defaultIssueType } = require("../config/jira");

// Build once at module load — token must be set before this module is required
const token = process.env.JIRA_TOKEN;
if (!token) throw new Error("Missing JIRA_TOKEN in .env");

const authHeader = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

const toADF = (text) => ({
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const createJiraTicket = async ({ summary, description, issueType = defaultIssueType }) => {
  const res = await fetch(`${host}/rest/api/3/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      fields: {
        project: { key: project },
        summary,
        description: toADF(description),
        issuetype: { name: issueType },
      },
    }),
  });

  if (!res.ok) throw new Error(`Jira API error: ${await res.text()}`);

  const { key } = await res.json();
  return { key, url: `${host}/browse/${key}` };
};

module.exports = { createJiraTicket };

require("dotenv").config();

const JIRA_HOST = process.env.JIRA_HOST;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_TOKEN;
const JIRA_PROJECT = process.env.JIRA_PROJECT || "INTEL";

const authHeader = "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString("base64");

async function createJiraTicket({ summary, description, issueType = "Task" }) {
  const response = await fetch(`${JIRA_HOST}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
    },
    body: JSON.stringify({
      fields: {
        project: { key: JIRA_PROJECT },
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
        issuetype: { name: issueType },
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
    url: `${JIRA_HOST}/browse/${data.key}`,
  };
}

module.exports = { createJiraTicket };
